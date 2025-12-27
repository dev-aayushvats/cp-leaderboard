-- 1. Users Table (For logging into your platform)
CREATE TABLE users (
    user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Platform Handles Table (Stores the linked accounts and ratings)
CREATE TABLE platform_stats (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    platform_name VARCHAR(20) NOT NULL, -- e.g., 'leetcode', 'codeforces'
    platform_handle VARCHAR(100) NOT NULL,
    rating INT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, platform_name) -- A user can only have one handle per platform
);

-- Add the max_rating field to the platform_stats table
ALTER TABLE platform_stats
ADD COLUMN max_rating INT DEFAULT 0;


ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL;

ALTER TABLE platform_stats ADD COLUMN daily_starting_count INT DEFAULT 0;
ALTER TABLE platform_stats ADD COLUMN last_snapshot_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE users ADD COLUMN institute VARCHAR(150);
ALTER TABLE users ADD COLUMN country VARCHAR(100);
ALTER TABLE users ADD COLUMN state VARCHAR(100);

-- 1. Remove password column
ALTER TABLE users DROP COLUMN password_hash;

-- 2. Create OTP Table
CREATE TABLE email_otps (
    email VARCHAR(100) PRIMARY KEY,
    otp_code VARCHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes')
);