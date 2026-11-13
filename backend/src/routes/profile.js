const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { verifyHandleLimiter } = require('../middleware/rateLimit');
const { fetchProfileText, VERIFICATION_FIELDS } = require('../services/platforms');
const { isValidHandle, PLATFORMS } = require('../lib/college');
const { newVerificationToken } = require('../lib/tokens');

const router = express.Router();
router.use('/profile', authenticate);

router.get('/profile', async (req, res) => {
    try {
        const [user, stats] = await Promise.all([
            pool.query('SELECT username, email, country, state, role FROM users WHERE user_id = $1', [req.user.user_id]),
            pool.query(
                'SELECT platform_name, platform_handle, verified_at, verification_token FROM platform_stats WHERE user_id = $1',
                [req.user.user_id]
            ),
        ]);

        const handles = Object.fromEntries(PLATFORMS.map((p) => [p, null]));
        for (const row of stats.rows) {
            const verified = !!row.verified_at;
            handles[row.platform_name] = {
                handle: row.platform_handle,
                verified,
                // Only unverified handles need a code; where to put it depends on the platform.
                verification_token: verified ? null : row.verification_token,
                verification_hint: verified ? null : VERIFICATION_FIELDS[row.platform_name],
            };
        }
        res.json({ ...user.rows[0], handles });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Linking a new/different handle resets its stats and verification. Re-saving
// the same handle (case-insensitive) is a no-op, so saving the form doesn't
// wipe stats or un-verify anyone.
const setHandle = (userId, platform, handle) =>
    pool.query(
        `INSERT INTO platform_stats (user_id, platform_name, platform_handle, verification_token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, platform_name) DO UPDATE
         SET platform_handle = $3, verification_token = $4, verified_at = NULL,
             rating = 0, max_rating = 0, questions_solved = 0, daily_starting_count = 0,
             last_updated = NOW()
         WHERE LOWER(platform_stats.platform_handle) <> LOWER($3)`,
        [userId, platform, handle, newVerificationToken()]
    );

router.put('/profile', async (req, res) => {
    try {
        const { country, state, leetcodeHandle, codeforcesHandle } = req.body;
        const handles = [['leetcode', leetcodeHandle], ['codeforces', codeforcesHandle]]
            .map(([platform, h]) => [platform, (h || '').trim()])
            .filter(([, h]) => h);
        if (handles.some(([, h]) => !isValidHandle(h))) {
            return res.status(400).json({ error: 'Handles may only contain letters, digits, "_", "-" and "."' });
        }

        await pool.query('UPDATE users SET country = $1, state = $2 WHERE user_id = $3',
            [country, state, req.user.user_id]);
        for (const [platform, handle] of handles) {
            await setHandle(req.user.user_id, platform, handle);
        }
        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Proves ownership of a linked handle: the user's verification code must appear
// in a free-text field of their public platform profile.
router.post('/profile/verify/:platform', verifyHandleLimiter, async (req, res) => {
    const { platform } = req.params;
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });

    try {
        const { rows } = await pool.query(
            'SELECT platform_handle, verification_token, verified_at FROM platform_stats WHERE user_id = $1 AND platform_name = $2',
            [req.user.user_id, platform]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Link a handle first' });
        const row = rows[0];
        if (row.verified_at) return res.json({ verified: true });

        let profile;
        try {
            profile = await fetchProfileText(platform, row.platform_handle);
        } catch (err) {
            console.error(`Verify ${platform}:`, err.message);
            return res.status(502).json({ error: `Couldn't reach ${platform} right now. Try again shortly.` });
        }
        if (!profile.exists) {
            return res.status(404).json({ error: `No ${platform} user named "${row.platform_handle}" was found.` });
        }
        if (!profile.text.toLowerCase().includes(row.verification_token.toLowerCase())) {
            return res.status(422).json({
                error: `Code not found. Add ${row.verification_token} to ${VERIFICATION_FIELDS[platform]}, save, then try again.`,
            });
        }

        try {
            await pool.query(
                'UPDATE platform_stats SET verified_at = NOW() WHERE user_id = $1 AND platform_name = $2',
                [req.user.user_id, platform]
            );
        } catch (err) {
            if (err.code === '23505') {
                return res.status(409).json({ error: 'This handle is already verified by another account.' });
            }
            throw err;
        }
        res.json({ verified: true });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
