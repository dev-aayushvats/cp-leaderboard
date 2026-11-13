// Create or update a college (tenant).
// Usage: npm run college:add -- <slug> "<Display Name>" [domain1,domain2,...]
// Re-running with an existing slug updates its name and domains.
const pool = require('../src/config/db');

async function main() {
    const [slug, name, domainsArg = ''] = process.argv.slice(2);
    if (!slug || !name) {
        console.error('Usage: npm run college:add -- <slug> "<Display Name>" [domain1,domain2,...]');
        process.exitCode = 1;
        return;
    }
    const domains = domainsArg.split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);

    const { rows } = await pool.query(
        `INSERT INTO colleges (slug, name, email_domains) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = $2, email_domains = $3
         RETURNING slug, name, email_domains`,
        [slug.toLowerCase(), name, domains]
    );
    const c = rows[0];
    console.log(`✅ ${c.name} (${c.slug})`);
    console.log(c.email_domains.length
        ? `   Sign-up restricted to: ${c.email_domains.join(', ')}`
        : '   ⚠️  No email domains set: registration is OPEN to any email.');
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
