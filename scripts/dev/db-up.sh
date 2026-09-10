#!/usr/bin/env bash
# ============================================================================
#  START THE LOCAL TEST DATABASE
# ============================================================================
#  Brings up the PostgreSQL the database and console test suites talk to, and
#  fetches the PostgREST binary they need if it is not already there.
#  Idempotent: safe to run when it is already up.
#
#      scripts/dev/db-up.sh
#      scripts/dev/db-test.sh          # schema and business rules
#      node scripts/dev/console-test.js # the console, end to end
#
#  Development only. Nothing here is used by the build or by the site.
# ============================================================================
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/pgtest}"
SOCKET="${PGHOST:-/var/run/pgtest}"
PORT="${PGPORT:-55432}"
BIN=/usr/lib/postgresql/16/bin
PGRST_VERSION=v12.2.3
PGRST_BIN="$PGDATA/bin/postgrest"

id -u postgres >/dev/null 2>&1 || useradd -m postgres
mkdir -p "$SOCKET" "$PGDATA"
chown -R postgres "$SOCKET" "$PGDATA"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "  initialising $PGDATA"
  su postgres -c "PATH=$BIN:\$PATH initdb -D $PGDATA -A trust -U postgres" >/dev/null
fi

if su postgres -c "PATH=$BIN:\$PATH pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  echo "  postgres already running"
else
  # A container restart leaves a stale postmaster.pid behind, and pg_ctl
  # refuses to start until it is gone.
  rm -f "$PGDATA/postmaster.pid"
  su postgres -c "PATH=$BIN:\$PATH pg_ctl -D $PGDATA \
    -o '-k $SOCKET -p $PORT -c listen_addresses=' -l $PGDATA/log start" >/dev/null
  echo "  postgres started on $SOCKET:$PORT"
fi

if [ ! -x "$PGRST_BIN" ]; then
  echo "  fetching PostgREST $PGRST_VERSION"
  mkdir -p "$PGDATA/bin"
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/pgrst.tar.xz" \
    "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x64.tar.xz"
  tar -xJf "$tmp/pgrst.tar.xz" -C "$PGDATA/bin"
  rm -rf "$tmp"
fi

PGHOST="$SOCKET" PGPORT="$PORT" psql -U postgres -tAc "select 'ready: ' || version()" postgres
"$PGRST_BIN" --version
