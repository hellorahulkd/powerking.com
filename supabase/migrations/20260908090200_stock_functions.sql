-- ============================================================================
--  POWERKING NEPAL — STOCK MUTATION FUNCTIONS
-- ============================================================================
--  The only way stock changes. Each function does the whole job in one
--  transaction: lock the stock row, check the result would not be negative,
--  write the new quantity, write the ledger entry. If any part fails the whole
--  thing rolls back, so `inventory` and `stock_movements` cannot disagree.
--
--  ── WHY THE ROW LOCK MATTERS ─────────────────────────────────────────────
--  Two people on two phones selling the last carton at the same moment both
--  read "1 in stock", both subtract 1, and the shop is now at -1 with two
--  movements recorded. SELECT ... FOR UPDATE makes the second one wait for
--  the first to commit, so it reads 0 and is rejected. Without it the check
--  is decoration.
--
--  ── ERROR CODES ──────────────────────────────────────────────────────────
--  Messages are prefixed PK_ and the admin console maps them to plain
--  English. Anything without a prefix is unexpected and is shown as a generic
--  failure, so a raw Postgres error never reaches a member of staff.
-- ============================================================================

-- Does this movement type add stock or remove it?
create or replace function public.movement_sign(t public.movement_type)
returns integer language sql immutable as $$
  select case when t in ('STOCK_IN', 'ADJUSTMENT_IN', 'RETURN_IN') then 1 else -1 end
$$;

-- The location a movement lands in when the caller did not name one.
create or replace function public.default_location_id()
returns uuid language sql stable as $$
  select id from public.inventory_locations
  where is_default and is_active
  order by created_at limit 1
$$;

-- ------------------------------------------------ record_stock_movement ----

create or replace function public.record_stock_movement(
  p_product_id       uuid,
  p_movement_type    public.movement_type,
  p_quantity         integer,
  p_location_id      uuid          default null,
  p_reference_number text          default null,
  p_supplier_id      uuid          default null,
  p_customer_name    text          default null,
  p_unit_cost        numeric       default null,
  p_reason           text          default null,
  p_notes            text          default null,
  p_occurred_at      timestamptz   default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      public.user_role := public.auth_role();
  v_uid       uuid := auth.uid();
  v_name      text;
  v_location  uuid;
  v_sign      integer := public.movement_sign(p_movement_type);
  v_before    integer;
  v_after     integer;
  v_reserved  integer;
  v_inv       public.inventory%rowtype;
  v_movement  public.stock_movements%rowtype;
  v_active    boolean;
begin
  -- --- who is asking -------------------------------------------------------
  if v_role is null then
    raise exception 'PK_FORBIDDEN: your account is not authorised to change stock';
  end if;
  -- Staff may move stock in and out; only manager and above may write off
  -- a discrepancy, because an adjustment is the one movement with no
  -- counterparty to check it against.
  if p_movement_type in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') and v_role = 'staff' then
    raise exception 'PK_FORBIDDEN: adjustments may only be made by a manager or an admin';
  end if;

  select full_name into v_name from public.profiles where id = v_uid;

  -- --- validate the request ------------------------------------------------
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'PK_BAD_QUANTITY: quantity must be a whole number greater than zero';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'PK_BAD_AMOUNT: unit cost cannot be negative';
  end if;

  select is_active into v_active from public.products where id = p_product_id;
  if not found then
    raise exception 'PK_NO_PRODUCT: that product no longer exists';
  end if;
  -- An inactive product can still receive a return or a correction; it just
  -- cannot be sold. Blocking every movement would strand its remaining stock.
  if not v_active and p_movement_type in ('STOCK_IN', 'STOCK_OUT') then
    raise exception 'PK_INACTIVE_PRODUCT: reactivate this product before moving stock in or out';
  end if;

  v_location := coalesce(p_location_id, public.default_location_id());
  if v_location is null then
    raise exception 'PK_NO_LOCATION: no active storage location has been set up';
  end if;

  -- --- lock, compute, apply ------------------------------------------------
  -- The insert covers a product that has never held stock at this location.
  -- ON CONFLICT DO NOTHING then a locking select, rather than upsert, so the
  -- row is locked whether we created it or somebody else did.
  insert into public.inventory (product_id, location_id, quantity)
  values (p_product_id, v_location, 0)
  on conflict (product_id, location_id) do nothing;

  select * into v_inv from public.inventory
  where product_id = p_product_id and location_id = v_location
  for update;

  v_before   := v_inv.quantity;
  v_reserved := v_inv.reserved_quantity;
  v_after    := v_before + (v_sign * p_quantity);

  if v_after < 0 then
    raise exception
      'PK_INSUFFICIENT_STOCK: only % in stock, cannot remove %', v_before, p_quantity;
  end if;
  -- Stock already promised to somebody cannot also be shipped to somebody
  -- else. reserved_quantity is 0 everywhere in this version, so this is
  -- dormant until reservations are switched on — but it is the check that
  -- will matter then, and adding it later means auditing every caller again.
  if v_after < v_reserved then
    raise exception
      'PK_RESERVED_STOCK: % of the % in stock are reserved, so only % can be removed',
      v_reserved, v_before, v_before - v_reserved;
  end if;

  -- Tells the inventory guard trigger that this write came through the front
  -- door. `true` scopes it to this transaction, so it cannot leak to the
  -- next request on a pooled connection.
  perform set_config('powerking.stock_rpc', 'on', true);

  update public.inventory
  set quantity = v_after, updated_at = now()
  where id = v_inv.id;

  insert into public.stock_movements (
    product_id, location_id, movement_type, quantity, quantity_after,
    reference_number, supplier_id, customer_name, reason, notes, unit_cost,
    created_by, created_by_name, created_at
  ) values (
    p_product_id, v_location, p_movement_type, p_quantity, v_after,
    nullif(btrim(coalesce(p_reference_number, '')), ''),
    p_supplier_id,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_unit_cost,
    v_uid, v_name, coalesce(p_occurred_at, now())
  )
  returning * into v_movement;

  perform set_config('powerking.stock_rpc', 'off', true);
  return v_movement;
end;
$$;

comment on function public.record_stock_movement is
  'The only supported way to change stock. Locks the inventory row, refuses to go negative, and writes inventory and stock_movements in one transaction.';

-- ------------------------------------------------------ create_product ----
-- A product and its inventory row are created together, with an optional
-- opening balance recorded as a real STOCK_IN so day one is in the ledger
-- too. Without this the first screen a new product reaches would show stock
-- that no movement explains.

create or replace function public.create_product(
  p_product        jsonb,
  p_opening_stock  integer default 0,
  p_location_id    uuid    default null,
  p_warehouse_note text    default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product  public.products%rowtype;
  v_location uuid;
begin
  if not public.can_manage() then
    raise exception 'PK_FORBIDDEN: only a manager or an admin may add a product';
  end if;
  if p_opening_stock is null or p_opening_stock < 0 then
    raise exception 'PK_BAD_QUANTITY: opening stock cannot be negative';
  end if;

  v_location := coalesce(p_location_id, public.default_location_id());

  begin
    insert into public.products (
      sku, name, slug, description, brand_id, category_id,
      product_image, gallery_images, units_per_carton,
      cost_price, wholesale_price, retail_price, carton_price,
      minimum_order_quantity, low_stock_threshold, is_active, is_featured, tags
    )
    select
      btrim(p_product ->> 'sku'),
      btrim(p_product ->> 'name'),
      btrim(p_product ->> 'slug'),
      coalesce(p_product ->> 'description', ''),
      nullif(p_product ->> 'brand_id', '')::uuid,
      (p_product ->> 'category_id')::uuid,
      nullif(p_product ->> 'product_image', ''),
      coalesce((select array_agg(value #>> '{}') from jsonb_array_elements(
                 coalesce(p_product -> 'gallery_images', '[]'::jsonb))), '{}'),
      coalesce((p_product ->> 'units_per_carton')::integer, 1),
      coalesce((p_product ->> 'cost_price')::numeric, 0),
      coalesce((p_product ->> 'wholesale_price')::numeric, 0),
      coalesce((p_product ->> 'retail_price')::numeric, 0),
      nullif(p_product ->> 'carton_price', '')::numeric,
      coalesce((p_product ->> 'minimum_order_quantity')::integer, 1),
      coalesce((p_product ->> 'low_stock_threshold')::integer, 10),
      coalesce((p_product ->> 'is_active')::boolean, true),
      coalesce((p_product ->> 'is_featured')::boolean, false),
      coalesce((select array_agg(value #>> '{}') from jsonb_array_elements(
                 coalesce(p_product -> 'tags', '[]'::jsonb))), '{}')
    returning * into v_product;
  exception
    when unique_violation then
      -- Two different unique indexes, two different things to fix.
      if sqlerrm like '%products_sku_key%' then
        raise exception 'PK_DUPLICATE_SKU: SKU "%" is already used by another product', p_product ->> 'sku';
      end if;
      raise exception 'PK_DUPLICATE_SLUG: the web address "%" is already taken', p_product ->> 'slug';
    when foreign_key_violation then
      raise exception 'PK_BAD_REFERENCE: the chosen category or brand no longer exists';
  end;

  if v_location is not null then
    insert into public.inventory (product_id, location_id, quantity, warehouse_location)
    values (v_product.id, v_location, 0, nullif(btrim(coalesce(p_warehouse_note, '')), ''))
    on conflict (product_id, location_id) do nothing;
  end if;

  if p_opening_stock > 0 then
    perform public.record_stock_movement(
      p_product_id    => v_product.id,
      p_movement_type => 'STOCK_IN',
      p_quantity      => p_opening_stock,
      p_location_id   => v_location,
      p_reason        => 'Opening stock',
      p_unit_cost     => nullif(v_product.cost_price, 0),
      p_notes         => 'Recorded when the product was created.'
    );
  end if;

  return v_product;
end;
$$;

-- -------------------------------------------------- deactivate_product ----
-- Soft delete, and the reason a hard delete is almost never offered: a
-- product that has ever moved is part of the ledger. This reports which case
-- it is so the console can say so rather than just refusing.

create or replace function public.product_can_be_deleted(p_product_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
     and not exists (select 1 from public.stock_movements where product_id = p_product_id)
$$;

-- ---------------------------------------------------- import_products -----
-- CSV import. Everything or nothing: one bad row raises, and the whole call
-- rolls back, so a half-imported spreadsheet is not a state this system can
-- be in. `p_dry_run` runs every check and then deliberately fails, which is
-- how the preview screen validates without writing.

create or replace function public.import_products(
  p_rows    jsonb,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       jsonb;
  v_index     integer := 0;
  v_created   integer := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_opening   integer;
  v_cat       uuid;
  v_brand     uuid;
  v_message   text;
begin
  if not public.can_manage() then
    raise exception 'PK_FORBIDDEN: only a manager or an admin may import products';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_index := v_index + 1;
    v_cat := nullif(v_row ->> 'category_id', '')::uuid;
    v_brand := nullif(v_row ->> 'brand_id', '')::uuid;
    v_opening := coalesce((v_row ->> 'opening_stock')::integer, 0);

    begin
      -- PERFORM, not SELECT ... INTO: create_product returns a composite, and
      -- assigning that to a %rowtype variable would try to put the whole row
      -- into its first column.
      perform public.create_product(
        (v_row - 'opening_stock')
          || jsonb_build_object('category_id', v_cat, 'brand_id', v_brand),
        v_opening
      );
      v_created := v_created + 1;
    exception when others then
      get stacked diagnostics v_message = message_text;
      v_errors := v_errors || jsonb_build_object(
        'row', v_index,
        'sku', v_row ->> 'sku',
        'message', v_message
      );
    end;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'PK_IMPORT_FAILED: %', v_errors::text;
  end if;

  if p_dry_run then
    -- Rolls the whole call back, including every row created above. The
    -- caller catches this code and reads it as "the preview passed".
    raise exception 'PK_DRY_RUN_OK: % rows would be imported', v_created;
  end if;

  return jsonb_build_object('created', v_created);
end;
$$;

-- ---------------------------------------------------- dashboard_summary ----
-- Five KPI cards in one round trip instead of five. Inventory value uses cost
-- price, never retail: it is what the stock cost the business, not what it
-- would fetch.

create or replace function public.dashboard_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with stock as (
    select
      p.id,
      p.cost_price,
      p.low_stock_threshold,
      coalesce(sum(i.quantity), 0)::integer as qty,
      coalesce(sum(i.quantity - i.reserved_quantity), 0)::integer as available
    from public.products p
    left join public.inventory i on i.product_id = p.id
    where p.is_active
    group by p.id, p.cost_price, p.low_stock_threshold
  )
  select case when public.is_staff() then jsonb_build_object(
    'total_products',    (select count(*) from stock),
    'total_units',       (select coalesce(sum(qty), 0) from stock),
    'low_stock',         (select count(*) from stock where available > 0 and available <= low_stock_threshold),
    'out_of_stock',      (select count(*) from stock where available <= 0),
    'inventory_value',   (select coalesce(sum(qty * cost_price), 0) from stock),
    'inactive_products', (select count(*) from public.products where not is_active),
    'movements_today',   (select count(*) from public.stock_movements where created_at >= date_trunc('day', now()))
  ) else null end
$$;

-- ------------------------------------------------------------- grants -----
-- PostgREST needs EXECUTE to expose these as RPCs. Each one re-checks the
-- caller's role internally, so being callable is not being permitted.

revoke all on function public.record_stock_movement(uuid, public.movement_type, integer, uuid, text, uuid, text, numeric, text, text, timestamptz) from public;
revoke all on function public.create_product(jsonb, integer, uuid, text) from public;
revoke all on function public.import_products(jsonb, boolean) from public;

grant execute on function public.record_stock_movement(uuid, public.movement_type, integer, uuid, text, uuid, text, numeric, text, text, timestamptz) to authenticated;
grant execute on function public.create_product(jsonb, integer, uuid, text) to authenticated;
grant execute on function public.import_products(jsonb, boolean) to authenticated;
grant execute on function public.product_can_be_deleted(uuid) to authenticated;
grant execute on function public.dashboard_summary() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_manage() to authenticated;
