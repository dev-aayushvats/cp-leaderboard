require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pool = require('./config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET is not set. Add it to backend/.env (see .env.example).');
    process.exit(1);
}

const PLATFORMS = ['leetcode', 'codeforces'];

const app = express();
app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});
const MAIL_FROM = process.env.EMAIL_FROM || `"Competitive Leaderboard" <${process.env.EMAIL_USER}>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// A college with no email_domains is open; otherwise the email's domain (or a
// subdomain of it, e.g. cs.mit.edu for mit.edu) must be on the whitelist.
const emailAllowed = (college, email) => {
    const domains = college.email_domains || [];
    if (domains.length === 0) return true;
    const domain = email.split('@')[1];
    if (!domain) return false;
    return domains.some((d) => domain === d || domain.endsWith('.' + d));
};

const domainError = (college) =>
    `Registration for ${college.name} is limited to: ${college.email_domains.map((d) => '@' + d).join(', ')}`;

const signToken = (user) =>
    jwt.sign({ user_id: user.user_id, college_id: user.college_id }, JWT_SECRET, { expiresIn: '7d' });

// Upsert a fresh OTP for an email and mail it.
async function issueOtp(email, subject, bodyPrefix) {
    const otp = crypto.randomInt(100000, 1000000).toString(); // 100000–999999 inclusive
    await pool.query(
        `INSERT INTO email_otps (email, otp_code) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE
         SET otp_code = $2, created_at = NOW(), expires_at = NOW() + INTERVAL '5 minutes'`,
        [email, otp]
    );
    await transporter.sendMail({
        from: MAIL_FROM,
        to: email,
        subject,
        text: `${bodyPrefix} ${otp}. It expires in 5 minutes. Do not share this code.`,
    });
}

async function otpIsValid(email, otp) {
    const { rows } = await pool.query(
        'SELECT 1 FROM email_otps WHERE email = $1 AND otp_code = $2 AND expires_at > NOW()',
        [email, String(otp || '')]
    );
    return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Tenant resolution: the frontend sends X-College-Slug. Falls back to
// DEFAULT_COLLEGE_SLUG so a single-college deployment needs no header.
const resolveCollege = async (req, res, next) => {
    const slug = String(req.headers['x-college-slug'] || process.env.DEFAULT_COLLEGE_SLUG || '')
        .trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'College not specified' });

    const { rows } = await pool.query(
        'SELECT college_id, slug, name, email_domains, logo_url FROM colleges WHERE slug = $1 AND is_active',
        [slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Unknown college' });
    req.college = rows[0];
    next();
};

// All auth failures are 401 so the frontend reliably logs the user out.
// A token is only valid for the college it was issued in (tokens issued before
// multi-tenancy have no college_id and are rejected, forcing a fresh login).
const authenticateToken = (req, res, next) => {
    const token = (req.headers['authorization'] || '').split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err || !payload.college_id || payload.college_id !== req.college.college_id) {
            return res.sendStatus(401);
        }
        req.user = payload;
        next();
    });
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/', (req, res) => res.send('Leaderboard API is running'));

// Everything below is tenant-scoped.
app.use(resolveCollege);

// Public college info (branding + sign-up rules) for the frontend.
app.get('/college', (req, res) => {
    const { slug, name, logo_url, email_domains } = req.college;
    res.json({ slug, name, logo_url, email_domains });
});

// --- Registration ---
app.post('/send-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!email) return res.status(400).json({ error: 'Email is required' });

        if (!emailAllowed(req.college, email)) {
            return res.status(403).json({ error: domainError(req.college) });
        }

        const exists = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists. Please login.' });
        }

        await issueOtp(email, 'Your Verification Code', 'Your verification code is:');
        res.json({ message: 'OTP sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.post('/register-with-otp', async (req, res) => {
    const { username, otp, leetcodeHandle, codeforcesHandle } = req.body;
    const email = normalizeEmail(req.body.email);

    // Re-check the whitelist: OTPs are keyed by email only, so an OTP requested
    // via another college must not unlock registration here.
    if (!emailAllowed(req.college, email)) {
        return res.status(403).json({ error: domainError(req.college) });
    }
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Display name is required' });
    }
    if (!(await otpIsValid(email, otp))) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `INSERT INTO users (username, email, college_id) VALUES ($1, $2, $3)
             RETURNING user_id, username, email, college_id`,
            [username.trim(), email, req.college.college_id]
        );
        const user = rows[0];

        const handles = [['leetcode', leetcodeHandle], ['codeforces', codeforcesHandle]];
        for (const [platform, handle] of handles) {
            if (handle && handle.trim()) {
                await client.query(
                    'INSERT INTO platform_stats (user_id, platform_name, platform_handle) VALUES ($1, $2, $3)',
                    [user.user_id, platform, handle.trim()]
                );
            }
        }
        await client.query('DELETE FROM email_otps WHERE email = $1', [email]);
        await client.query('COMMIT');

        res.json({
            message: 'Registered!',
            token: signToken(user),
            user: { username: user.username, email: user.email },
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') {
            const taken = err.constraint === 'users_college_username_key' ? 'Display name' : 'Email';
            return res.status(409).json({ error: `${taken} is already taken` });
        }
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    } finally {
        client.release();
    }
});

// --- Login ---
app.post('/send-login-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const user = await pool.query(
            'SELECT 1 FROM users WHERE LOWER(email) = $1 AND college_id = $2',
            [email, req.college.college_id]
        );
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'No account found with this email. Please register.' });
        }

        await issueOtp(email, 'Login Verification Code', 'Your login code is:');
        res.json({ message: 'OTP sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

app.post('/login-with-otp', async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!(await otpIsValid(email, req.body.otp))) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = $1 AND college_id = $2',
            [email, req.college.college_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
        const user = rows[0];

        await pool.query('DELETE FROM email_otps WHERE email = $1', [email]);

        res.json({
            message: 'Login successful',
            token: signToken(user),
            user: { username: user.username, email: user.email, country: user.country, state: user.state },
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- Profile ---
app.get('/profile', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT u.username, u.email, u.country, u.state,
                MAX(CASE WHEN p.platform_name = 'leetcode'   THEN p.platform_handle END) AS leetcode_handle,
                MAX(CASE WHEN p.platform_name = 'codeforces' THEN p.platform_handle END) AS codeforces_handle
             FROM users u
             LEFT JOIN platform_stats p ON u.user_id = p.user_id
             WHERE u.user_id = $1
             GROUP BY u.user_id`,
            [req.user.user_id]
        );
        if (rows.length === 0) return res.sendStatus(404);
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

app.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { country, state, leetcodeHandle, codeforcesHandle } = req.body;
        const userId = req.user.user_id;

        await pool.query('UPDATE users SET country = $1, state = $2 WHERE user_id = $3', [country, state, userId]);

        // Changing a handle resets its stats until the worker refreshes them.
        if (leetcodeHandle) {
            await pool.query(
                `INSERT INTO platform_stats (user_id, platform_name, platform_handle, rating, questions_solved)
                 VALUES ($1, 'leetcode', $2, 0, 0)
                 ON CONFLICT (user_id, platform_name)
                 DO UPDATE SET platform_handle = $2, rating = 0, questions_solved = 0, last_updated = NOW()`,
                [userId, leetcodeHandle.trim()]
            );
        }
        if (codeforcesHandle) {
            await pool.query(
                `INSERT INTO platform_stats (user_id, platform_name, platform_handle, rating, max_rating)
                 VALUES ($1, 'codeforces', $2, 0, 0)
                 ON CONFLICT (user_id, platform_name)
                 DO UPDATE SET platform_handle = $2, rating = 0, max_rating = 0, last_updated = NOW()`,
                [userId, codeforcesHandle.trim()]
            );
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- Leaderboard (scoped to the requesting college) ---
app.get('/leaderboard/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        if (!PLATFORMS.includes(platform)) {
            return res.status(400).json({ error: `Platform must be one of: ${PLATFORMS.join(', ')}` });
        }
        const { country, state } = req.query;

        let query = `
            SELECT u.username, u.country, u.state,
                   p.platform_handle, p.rating, p.max_rating, p.questions_solved,
                   (p.questions_solved - p.daily_starting_count) AS questions_today
            FROM platform_stats p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.platform_name = $1 AND u.college_id = $2`;
        const params = [platform, req.college.college_id];

        if (country) { params.push(country); query += ` AND u.country = $${params.length}`; }
        if (state)   { params.push(state);   query += ` AND u.state = $${params.length}`; }
        query += ' ORDER BY p.rating DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
