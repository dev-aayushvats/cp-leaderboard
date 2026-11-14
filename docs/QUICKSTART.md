# Quick start

Pick the path that matches what you are doing. Each takes about 10 minutes.

| I want to… | Path |
|---|---|
| **Run the leaderboard for one college** on its own server | [A. Self-host a college](#a-self-host-a-college) |
| **Run the whole platform** (one college, or many colleges, one subdomain each) | [B. Run the platform with Docker](#b-run-the-platform-with-docker) |
| **Develop** on the code | [C. Run from source](#c-run-from-source) |

You need **Docker** for A and B, and **Node 22 and a Postgres database** for C.
Login codes are sent by email, so every path needs a **mailbox**: a Gmail/Workspace address with an
[App Password](https://myaccount.google.com/apppasswords), or any SMTP server.

---

## A. Self-host a college

For a college admin. No code to read: generate the package, hand it over, run one script.

```bash
# once, by you (the platform owner): produce the single-college package
scripts/package-selfhost.sh                 # writes ../cp-leaderboard-selfhost

# by the college, on their server
git clone <the package repo> leaderboard && cd leaderboard
./setup.sh                                  # asks ~6 questions, writes .env, starts everything
```

`setup.sh` asks for the college name, the email domain students use (e.g. `mycollege.ac.in`), the admin's email,
the mailbox for login codes, an optional domain (for automatic HTTPS) and a port. Then open the site and sign in
as the admin: a code arrives by email. Everything else happens in the **Admin panel** (account menu, top right).

HTTPS needs a domain whose DNS points at the server and ports 80/443 open. Details, backups and
troubleshooting are in the package's own `README.md`.

---

## B. Run the platform with Docker

```bash
cp .env.example .env        # fill it in (below)
docker compose up -d --build
```

Open `http://localhost:3000`. First start creates the database, applies migrations and creates the college(s).

**One college** (`.env`):
```
POSTGRES_PASSWORD=lettersAndDigitsOnly
JWT_SECRET=<openssl rand -hex 48>
EMAIL_USER=you@gmail.com
EMAIL_PASS=<app password>
COLLEGE_SLUG=mit
COLLEGE_NAME=MIT
COLLEGE_EMAIL_DOMAINS=mit.edu
COLLEGE_ADMIN_EMAIL=you@mit.edu
```

**Many colleges** (one subdomain each): leave `COLLEGE_SLUG` empty and set
```
ROOT_DOMAIN=yoursite.com
SUPERADMIN_EMAILS=you@yoursite.com
```
Then sign in at `https://yoursite.com/platform` (emailed code), create colleges, and each is live at
`<slug>.yoursite.com`. This needs wildcard DNS (`*.yoursite.com`) and a wildcard TLS certificate in front.

Everyday commands:
```bash
docker compose logs -f api worker     # watch it
git pull && docker compose up -d --build   # update (migrations run automatically)
docker compose down                   # stop, keep data   (down -v deletes the data)
```
Put an HTTPS reverse proxy in front of port 3000 for production. It must send `X-Forwarded-For` and the
original `Host`. Without one, every visitor shares one rate-limit bucket.

---

## C. Run from source

```bash
# 1. Database
docker run -d --name cpl-db -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16

# 2. Backend
cd backend && cp .env.example .env     # set DATABASE_URL, DATABASE_SSL=false, JWT_SECRET, EMAIL_USER/PASS
npm install && npm run migrate
npm run college:add -- mit "MIT" mit.edu        # a college + its allowed email domains
npm run admin:add -- mit you@mit.edu            # its first admin
npm run dev                                      # API on :5000 (set PORT if taken; macOS uses 5000)

# 3. Frontend (new terminal)
cd frontend && cp .env.example .env.local        # set API_INTERNAL_URL if the API isn't on :5000
npm install && npm run dev                       # http://localhost:3000

# 4. Ratings (new terminal). Nothing shows until the worker has run once
cd backend && npm run worker
```
Try a specific college without DNS: `http://mit.localhost:3000`. For one college on plain `localhost:3000`, set
`DEFAULT_COLLEGE_SLUG=mit` in `backend/.env`.

---

## Your first 10 minutes as admin

1. Sign in with the admin email (emailed code), open **Admin panel** from the account menu.
2. **Settings**: upload a logo, pick colors, set a tagline, confirm the allowed email domains.
3. **Import**: upload a CSV of students (email, name, batch, department, handles) or just share your link.
4. Copy **Your college link** from the top of the Admin panel and send it to students.
5. Students sign in, link LeetCode / Codeforces / AtCoder handles in **Settings**, and appear after the next sync (hourly).

## When something is off

| Symptom | Cause and fix |
|---|---|
| No login code arrives | Mailbox not set up. `docker compose logs api` shows the mail error; check spam. |
| Everyone sits at rating 0 | The worker hasn't run yet or is down: `docker compose logs worker`. |
| `api` restarts: *password authentication failed* | `.env` password differs from the existing database volume. See the package README troubleshooting. |
| "Too many attempts" for many students at once | No proxy in front, so all share one IP. Raise `RATE_LIMIT_*` or add a proxy. |
| "Registration for … is limited to @…" | The email isn't on the college's allowed domains. Admin panel → Settings. |
| "College not found" on a subdomain | Typo, or the college is offline. Check it in `/platform`. |
