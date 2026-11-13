// src/worker.js
const pool = require('./config/db'); // Reuse your DB connection
require('dotenv').config();

const { fetchLeetCodeData, fetchCodeforcesData } = require('./services/platforms');

// Helper: Sleep function to prevent Rate Limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateRatings() {
    console.log('🔄 Starting Update...');

    try {
        // Suspended users are skipped to save platform API calls
        const res = await pool.query(
            "SELECT p.* FROM platform_stats p JOIN users u ON u.user_id = p.user_id WHERE u.is_active"
        );
        const entries = res.rows;
        
        // Get today's date string (YYYY-MM-DD) to check for rollover
        const today = new Date().toLocaleDateString('en-CA'); // 'en-CA' gives YYYY-MM-DD format

        for (const entry of entries) {
            let data = null;

            // 1. Fetch Data
            if (entry.platform_name === 'leetcode') {
                data = await fetchLeetCodeData(entry.platform_handle);
                await sleep(2000);
            } else if (entry.platform_name === 'codeforces') {
                data = await fetchCodeforcesData(entry.platform_handle);
                await sleep(1000);
            }

            if (data) {
                // 2. Calculate Daily Progress
                let dailyStart = entry.daily_starting_count;
                let lastDate = entry.last_snapshot_date ? entry.last_snapshot_date.toISOString().split('T')[0] : "";

                // CHECK FOR NEW DAY: If stored date is not today, reset the counter
                if (lastDate !== today) {
                    console.log(`📅 New Day detected for ${entry.platform_handle}. Resetting daily count.`);
                    dailyStart = entry.questions_solved; // The count from "yesterday" becomes today's start
                    lastDate = today;
                }

                // If it's a new user (0 start), set start to current so they don't show +500 today
                if (dailyStart === 0 && entry.questions_solved === 0) {
                     dailyStart = data.solved;
                }

                // 3. Update Database
                await pool.query(
                    `UPDATE platform_stats 
                     SET rating = $1, 
                         questions_solved = $2, 
                         max_rating = $3, 
                         daily_starting_count = $4,
                         last_snapshot_date = $5,
                         last_updated = NOW() 
                     WHERE id = $6`,
                    [
                        Math.round(data.rating), 
                        data.solved, 
                        data.maxRating, 
                        dailyStart, 
                        lastDate, // Save 'today' as the snapshot date
                        entry.id
                    ]
                );
                
                console.log(`✅ ${entry.platform_handle}: Total ${data.solved} | Today: +${data.solved - dailyStart}`);
            }
        }
    } catch (err) {
        console.error('Update Failed:', err);
    }
}

// --- EXECUTION ---
// If you want to run this purely as a script once:
updateRatings().then(() => {
    pool.end(); // Close DB connection if running once
});

// If you want this to run forever every 1 hour (uncomment below):
/*
const cron = require('node-cron');
cron.schedule('0 * * * *', () => {
    updateRatings();
});
*/