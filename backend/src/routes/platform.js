// Platform console API: college management for the operator. Mounted BEFORE tenant
// resolution (see index.js): these routes are not about any one college.
const express = require('express');
const pool = require('../config/db');
const { isOperatorEmail, signOperatorToken, authenticateOperator } = require('../middleware/operator');
const { sendOtpLimiter, verifyOtpLimiter } = require('../middleware/rateLimit');
const { issueOtp, verifyOtp, clearOtp } = require('../services/otp');
const { normalizeEmail } = require('../lib/college');
const { ROOT_DOMAIN, isEmail, validateSlug, parseEmailDomains, parseCustomDomain, collegeUrl, ensureAdmin } = require('../lib/colleges');

const router = express.Router();

// --- Sign-in (public) ---
// Same answer whether or not the address is an operator, so this can't be used to
// discover who the operators are.
router.post('/platform/send-otp', sendOtpLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (isOperatorEmail(email)) {
            await issueOtp(email, 'Platform console login', 'Your platform console code is:');
        }
        res.json({ message: 'If this address is a platform administrator, a code has been sent.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

router.post('/platform/login', verifyOtpLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!isOperatorEmail(email) || !(await verifyOtp(email, req.body.otp))) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        await clearOtp(pool, email);
        res.json({ token: signOperatorToken(email), email });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- Everything below needs an operator token ---
router.use('/platform', authenticateOperator);

router.get('/platform/config', (req, res) => {
    res.json({ email: req.operator.email, root_domain: ROOT_DOMAIN || null });
});

const withUrl = (c) => ({ ...c, url: collegeUrl(c.slug) });

const COLLEGE_SELECT = `
    SELECT c.slug, c.name, c.email_domains, c.custom_domain, c.is_active, c.created_at,
           (SELECT COUNT(*) FROM users u WHERE u.college_id = c.college_id)::int AS members,
           COALESCE((SELECT json_agg(json_build_object('email', u.email, 'username', u.username) ORDER BY u.created_at)
                     FROM users u WHERE u.college_id = c.college_id AND u.role = 'college_admin'), '[]'::json) AS admins
    FROM colleges c`;

router.get('/platform/colleges', async (req, res) => {
    try {
        const { rows } = await pool.query(`${COLLEGE_SELECT} ORDER BY c.created_at DESC, c.slug`);
        res.json(rows.map(withUrl));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

const uniqueViolation = (err) => {
    if (err.code !== '23505') return null;
    if (/custom_domain/.test(err.constraint || '')) return 'That custom domain is already used by another college.';
    return 'A college with that slug already exists.';
};

router.post('/platform/colleges', async (req, res) => {
    const { name, admin_email, admin_name } = req.body;
    const slug = validateSlug(req.body.slug);
    const domains = parseEmailDomains(req.body.email_domains);
    const custom = parseCustomDomain(req.body.custom_domain);
    const problem = slug.error || domains.error || custom.error
        || (!name || typeof name !== 'string' || !name.trim() || name.length > 150 ? 'Name must be 1–150 characters' : null)
        || (admin_email && !isEmail(String(admin_email).trim()) ? 'The first admin\'s email is not valid.' : null);
    if (problem) return res.status(400).json({ error: problem });

    // College + first admin together: a half-created college would be a mess to clean up.
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            `INSERT INTO colleges (slug, name, email_domains, custom_domain) VALUES ($1, $2, $3, $4)
             RETURNING college_id, slug`,
            [slug.value, name.trim(), domains.value, custom.value]
        );
        let admin = null;
        if (admin_email) {
            const result = await ensureAdmin(client, rows[0].college_id, admin_email, admin_name);
            if (result.error) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `${admin_email} already has an account in a different college.` });
            }
            admin = { ...result.user, action: result.action };
        }
        await client.query('COMMIT');
        const created = await pool.query(`${COLLEGE_SELECT} WHERE c.slug = $1`, [rows[0].slug]);
        res.status(201).json({ college: withUrl(created.rows[0]), admin });
    } catch (err) {
        await client.query('ROLLBACK');
        const message = uniqueViolation(err);
        if (message) return res.status(409).json({ error: message });
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    } finally {
        client.release();
    }
});

// The slug is the college's address, so it isn't editable. Colleges can be switched off
// (is_active) but not deleted: that would destroy every member's data.
router.patch('/platform/colleges/:slug', async (req, res) => {
    try {
        const current = (await pool.query(`${COLLEGE_SELECT} WHERE c.slug = $1`, [req.params.slug])).rows[0];
        if (!current) return res.status(404).json({ error: 'College not found' });

        const next = { name: current.name, email_domains: current.email_domains, custom_domain: current.custom_domain, is_active: current.is_active };
        if (req.body.name !== undefined) {
            if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 150) {
                return res.status(400).json({ error: 'Name must be 1–150 characters' });
            }
            next.name = req.body.name.trim();
        }
        if (req.body.email_domains !== undefined) {
            const d = parseEmailDomains(req.body.email_domains);
            if (d.error) return res.status(400).json({ error: d.error });
            next.email_domains = d.value;
        }
        if (req.body.custom_domain !== undefined) {
            const c = parseCustomDomain(req.body.custom_domain);
            if (c.error) return res.status(400).json({ error: c.error });
            next.custom_domain = c.value;
        }
        if (req.body.is_active !== undefined) {
            if (typeof req.body.is_active !== 'boolean') return res.status(400).json({ error: 'is_active must be a boolean' });
            next.is_active = req.body.is_active;
        }

        await pool.query(
            'UPDATE colleges SET name = $2, email_domains = $3, custom_domain = $4, is_active = $5 WHERE slug = $1',
            [req.params.slug, next.name, next.email_domains, next.custom_domain, next.is_active]
        );
        const updated = await pool.query(`${COLLEGE_SELECT} WHERE c.slug = $1`, [req.params.slug]);
        res.json(withUrl(updated.rows[0]));
    } catch (err) {
        const message = uniqueViolation(err);
        if (message) return res.status(409).json({ error: message });
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.post('/platform/colleges/:slug/admins', async (req, res) => {
    try {
        if (!isEmail(String(req.body.email || '').trim())) return res.status(400).json({ error: 'A valid email is required' });
        const college = (await pool.query('SELECT college_id FROM colleges WHERE slug = $1', [req.params.slug])).rows[0];
        if (!college) return res.status(404).json({ error: 'College not found' });

        const result = await ensureAdmin(pool, college.college_id, req.body.email, req.body.name);
        if (result.error) return res.status(409).json({ error: 'That email already has an account in a different college.' });
        res.json({ action: result.action, user: result.user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
