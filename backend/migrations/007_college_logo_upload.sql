-- Admins can upload a logo image instead of (or as well as) pasting a URL. The image is stored in the
-- database: nothing extra to mount, back up or lose, and it follows the college everywhere. It lives in its own
-- table so the college row (read on every request) never carries the bytes.
CREATE TABLE college_logos (
    college_id   UUID PRIMARY KEY REFERENCES colleges(college_id) ON DELETE CASCADE,
    content_type VARCHAR(40) NOT NULL,
    data         BYTEA NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Short content hash of the uploaded image; NULL = no upload. It goes into the image URL (?v=...) so browsers
-- refetch exactly when the logo changes and may cache it for a long time otherwise.
ALTER TABLE colleges ADD COLUMN logo_version VARCHAR(16);
