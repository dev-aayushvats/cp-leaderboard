# Architecture, data flow and platform overview

## 1. What it is

A **whitelabel competitive-programming leaderboard for colleges**. Students sign in with a college email (no
passwords), link their LeetCode / Codeforces / AtCoder handles, and are ranked against their peers. Each college has
its own address, branding, members and leaderboard, isolated from every other college.

One codebase runs two ways:

| Mode | Who runs it | What it looks like |
|---|---|---|
| **Hosted, multi-college** | the platform owner | one deployment, `<college>.yoursite.com` per college, a `/platform` console to create them |
| **Self-hosted, single college** | a college's own IT | the same code in a generated single-college package, one `./setup.sh`, no cost to the platform owner |

There is nothing to fork: the self-host package is generated from this repository (`scripts/package-selfhost.sh`).

## 2. Who uses it

| Actor | Can do | Signs in with |
|---|---|---|
| **Visitor** | see a college's leaderboard and profiles (public) | nothing |
| **Student** | register, link handles, verify them, edit own profile | emailed 6-digit code |
| **College admin** | everything a student can, plus: branding and logo, allowed email domains, departments, members (suspend, promote, remove), bulk import, CSV export | emailed code, role `college_admin` |
| **Platform operator** | create and take offline colleges, set custom domains, add admins | emailed code; email must be in `SUPERADMIN_EMAILS` |

## 3. System at a glance

```
                      Browser
                         |  https://mit.yoursite.com
                         v
              +----------------------+
              |  HTTPS proxy (Caddy, |   passes X-Forwarded-For + Host
              |  nginx, LB)          |
              +----------+-----------+
                         v
              +----------------------+      /api/*  (same-origin proxy,
              |  web  (Next.js 16)   |----> target read at RUNTIME from
              |  pages + SSR + /api  |      API_INTERNAL_URL)
              +----------+-----------+
                         v
              +----------------------+       +-----------------------+
              |  api  (Express 5)    |<----->|  PostgreSQL           |
              |  tenant, auth, rules |       |  colleges, users, ... |
              +----------------------+       +-----------+-----------+
                                                         ^
              +----------------------+                   |
              |  worker (node-cron)  |-------------------+
              |  hourly rating sync  |
              +----------+-----------+
                         v
        LeetCode GraphQL · Codeforces API · AtCoder (+ kenkoooo)
```

Four containers (`db`, `api`, `worker`, `web`), plus `caddy` in the self-host package when a domain is set. Only
`web` (and the proxy) is reachable from outside; the API and database are internal.

**Why the browser never talks to the API directly.** The browser calls a relative `/api/...`, which the Next.js app
forwards to `API_INTERNAL_URL`. That address is read at *runtime*, so a single prebuilt image works for any
deployment, there is no CORS, and it works unchanged on every subdomain and custom domain.

## 4. Repository map

```
backend/
  src/index.js              app wiring, public /college and /college/logo
  src/middleware/           tenant.js (which college?), auth.js (JWT), operator.js, rateLimit.js
  src/routes/               auth, profile, leaderboard, users, admin, platform
  src/services/otp.js       issue/verify emailed codes (Gmail or any SMTP)
  src/platforms/            one file per coding platform + registry (index.js)
  src/lib/                  college rules, bulk import, branding, logo, domain checks
  src/worker.js             rating sync
  migrations/001-007.sql    schema, applied by src/migrate.js
  scripts/                  addCollege, addAdmin, bootstrap (first-run from env)
frontend/src/
  app/layout.js             resolves the college server-side: theme, title, favicon
  app/(college)/            pages: leaderboard, login, register, profile (u/), settings, admin
  app/(platform)/platform/  operator console
  app/api/[...path]/        the same-origin API proxy
  components/, store/, utils/
selfhost/                   templates for the single-college package
scripts/package-selfhost.sh generates that package
docker-compose.yml          the whole platform (one or many colleges)
```

## 5. Multi-tenancy: how a request finds its college

Every API request (except `/platform/*`) is tied to one college by `middleware/tenant.js`, in this order:

1. a **custom domain** the college owns (`X-College-Host` matches `colleges.custom_domain`)
2. an explicit `X-College-Slug` header
3. the **subdomain** of `ROOT_DOMAIN` (`mit.yoursite.com` → `mit`; `*.localhost` works in development)
4. `DEFAULT_COLLEGE_SLUG`, **only if the request named no college at all**

A hostname that names a college that doesn't exist (a typo, or a college taken offline) is `404 Unknown college`,
never silently served another college. Isolation is enforced in three places: every query filters by `college_id`;
a login token carries a `college_id` and is rejected anywhere else; admin routes act only within the caller's college.

## 6. Data model

```
colleges (college_id, slug, name, email_domains[], custom_domain, logo_url, logo_version,
          brand_primary, brand_secondary, tagline, departments[], require_verified_handles, is_active)
   |1                                                     |1
   |n                                                     |1
users (user_id, college_id, username, email, role, is_active, batch, department)     college_logos (bytea image)
   |1
   |n   one row per user per platform
platform_stats (user_id, platform_name, platform_handle, rating, max_rating, questions_solved,
                daily_starting_count, last_snapshot_date, last_synced_at, verification_token, verified_at,
                last_sync_error, last_sync_error_kind, sync_failures)
   |1
   |n   one row per stat per day
rating_history (stat_id, recorded_on, rating, max_rating, questions_solved)

email_otps (email, otp_code, attempts, expires_at)        schema_migrations (applied files)
```
Usernames are unique per college; emails are unique across the platform (one account per person). Migrations are
plain SQL files applied in order at startup; never edit an applied one, add the next number.

## 7. Data flows

### 7.1 Sign-up and sign-in (passwordless)
```
Student -> POST /send-otp {email, username, ...}   domain allowed? -> create 6-digit code (5 min) -> email it
Student -> POST /register-with-otp {email, code}   check code -> create user (college from the request) -> JWT (7 days)
later   -> POST /send-login-otp, /login-with-otp   same, for an existing member -> JWT
```
Protections: a code allows **5 guesses** then is destroyed; **60 s** between codes per email; per-IP limits
(`RATE_LIMIT_*`); sign-in answers identically whether or not an account exists, so addresses can't be probed (registration
does say when an email is already taken, because the person needs to know). The
token is checked on every request against the database, so suspending a member or changing a role takes effect
immediately, and a token is valid only for the college that issued it.

### 7.2 Linking and verifying a handle
```
Settings: save handle  -> platform_stats row, fresh verification_token, verified_at = NULL
Settings: "Verify"     -> API fetches the public profile text from the platform
                          token present in the bio/about?  -> verified_at = now  -> verified badge
```
Changing a handle resets its stats and verification. A college may require verified handles to appear at all.

### 7.3 Rating sync (the worker)
```
every SYNC_CRON (default hourly) -> select handles of ACTIVE users, stalest first
   -> one "lane" per platform, lanes in parallel, handles in a lane sequential with a polite delay
      LeetCode 2.0 s · AtCoder 1.5 s · Codeforces 1.0 s
   -> fetch (3 attempts, backoff 2 s then 4 s for transient errors; "not found" fails at once)
   -> ONE statement: update platform_stats + upsert today's rating_history point
   -> on failure: sync_failures += 1, record the error and its kind
```
"Questions today" = `questions_solved - daily_starting_count`; the baseline rolls forward at midnight in
`APP_TIMEZONE`, computed in SQL. A first sync never shows a bogus "+N today". Handles failing 3+ times in a row, or
not found, surface as **Sync issues** in the Admin panel. Suspended members are skipped to save platform API calls.

### 7.4 Reading the leaderboard
```
GET /leaderboard/:platform?batch=&department=
   WHERE college = request's college AND user is active [AND verified, if the college requires it]
   ORDER BY rating DESC, max_rating DESC, username
```
Public, no login. Profile rank uses the same ordering, so a member's rank matches their position on the list. The
browser then does search, column sort and "your rank" locally on that list.

### 7.5 Branding and the logo
The root layout asks the API for the college **on the server**, so the first HTML already carries the college's
colors (CSS variables), title and favicon: no flash of default styling. Logos are either a pasted URL or an uploaded
image (PNG/JPEG/GIF/WebP/SVG, up to 512 KB) stored in the database and served from `/college/logo?v=<hash>` with
long-lived caching; an uploaded SVG is served sandboxed so scripts inside it cannot run.

### 7.6 Bulk import
```
Admin uploads a CSV (parsed in the browser) -> POST /admin/users/import {dry_run: true}   (the default)
   -> every row analysed: bad email, domain not allowed, duplicates, already registered, name taken...
   -> preview with a verdict per row -> admin confirms -> same call with dry_run: false
   -> each row committed in its own SAVEPOINT; up to 1000 rows; re-importing is safe
```
Imported members are not emailed; they simply sign in with their address.

### 7.7 Platform console
`/platform/*` is mounted before tenant resolution. An operator signs in with an emailed code (email in
`SUPERADMIN_EMAILS`), gets a separate 12-hour token type that cannot be used as a student or admin token, and can
create a college (with its first admin, atomically), edit it, add admins, set a custom domain, or take it offline
(colleges are never deleted from the UI).

## 8. Security model (summary)

| Concern | How it is handled |
|---|---|
| Authentication | emailed codes only; JWT (7 days), re-checked against the database on every request |
| Tenant isolation | `college_id` in every query and in every token; unknown colleges are 404, never defaulted |
| Roles | `student` / `college_admin` from the database; operators are an environment allowlist with a distinct token |
| Abuse | per-email cooldown and guess limit; per-IP rate limits (need a proxy that sets `X-Forwarded-For`) |
| Sign-up scope | allowed email domains, validated against the Public Suffix List so `ac.in` or `edu.in` cannot be used |
| Uploads | type sniffed from the bytes, 512 KB cap, SVG served with a sandboxing CSP and `nosniff` |
| Imports and CSV export | dry-run first; exported cells that start with `=`, `+`, `-`, `@` are neutralised |
| Secrets | never in images; `.env` created mode 600 by `setup.sh` |

## 9. Configuration reference (most used)

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | Postgres connection |
| `JWT_SECRET` | signs sessions (required) |
| `EMAIL_USER`/`EMAIL_PASS` or `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, `EMAIL_FROM` | outgoing mail |
| `DEFAULT_COLLEGE_SLUG` | single-college mode |
| `ROOT_DOMAIN`, `SUPERADMIN_EMAILS` | many-college mode and the operator allowlist |
| `BOOTSTRAP_COLLEGE_*`, `BOOTSTRAP_ADMIN_*` | create the first college and admin on first start (never overwrites) |
| `APP_TIMEZONE`, `SYNC_CRON`, `SYNC_DELAY_<PLATFORM>_MS` | worker behaviour |
| `TRUST_PROXY`, `RATE_LIMIT_CODES_PER_HOUR`, `RATE_LIMIT_VERIFY_PER_15_MIN` | proxy and rate limits |
| `API_INTERNAL_URL` (frontend) | where the web app's `/api` proxy forwards to |

## 10. Extending it

- **Add a coding platform:** create `backend/src/platforms/<id>.js` (id, label, `delayMs`, `handlePattern`,
  `verificationHint`, `profileUrl`, `fetchStats`, `fetchProfileText`) and list it in `platforms/index.js`. The API,
  worker and admin pick it up; only the display styling in `frontend/src/utils/platforms.js` is per-platform.
- **Add a schema change:** add the next `migrations/NNN_name.sql`; it applies on the next start.
- **Ship to a college:** `scripts/package-selfhost.sh`, then hand over the generated folder.

## 11. Known limits and good next steps

- Ratings are polled hourly from public pages and APIs; a platform changing its site can break its lane (the admin
  panel shows it as sync issues). The worker does not alert anyone by itself yet.
- Rate limiting is in memory per API process: fine for one API container, not for several replicas.
- Every self-hosted install is operated by its college; the package records which commit it came from.
- Not built yet: friends/following, weekly leaderboards, leaderboard pagination, per-college platform toggles,
  a subdomain request flow for admins, published Docker images and CI.
