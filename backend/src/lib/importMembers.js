// Bulk member import for college admins (a pasted/uploaded CSV, parsed by the client).
// analyzeRows() decides what would happen to each row; the dry run and the real run
// both use it, so the preview can never disagree with the result.
const { emailAllowed, domainError, normalizeEmail } = require('./college');
const { isEmail } = require('./colleges');
const { parseHandles, parseAcademic } = require('./profile');
const { newVerificationToken } = require('./tokens');

const MAX_ROWS = 1000;

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

// rows: [{ line?, email, name?, batch?, department?, handles?: {platformId: handle} }]
// -> [{ line, email, username, batch, department, handles, status: 'ok'|'exists'|'error', message? }]
async function analyzeRows(db, college, rows) {
    const out = rows.map((raw, i) => {
        const r = { line: Number.isFinite(raw?.line) ? raw.line : i + 1, email: '', status: 'ok' };
        const fail = (message) => Object.assign(r, { status: 'error', message });

        r.email = normalizeEmail(raw?.email);
        if (!isEmail(r.email)) { fail('Not a valid email address'); return r; }
        if (!emailAllowed(college, r.email)) { fail(domainError(college).replace(/^Registration for /, 'Not allowed: ')); return r; }

        r.username = (blank(raw.name) ? r.email.split('@')[0] : String(raw.name).trim());
        if (r.username.length > 50) { fail('Name is longer than 50 characters'); return r; }

        const academicInput = {};
        if (!blank(raw.batch)) academicInput.batch = raw.batch;
        if (!blank(raw.department)) academicInput.department = String(raw.department).trim();
        const academic = parseAcademic(college, academicInput);
        if (academic.error) { fail(academic.error); return r; }
        r.batch = academic.values.batch ?? null;
        r.department = academic.values.department ?? null;

        const handles = parseHandles(raw.handles);
        if (handles.error) { fail(handles.error); return r; }
        r.handles = handles.handles;
        return r;
    });

    // Duplicates inside the file: the first occurrence wins
    const firstEmail = new Map();
    const firstName = new Map();
    for (const r of out) {
        if (r.status !== 'ok') continue;
        if (firstEmail.has(r.email)) { Object.assign(r, { status: 'error', message: `Same email as line ${firstEmail.get(r.email)}` }); continue; }
        firstEmail.set(r.email, r.line);
        if (firstName.has(r.username)) { Object.assign(r, { status: 'error', message: `Display name "${r.username}" is also used on line ${firstName.get(r.username)}` }); continue; }
        firstName.set(r.username, r.line);
    }

    // Against the database. An email that already has an account is skipped (not an
    // error: re-running an import is safe) without saying which college it's in.
    const candidates = out.filter((r) => r.status === 'ok');
    if (candidates.length > 0) {
        const emails = (await db.query('SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1)', [candidates.map((r) => r.email)]))
            .rows.map((x) => x.email);
        const taken = new Set(emails);
        for (const r of candidates) if (taken.has(r.email)) Object.assign(r, { status: 'exists', message: 'Already registered' });

        const names = (await db.query('SELECT username FROM users WHERE college_id = $1 AND username = ANY($2)',
            [college.college_id, candidates.filter((r) => r.status === 'ok').map((r) => r.username)])).rows.map((x) => x.username);
        const usedNames = new Set(names);
        for (const r of candidates) {
            if (r.status === 'ok' && usedNames.has(r.username)) {
                Object.assign(r, { status: 'error', message: `Display name "${r.username}" is already taken in this college` });
            }
        }
    }
    return out;
}

// Inserts every 'ok' row. Each row gets its own savepoint, so one that loses a race
// (someone registered the same email a moment ago) fails alone instead of sinking the batch.
async function commitRows(client, college, analyzed) {
    let imported = 0;
    await client.query('BEGIN');
    try {
        for (const r of analyzed) {
            if (r.status !== 'ok') continue;
            await client.query('SAVEPOINT member');
            try {
                const { rows } = await client.query(
                    `INSERT INTO users (username, email, college_id, batch, department) VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
                    [r.username, r.email, college.college_id, r.batch, r.department]
                );
                for (const [platform, handle] of r.handles) {
                    await client.query(
                        'INSERT INTO platform_stats (user_id, platform_name, platform_handle, verification_token) VALUES ($1, $2, $3, $4)',
                        [rows[0].user_id, platform, handle, newVerificationToken()]
                    );
                }
                await client.query('RELEASE SAVEPOINT member');
                r.status = 'imported';
                imported++;
            } catch (err) {
                await client.query('ROLLBACK TO SAVEPOINT member');
                if (err.code !== '23505') throw err;
                Object.assign(r, { status: 'error', message: 'Someone registered this email or name just now. Check it and import again.' });
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    return imported;
}

const summarize = (rows, imported = 0) => ({
    total: rows.length,
    ok: rows.filter((r) => r.status === 'ok' || r.status === 'imported').length,
    exists: rows.filter((r) => r.status === 'exists').length,
    error: rows.filter((r) => r.status === 'error').length,
    imported,
});

// Public shape (never leaks internals)
const present = (r) => ({ line: r.line, email: r.email, username: r.username ?? null, status: r.status, message: r.message ?? null });

module.exports = { MAX_ROWS, analyzeRows, commitRows, summarize, present };
