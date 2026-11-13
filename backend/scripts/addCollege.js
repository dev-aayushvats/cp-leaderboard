// Create or update a college (tenant). Operator-only: there is no self-serve signup for colleges.
// Usage: npm run college:add -- <slug> "<Display Name>" [email-domain1,email-domain2] [--custom-domain=cp.college.edu]
//   slug            becomes the subdomain: <slug>.<ROOT_DOMAIN>
//   email domains   sign-up whitelist (none = registration open to any email)
//   --custom-domain serve this college from its own domain too (point its DNS at the platform first)
// Re-running with an existing slug updates its name and email domains (and custom domain, if given).
const pool = require('../src/config/db');
const { isValidDomain } = require('../src/lib/college');

// Names that would collide with infrastructure or look official as a subdomain
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'root', 'mail', 'smtp', 'ftp', 'static', 'assets', 'cdn',
    'docs', 'help', 'support', 'status', 'login', 'auth', 'dashboard', 'blog', 'localhost']);

async function main() {
    const args = process.argv.slice(2);
    const flags = {};
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const m = args[i].match(/^--([a-z-]+)(?:=(.*))?$/);
        if (!m) { positional.push(args[i]); continue; }
        flags[m[1]] = m[2] !== undefined ? m[2] : args[++i];
    }
    const [slugArg, name, domainsArg = ''] = positional;
    if (!slugArg || !name) {
        console.error('Usage: npm run college:add -- <slug> "<Display Name>" [email-domain1,email-domain2] [--custom-domain=cp.college.edu]');
        process.exitCode = 1;
        return;
    }

    const slug = slugArg.toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
        console.error(`Invalid slug "${slugArg}": use lowercase letters, digits and hyphens (it becomes a subdomain, so no leading/trailing hyphen).`);
        process.exitCode = 1;
        return;
    }
    if (RESERVED.has(slug)) {
        console.error(`"${slug}" is reserved. Pick another slug.`);
        process.exitCode = 1;
        return;
    }

    const emailDomains = domainsArg.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
    const bad = emailDomains.find((d) => !isValidDomain(d));
    if (bad) {
        console.error(`"${bad}" is not a valid email domain.`);
        process.exitCode = 1;
        return;
    }

    let customDomain = null;
    if (flags['custom-domain'] !== undefined) {
        customDomain = String(flags['custom-domain']).trim().toLowerCase();
        if (!isValidDomain(customDomain)) {
            console.error(`"${customDomain}" is not a valid domain.`);
            process.exitCode = 1;
            return;
        }
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO colleges (slug, name, email_domains, custom_domain) VALUES ($1, $2, $3, $4)
             ON CONFLICT (slug) DO UPDATE
             SET name = $2, email_domains = $3, custom_domain = COALESCE($4, colleges.custom_domain)
             RETURNING slug, name, email_domains, custom_domain`,
            [slug, name, emailDomains, customDomain]
        );
        const c = rows[0];
        const root = process.env.ROOT_DOMAIN;
        console.log(`✅ ${c.name} (${c.slug})`);
        console.log(`   URL: ${root ? `https://${c.slug}.${root}` : `http://${c.slug}.localhost:3000 (set ROOT_DOMAIN for a real domain)`}`);
        if (c.custom_domain) console.log(`   Custom domain: ${c.custom_domain}`);
        console.log(c.email_domains.length
            ? `   Sign-up restricted to: ${c.email_domains.join(', ')}`
            : '   ⚠️  No email domains set: registration is OPEN to any email.');
    } catch (err) {
        if (err.code === '23505' && /custom_domain/.test(err.constraint || '')) {
            console.error(`"${customDomain}" is already used by another college.`);
            process.exitCode = 1;
            return;
        }
        throw err;
    }
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
