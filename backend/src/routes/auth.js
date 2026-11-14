const express = require('express');
const pool = require('../config/db');
const { signToken } = require('../middleware/auth');
const { sendOtpLimiter, verifyOtpLimiter } = require('../middleware/rateLimit');
const { issueOtp, verifyOtp, clearOtp } = require('../services/otp');
const { normalizeEmail, emailAllowed, domainError } = require('../lib/college');
const { parseHandles, parseAcademic } = require('../lib/profile');
const { newVerificationToken } = require('../lib/tokens');

const router = express.Router();

// --- Registration ---
router.post('/send-otp', sendOtpLimiter, async (req, res) => {
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

        const result = await issueOtp(email, 'Your Verification Code', 'Your verification code is:');
        if (!result.sent) {
            return res.status(429).json({ error: `Please wait ${result.retryAfter}s before requesting another code.` });
        }
        res.json({ message: 'OTP sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/register-with-otp', verifyOtpLimiter, async (req, res) => {
    const { username, otp } = req.body;
    const email = normalizeEmail(req.body.email);

    // Re-check the whitelist: OTPs are keyed by email only, so an OTP requested
    // via another college must not unlock registration here.
    if (!emailAllowed(req.college, email)) {
        return res.status(403).json({ error: domainError(req.college) });
    }
    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Display name is required' });
    }
    const parsedHandles = parseHandles(req.college, req.body.handles);
    if (parsedHandles.error) return res.status(400).json({ error: parsedHandles.error });
    const academic = parseAcademic(req.college, req.body);
    if (academic.error) return res.status(400).json({ error: academic.error });
    const { handles } = parsedHandles;
    const { batch = null, department = null } = academic.values;
    if (!(await verifyOtp(email, otp))) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `INSERT INTO users (username, email, college_id, batch, department) VALUES ($1, $2, $3, $4, $5)
             RETURNING user_id, username, email, college_id, role`,
            [username.trim(), email, req.college.college_id, batch, department]
        );
        const user = rows[0];

        for (const [platform, handle] of handles) {
            await client.query(
                `INSERT INTO platform_stats (user_id, platform_name, platform_handle, verification_token)
                 VALUES ($1, $2, $3, $4)`,
                [user.user_id, platform, handle, newVerificationToken()]
            );
        }
        await clearOtp(client, email);
        await client.query('COMMIT');

        res.json({
            message: 'Registered!',
            token: signToken(user),
            user: { username: user.username, email: user.email, role: user.role },
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
// Always answers the same way whether or not the account exists, so this
// endpoint can't be used to find out who has signed up.
router.post('/send-login-otp', sendOtpLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const { rows } = await pool.query(
            'SELECT is_active FROM users WHERE LOWER(email) = $1 AND college_id = $2',
            [email, req.college.college_id]
        );
        if (rows.length > 0 && rows[0].is_active) {
            await issueOtp(email, 'Login Verification Code', 'Your login code is:');
        }
        res.json({ message: 'If an account exists for this email, a login code has been sent.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/login-with-otp', verifyOtpLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);

        if (!(await verifyOtp(email, req.body.otp))) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        const { rows } = await pool.query(
            'SELECT * FROM users WHERE LOWER(email) = $1 AND college_id = $2',
            [email, req.college.college_id]
        );
        if (rows.length === 0) return res.status(400).json({ error: 'Invalid or expired OTP' });
        const user = rows[0];
        if (!user.is_active) return res.status(403).json({ error: 'Your account has been suspended. Contact your college admin.' });

        await clearOtp(pool, email);

        res.json({
            message: 'Login successful',
            token: signToken(user),
            user: { username: user.username, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
