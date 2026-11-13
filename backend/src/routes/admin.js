const express = require('express');
const pool = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { normalizeDomains, isValidDomain } = require('../lib/college');

const router = express.Router();
router.use('/admin', authenticate, requireAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['student', 'college_admin'];

// Every user-targeting route checks the id format and that the target belongs to
// the admin's own college, and refuses to act on the admin's own account (so a
// college can never be left without an admin by accident).
const targetUser = (req, res, next) => {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.user_id) return res.status(400).json({ error: "You can't change your own account here" });
    next();
};

// --- Overview ---
router.get('/admin/stats', async (req, res) => {
    try {
        const collegeId = req.college.college_id;
        const [members, platformStats, sync] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE is_active)::int AS active,
                        COUNT(*) FILTER (WHERE role = 'college_admin')::int AS admins
                 FROM users WHERE college_id = $1`, [collegeId]),
            pool.query(
                `SELECT p.platform_name AS platform,
                        COUNT(*)::int AS linked,
                        COUNT(p.verified_at)::int AS verified
                 FROM platform_stats p JOIN users u ON u.user_id = p.user_id
                 WHERE u.college_id = $1 GROUP BY p.platform_name ORDER BY p.platform_name`, [collegeId]),
            // Sync health: handles that keep failing (3+ runs in a row) and the most recent success
            pool.query(
                `SELECT MAX(p.last_synced_at) AS last_synced_at,
                        COUNT(*) FILTER (WHERE p.sync_failures >= 3)::int AS failing,
                        COUNT(*) FILTER (WHERE p.last_sync_error_kind = 'not_found')::int AS not_found,
                        -- a handle can be both; 'issues' counts each problem handle once
                        COUNT(*) FILTER (WHERE p.sync_failures >= 3 OR p.last_sync_error_kind = 'not_found')::int AS issues
                 FROM platform_stats p JOIN users u ON u.user_id = p.user_id
                 WHERE u.college_id = $1 AND u.is_active`, [collegeId]),
        ]);
        res.json({ members: members.rows[0], platforms: platformStats.rows, sync: sync.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- Members ---
router.get('/admin/users', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const params = [req.college.college_id];
        let where = 'u.college_id = $1';
        if (req.query.search) {
            // Escape LIKE wildcards so the search is a plain substring match.
            params.push(`%${String(req.query.search).replace(/[\\%_]/g, '\\$&')}%`);
            where += ` AND (u.username ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
        }

        const [list, count] = await Promise.all([
            pool.query(
                `SELECT u.user_id, u.username, u.email, u.role, u.is_active, u.created_at, u.batch, u.department,
                    COALESCE(jsonb_object_agg(p.platform_name, jsonb_build_object(
                        'handle', p.platform_handle,
                        'verified', p.verified_at IS NOT NULL,
                        'sync_error', p.last_sync_error,
                        'sync_error_kind', p.last_sync_error_kind,
                        'sync_failures', p.sync_failures
                    )) FILTER (WHERE p.id IS NOT NULL), '{}'::jsonb) AS handles
                 FROM users u LEFT JOIN platform_stats p ON p.user_id = u.user_id
                 WHERE ${where}
                 GROUP BY u.user_id
                 ORDER BY u.created_at DESC
                 LIMIT ${limit} OFFSET ${offset}`, params),
            pool.query(`SELECT COUNT(*)::int AS total FROM users u WHERE ${where}`, params),
        ]);
        res.json({ users: list.rows, total: count.rows[0].total });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.patch('/admin/users/:id', targetUser, async (req, res) => {
    try {
        const { is_active, role } = req.body;
        if (is_active !== undefined && typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active must be a boolean' });
        }
        if (role !== undefined && !ROLES.includes(role)) {
            return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
        }
        if (is_active === undefined && role === undefined) {
            return res.status(400).json({ error: 'Nothing to update' });
        }

        const { rows } = await pool.query(
            `UPDATE users SET is_active = COALESCE($3, is_active), role = COALESCE($4, role)
             WHERE user_id = $1 AND college_id = $2
             RETURNING user_id, username, email, role, is_active`,
            [req.params.id, req.college.college_id, is_active ?? null, role ?? null]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.delete('/admin/users/:id', targetUser, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM users WHERE user_id = $1 AND college_id = $2',
            [req.params.id, req.college.college_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- College settings ---
const collegeSettings = (c) => ({
    slug: c.slug, name: c.name, logo_url: c.logo_url,
    email_domains: c.email_domains, require_verified_handles: c.require_verified_handles,
    departments: c.departments,
});

router.get('/admin/college', (req, res) => res.json(collegeSettings(req.college)));

router.patch('/admin/college', async (req, res) => {
    try {
        const { name, logo_url, email_domains, require_verified_handles, departments } = req.body;
        const next = { ...req.college };

        if (name !== undefined) {
            if (typeof name !== 'string' || !name.trim() || name.length > 150) {
                return res.status(400).json({ error: 'Name must be 1–150 characters' });
            }
            next.name = name.trim();
        }
        if (logo_url !== undefined) {
            if (logo_url !== null && logo_url !== '' && !/^https?:\/\/\S+$/.test(logo_url)) {
                return res.status(400).json({ error: 'Logo must be an http(s) URL' });
            }
            next.logo_url = logo_url || null;
        }
        if (email_domains !== undefined) {
            if (!Array.isArray(email_domains)) return res.status(400).json({ error: 'email_domains must be a list' });
            const domains = normalizeDomains(email_domains);
            const bad = domains.find((d) => !isValidDomain(d));
            if (bad) return res.status(400).json({ error: `"${bad}" is not a valid domain` });
            next.email_domains = domains;
        }
        if (departments !== undefined) {
            if (!Array.isArray(departments)) return res.status(400).json({ error: 'departments must be a list' });
            const cleaned = [...new Set(departments.map((d) => String(d).trim()).filter(Boolean))];
            if (cleaned.length > 50) return res.status(400).json({ error: 'At most 50 departments' });
            if (cleaned.some((d) => d.length > 80)) return res.status(400).json({ error: 'Department names are limited to 80 characters' });
            next.departments = cleaned;
        }
        if (require_verified_handles !== undefined) {
            if (typeof require_verified_handles !== 'boolean') {
                return res.status(400).json({ error: 'require_verified_handles must be a boolean' });
            }
            next.require_verified_handles = require_verified_handles;
        }

        const { rows } = await pool.query(
            `UPDATE colleges SET name = $2, logo_url = $3, email_domains = $4, require_verified_handles = $5, departments = $6
             WHERE college_id = $1
             RETURNING slug, name, logo_url, email_domains, require_verified_handles, departments`,
            [req.college.college_id, next.name, next.logo_url, next.email_domains, next.require_verified_handles, next.departments]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router;
