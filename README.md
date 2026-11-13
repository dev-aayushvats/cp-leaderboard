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

**3. Sync ratings** (not scheduled yet: run manually or from an external cron)
```bash
cd backend && npm run worker
```

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
