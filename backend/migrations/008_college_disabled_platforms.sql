-- Platforms a college has switched off (e.g. students there don't use AtCoder). A list of
-- *disabled* ids, not enabled ones, so a platform added to the code later is on by default.
ALTER TABLE colleges ADD COLUMN disabled_platforms TEXT[] NOT NULL DEFAULT '{}';
