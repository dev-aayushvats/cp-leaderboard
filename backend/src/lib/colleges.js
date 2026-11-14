// Operator-level college management, shared by the CLI (scripts/), the platform
// console API (routes/platform.js) and the container bootstrap, so all of them
// apply exactly the same rules.
const { normalizeDomains, domainProblem, isPublicSuffix } = require('./college');

const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || '').trim().toLowerCase().replace(/^\./, '');

// Names that would collide with infrastructure or look official as a subdomain
const RESERVED_SLUGS = new Set(['www', 'api', 'app', 'admin', 'root', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn',
    'docs', 'help', 'support', 'status', 'login', 'auth', 'dashboard', 'blog', 'platform', 'localhost']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (s) => typeof s === 'string' && s.length <= 100 && EMAIL_RE.test(s);

// -> { value } | { error }
function validateSlug(raw) {
    const slug = String(raw || '').trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length > 50) {
        return { error: `Invalid slug "${raw}": use lowercase letters, digits and hyphens (it becomes a subdomain, so no leading/trailing hyphen; max 50).` };
    }
    if (RESERVED_SLUGS.has(slug)) return { error: `"${slug}" is reserved. Pick another slug.` };
    return { value: slug };
}

// Accepts an array or a comma-separated string. Empty = open registration.
function parseEmailDomains(input) {
    const list = Array.isArray(input) ? input : String(input || '').split(',');
    const domains = normalizeDomains(list);
    for (const d of domains) {
        const problem = domainProblem(d);
        if (problem) return { error: problem };
    }
    return { value: domains };
}

// null/'' clears it. A custom domain must not sit under the platform's own root
// (that namespace is for <slug>.<ROOT_DOMAIN>), or routing would be ambiguous.
function parseCustomDomain(raw) {
    if (raw === null || raw === undefined || raw === '') return { value: null };
    const domain = String(raw).trim().toLowerCase();
    if (isPublicSuffix(domain)) return { error: `"${domain}" is a shared suffix, not a domain a college can own. Use the college's own address, such as cp.yourcollege.edu.` };
    const problem = domainProblem(domain);
    if (problem) return { error: problem };
    for (const root of [ROOT_DOMAIN, 'localhost'].filter(Boolean)) {
        if (domain === root || domain.endsWith('.' + root)) {
            return { error: `"${domain}" is under ${root}, which the platform uses for <slug>.${root}. Use the college's own domain.` };
        }
    }
    return { value: domain };
}

const collegeUrl = (slug) => (ROOT_DOMAIN ? `https://${slug}.${ROOT_DOMAIN}` : `http://${slug}.localhost:3000`);

// Create the account if needed, or promote an existing member, as admin of a college.
// The college's email whitelist is deliberately NOT applied: operators may name any address.
// -> { action: 'created' | 'promoted', user } | { error: 'other_college' }
async function ensureAdmin(db, collegeId, rawEmail, name) {
    const email = String(rawEmail).trim().toLowerCase();
    const existing = await db.query('SELECT user_id, college_id, username FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length > 0) {
        if (existing.rows[0].college_id !== collegeId) return { error: 'other_college' };
        await db.query("UPDATE users SET role = 'college_admin', is_active = TRUE WHERE user_id = $1", [existing.rows[0].user_id]);
        return { action: 'promoted', user: { email, username: existing.rows[0].username } };
    }
    const username = String(name || email.split('@')[0]).trim().slice(0, 50);
    await db.query(
        "INSERT INTO users (username, email, college_id, role) VALUES ($1, $2, $3, 'college_admin')",
        [username, email, collegeId]
    );
    return { action: 'created', user: { email, username } };
}

module.exports = { ROOT_DOMAIN, RESERVED_SLUGS, isEmail, validateSlug, parseEmailDomains, parseCustomDomain, collegeUrl, ensureAdmin };
