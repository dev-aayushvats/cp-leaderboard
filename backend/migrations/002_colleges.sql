-- Multi-tenancy: every user belongs to exactly one college.

CREATE TABLE colleges (
    college_id    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug          VARCHAR(50)  UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
    name          VARCHAR(150) NOT NULL,
    -- Allowed email domains for sign-up, e.g. {'mit.edu'}. Empty array = open registration.
    email_domains TEXT[] NOT NULL DEFAULT '{}',
    logo_url      TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Existing users are moved into a legacy open college so nothing breaks.
INSERT INTO colleges (slug, name) VALUES ('default', 'Default College');

ALTER TABLE users ADD COLUMN college_id UUID REFERENCES colleges(college_id) ON DELETE RESTRICT;
UPDATE users SET college_id = (SELECT college_id FROM colleges WHERE slug = 'default');
ALTER TABLE users ALTER COLUMN college_id SET NOT NULL;

-- Usernames are unique per college, not globally.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT users_college_username_key UNIQUE (college_id, username);

-- Emails stay globally unique (one account per person), case-insensitively.
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));

CREATE INDEX idx_users_college ON users (college_id);
CREATE INDEX idx_platform_stats_leaderboard ON platform_stats (platform_name, rating DESC);
