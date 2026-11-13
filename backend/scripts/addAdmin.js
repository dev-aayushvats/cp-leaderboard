// Make someone a college admin: creates the account if needed, or promotes an
// existing one. They then log in normally with an email OTP. The college's
// email-domain whitelist is NOT enforced here, so admins may use any address.
// Usage: npm run admin:add -- <college-slug> <email> [display-name]
const pool = require('../src/config/db');

async function main() {
    const [slug, rawEmail, name] = process.argv.slice(2);
    if (!slug || !rawEmail) {
        console.error('Usage: npm run admin:add -- <college-slug> <email> [display-name]');
        process.exitCode = 1;
        return;
    }
    const email = rawEmail.trim().toLowerCase();

    const college = await pool.query('SELECT college_id, name FROM colleges WHERE slug = $1', [slug.toLowerCase()]);
    if (college.rows.length === 0) {
        console.error(`No college with slug "${slug}". Create it with: npm run college:add`);
        process.exitCode = 1;
        return;
    }
    const { college_id, name: collegeName } = college.rows[0];

    const existing = await pool.query('SELECT user_id, college_id FROM users WHERE LOWER(email) = $1', [email]);
    if (existing.rows.length > 0) {
        if (existing.rows[0].college_id !== college_id) {
            console.error(`${email} already has an account in a different college.`);
            process.exitCode = 1;
            return;
        }
        await pool.query("UPDATE users SET role = 'college_admin', is_active = TRUE WHERE user_id = $1", [existing.rows[0].user_id]);
        console.log(`✅ Promoted existing user ${email} to admin of ${collegeName}`);
        return;
    }

    const username = (name || email.split('@')[0]).slice(0, 50);
    await pool.query(
        "INSERT INTO users (username, email, college_id, role) VALUES ($1, $2, $3, 'college_admin')",
        [username, email, college_id]
    );
    console.log(`✅ Created admin ${username} <${email}> for ${collegeName}. They can log in with an email code.`);
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
