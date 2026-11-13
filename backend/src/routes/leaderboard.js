const express = require('express');
const pool = require('../config/db');
const platforms = require('../platforms');

const router = express.Router();

// Public, scoped to the requesting college. Suspended users are hidden; if the
// college requires verified handles, unverified ones are hidden too. Optional
// ?batch=<year> and ?department=<name> filters.
// NOTE: the ORDER BY here and in routes/users.js (rank) must stay identical so a
// member's profile rank equals their position on this list.
router.get('/leaderboard/:platform', async (req, res) => {
    try {
        const platform = platforms.get(req.params.platform);
        if (!platform) {
            return res.status(400).json({ error: `Platform must be one of: ${platforms.ids.join(', ')}` });
        }
        const { batch, department } = req.query;

        let query = `
            SELECT u.username, u.batch, u.department,
                   p.platform_handle, p.rating, p.max_rating, p.questions_solved,
                   (p.questions_solved - p.daily_starting_count) AS questions_today,
                   (p.verified_at IS NOT NULL) AS verified,
                   p.last_synced_at
            FROM platform_stats p
            JOIN users u ON p.user_id = u.user_id
            WHERE p.platform_name = $1 AND u.college_id = $2 AND u.is_active`;
        const params = [platform.id, req.college.college_id];

        if (req.college.require_verified_handles) query += ' AND p.verified_at IS NOT NULL';
        if (batch !== undefined && batch !== '') {
            const year = Number(batch);
            if (!Number.isInteger(year)) return res.status(400).json({ error: 'batch must be a year' });
            params.push(year);
            query += ` AND u.batch = $${params.length}`;
        }
        if (department) { params.push(department); query += ` AND u.department = $${params.length}`; }
        query += ' ORDER BY p.rating DESC, p.max_rating DESC, u.username';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
