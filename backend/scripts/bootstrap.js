// First-run helper for container deployments: creates a college and its first admin from environment
// variables, so a fresh install needs no manual CLI steps. Runs on every API start and is
// deliberately NON-DESTRUCTIVE: it only creates things that don't exist yet. Anything you later change
// in the admin panel (name, domains, branding) or in the console is never overwritten, and an admin
// you demoted or suspended is not re-promoted.
//   BOOTSTRAP_COLLEGE_SLUG, BOOTSTRAP_COLLEGE_NAME, BOOTSTRAP_EMAIL_DOMAINS (comma-separated),
//   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME
const pool = require('../src/config/db');
const { validateSlug, parseEmailDomains, isEmail, collegeUrl } = require('../src/lib/colleges');

async function main() {
    const slugRaw = (process.env.BOOTSTRAP_COLLEGE_SLUG || '').trim();
    if (!slugRaw) {
        console.log('bootstrap: no BOOTSTRAP_COLLEGE_SLUG set, nothing to do');
        return;
    }
    const slug = validateSlug(slugRaw);
    const domains = parseEmailDomains(process.env.BOOTSTRAP_EMAIL_DOMAINS);
    const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
    const problem = slug.error || domains.error || (adminEmail && !isEmail(adminEmail) ? `"${adminEmail}" is not a valid admin email.` : null);
    if (problem) throw new Error(`bootstrap: ${problem}`);

    const name = (process.env.BOOTSTRAP_COLLEGE_NAME || slug.value).trim();
    const inserted = await pool.query(
        `INSERT INTO colleges (slug, name, email_domains) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO NOTHING RETURNING college_id`,
        [slug.value, name, domains.value]
    );
    const college = inserted.rows[0]
        ? { college_id: inserted.rows[0].college_id, created: true }
        : { college_id: (await pool.query('SELECT college_id FROM colleges WHERE slug = $1', [slug.value])).rows[0].college_id, created: false };
    console.log(college.created
        ? `bootstrap: created college "${name}" (${slug.value}) at ${collegeUrl(slug.value)}`
        : `bootstrap: college "${slug.value}" already exists, leaving it as is`);
    if (college.created && domains.value.length === 0) console.log('bootstrap: WARNING no BOOTSTRAP_EMAIL_DOMAINS set, so registration is open to any email');

    if (!adminEmail) {
        if (college.created) console.log('bootstrap: no BOOTSTRAP_ADMIN_EMAIL set, so this college has no admin yet (npm run admin:add)');
        return;
    }
    const existing = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [adminEmail]);
    if (existing.rows.length > 0) {
        console.log(`bootstrap: ${adminEmail} already has an account, leaving it as is`);
        return;
    }
    const username = (process.env.BOOTSTRAP_ADMIN_NAME || adminEmail.split('@')[0]).trim().slice(0, 50);
    await pool.query(
        "INSERT INTO users (username, email, college_id, role) VALUES ($1, $2, $3, 'college_admin')",
        [username, adminEmail, college.college_id]
    );
    console.log(`bootstrap: created admin ${adminEmail}. They can sign in with an emailed code.`);
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
