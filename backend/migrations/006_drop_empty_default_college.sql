-- Migration 002 seeded a 'default' college on every install so that pre-multi-tenant users had a home.
-- On a fresh install that leaves an open-registration college nobody manages (and, in hosted mode, a live
-- default.<your-domain>). Remove it when it is unused. A 'default' college that has members is left alone.
DELETE FROM colleges c
WHERE c.slug = 'default'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.college_id = c.college_id);
