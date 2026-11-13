const express = require('express');
const pool = require('../config/db');
const { PLATFORMS } = require('../lib/college');

const router = express.Router();

// Public, scoped to the requesting college. Suspended users are hidden; if the
// college requires verified handles, unverified ones are hidden too.
router.get('/leaderboard/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        if (!PLATFORMS.includes(platform)) {
            return res.status(400).json({ error: `Platform must be one of: ${PLATFORMS.join(', ')}` });
        }
        const { country, state } = req.query;

        let query = `
            SELECT u.username, u.country, u.state,
                   p.platform_handle, p.rating, p.max_rating, p.questions_solved,
                   (p.questions_solved - p.daily_starting_count) AS questions_today,
                   (p.verified_at IS NOT NULL) AS verified
            FROM platform_stats p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.platform_name = $1 AND u.college_id = $2 AND u.is_active`;
        const params = [platform, req.college.college_id];

        if (req.college.require_verified_handles) query += ' AND p.verified_at IS NOT NULL';
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

module.exports = router;
