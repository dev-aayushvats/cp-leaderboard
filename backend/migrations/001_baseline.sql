-- Baseline: the schema as it actually exists in production today.
-- Written with IF NOT EXISTS so it is a safe no-op on the already-provisioned DB
-- and builds the full schema on a fresh one.

CREATE TABLE IF NOT EXISTS users (
    user_id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username   VARCHAR(50)  UNIQUE NOT NULL,
    email      VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS institute VARCHAR(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country   VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state     VARCHAR(100);
-- Auth is passwordless (email OTP)
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

CREATE TABLE IF NOT EXISTS platform_stats (
    id              SERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(user_id) ON DELETE CASCADE,
    platform_name   VARCHAR(20)  NOT NULL,   -- 'leetcode' | 'codeforces'
    platform_handle VARCHAR(100) NOT NULL,
    rating          INT DEFAULT 0,
    last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, platform_name)
);
ALTER TABLE platform_stats ADD COLUMN IF NOT EXISTS max_rating           INT  DEFAULT 0;
ALTER TABLE platform_stats ADD COLUMN IF NOT EXISTS questions_solved     INT  DEFAULT 0;  -- used by worker/API but missing from old database.sql
ALTER TABLE platform_stats ADD COLUMN IF NOT EXISTS daily_starting_count INT  DEFAULT 0;
ALTER TABLE platform_stats ADD COLUMN IF NOT EXISTS last_snapshot_date   DATE DEFAULT CURRENT_DATE;

CREATE TABLE IF NOT EXISTS email_otps (
    email      VARCHAR(100) PRIMARY KEY,
    otp_code   VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
);
