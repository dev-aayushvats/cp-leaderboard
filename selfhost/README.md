# College Leaderboard

A competitive-programming leaderboard for **your college**. Students sign in with their college email (a code is
emailed, no passwords), link their LeetCode, Codeforces and AtCoder handles, and see how they rank among their
peers. You host it on your own server, so there is no cost beyond the server itself.

You run one college. Your admin can brand it (logo, colors, tagline), restrict sign-up to your email domain,
import a class from a spreadsheet, and manage members, all from the Admin panel in the site.

## What you need
- A Linux server (a small VPS or a spare machine is fine): **1 vCPU and 2 GB RAM** is enough for a few thousand students.
  The first build uses more memory, so add a 2 GB swap file on very small servers.
- [Docker](https://docs.docker.com/engine/install/) with Compose v2.
- A mailbox to send login codes from: a Gmail / Google Workspace account (with an App Password) or any SMTP server.
- Optional, for HTTPS: a domain name (e.g. `cp.yourcollege.edu`) whose DNS A record points at the server.

## Install (about 10 minutes)
```bash
git clone <this repository> leaderboard
cd leaderboard
./setup.sh
```
`setup.sh` asks for the college name, the email domain students use, your admin email, the mailbox for login codes
and (optionally) a domain, generates the secrets, and starts everything. Then open the site and sign in as the admin
email: a code arrives by email. From there everything is done in the **Admin panel** (account menu, top right).

Prefer to do it by hand? `cp .env.example .env`, fill in the top sections, then `docker compose up -d --build`.

## Email (login codes)
Students and admins sign in with a code sent by email, so the site needs a mailbox.

| You have | Set |
|---|---|
| Gmail or Google Workspace | `EMAIL_USER` and `EMAIL_PASS` (an **App Password**: Google Account > Security > 2-Step Verification > App passwords) |
| Any other mail server | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and `EMAIL_FROM` for the sender name) |

If codes don't arrive, check `docker compose logs api` for the mail error and check the spam folder.

## HTTPS
Set `DOMAIN` (setup.sh asks). Caddy then gets and renews a free certificate automatically. Before you start, the
domain must point at the server and ports **80 and 443** must be open. Without a domain the site runs on
`http://<server>:3000` (setup.sh asks which port; change it later with `WEB_PORT` in `.env`, then `docker compose up -d`), which is fine for a trial but not for real use (login codes would travel unencrypted).

## Running it
```bash
docker compose up -d --build   # start / apply changes
docker compose ps              # is everything running?
docker compose logs -f api worker
docker compose down            # stop (your data is kept)
```
- **Ratings** are fetched hourly in the background by the `worker`. New members show 0 until the first sync.
- **Update** to a new version: `git pull && docker compose up -d --build`. Database changes apply automatically.
- **Timezone:** set `APP_TIMEZONE` (e.g. `Asia/Kolkata`) so "solved today" rolls over at your midnight.

## Backups
All data lives in a Docker volume. Save a copy any time:
```bash
./backup.sh                    # writes backups/leaderboard-<date>.sql.gz
```
Run it from cron (`0 3 * * * cd /path/to/leaderboard && ./backup.sh`) and copy the files off the server.
To restore a backup (this replaces everything currently in the database):
```bash
docker compose exec -T db psql -U postgres -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/leaderboard-XXXX.sql.gz | docker compose exec -T db psql -U postgres postgres
docker compose restart api worker
```
`docker compose down -v` **deletes the data**; plain `down` does not.

## Common questions
- **Add many students at once:** Admin panel > Import. Upload a CSV (email, name, batch, department, handles). Members
  aren't emailed; they just sign in with their address.
- **Lock sign-up to the college:** the email domain in setup, or Admin > Settings > "Allowed sign-up email domains".
  Subdomains are included (`mycollege.ac.in` also allows `cs.mycollege.ac.in`). Don't use a bare `ac.in`: that would
  admit every institution with a `.ac.in` address.
- **More admins:** Admin > Members > "Make admin" next to any member.
- **Change the college's look:** Admin > Settings: logo, colors, tagline.
- **Locked out / forgot who the admin is:** `docker compose exec api node scripts/addAdmin.js college you@yourcollege.edu`.
- **Behind a company proxy or load balancer already?** Keep `DOMAIN` empty, point the proxy at port 3000, and make
  sure it sends `X-Forwarded-For` and the original `Host`.

## Troubleshooting
- **The `api` container keeps restarting with `password authentication failed for user "postgres"`.** The database
  was created with one password and your `.env` now holds a different one (for example after deleting `.env` and
  running `./setup.sh` again). Postgres only reads the password when it first creates its volume. Either put the old
  `.env` back, or, to keep the data and use the current password:
  ```bash
  PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
  echo "ALTER USER postgres PASSWORD :'pw';" | docker compose exec -T db psql -U postgres -v pw="$PW"
  docker compose up -d
  ```
  If there is nothing to keep, `docker compose down -v` (deletes the data) and start again.
- **Codes don't arrive:** see [Email](#email-login-codes).
- **Port already in use:** change `WEB_PORT` in `.env`, then `docker compose up -d`.

## What runs
(For the full picture of how the pieces fit together, read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).)

Four containers: `db` (PostgreSQL), `api`, `worker` (rating sync) and `web` (the website), plus `caddy` when
`DOMAIN` is set. Only the website (and Caddy) is reachable from outside; the database and API are internal.

## License

GNU AGPL-3.0-or-later, see [LICENSE](LICENSE). You may use, modify and self-host it freely; if you run a modified
version as a network service, you must make your modified source available to its users under the same license.
