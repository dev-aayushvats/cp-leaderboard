const pool = require('../config/db');

// Tenant resolution: the frontend sends X-College-Slug. Falls back to
// DEFAULT_COLLEGE_SLUG so a single-college deployment needs no header.
const resolveCollege = async (req, res, next) => {
    const slug = String(req.headers['x-college-slug'] || process.env.DEFAULT_COLLEGE_SLUG || '')
        .trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'College not specified' });

    const { rows } = await pool.query(
        `SELECT college_id, slug, name, email_domains, logo_url, require_verified_handles
         FROM colleges WHERE slug = $1 AND is_active`,
        [slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Unknown college' });
    req.college = rows[0];
    next();
};

module.exports = { resolveCollege };
