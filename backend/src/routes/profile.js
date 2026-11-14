const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { verifyHandleLimiter } = require('../middleware/rateLimit');
const platforms = require('../platforms');
const { isEnabled, enabledPlatforms } = require('../lib/collegePlatforms');
const { parseHandles, parseAcademic } = require('../lib/profile');
const { newVerificationToken } = require('../lib/tokens');

const router = express.Router();
router.use('/profile', authenticate);

router.get('/profile', async (req, res) => {
    try {
        const [user, stats] = await Promise.all([
            pool.query('SELECT username, email, role, batch, department FROM users WHERE user_id = $1', [req.user.user_id]),
            pool.query(
                `SELECT platform_name, platform_handle, verified_at, verification_token,
                        last_synced_at, last_sync_error, last_sync_error_kind
                 FROM platform_stats WHERE user_id = $1`,
                [req.user.user_id]
            ),
        ]);

        const handles = Object.fromEntries(enabledPlatforms(req.college).map((p) => [p.id, null]));
        for (const row of stats.rows) {
            const platform = platforms.get(row.platform_name);
            if (!platform || !isEnabled(req.college, platform.id)) continue;
            const verified = !!row.verified_at;
            handles[row.platform_name] = {
                handle: row.platform_handle,
                verified,
                // Only unverified handles need a code; where to put it depends on the platform.
                verification_token: verified ? null : row.verification_token,
                verification_hint: verified ? null : platform.verificationHint,
                profile_url: platform.profileUrl(row.platform_handle),
                last_synced_at: row.last_synced_at,
                // Only permanent problems are surfaced to the user (e.g. a typo'd handle);
                // transient outages are the platform's fault and fix themselves.
                sync_error: row.last_sync_error_kind === 'not_found' ? row.last_sync_error : null,
            };
        }
        res.json({ ...user.rows[0], handles });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// Linking a new/different handle resets its stats, history, sync state and
// verification. Re-saving the same handle (case-insensitive) is a no-op, so
// saving the form doesn't wipe stats or un-verify anyone.
async function setHandle(userId, platform, handle) {
    const { rows } = await pool.query(
        `INSERT INTO platform_stats (user_id, platform_name, platform_handle, verification_token)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, platform_name) DO UPDATE
         SET platform_handle = $3, verification_token = $4, verified_at = NULL,
             rating = 0, max_rating = 0, questions_solved = 0, daily_starting_count = 0,
             last_updated = NOW(), last_synced_at = NULL,
             last_sync_error = NULL, last_sync_error_kind = NULL, sync_failures = 0
         WHERE LOWER(platform_stats.platform_handle) <> LOWER($3)
         RETURNING id`,
        [userId, platform, handle, newVerificationToken()]
    );
    // A different account's rating history doesn't belong to the new handle.
    if (rows.length > 0) await pool.query('DELETE FROM rating_history WHERE stat_id = $1', [rows[0].id]);
}

router.put('/profile', async (req, res) => {
    try {
        const parsedHandles = parseHandles(req.college, req.body.handles);
        if (parsedHandles.error) return res.status(400).json({ error: parsedHandles.error });
        const academic = parseAcademic(req.college, req.body);
        if (academic.error) return res.status(400).json({ error: academic.error });
        const { batch, department } = academic.values;

        await pool.query(
            `UPDATE users SET
                batch = CASE WHEN $2::boolean THEN $3::smallint ELSE batch END,
                department = CASE WHEN $4::boolean THEN $5::varchar ELSE department END
             WHERE user_id = $1`,
            [req.user.user_id, batch !== undefined, batch ?? null, department !== undefined, department ?? null]
        );
        for (const [platform, handle] of parsedHandles.handles) {
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
    const platform = platforms.get(req.params.platform);
    if (!platform || !isEnabled(req.college, platform.id)) return res.status(400).json({ error: 'Unknown platform' });

    try {
        const { rows } = await pool.query(
            'SELECT platform_handle, verification_token, verified_at FROM platform_stats WHERE user_id = $1 AND platform_name = $2',
            [req.user.user_id, platform.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Link a handle first' });
        const row = rows[0];
        if (row.verified_at) return res.json({ verified: true });

        let profile;
        try {
            profile = await platform.fetchProfileText(row.platform_handle);
        } catch (err) {
            console.error(`Verify ${platform.id}:`, err.message);
            return res.status(502).json({ error: `Couldn't reach ${platform.label} right now. Try again shortly.` });
        }
        if (!profile.exists) {
            return res.status(404).json({ error: `No ${platform.label} user named "${row.platform_handle}" was found.` });
        }
        if (!profile.text.toLowerCase().includes(row.verification_token.toLowerCase())) {
            return res.status(422).json({
                error: `Code not found. Add ${row.verification_token} to ${platform.verificationHint}, save, then try again.`,
            });
        }

        try {
            await pool.query(
                'UPDATE platform_stats SET verified_at = NOW() WHERE user_id = $1 AND platform_name = $2',
                [req.user.user_id, platform.id]
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
