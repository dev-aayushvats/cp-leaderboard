const express = require('express');
const pool = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { normalizeDomains, isValidDomain } = require('../lib/college');
const { parseBrandColor } = require('../lib/branding');
const { MAX_ROWS, analyzeRows, commitRows, summarize, present } = require('../lib/importMembers');
const { MAX_LOGO_BYTES, sniffImage, logoVersion } = require('../lib/logo');

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
        // Filters. Unknown values are ignored rather than silently matching nothing.
        const { role, status, department, problem } = req.query;
        if (ROLES.includes(role)) { params.push(role); where += ` AND u.role = $${params.length}`; }
        if (status === 'active') where += ' AND u.is_active';
        if (status === 'suspended') where += ' AND NOT u.is_active';
        if (/^\d{4}$/.test(String(req.query.batch || ''))) { params.push(parseInt(req.query.batch, 10)); where += ` AND u.batch = $${params.length}`; }
        if (department) { params.push(String(department)); where += ` AND u.department = $${params.length}`; }
        // Same definition as the "Sync issues" tile on /admin/stats: active members with a failing or not-found handle
        if (problem === '1' || problem === 'true') {
            where += ` AND u.is_active AND EXISTS (SELECT 1 FROM platform_stats q WHERE q.user_id = u.user_id
                       AND (q.sync_failures >= 3 OR q.last_sync_error_kind = 'not_found'))`;
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

// Bulk import: pre-create members from a roster (CSV parsed client-side). They don't get an
// email; they just sign in with their address like anyone else. dry_run defaults to TRUE so a
// forgotten flag can never import by accident: the UI previews first, then sends dry_run:false.
router.post('/admin/users/import', async (req, res) => {
    try {
        const { rows, dry_run } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows to import' });
        if (rows.length > MAX_ROWS) return res.status(400).json({ error: `At most ${MAX_ROWS} rows per import. Split the file.` });

        const analyzed = await analyzeRows(pool, req.college, rows);
        let imported = 0;
        if (dry_run === false) {
            const client = await pool.connect();
            try { imported = await commitRows(client, req.college, analyzed); }
            finally { client.release(); }
        }
        res.json({ dry_run: dry_run !== false, summary: summarize(analyzed, imported), rows: analyzed.map(present) });
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
    slug: c.slug, name: c.name,
    logo_url: c.logo_url,                 // the pasted URL, as saved
    logo_uploaded: !!c.logo_version,      // an uploaded image takes precedence over the URL
    logo_version: c.logo_version || null,
    email_domains: c.email_domains, require_verified_handles: c.require_verified_handles,
    departments: c.departments,
    brand_primary: c.brand_primary, brand_secondary: c.brand_secondary, tagline: c.tagline,
    custom_domain: c.custom_domain, // read-only here: set by the operator
});

router.get('/admin/college', (req, res) => res.json(collegeSettings(req.college)));

router.patch('/admin/college', async (req, res) => {
    try {
        const { name, logo_url, email_domains, require_verified_handles, departments, brand_primary, brand_secondary, tagline } = req.body;
        const next = { ...req.college };

        if (name !== undefined) {
            if (typeof name !== 'string' || !name.trim() || name.length > 150) {
                return res.status(400).json({ error: 'Name must be 1–150 characters' });
            }
            next.name = name.trim();
        }
        if (logo_url !== undefined) {
            if (logo_url !== null && logo_url !== '' && (!/^https?:\/\/\S+$/.test(logo_url) || logo_url.length > 500)) {
                return res.status(400).json({ error: 'Logo must be an http(s) URL (max 500 characters)' });
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
        for (const [key, label] of [['brand_primary', 'Primary color'], ['brand_secondary', 'Secondary color']]) {
            if (req.body[key] === undefined) continue;
            const parsed = parseBrandColor(req.body[key], label);
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            next[key] = parsed.value;
        }
        if (tagline !== undefined) {
            if (tagline !== null && typeof tagline !== 'string') return res.status(400).json({ error: 'Tagline must be text' });
            const t = (tagline || '').trim();
            if (t.length > 120) return res.status(400).json({ error: 'Tagline is limited to 120 characters' });
            next.tagline = t || null;
        }
        if (require_verified_handles !== undefined) {
            if (typeof require_verified_handles !== 'boolean') {
                return res.status(400).json({ error: 'require_verified_handles must be a boolean' });
            }
            next.require_verified_handles = require_verified_handles;
        }

        const { rows } = await pool.query(
            `UPDATE colleges SET name = $2, logo_url = $3, email_domains = $4, require_verified_handles = $5, departments = $6,
                    brand_primary = $7, brand_secondary = $8, tagline = $9
             WHERE college_id = $1
             RETURNING slug, name, logo_url, logo_version, email_domains, require_verified_handles, departments,
                       brand_primary, brand_secondary, tagline, custom_domain`,
            [req.college.college_id, next.name, next.logo_url, next.email_domains, next.require_verified_handles, next.departments,
             next.brand_primary, next.brand_secondary, next.tagline]
        );
        res.json(collegeSettings(rows[0]));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

// --- Logo upload ---
// The browser sends the raw image as the request body. We check what the bytes really are (not the declared
// type) and store them in the database. An uploaded logo wins over a pasted URL until it is removed.
const rawImage = express.raw({
    type: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
    limit: MAX_LOGO_BYTES,
});
router.put('/admin/college/logo', rawImage, async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(415).json({ error: 'Send a PNG, JPEG, GIF, WebP or SVG image.' });
    }
    const found = sniffImage(buf);
    if (!found) return res.status(415).json({ error: 'That file is not a PNG, JPEG, GIF, WebP or SVG image.' });

    const version = logoVersion(buf);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO college_logos (college_id, content_type, data) VALUES ($1, $2, $3)
             ON CONFLICT (college_id) DO UPDATE SET content_type = $2, data = $3, updated_at = NOW()`,
            [req.college.college_id, found.type, buf]
        );
        const { rows } = await client.query(
            `UPDATE colleges SET logo_version = $2 WHERE college_id = $1
             RETURNING slug, name, logo_url, logo_version, email_domains, require_verified_handles, departments,
                       brand_primary, brand_secondary, tagline, custom_domain`,
            [req.college.college_id, version]
        );
        await client.query('COMMIT');
        res.json(collegeSettings(rows[0]));
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    } finally {
        client.release();
    }
});
// body-parser's "too large" and similar errors, as JSON like every other error here
router.use('/admin/college/logo', (err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: `The image is too large. The limit is ${Math.round(MAX_LOGO_BYTES / 1024)} KB.` });
    }
    next(err);
});

router.delete('/admin/college/logo', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM college_logos WHERE college_id = $1', [req.college.college_id]);
        const { rows } = await client.query(
            `UPDATE colleges SET logo_version = NULL WHERE college_id = $1
             RETURNING slug, name, logo_url, logo_version, email_domains, require_verified_handles, departments,
                       brand_primary, brand_secondary, tagline, custom_domain`,
            [req.college.college_id]
        );
        await client.query('COMMIT');
        res.json(collegeSettings(rows[0]));
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    } finally {
        client.release();
    }
});

module.exports = router;
