-- ============================================================================
--  DATABASE BEHAVIOUR TESTS
-- ============================================================================
--  Asserts the business rules that the brief says must never be violated,
--  against the real migrations on a real Postgres. Any failure raises and the
--  script exits non-zero.
--
--  These run as each role in turn using the same GUC Supabase sets from the
--  JWT, so a policy that passes here is the policy the browser meets.
-- ============================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.ok(label text, cond boolean) returns void
language plpgsql as $$
begin
  if cond then raise notice '  ✓ %', label;
  else raise exception '  ✗ FAILED: %', label; end if;
end $$;

-- Runs a statement and returns the error message it raised, or null.
create or replace function pg_temp.err(stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return null;
exception when others then
  return sqlerrm;
end $$;

create or replace function pg_temp.become(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;

-- --------------------------------------------------------------- setup ----
do $$
declare v_admin uuid; v_manager uuid; v_staff uuid;
begin
  insert into auth.users (email, raw_user_meta_data)
  values ('admin@test.local',   '{"full_name":"Ama Admin"}')   returning id into v_admin;
  insert into auth.users (email, raw_user_meta_data)
  values ('manager@test.local', '{"full_name":"Mira Manager","role":"manager"}') returning id into v_manager;
  insert into auth.users (email, raw_user_meta_data)
  values ('staff@test.local',   '{"full_name":"Sita Staff","role":"staff"}')     returning id into v_staff;

  perform pg_temp.ok('first auth user becomes admin automatically',
    (select role from public.profiles where id = v_admin) = 'admin');
  perform pg_temp.ok('later users take the role from their metadata',
    (select role from public.profiles where id = v_manager) = 'manager'
    and (select role from public.profiles where id = v_staff) = 'staff');
end $$;

create temporary table who as
select
  (select id from public.profiles where email = 'admin@test.local')   as admin,
  (select id from public.profiles where email = 'manager@test.local') as manager,
  (select id from public.profiles where email = 'staff@test.local')   as staff;
-- The tests switch roles part-way through; a temp table is owner-only by
-- default, so the fixture has to be readable by the roles under test.
grant select on who to public;

-- ------------------------------------------------------- seeded catalogue --
do $$
begin
  perform pg_temp.ok('catalogue seed loaded 87 products',
    (select count(*) from public.products) = 87);
  perform pg_temp.ok('every product has an inventory row at the default location',
    (select count(*) from public.inventory) = 87);
  perform pg_temp.ok('all seeded stock is zero — nothing was invented',
    (select coalesce(sum(quantity), 0) from public.inventory) = 0);
  perform pg_temp.ok('no stock movement was invented either',
    (select count(*) from public.stock_movements) = 0);
  perform pg_temp.ok('SKUs are unique after de-duplication',
    (select count(distinct lower(sku)) from public.products) = 87);
end $$;

-- ================================================================ RULES ====

-- 1. SKU must be unique -----------------------------------------------------
do $$
declare v_cat uuid; v_msg text;
begin
  perform pg_temp.become((select admin from who));
  select id into v_cat from public.categories where slug = 'speakers';

  perform public.create_product(jsonb_build_object(
    'sku', 'TEST-001', 'name', 'Test Speaker', 'slug', 'test-speaker',
    'category_id', v_cat, 'units_per_carton', 20, 'cost_price', 100,
    'wholesale_price', 150, 'low_stock_threshold', 10), 0);

  v_msg := pg_temp.err(format(
    'select public.create_product(jsonb_build_object(''sku'',''test-001'',''name'',''Clash'',''slug'',''clash'',''category_id'',%L), 0)', v_cat));
  perform pg_temp.ok('rule 1: a duplicate SKU is rejected, case-insensitively',
    v_msg like '%PK_DUPLICATE_SKU%');

  v_msg := pg_temp.err(format(
    'select public.create_product(jsonb_build_object(''sku'',''OTHER-1'',''name'',''Clash'',''slug'',''test-speaker'',''category_id'',%L), 0)', v_cat));
  perform pg_temp.ok('a duplicate slug is rejected and named as such',
    v_msg like '%PK_DUPLICATE_SLUG%');
end $$;

-- 2. Stock cannot go negative ----------------------------------------------
do $$
declare v_p uuid; v_msg text;
begin
  perform pg_temp.become((select admin from who));
  select id into v_p from public.products where sku = 'TEST-001';

  perform public.record_stock_movement(v_p, 'STOCK_IN', 100, p_unit_cost => 95);
  perform pg_temp.ok('rule 3: a stock-in raises the quantity',
    (select quantity from public.inventory where product_id = v_p) = 100);

  v_msg := pg_temp.err(format('select public.record_stock_movement(%L, ''STOCK_OUT'', 101)', v_p));
  perform pg_temp.ok('rule 2: removing more than is in stock is refused',
    v_msg like '%PK_INSUFFICIENT_STOCK%');
  perform pg_temp.ok('the refused movement left the quantity untouched',
    (select quantity from public.inventory where product_id = v_p) = 100);
  perform pg_temp.ok('and wrote no ledger entry',
    (select count(*) from public.stock_movements where product_id = v_p) = 1);

  perform public.record_stock_movement(v_p, 'STOCK_OUT', 100, p_customer_name => 'Ram Traders');
  perform pg_temp.ok('stock may be taken down to exactly zero',
    (select quantity from public.inventory where product_id = v_p) = 0);

  v_msg := pg_temp.err(format('select public.record_stock_movement(%L, ''STOCK_IN'', 0)', v_p));
  perform pg_temp.ok('a zero quantity is rejected', v_msg like '%PK_BAD_QUANTITY%');
  v_msg := pg_temp.err(format('select public.record_stock_movement(%L, ''STOCK_IN'', -5)', v_p));
  perform pg_temp.ok('a negative quantity is rejected', v_msg like '%PK_BAD_QUANTITY%');
end $$;

-- 3 & 15. Every change is recorded, and atomically -------------------------
do $$
declare v_p uuid; v_msg text;
begin
  select id into v_p from public.products where sku = 'TEST-001';
  perform pg_temp.ok('rule 3: every applied movement left a ledger row',
    (select count(*) from public.stock_movements where product_id = v_p) = 2);
  perform pg_temp.ok('rule 25: the ledger records who, when and the running total',
    (select count(*) from public.stock_movements
     where product_id = v_p and created_by is not null
       and created_by_name is not null and quantity_after is not null) = 2);

  -- The guard trigger is what makes "no silent stock change" structural.
  v_msg := pg_temp.err(format('update public.inventory set quantity = 9999 where product_id = %L', v_p));
  perform pg_temp.ok('rule 25: stock cannot be edited directly, even as the owner',
    v_msg like '%PK_NO_SILENT_STOCK%');
end $$;

-- 4 & 5. History is not deletable; products with history are not deletable --
do $$
declare v_p uuid; v_msg text;
begin
  select id into v_p from public.products where sku = 'TEST-001';
  v_msg := pg_temp.err(format('delete from public.products where id = %L', v_p));
  perform pg_temp.ok('rule 5: a product with history cannot be deleted',
    v_msg is not null);
  perform pg_temp.ok('product_can_be_deleted() reports that too',
    public.product_can_be_deleted(v_p) = false);

  update public.products set is_active = false where id = v_p;
  perform pg_temp.ok('rule 5: it can be deactivated instead',
    (select not is_active from public.products where id = v_p));
  update public.products set is_active = true where id = v_p;
end $$;

-- 20. Carton arithmetic -----------------------------------------------------
do $$
declare v_p uuid;
begin
  select id into v_p from public.products where sku = 'TEST-001';
  perform public.record_stock_movement(v_p, 'STOCK_IN', 247);
  perform pg_temp.ok('rule 20: 247 units at 20 per carton is 12 cartons + 7',
    (select quantity / units_per_carton = 12 and quantity % units_per_carton = 7
     from public.product_stock where id = v_p));
  perform public.record_stock_movement(v_p, 'STOCK_IN', 3);
  perform pg_temp.ok('rule 20: 250 units at 20 per carton is 12 cartons + 10',
    (select quantity / units_per_carton = 12 and quantity % units_per_carton = 10
     from public.product_stock where id = v_p));
end $$;

-- =============================================================== ROLES =====

-- STAFF ---------------------------------------------------------------------
set session role authenticated;
do $$
declare v_p uuid; v_cat uuid; v_msg text;
begin
  perform pg_temp.become((select staff from who));
  select id into v_p from public.products where sku = 'TEST-001';
  select id into v_cat from public.categories where slug = 'speakers';

  perform pg_temp.ok('staff can read products',    (select count(*) from public.products)  > 0);
  perform pg_temp.ok('staff can read inventory',   (select count(*) from public.inventory) > 0);
  perform pg_temp.ok('staff can read the ledger',  (select count(*) from public.stock_movements) > 0);

  perform public.record_stock_movement(v_p, 'STOCK_OUT', 10, p_customer_name => 'Shop 12');
  perform pg_temp.ok('staff can move stock out', true);

  v_msg := pg_temp.err(format(
    'select public.record_stock_movement(%L, ''ADJUSTMENT_OUT'', 5, p_reason => ''Damaged'')', v_p));
  perform pg_temp.ok('staff cannot write off stock as an adjustment',
    v_msg like '%PK_FORBIDDEN%');

  v_msg := pg_temp.err(format(
    'select public.create_product(jsonb_build_object(''sku'',''S-1'',''name'',''S'',''slug'',''s-1'',''category_id'',%L), 0)', v_cat));
  perform pg_temp.ok('staff cannot create a product', v_msg like '%PK_FORBIDDEN%');

  perform pg_temp.err(format('update public.products set name = ''Hacked'' where id = %L', v_p));
  perform pg_temp.ok('staff cannot edit a product',
    (select name from public.products where id = v_p) <> 'Hacked');

  v_msg := pg_temp.err('update public.profiles set role = ''admin'' where id = ' || quote_literal((select staff from who)) || '::uuid');
  perform pg_temp.ok('rule 11: staff cannot promote themselves',
    v_msg like '%PK_FORBIDDEN%');

  perform pg_temp.err('delete from public.stock_movements');
  perform pg_temp.ok('rule 4: staff cannot delete the ledger',
    (select count(*) from public.stock_movements) > 0);
end $$;

-- MANAGER -------------------------------------------------------------------
do $$
declare v_p uuid; v_msg text;
begin
  perform pg_temp.become((select manager from who));
  select id into v_p from public.products where sku = 'TEST-001';

  perform public.record_stock_movement(v_p, 'ADJUSTMENT_OUT', 5, p_reason => 'Damaged in transit');
  perform pg_temp.ok('a manager can record an adjustment', true);

  update public.products set retail_price = 199 where id = v_p;
  perform pg_temp.ok('a manager can edit a product',
    (select retail_price from public.products where id = v_p) = 199);

  -- RLS matches no policy for this row, so the statement affects zero rows
  -- rather than raising. Asserting on the outcome rather than on an error is
  -- the honest test: what matters is that the role did not change.
  perform pg_temp.err('update public.profiles set role = ''staff'' where email = ''admin@test.local''');
  perform pg_temp.ok('rule 11: a manager cannot change anybody''s role',
    (select role from public.profiles where email = 'admin@test.local') = 'admin');

  perform pg_temp.err(format('delete from public.products where id = %L', v_p));
  perform pg_temp.ok('a manager cannot delete a product',
    exists (select 1 from public.products where id = v_p));
end $$;

-- ADMIN ---------------------------------------------------------------------
do $$
declare v_msg text;
begin
  perform pg_temp.become((select admin from who));
  update public.profiles set role = 'manager' where email = 'staff@test.local';
  perform pg_temp.ok('an admin can change a role',
    (select role from public.profiles where email = 'staff@test.local') = 'manager');
  update public.profiles set role = 'staff' where email = 'staff@test.local';

  v_msg := pg_temp.err('update public.profiles set is_active = false where email = ''admin@test.local''');
  perform pg_temp.ok('the last admin cannot lock everybody out',
    v_msg like '%PK_LAST_ADMIN%');

  perform pg_temp.err('delete from public.stock_movements');
  perform pg_temp.ok('rule 4: not even an admin can delete a ledger row',
    (select count(*) from public.stock_movements) > 0);
end $$;

-- DEACTIVATED USER ----------------------------------------------------------
do $$
declare v_msg text;
begin
  perform pg_temp.become((select admin from who));
  update public.profiles set is_active = false where email = 'staff@test.local';
  perform pg_temp.become((select staff from who));
  perform pg_temp.ok('a deactivated user has no role', public.auth_role() is null);
  perform pg_temp.ok('a deactivated user reads nothing',
    (select count(*) from public.products) = 0);
  v_msg := pg_temp.err(format('select public.record_stock_movement(%L, ''STOCK_IN'', 1)',
    (select id from public.products limit 1)));
  perform pg_temp.ok('a deactivated user cannot move stock',
    v_msg like '%PK_FORBIDDEN%' or v_msg is not null);
end $$;

-- The role helpers must return false, never null, for a caller with no role.
-- A null would make every `if not can_manage() then raise` guard skip its own
-- raise, because `not null` is null and the branch is not taken. This is a
-- regression test for exactly that: it was live until the concurrency test
-- created a product with no session at all and was allowed to.
do $$ begin
  perform pg_temp.become(null);
  perform pg_temp.ok('is_staff() is false, not null, when signed out',   public.is_staff()   is false);
  perform pg_temp.ok('is_admin() is false, not null, when signed out',   public.is_admin()   is false);
  perform pg_temp.ok('can_manage() is false, not null, when signed out', public.can_manage() is false);
end $$;

do $$
declare v_cat uuid; v_msg text;
begin
  perform pg_temp.become(null);
  select id into v_cat from public.categories where slug = 'speakers';
  v_msg := pg_temp.err(format(
    'select public.create_product(jsonb_build_object(''sku'',''NOAUTH-1'',''name'',''N'',''slug'',''noauth-1'',''category_id'',%L), 5)', v_cat));
  perform pg_temp.ok('a caller with no session cannot create a product',
    v_msg like '%PK_FORBIDDEN%');
  perform pg_temp.ok('and created nothing',
    not exists (select 1 from public.products where sku = 'NOAUTH-1'));
end $$;

-- ANONYMOUS -----------------------------------------------------------------
reset role;
set session role anon;
do $$
declare v_msg text;
begin
  perform pg_temp.become(null);
  perform pg_temp.ok('rule 8: anon cannot read the products table at all',
    pg_temp.err('select count(*) from public.products') is not null);
  perform pg_temp.ok('anon cannot read inventory',
    pg_temp.err('select count(*) from public.inventory') is not null);
  perform pg_temp.ok('rule 7: anon cannot read suppliers',
    pg_temp.err('select count(*) from public.suppliers') is not null);
  perform pg_temp.ok('anon cannot read the ledger',
    pg_temp.err('select count(*) from public.stock_movements') is not null);
  perform pg_temp.ok('anon cannot read profiles',
    pg_temp.err('select count(*) from public.profiles') is not null);

  perform pg_temp.ok('anon CAN read the public catalogue view',
    (select count(*) from public.catalogue_products) > 0);
  perform pg_temp.ok('rule 6: the public view has no cost_price column',
    not exists (select 1 from information_schema.columns
                where table_name = 'catalogue_products' and column_name = 'cost_price'));
  perform pg_temp.ok('rule 8: the public view exposes no quantity column',
    not exists (select 1 from information_schema.columns
                where table_name = 'catalogue_products'
                  and column_name in ('quantity', 'available_quantity', 'reserved_quantity')));
  perform pg_temp.ok('the public view reports stock as a word',
    (select stock_status from public.catalogue_products limit 1) in
      ('in_stock', 'low_stock', 'out_of_stock', 'contact'));
end $$;

-- Inactive products must not appear publicly.
reset role;
do $$
declare v_p uuid;
begin
  perform pg_temp.become((select admin from who));
  select id into v_p from public.products where sku = 'TEST-001';
  update public.products set is_active = false where id = v_p;
  set local role anon;
  perform pg_temp.ok('rule 13/part 16: a deactivated product vanishes from the catalogue',
    not exists (select 1 from public.catalogue_products where sku = 'TEST-001'));
end $$;

reset role;
do $$ begin
  perform pg_temp.become((select admin from who));
  update public.products set is_active = true where sku = 'TEST-001';
  perform pg_temp.ok('and comes back when reactivated',
    exists (select 1 from public.catalogue_products where sku = 'TEST-001'));
end $$;

-- DASHBOARD + IMPORT --------------------------------------------------------
do $$
declare v_sum jsonb; v_cat uuid; v_msg text;
begin
  perform pg_temp.become((select admin from who));
  v_sum := public.dashboard_summary();
  perform pg_temp.ok('dashboard reports a product count', (v_sum ->> 'total_products')::int > 0);
  perform pg_temp.ok('dashboard values stock at cost, not retail',
    (v_sum ->> 'inventory_value')::numeric =
      (select coalesce(sum(ps.quantity * ps.cost_price), 0)
       from public.product_stock ps where ps.is_active));

  select id into v_cat from public.categories where slug = 'earbuds';
  -- One good row and one with a duplicate SKU: the whole import must fail.
  v_msg := pg_temp.err(format($f$
    select public.import_products(jsonb_build_array(
      jsonb_build_object('sku','IMP-1','name','Imported One','slug','imported-one','category_id',%L,'opening_stock',5),
      jsonb_build_object('sku','TEST-001','name','Clash','slug','imported-two','category_id',%L)
    ), false)$f$, v_cat, v_cat));
  perform pg_temp.ok('rule 23: an import with one bad row fails as a whole',
    v_msg like '%PK_IMPORT_FAILED%');
  perform pg_temp.ok('and imported nothing at all — no partial write',
    not exists (select 1 from public.products where sku = 'IMP-1'));

  perform public.import_products(jsonb_build_array(
    jsonb_build_object('sku','IMP-1','name','Imported One','slug','imported-one',
                       'category_id', v_cat, 'units_per_carton', 12, 'opening_stock', 5)), false);
  perform pg_temp.ok('a clean import writes every row',
    (select quantity from public.product_stock where sku = 'IMP-1') = 5);
  perform pg_temp.ok('and its opening stock is in the ledger, not conjured',
    exists (select 1 from public.stock_movement_log
            where product_sku = 'IMP-1' and movement_type = 'STOCK_IN' and quantity = 5));
end $$;

do $$
declare v_msg text; v_cat uuid;
begin
  select id into v_cat from public.categories where slug = 'earbuds';
  v_msg := pg_temp.err(format($f$
    select public.import_products(jsonb_build_array(
      jsonb_build_object('sku','DRY-1','name','Dry Run','slug','dry-run','category_id',%L)), true)$f$, v_cat));
  perform pg_temp.ok('a dry run reports success without writing',
    v_msg like '%PK_DRY_RUN_OK%');
  perform pg_temp.ok('and left nothing behind',
    not exists (select 1 from public.products where sku = 'DRY-1'));
end $$;

-- CATEGORY WITH PRODUCTS ----------------------------------------------------
do $$
declare v_msg text;
begin
  perform pg_temp.become((select admin from who));
  v_msg := pg_temp.err('delete from public.categories where slug = ''speakers''');
  perform pg_temp.ok('part 12: a category holding products cannot be deleted', v_msg is not null);
end $$;

do $$ begin raise notice ''; raise notice '  all database tests passed'; raise notice ''; end $$;
