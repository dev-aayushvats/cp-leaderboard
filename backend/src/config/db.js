const { Pool } = require('pg');
require('dotenv').config();

// SSL is on by default (Neon/cloud). Set DATABASE_SSL=false for a local Postgres.
const useSsl = process.env.DATABASE_SSL !== 'false';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
    console.log('✅ Connected to Postgres');
});

module.exports = pool;
