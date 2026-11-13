// Minimal forward-only SQL migration runner.
// Applies migrations/*.sql in filename order, each in its own transaction,
// and records them in schema_migrations. Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name       TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT NOW()
        )`);

    const applied = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
        if (applied.has(file)) continue;
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            console.log(`✅ Applied ${file}`);
            count++;
        } catch (err) {
            await client.query('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${err.message}`);
        } finally {
            client.release();
        }
    }
    console.log(count ? `Done. ${count} migration(s) applied.` : 'Database is up to date.');
}

migrate()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => pool.end());
