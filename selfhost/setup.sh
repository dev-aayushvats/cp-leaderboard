#!/bin/sh
# Creates the .env file for you: asks a few questions and generates the secrets.
# Run it once:   ./setup.sh        (then it can start everything for you)
# Any value already in your environment is used without asking, e.g.:
#   COLLEGE_NAME='My College' COLLEGE_ADMIN_EMAIL=me@my.edu ./setup.sh
set -e
cd "$(dirname "$0")"

say() { printf '%s\n' "$*"; }
die() { say "Error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker first: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing ('docker compose' must work)."

if [ -f .env ] && [ "${FORCE:-}" != "1" ]; then
  say ".env already exists, so nothing was changed. Delete it (or run FORCE=1 ./setup.sh) to start over."
  exit 0
fi

# ask VAR "Question" [default]  -> sets VAR from the environment, the prompt, or the default
ask() {
  name=$1; question=$2; default=${3:-}
  eval "current=\${$name:-}"
  [ -n "$current" ] && return 0
  if [ -t 0 ]; then
    if [ -n "$default" ]; then printf '%s [%s]: ' "$question" "$default"; else printf '%s: ' "$question"; fi
    read -r answer || answer=
    [ -z "$answer" ] && answer=$default
  else
    answer=$default
  fi
  eval "$name=\$answer"
}

random_hex() { # random_hex <bytes>
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

# Writes KEY="value" with the characters Compose treats specially (\ " $) escaped, so names like
# St. John's College or passwords containing $ arrive in the app unchanged.
put() { # put KEY value
  esc=$(printf '%s' "$2" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/\\$/g')
  printf '%s="%s"\n' "$1" "$esc"
}

# A database volume from an earlier install keeps ITS password: Postgres only reads POSTGRES_PASSWORD when it
# first creates the volume. A freshly generated password would never match, and the API would crash-loop with
# "password authentication failed". So stop here instead of creating that trap.
project=$(sed -n 's/^name: *//p' docker-compose.yml | head -n 1)
volume="${project:-college-leaderboard}_pgdata"
if docker volume inspect "$volume" >/dev/null 2>&1; then
  say "Found a database from an earlier install (Docker volume '$volume')."
  say "Its password is stored inside it, so a new .env would not be able to open it and the site would not start."
  say ""
  say "  To KEEP that data:   restore your previous .env file (and don't run setup)."
  say "  To start over:       docker compose down -v      (this DELETES the old data), then run ./setup.sh again."
  exit 1
fi

say "College Leaderboard setup"
say "-------------------------"
ask COLLEGE_NAME "College name (shown on the site)"
[ -n "${COLLEGE_NAME:-}" ] || die "A college name is required."
ask COLLEGE_EMAIL_DOMAINS "Email domain(s) students sign up with, e.g. mycollege.ac.in (empty = anyone can register)"
ask COLLEGE_ADMIN_EMAIL "Your email (you become the admin)"
[ -n "${COLLEGE_ADMIN_EMAIL:-}" ] || die "An admin email is required."
case "$COLLEGE_ADMIN_EMAIL" in *@*.*) ;; *) die "'$COLLEGE_ADMIN_EMAIL' doesn't look like an email address." ;; esac

say ""
say "Login codes are sent by email, so the site needs a mailbox to send from."
ask MAIL_KIND "Mail server: 1 = Gmail / Google Workspace, 2 = other SMTP server" 1
case "$MAIL_KIND" in
  1) ask EMAIL_USER "Gmail address"
     ask EMAIL_PASS "Gmail App Password (not your normal password)" ;;
  2) ask SMTP_HOST "SMTP host, e.g. smtp.yourcollege.edu"
     ask SMTP_PORT "SMTP port" 587
     ask SMTP_USER "SMTP username (empty if none)"
     ask SMTP_PASS "SMTP password (empty if none)"
     ask EMAIL_FROM "Sender shown to students, e.g. \"College Leaderboard\" <noreply@yourcollege.edu>" ;;
  *) die "Choose 1 or 2." ;;
esac

say ""
ask DOMAIN "Domain for HTTPS, e.g. cp.yourcollege.edu (empty = no HTTPS, run on a local port)"
ask APP_TIMEZONE "Timezone, e.g. Asia/Kolkata" UTC

# Without a domain the site is published on a local port. (With a domain, Caddy serves ports 80 and 443.)
port_in_use() { # best effort: true if something is already listening on this port
  if command -v nc >/dev/null 2>&1; then nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  elif command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else return 1; fi
}
if [ -z "${DOMAIN:-}" ]; then
  while :; do
    ask WEB_PORT "Port to run the site on" 3000
    case "$WEB_PORT" in ''|*[!0-9]*) bad="'$WEB_PORT' is not a port number." ;; *)
      if [ "$WEB_PORT" -lt 1 ] || [ "$WEB_PORT" -gt 65535 ]; then bad="Ports go from 1 to 65535."
      elif port_in_use "$WEB_PORT"; then bad="Port $WEB_PORT is already in use on this machine."
      else bad=; fi ;;
    esac
    [ -z "$bad" ] && break
    [ -t 0 ] || die "$bad"
    say "$bad Pick another."
    WEB_PORT=
  done
fi

POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-$(random_hex 16)}
JWT_SECRET=${JWT_SECRET:-$(random_hex 48)}

umask 077
{
  echo "# Written by setup.sh. Edit freely; see .env.example for every option."
  put COLLEGE_NAME "$COLLEGE_NAME"
  put COLLEGE_EMAIL_DOMAINS "${COLLEGE_EMAIL_DOMAINS:-}"
  put COLLEGE_ADMIN_EMAIL "$COLLEGE_ADMIN_EMAIL"
  put POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  put JWT_SECRET "$JWT_SECRET"
  if [ "$MAIL_KIND" = 1 ]; then
    put EMAIL_USER "${EMAIL_USER:-}"
    put EMAIL_PASS "${EMAIL_PASS:-}"
  else
    put SMTP_HOST "${SMTP_HOST:-}"
    put SMTP_PORT "${SMTP_PORT:-587}"
    put SMTP_USER "${SMTP_USER:-}"
    put SMTP_PASS "${SMTP_PASS:-}"
  fi
  [ -z "${EMAIL_FROM:-}" ] || put EMAIL_FROM "$EMAIL_FROM"
  put APP_TIMEZONE "${APP_TIMEZONE:-UTC}"
  [ -z "${WEB_PORT:-}" ] || echo "WEB_PORT=$WEB_PORT"
  if [ -n "${DOMAIN:-}" ]; then
    put DOMAIN "$DOMAIN"
    echo "COMPOSE_PROFILES=https"
    echo "WEB_BIND=127.0.0.1"
  fi
} > .env

say ""
say "Saved .env (readable only by you)."
if [ -n "${DOMAIN:-}" ]; then
  say "HTTPS: make sure $DOMAIN points at this server and ports 80 and 443 are open before starting."
  site="https://$DOMAIN"
else
  site="http://localhost:${WEB_PORT:-3000}"
fi

start=${START:-}
if [ -z "$start" ]; then
  if [ -t 0 ]; then printf 'Start it now? (the first build takes a few minutes) [Y/n]: '; read -r start || start=; fi
  case "$start" in n|N|no|No) start=0 ;; *) start=1 ;; esac
fi
if [ "$start" = 1 ]; then
  docker compose up -d --build
  say ""
  say "Running. Open $site and sign in as $COLLEGE_ADMIN_EMAIL (a code arrives by email)."
else
  say "Start it with:  docker compose up -d --build   then open $site"
fi
