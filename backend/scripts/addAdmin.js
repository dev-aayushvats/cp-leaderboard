// Make someone a college admin: creates the account if needed, or promotes an
// existing one. They then log in normally with an email OTP. The college's
// email-domain whitelist is NOT enforced here, so admins may use any address.
// Usage: npm run admin:add -- <college-slug> <email> [display-name]
const pool = require('../src/config/db');
const { isEmail, ensureAdmin } = require('../src/lib/colleges');

async function main() {
    const [slug, email, name] = process.argv.slice(2);
    if (!slug || !email) {
        console.error('Usage: npm run admin:add -- <college-slug> <email> [display-name]');
        process.exitCode = 1;
        return;
    }
    if (!isEmail(email.trim())) {
        console.error(`"${email}" is not a valid email address.`);
        process.exitCode = 1;
        return;
    }

    const college = await pool.query('SELECT college_id, name FROM colleges WHERE slug = $1', [slug.toLowerCase()]);
    if (college.rows.length === 0) {
        console.error(`No college with slug "${slug}". Create it with: npm run college:add`);
        process.exitCode = 1;
        return;
    }
    const { college_id, name: collegeName } = college.rows[0];

    const result = await ensureAdmin(pool, college_id, email, name);
    if (result.error) {
        console.error(`${email} already has an account in a different college.`);
        process.exitCode = 1;
    } else if (result.action === 'promoted') {
        console.log(`✅ Promoted existing user ${result.user.email} to admin of ${collegeName}`);
    } else {
        console.log(`✅ Created admin ${result.user.username} <${result.user.email}> for ${collegeName}. They can log in with an email code.`);
    }
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
