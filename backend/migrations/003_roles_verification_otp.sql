-- Phase 2: roles & moderation, handle-ownership verification, OTP hardening.

-- Roles / moderation -------------------------------------------------------
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'college_admin'));
-- Suspended users cannot log in and are hidden from leaderboards.
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Handle verification --------------------------------------------------------
-- A user proves they own a handle by putting verification_token in their
-- platform profile; verified_at is set once the backend has seen it there.
ALTER TABLE platform_stats ADD COLUMN verification_token VARCHAR(20);
ALTER TABLE platform_stats ADD COLUMN verified_at TIMESTAMP;
UPDATE platform_stats
   SET verification_token = 'lb-' || substr(md5(random()::text || id::text), 1, 10)
 WHERE verification_token IS NULL;
ALTER TABLE platform_stats ALTER COLUMN verification_token SET NOT NULL;

-- A handle can be verified by at most one account (across all colleges).
CREATE UNIQUE INDEX platform_stats_verified_handle_idx
    ON platform_stats (platform_name, LOWER(platform_handle))
    WHERE verified_at IS NOT NULL;

-- Colleges can choose to show only verified handles on the leaderboard.
ALTER TABLE colleges ADD COLUMN require_verified_handles BOOLEAN NOT NULL DEFAULT FALSE;

-- OTP hardening ----------------------------------------------------------------
-- Failed guesses are counted per OTP; the code dies after too many.
ALTER TABLE email_otps ADD COLUMN attempts INT NOT NULL DEFAULT 0;
