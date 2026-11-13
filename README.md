# CP Leaderboard

A competitive-programming leaderboard that colleges can host for their students.
Students sign up with a college email (OTP, no passwords), link their LeetCode /
Codeforces handles, and see rankings among their peers.

Each deployment serves one **college (tenant)**. Users, leaderboards and login
tokens are fully isolated per college, and sign-up can be restricted to the
college's email domains.

```
backend/    Express + Postgres API (routes/, middleware/, services/), SQL migrations, rating-sync worker
frontend/   Next.js app
```

## Setup

**1. Backend**
```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, EMAIL_USER/PASS
npm install
npm run migrate             # create/upgrade the schema
npm run college:add -- mit "MIT" mit.edu     # create a college + allowed email domains
npm run dev                 # API on :5000
```

**2. Frontend**
```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_COLLEGE_SLUG=mit
npm install
npm run dev                 # app on :3000
```

**3. Sync ratings.** Ratings are pulled by a separate worker process:
```bash
cd backend
npm run worker            # one sync of every handle, then exit (use from cron / a scheduler)
npm run worker:schedule   # long-running: sync now, then on SYNC_CRON (default: hourly)
```
Run `worker:schedule` as a second process next to the API (a process manager, a second
container, ...). It shuts down cleanly on SIGTERM. See [The sync worker](#the-sync-worker).

## Colleges

```bash
npm run college:add -- <slug> "<Display Name>" [domain1,domain2]
```
- Email domains match subdomains too (`mit.edu` allows `cs.mit.edu`).
- **No domains = open registration** (any email). The script warns when this is the case.
- Re-running with an existing slug updates its name and domains.

The frontend picks its college from `NEXT_PUBLIC_COLLEGE_SLUG` and sends it as the
`X-College-Slug` header on every request. The backend falls back to
`DEFAULT_COLLEGE_SLUG` if the header is absent.

## Platforms

LeetCode, Codeforces and AtCoder are supported. Each platform is one file in
`backend/src/platforms/` (stats fetcher, profile-text fetcher for verification, handle
format, delay between requests). To add one, create `<id>.js` exporting that shape and list
it in `platforms/index.js`. The API, worker, verification, leaderboard tabs, settings and
admin panel pick it up automatically; the only per-platform frontend code is its colors/icon
in `frontend/src/utils/platforms.js`.

AtCoder note: it has no official API for solved counts, so those come from the community
service kenkoooo. If that's down, ratings still refresh and the previous solved count is kept.

## The sync worker

- **Lanes:** each platform is synced one handle at a time with a polite delay (configurable
  per platform, e.g. `SYNC_DELAY_LEETCODE_MS`), and platforms run in parallel, so a run takes
  as long as the slowest platform, not the sum. Stalest handles go first.
- **Retries and failures:** transient failures are retried (3 attempts); a handle that doesn't
  exist is not. Every handle records its last error and consecutive failures. Members see a
  "couldn't find this account" note for a bad handle, and admins see sync issues in the admin
  panel.
- **History:** every successful sync writes that day's rating/solved to `rating_history` (one
  row per handle per day), which feeds the profile graphs. Changing a handle clears its history.
- **"Today":** the daily "+N solved today" counter and history dates roll over at midnight in
  `APP_TIMEZONE` (an IANA name such as `Asia/Kolkata`; default UTC). Set this to your college's zone.
- A run that starts while another is still going is skipped. `SYNC_CRON` sets the schedule.

## Members, profiles and filters

- Members can set a **batch** (graduation year) and a **department**. Departments are a list
  the college admin maintains (admin panel -> College settings), so values stay clean.
  Leave the list empty to turn departments off.
- The leaderboard can be filtered by batch and department, and each row links to a public
  **profile page** (`/u/<name>`) with rank in the college, rating, peak, solved count and a
  daily rating/solved graph. Profiles never show email addresses and follow the same
  visibility rules as the leaderboard (suspended members and, if enabled, unverified handles
  are hidden).

## Admins

A **college admin** manages one college from the in-app admin panel (`/admin`, linked
from the header for admins): member list with search, suspend / restore / remove members,
promote or demote admins, and college settings (name, logo, allowed email domains,
"verified handles only").

Create the first admin for a college from the CLI. It creates the account (or promotes an
existing one); they then log in normally with an email code. The domain whitelist isn't
applied to admins, so they can use any address.
```bash
npm run admin:add -- <college-slug> <email> [display-name]
```
Suspending a member takes effect immediately: their session stops working, they can't log
back in, they're hidden from the leaderboard and the worker stops fetching their ratings.

## Handle verification

Anyone can type any handle, so ownership is verified: in **Settings** a user gets a short
code (`lb-xxxxxxxxxx`) to paste into their LeetCode "Summary" or Codeforces first name /
last name / organization / city, then clicks **Verify**. The backend reads the public
profile and checks for the code. A verified handle gets a badge on the leaderboard and
can't be verified by any other account. Changing a handle resets its stats and verification.

By default unverified handles still appear. A college admin can switch on
"Only show verified handles on the leaderboard".

## Security notes

- Email codes expire after 5 minutes, die after 5 wrong guesses, and can be re-requested
  once per 60 seconds per email. Requests are also rate limited per IP.
  **Behind a reverse proxy, set `TRUST_PROXY`** (e.g. `1`) or all users share one IP.
- Login never reveals whether an email has an account. (Registration still says if an
  email is taken, since the user needs to know.)
- Roles and suspensions are read from the database on every request, not from the token.

## Migrations

Plain SQL files in `backend/migrations/`, applied in filename order by
`npm run migrate` and tracked in a `schema_migrations` table. To change the
schema, add the next numbered file (e.g. `003_batches.sql`); never edit an
applied one. Existing databases created before migrations existed upgrade
safely: `001_baseline.sql` is idempotent and existing users are moved into a
`default` college.

For a local Postgres without SSL, set `DATABASE_SSL=false`.
