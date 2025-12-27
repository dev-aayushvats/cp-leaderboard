const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // SSL block for Neon/Cloud DBs
    ssl: {
        rejectUnauthorized: false, 
    },
});

pool.on('connect', () => {
    console.log('✅ Connected to Neon Postgres');
});

module.exports = pool;