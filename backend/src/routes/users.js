const express = require('express');
const pool = require('../config/db');
const platforms = require('../platforms');

const router = express.Router();

// Public member profile (same visibility as the public leaderboard; never
// exposes email). Only handles that appear on the leaderboard are shown, so a
// college that hides unverified handles hides them here too.
router.get('/users/:username', async (req, res) => {
    try {
        const collegeId = req.college.college_id;
        const user = await pool.query(
            `SELECT user_id, username, batch, department, created_at
             FROM users WHERE college_id = $1 AND username = $2 AND is_active`,
            [collegeId, req.params.username]
        );
        if (user.rows.length === 0) return res.status(404).json({ error: 'Member not found' });
        const u = user.rows[0];

        const requireVerified = req.college.require_verified_handles;
        const visible = requireVerified ? 'AND p.verified_at IS NOT NULL' : '';

        // rank/participants use the leaderboard's exact ordering and visibility rules
        const stats = await pool.query(
            `WITH ranked AS (
                SELECT p.id,
                       ROW_NUMBER() OVER (PARTITION BY p.platform_name
                                          ORDER BY p.rating DESC, p.max_rating DESC, x.username) AS rank,
                       COUNT(*)     OVER (PARTITION BY p.platform_name) AS participants
                FROM platform_stats p JOIN users x ON x.user_id = p.user_id
                WHERE x.college_id = $1 AND x.is_active ${visible}
             )
             SELECT p.id, p.platform_name, p.platform_handle, p.rating, p.max_rating, p.questions_solved,
                    (p.questions_solved - p.daily_starting_count) AS questions_today,
                    (p.verified_at IS NOT NULL) AS verified, p.last_synced_at,
                    r.rank::int, r.participants::int
             FROM platform_stats p JOIN ranked r ON r.id = p.id
             WHERE p.user_id = $2
             ORDER BY p.platform_name`,
            [collegeId, u.user_id]
        );

        const ids = stats.rows.map((r) => r.id);
        const history = ids.length
            ? await pool.query(
                `SELECT stat_id, recorded_on::text AS date, rating, max_rating, questions_solved
                 FROM rating_history
                 WHERE stat_id = ANY($1) AND recorded_on >= CURRENT_DATE - 365
                 ORDER BY recorded_on`,
                [ids]
            )
            : { rows: [] };

        res.json({
            username: u.username,
            batch: u.batch,
            department: u.department,
            member_since: u.created_at,
            // Registry order (not alphabetical), so the primary platforms come first
            platforms: stats.rows
                .filter((r) => platforms.get(r.platform_name))
                .sort((a, b) => platforms.ids.indexOf(a.platform_name) - platforms.ids.indexOf(b.platform_name))
                .map((r) => {
                    const platform = platforms.get(r.platform_name);
                    return {
                        platform: r.platform_name,
                        label: platform.label,
                        handle: r.platform_handle,
                        profile_url: platform.profileUrl(r.platform_handle),
                        verified: r.verified,
                        rating: r.rating,
                        max_rating: r.max_rating,
                        questions_solved: r.questions_solved,
                        questions_today: r.questions_today,
                        rank: r.rank,
                        participants: r.participants,
                        last_synced_at: r.last_synced_at,
                        history: history.rows
                            .filter((h) => h.stat_id === r.id)
                            .map(({ date, rating, max_rating, questions_solved }) => ({ date, rating, max_rating, questions_solved })),
                    };
                }),
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
