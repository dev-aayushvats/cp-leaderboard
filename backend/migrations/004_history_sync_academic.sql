-- Phase 3: rating history, sync health, batch/department.

-- Rating history: one row per handle per day (the day's latest values). -----
CREATE TABLE rating_history (
    stat_id          INT  NOT NULL REFERENCES platform_stats(id) ON DELETE CASCADE,
    recorded_on      DATE NOT NULL,
    rating           INT  NOT NULL,
    max_rating       INT  NOT NULL DEFAULT 0,
    questions_solved INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (stat_id, recorded_on)
);

-- Sync health, per linked handle. ---------------------------------------------
-- last_synced_at: last SUCCESSFUL sync (NULL = never). sync_failures counts
-- consecutive failures; last_sync_error says why the latest attempt failed.
-- TIMESTAMPTZ (unlike the older TIMESTAMP columns) so the instant is unambiguous
-- no matter which timezone the DB session or the API server runs in.
ALTER TABLE platform_stats ADD COLUMN last_synced_at  TIMESTAMPTZ;
ALTER TABLE platform_stats ADD COLUMN last_sync_error TEXT;
-- 'not_found' (handle doesn't exist: needs a human) or 'unavailable' (transient)
ALTER TABLE platform_stats ADD COLUMN last_sync_error_kind VARCHAR(20);
ALTER TABLE platform_stats ADD COLUMN sync_failures   INT NOT NULL DEFAULT 0;
-- Rows that already hold real data count as synced.
UPDATE platform_stats SET last_synced_at = last_updated::timestamptz  -- written by NOW() in the session zone
 WHERE rating > 0 OR questions_solved > 0 OR max_rating > 0;

-- Academic info ----------------------------------------------------------------
ALTER TABLE users ADD COLUMN batch SMALLINT CHECK (batch BETWEEN 1990 AND 2100);  -- graduation year
ALTER TABLE users ADD COLUMN department VARCHAR(80);
-- Departments a college offers (admin-managed, so values stay clean/filterable).
ALTER TABLE colleges ADD COLUMN departments TEXT[] NOT NULL DEFAULT '{}';
