#!/usr/bin/env bash
# Run every migration, then the behaviour tests, against a throwaway Postgres.
#   scripts/dev/db-test.sh
# Requires a local PostgreSQL; it never touches a Supabase project.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
PGHOST="${PGHOST:-/var/run/pgtest}"
PGPORT="${PGPORT:-55432}"
DB="${DB:-pk_test}"
export PGHOST PGPORT
export PGOPTIONS="-c client_min_messages=warning"
psql -U postgres -q -c "drop database if exists $DB" -c "create database $DB" postgres
run() { psql -U postgres -v ON_ERROR_STOP=1 -q -f "$1" "$DB"; }
run "$HERE/scripts/dev/supabase-shim.sql"
for f in "$HERE"/supabase/migrations/*.sql; do
  echo "  → $(basename "$f")"
  run "$f"
done
echo "  → seed/0001_catalogue_from_json.sql"
run "$HERE/supabase/seed/0001_catalogue_from_json.sql"
echo "  → tests"
# The tests report each assertion as a NOTICE, so they need the level the
# migrations were run without.
PGOPTIONS="-c client_min_messages=notice" \
  psql -U postgres -v ON_ERROR_STOP=1 -q -f "$HERE/scripts/dev/db-tests.sql" "$DB" 2>&1 |
  sed -E 's/^psql:[^ ]+ (NOTICE|WARNING):  //'
exit "${PIPESTATUS[0]}"
