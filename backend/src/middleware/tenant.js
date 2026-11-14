const pool = require('../config/db');

// <slug>.<ROOT_DOMAIN> serves a college, e.g. mit.leaderboard.example.com.
// *.localhost always works too, so subdomain routing can be tried locally
// (browsers resolve mit.localhost to 127.0.0.1) without touching /etc/hosts.
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || '').trim().toLowerCase().replace(/^\./, '');
const ROOTS = [...new Set([ROOT_DOMAIN, 'localhost'].filter(Boolean))];

const normalizeHost = (raw) =>
    String(raw || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '') || null;

// 'mit.leaderboard.example.com' -> 'mit'. Only a single label directly under a
// root counts (a.b.example.com is not a college), and the root itself has no slug.
function slugFromHost(host) {
    if (!host) return null;
    for (const root of ROOTS) {
        if (host.endsWith('.' + root)) {
            const sub = host.slice(0, -(root.length + 1));
            if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sub)) return sub;
        }
    }
    return null;
}

// Tenant resolution, in priority order:
//   1. a college whose custom_domain equals the request host (X-College-Host)
//   2. X-College-Slug (explicit: dev, tests, single-college deployments)
//   3. the slug in the request host (<slug>.<ROOT_DOMAIN>)
//   4. DEFAULT_COLLEGE_SLUG, but ONLY if the request named no college of its own.
// A request that names a college that doesn't exist (a typo'd subdomain) is
// "unknown", never silently served the default college.
// The frontend sends X-College-Host (the browser's hostname); this is routing, not
// access control: data is protected by tokens, which are bound to a college.
const resolveCollege = async (req, res, next) => {
    const host = normalizeHost(req.headers['x-college-host']);
    const explicit = String(req.headers['x-college-slug'] || '').trim().toLowerCase();
    const slug = explicit || slugFromHost(host) || String(process.env.DEFAULT_COLLEGE_SLUG || '').trim().toLowerCase() || null;

    const { rows } = await pool.query(
        `SELECT college_id, slug, name, email_domains, logo_url, require_verified_handles, departments,
                brand_primary, brand_secondary, tagline, custom_domain, logo_version, disabled_platforms
         FROM colleges
         WHERE is_active AND (($1::text IS NOT NULL AND custom_domain = $1) OR ($2::text IS NOT NULL AND slug = $2))
         ORDER BY (custom_domain = $1::text) DESC NULLS LAST
         LIMIT 1`,
        [host, slug]
    );
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Unknown college', root_domain: ROOT_DOMAIN || null });
    }
    req.college = rows[0];
    next();
};

module.exports = { resolveCollege, slugFromHost, normalizeHost, ROOT_DOMAIN };
