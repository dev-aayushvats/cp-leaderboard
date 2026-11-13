# CP Leaderboard

A competitive-programming leaderboard that colleges can host for their students.
Students sign up with a college email (OTP, no passwords), link their LeetCode /
Codeforces handles, and see rankings among their peers.

Each deployment serves one **college (tenant)**. Users, leaderboards and login
tokens are fully isolated per college, and sign-up can be restricted to the
college's email domains.

```
backend/    Express + Postgres API, SQL migrations, rating-sync worker
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

## Migrations

Plain SQL files in `backend/migrations/`, applied in filename order by
`npm run migrate` and tracked in a `schema_migrations` table. To change the
schema, add the next numbered file (e.g. `003_batches.sql`); never edit an
applied one. Existing databases created before migrations existed upgrade
safely: `001_baseline.sql` is idempotent and existing users are moved into a
`default` college.

For a local Postgres without SSL, set `DATABASE_SSL=false`.
