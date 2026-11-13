// Rating sync worker.
//   npm run worker            one sync of every linked handle, then exit (cron / manual)
//   npm run worker:schedule   long-running: sync now, then on SYNC_CRON (default hourly)
//
// Each platform is a "lane" synced sequentially (with a polite delay between
// handles) while lanes run in parallel, so a full run takes as long as the
// slowest platform rather than the sum. Stalest handles go first, transient
// failures are retried, and every handle records success/failure so problems
// are visible to users and admins instead of silently serving stale data.
require('dotenv').config();
const cron = require('node-cron');
const pool = require('./config/db');
const platforms = require('./platforms');

const TZ = process.env.APP_TIMEZONE || 'UTC';          // decides when "today" rolls over
const CRON = process.env.SYNC_CRON || '0 * * * *';
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = Number(process.env.SYNC_RETRY_MS ?? 2000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const delayFor = (platform) => Number(process.env[`SYNC_DELAY_${platform.id.toUpperCase()}_MS`] ?? platform.delayMs);

let running = false;
let stopping = false;

// Retries transient failures (backoff 2s, 4s); "not found" fails immediately.
async function fetchWithRetry(platform, handle) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await platform.fetchStats(handle);
        } catch (err) {
            if (err.kind !== 'unavailable' || attempt >= MAX_ATTEMPTS || stopping) throw err;
            await sleep(RETRY_BASE_MS * attempt);
        }
    }
}

// One statement, so stats and history can't diverge. The handle check makes it a
// no-op if the user switched handles while we were fetching the old one.
// "Today" is computed in APP_TIMEZONE, in SQL (not JS) to avoid date/zone drift.
async function saveSuccess(row, data) {
    const { rowCount } = await pool.query(
        `WITH today AS (SELECT (NOW() AT TIME ZONE $6)::date AS d),
         upd AS (
            UPDATE platform_stats SET
                daily_starting_count = CASE
                    WHEN last_synced_at IS NULL THEN COALESCE($3::int, questions_solved)   -- first sync: no bogus "+N today"
                    WHEN last_snapshot_date < (SELECT d FROM today) THEN questions_solved  -- new day: yesterday's total is today's start
                    ELSE daily_starting_count END,
                last_snapshot_date = (SELECT d FROM today),
                rating = $1, max_rating = $2,
                questions_solved = COALESCE($3::int, questions_solved),                    -- null = platform doesn't report it
                last_synced_at = NOW(), last_updated = NOW(),
                last_sync_error = NULL, last_sync_error_kind = NULL, sync_failures = 0
            WHERE id = $4 AND LOWER(platform_handle) = LOWER($5)
            RETURNING id, rating, max_rating, questions_solved
         )
         INSERT INTO rating_history (stat_id, recorded_on, rating, max_rating, questions_solved)
         SELECT id, (SELECT d FROM today), rating, max_rating, questions_solved FROM upd
         ON CONFLICT (stat_id, recorded_on) DO UPDATE
         SET rating = EXCLUDED.rating, max_rating = EXCLUDED.max_rating, questions_solved = EXCLUDED.questions_solved`,
        [data.rating, data.maxRating, data.solved, row.id, row.platform_handle, TZ]
    );
    return rowCount;
}

async function saveFailure(row, err) {
    await pool.query(
        `UPDATE platform_stats
         SET sync_failures = sync_failures + 1, last_sync_error = $2, last_sync_error_kind = $3
         WHERE id = $1 AND LOWER(platform_handle) = LOWER($4)`,
        [row.id, String(err.message).slice(0, 300), err.kind || 'unavailable', row.platform_handle]
    );
}

async function runLane(platform, rows, tally) {
    for (const row of rows) {
        if (stopping) return;
        try {
            const data = await fetchWithRetry(platform, row.platform_handle);
            // 0 rows = the user switched handles while we were fetching; nothing was written
            if (await saveSuccess(row, data)) tally.ok++;
            else tally.skipped++;
        } catch (err) {
            if (err.kind === 'not_found') tally.notFound++;
            else tally.failed++;
            console.warn(`⚠️  ${platform.id}/${row.platform_handle}: ${err.message}`);
            await saveFailure(row, err).catch((e) => console.error('Could not record failure:', e.message));
        }
        await sleep(delayFor(platform));
    }
}

async function runSync() {
    if (running) {
        console.log('⏭️  Previous sync still running, skipping this tick');
        return null;
    }
    running = true;
    const started = Date.now();
    const tally = { ok: 0, notFound: 0, failed: 0, skipped: 0 };
    try {
        console.log('🔄 Sync started');
        // Suspended users are skipped to save platform API calls. Stalest first, so a
        // run that gets cut short still refreshes whoever has waited longest.
        const { rows } = await pool.query(
            `SELECT p.id, p.platform_name, p.platform_handle
             FROM platform_stats p JOIN users u ON u.user_id = p.user_id
             WHERE u.is_active
             ORDER BY p.last_synced_at NULLS FIRST, p.id`
        );

        const lanes = {};
        for (const row of rows) (lanes[row.platform_name] ||= []).push(row);

        await Promise.all(Object.entries(lanes).map(([id, laneRows]) => {
            const platform = platforms.get(id);
            if (!platform) {
                console.warn(`⚠️  Unknown platform "${id}" (${laneRows.length} handles skipped)`);
                return null;
            }
            return runLane(platform, laneRows, tally);
        }));

        const secs = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`✅ Sync finished in ${secs}s: ${tally.ok} ok, ${tally.notFound} not found, ${tally.failed} failed, ${tally.skipped} skipped`);
        return tally;
    } finally {
        running = false;
    }
}

async function main() {
    if (!process.argv.includes('--schedule')) {
        const tally = await runSync();
        await pool.end();
        return tally;
    }

    if (!cron.validate(CRON)) throw new Error(`Invalid SYNC_CRON "${CRON}"`);
    console.log(`⏰ Scheduled sync: "${CRON}" (${TZ})`);

    const shutdown = async (signal) => {
        console.log(`${signal} received, finishing current handle and exiting...`);
        stopping = true;
        while (running) await sleep(200);
        await pool.end();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    const tick = () => runSync().catch((err) => console.error('Sync crashed:', err));
    cron.schedule(CRON, tick, { timezone: TZ });
    await tick();
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { runSync };
