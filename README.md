# CP Leaderboard

A competitive-programming leaderboard that colleges can host for their students.
Students sign up with a college email (OTP, no passwords), link their LeetCode /
Codeforces handles, and see rankings among their peers.

One codebase serves **many colleges (tenants)** from a single deployment. Each college
gets its own address (`mit.yoursite.com`, or its own domain), branding, members and
leaderboard, all isolated from each other. You can also run it for a **single college**
with no subdomain setup. Both modes are the same code; there is nothing to fork.

```
backend/    Express + Postgres API (routes/, middleware/, services/), SQL migrations, rating-sync worker
frontend/   Next.js app
```

**Docs:** [Quick start](docs/QUICKSTART.md) · [Architecture, data flow and platform overview](docs/ARCHITECTURE.md)

## Quick start with Docker (recommended)

You need Docker. Everything runs from one command: the database, the API, the rating-sync worker and the website.

```bash
cp .env.example .env        # fill in the few required values (see below)
docker compose up -d --build
```
Open `http://localhost:3000`. The first start creates the database, applies migrations, and (single-college mode)
creates your college and its admin from the settings in `.env`. Sign in with the admin email: a code arrives by email.

**Minimum `.env`:**
```
POSTGRES_PASSWORD=pick-letters-and-digits
JWT_SECRET=<openssl rand -hex 48>
EMAIL_USER=you@gmail.com            # sends the login codes
EMAIL_PASS=<gmail app password>
COLLEGE_SLUG=mit                    # ---- one college ----
COLLEGE_NAME=MIT
COLLEGE_EMAIL_DOMAINS=mit.edu
COLLEGE_ADMIN_EMAIL=you@mit.edu
```
For **many colleges** instead, leave `COLLEGE_SLUG` empty and set `ROOT_DOMAIN=yoursite.com` and
`SUPERADMIN_EMAILS=you@yoursite.com`; then create colleges at `/platform` (see [Platform console](#platform-console)).

- **Data** lives in the `pgdata` Docker volume: `docker compose down` keeps it, `docker compose down -v` deletes it.
- **Updating:** `git pull && docker compose up -d --build`. Migrations run automatically on start.
- **Logs:** `docker compose logs -f api worker`.
- **The API isn't published**: only the website is (port `WEB_PORT`). The browser talks to the site's own `/api`,
  which the site forwards to the API, so one build works on any address, with no CORS and no baked-in URLs.
- **Production:** put an HTTPS reverse proxy (Caddy, nginx, Traefik, a cloud load balancer) in front of port 3000. It must
  pass each visitor's address in `X-Forwarded-For` (they do by default) and forward the original `Host`. Without one,
  every visitor looks like the same IP and shares the per-IP rate limits, so raise `RATE_LIMIT_*` in `.env` for plain-HTTP/LAN installs.
- **Behind that proxy** keep `TRUST_PROXY=1` (the number of proxies in front).

## Self-hosting package for a single college

Want to hand a college something it can run on its own server? `scripts/package-selfhost.sh` generates a clean,
single-college copy (default: `../cp-leaderboard-selfhost`) from this repository: the same backend and frontend, plus a
compose file, a `./setup.sh` that writes the `.env`, optional automatic HTTPS (Caddy), a backup script and a README for
the college's admin. It is generated, not forked: re-run the script after changing the app. Templates live in `selfhost/`.

## Running from source (development)

**1. Backend** (needs a Postgres database; `docker run -d -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16` works)
```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, EMAIL_USER/PASS
npm install
npm run migrate             # create/upgrade the schema
npm run college:add -- mit "MIT" mit.edu     # create a college + allowed email domains
npm run admin:add -- mit you@mit.edu         # its first admin
npm run dev                 # API on :5000 (set PORT if that's taken: macOS AirPlay uses 5000)
```

**2. Frontend**
```bash
cd frontend
cp .env.example .env.local  # set API_INTERNAL_URL if the API isn't on http://localhost:5000
npm install
npm run dev                 # app on :3000
```
The college is chosen by the **hostname** you browse to, so one frontend serves every
college. Try it locally with no setup: `http://mit.localhost:3000` shows MIT. For a
single-college install, either set `DEFAULT_COLLEGE_SLUG=mit` in the backend (then any
hostname shows MIT) or pin the frontend with `NEXT_PUBLIC_COLLEGE_SLUG=mit`.

**3. Sync ratings.** Ratings are pulled by a separate worker process:
```bash
cd backend
npm run worker            # one sync of every handle, then exit (use from cron / a scheduler)
npm run worker:schedule   # long-running: sync now, then on SYNC_CRON (default: hourly)
```
Run `worker:schedule` as a second process next to the API (a process manager, a second
container, ...). It shuts down cleanly on SIGTERM. See [The sync worker](#the-sync-worker).

## Colleges

Colleges are created by the platform operator (there is no self-signup for colleges):
```bash
npm run college:add -- <slug> "<Display Name>" [domain1,domain2] [--custom-domain=cp.college.edu]
```
- `slug` becomes the subdomain (`<slug>.<ROOT_DOMAIN>`): lowercase letters, digits, hyphens.
  Names like `www`, `api`, `admin`, `mail` are reserved.
- Email domains match subdomains too (`mit.edu` allows `cs.mit.edu`).
- **No domains = open registration** (any email). The script warns when this is the case.
- Re-running with an existing slug updates its name and email domains (and the custom domain, if given).
- Admins: `npm run admin:add -- <slug> <email>`.

## Hosting many colleges

**How a request finds its college** (first match wins):
1. a college whose **custom domain** equals the hostname (`cp.mit.edu`);
2. an explicit `X-College-Slug` header (dev/tests, or `NEXT_PUBLIC_COLLEGE_SLUG`);
3. the subdomain: `mit.<ROOT_DOMAIN>` -> `mit` (`*.localhost` always works for local dev);
4. `DEFAULT_COLLEGE_SLUG`, **only** if the request didn't name a college at all.

A subdomain that doesn't exist (a typo) is "College not found", never someone else's
leaderboard. The bare root domain shows a small "find your college" page.
Members' sessions are stored per address, so logging in at `mit.…` never carries over to `iit.…`.

**Setting it up on a server** (with Docker, `ROOT_DOMAIN` and `SUPERADMIN_EMAILS` in `.env` do steps 1 and 5's setup for you):
1. Set `ROOT_DOMAIN=leaderboard.example.com` in the backend env. Leave `DEFAULT_COLLEGE_SLUG` unset.
2. Point wildcard DNS `*.leaderboard.example.com` (and the bare name) at the frontend, and get a
   wildcard TLS certificate (e.g. Caddy or a DNS-challenge certificate). The frontend and API each
   need to be reachable by browsers; set `NEXT_PUBLIC_API_BASE_URL` at build time.
3. Leave `NEXT_PUBLIC_COLLEGE_SLUG` unset in the frontend. The frontend forwards `/api` to the API at
   `API_INTERNAL_URL` (set at runtime), so no build-time URL is needed.
4. Behind a reverse proxy, set `TRUST_PROXY` (see Security notes) and forward the original `Host`
   (or `X-Forwarded-Host`) header to the frontend.
5. Create colleges in the [Platform console](#platform-console) (or with `college:add`). They go live immediately at `<slug>.leaderboard.example.com`.

**Custom domains** (e.g. `cp.mit.edu`): the college points a DNS `CNAME` at your frontend, you add the
domain to your TLS setup, then run `college:add -- mit "MIT" mit.edu --custom-domain=cp.mit.edu`.
Custom domains are operator-set on purpose: a college admin can't claim a domain by typing it.

## Platform console

Operators (you) create and manage colleges from the browser instead of the command line. Set
`SUPERADMIN_EMAILS=you@example.com` (comma-separated for several) and open **`/platform`** (it works on any address,
including the bare root domain). Sign in with an emailed code.

From the console you can **create a college** (address, name, allowed email domains, optional custom domain and its
first admin, all in one step), **edit** it, **add admins**, and **take a college offline** (its address then says
"College not found" until you bring it back; nothing is deleted). Colleges can't be deleted from the UI on purpose.
Operator sessions last 12 hours; removing an address from `SUPERADMIN_EMAILS` (and restarting) revokes it immediately.
The command line (`college:add`, `admin:add`) does the same things and shares the same rules.

## Importing members

College admins can add a whole class at once: **Admin panel -> Import members**. Upload a CSV (or paste rows) with
columns `email` (required), `name`, `batch`, `department` and one column per platform (`leetcode`, `codeforces`,
`atcoder`). A bare list of emails also works, and a template can be downloaded in the panel.

Every import is **previewed first**: each row is marked ready, already registered (skipped, so re-importing the same file
is safe) or needs fixing, with the reason and the line number from your file. Nothing is saved until you confirm, and
rows that need fixing are skipped. Imported members aren't emailed: they sign in with their address like anyone else and
can verify their handles in Settings. The college's email-domain rule applies. Up to 1000 rows per import.

## Branding

College admins customise their leaderboard in the admin panel (College settings -> Branding):
**name, logo (an image URL), tagline, and two brand colors**, with a live preview. The theme and
page title are applied in the first HTML the server sends, so there is no flash of default colors.
Colors must stay readable on the dark background (WCAG AA, 4.5:1); the form and the API both
reject colors that are too dark. Each platform keeps its own identity color (LeetCode blue, ...)
regardless of the brand, and "Reset colors" returns to the defaults. Without a logo, the college's
initials are shown.

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
`default` college. A fresh install has no colleges until you create one (a `default`
college that has no members is removed by `006`).

For a local Postgres without SSL, set `DATABASE_SSL=false`.
