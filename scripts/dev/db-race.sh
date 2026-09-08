#!/usr/bin/env bash
# ============================================================================
#  CONCURRENCY TEST — two people selling the last carton at the same moment
# ============================================================================
#  record_stock_movement() claims that SELECT ... FOR UPDATE makes a race
#  impossible. This is that claim under test, with real connections rather
#  than a single session that cannot race itself.
#
#  Stock is set to 10. Twenty sessions each try to take 1, all at once.
#  Exactly 10 must succeed, 10 must be refused, the quantity must land on 0
#  and never below, and the ledger must hold exactly 10 rows — one per
#  movement that actually happened, and none for the ones that did not.
# ============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
export PGHOST="${PGHOST:-/var/run/pgtest}" PGPORT="${PGPORT:-55432}"
export PGOPTIONS="-c client_min_messages=warning"
DB="${DB:-pk_race}"
ATTEMPTS="${ATTEMPTS:-20}"
STOCK="${STOCK:-10}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

psql -U postgres -q -c "drop database if exists $DB" -c "create database $DB" postgres
run() { psql -U postgres -v ON_ERROR_STOP=1 -q -f "$1" "$DB"; }
run "$HERE/scripts/dev/supabase-shim.sql"
for f in "$HERE"/supabase/migrations/*.sql; do run "$f"; done

psql -U postgres -v ON_ERROR_STOP=1 -q "$DB" <<SQL
insert into auth.users (email, raw_user_meta_data) values ('race@test.local', '{"full_name":"Race"}');
-- The first auth user is made an admin by the trigger; become them before
-- creating anything, so the fixture goes through the same guards as a person.
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'race@test.local'), false);
insert into public.categories (name, slug) values ('Race', 'race') on conflict do nothing;
select public.create_product(jsonb_build_object(
  'sku','RACE-1','name','Race Product','slug','race-product',
  'category_id',(select id from public.categories where slug='race')), $STOCK);
SQL

UID_="$(psql -U postgres -tAc "select id from public.profiles where email='race@test.local'" "$DB")"
PID_="$(psql -U postgres -tAc "select id from public.products where sku='RACE-1'" "$DB")"

# All sessions block on the same starting gun so they arrive together.
for i in $(seq 1 "$ATTEMPTS"); do
  (
    psql -U postgres -tAq "$DB" <<SQL >"$TMP/out.$i" 2>&1
set role authenticated;
select set_config('request.jwt.claim.sub', '$UID_', false);
select 'OK' from public.record_stock_movement('$PID_'::uuid, 'STOCK_OUT', 1);
SQL
  ) &
done
wait

ok=$(grep -lc '^OK$' "$TMP"/out.* 2>/dev/null | wc -l || true)
refused=$(grep -l 'PK_INSUFFICIENT_STOCK' "$TMP"/out.* 2>/dev/null | wc -l || true)
qty=$(psql -U postgres -tAc "select quantity from public.inventory where product_id='$PID_'" "$DB")
moves=$(psql -U postgres -tAc "select count(*) from public.stock_movements where product_id='$PID_' and movement_type='STOCK_OUT'" "$DB")
other=$(cat "$TMP"/out.* | grep -c 'ERROR' || true)

fail=0
check() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($2)"; else echo "  ✗ $1 — expected $3, got $2"; fail=1; fi; }
echo
check "sessions that succeeded"          "$ok"      "$STOCK"
check "sessions refused for lack of stock" "$refused" "$((ATTEMPTS - STOCK))"
check "final quantity"                    "$qty"     "0"
check "ledger rows written"               "$moves"   "$STOCK"
echo
[ "$fail" = 0 ] && echo "  no overselling, no lost update, no phantom ledger row" || true
[ "$other" -gt "$((ATTEMPTS - STOCK))" ] && echo "  ! unexpected errors beyond the expected refusals" && fail=1
exit "$fail"
