-- ============================================================================
--  POWERKING NEPAL — PUBLIC CATALOGUE SURFACE
-- ============================================================================
--  What an anonymous visitor — and the site build, which uses the same
--  anonymous key — is allowed to see. Everything else is closed.
--
--  ── WHY VIEWS AND NOT A POLICY ON products ───────────────────────────────
--  An `anon` SELECT policy on `products` would grant the whole row. RLS
--  filters rows, not columns, so cost_price would travel to every browser
--  that asked for it. These views are a projection: the private columns are
--  not in them, so there is no request that returns one.
--
--  The views run with the privileges of their owner rather than the caller's
--  (`security_invoker = false`, which is the default and is stated here so it
--  is a decision rather than an accident). That is what lets them read the
--  base tables while `anon` holds no grant on those tables at all — checked
--  at the bottom of this file. Each view hard-codes `is_active`, so an
--  inactive product has no public representation to leak.
--
--  Business rules 6, 7 and 8: cost price, suppliers and exact quantities do
--  not appear below. Stock is a word, not a number.
-- ============================================================================

-- Belt and braces. PostgREST reaches these tables as `anon` for a signed-out
-- caller; with RLS on and no anon policy it would already return nothing, and
-- with no grant it cannot even be asked.
revoke all on public.products            from anon;
revoke all on public.inventory           from anon;
revoke all on public.stock_movements     from anon;
revoke all on public.suppliers           from anon;
revoke all on public.profiles            from anon;
revoke all on public.categories          from anon;
revoke all on public.brands              from anon;
revoke all on public.inventory_locations from anon;
revoke all on public.app_settings        from anon;

-- ------------------------------------------------------- stock wording ----
-- How much a visitor is told. Configurable because it is a commercial
-- decision, not a technical one: a shop that is happy to advertise depth can
-- switch it, one that is not can turn the badge off entirely.
--
--   'badge'  → In Stock / Low Stock / Out of Stock
--   'binary' → In Stock / Contact for Availability
--   'off'    → always Contact for Availability
--
-- Even on 'badge' the number itself never crosses the line.

create or replace function public.public_stock_label(
  p_mode      text,
  p_available integer,
  p_threshold integer
)
returns text
language sql
immutable
as $$
  select case p_mode
    when 'off' then 'contact'
    when 'binary' then case when coalesce(p_available, 0) > 0 then 'in_stock' else 'contact' end
    else case
      when coalesce(p_available, 0) <= 0 then 'out_of_stock'
      when p_available <= coalesce(p_threshold, 0) then 'low_stock'
      else 'in_stock'
    end
  end
$$;

-- The mode is a single row that every product on the page shares, so it is
-- read once per query as a scalar and passed in, rather than being looked up
-- per product. Taking the setting as an argument also keeps the function
-- pure: it touches no table, so it needs no privileges of its own and there
-- is no reason for it to be SECURITY DEFINER.
create or replace function public.public_stock_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value ->> 'mode' from public.app_settings where key = 'public_stock_display'),
    'badge')
$$;

-- ------------------------------------------------- catalogue_products -----

drop view if exists public.catalogue_products;
create view public.catalogue_products
with (security_invoker = false) as
select
  p.id,
  p.sku,
  p.name,
  p.slug,
  p.description,
  b.name  as brand,
  c.name  as category,
  c.slug  as category_slug,
  p.product_image,
  p.gallery_images,
  p.units_per_carton,
  -- Trade prices only. cost_price is not selected, so it cannot be returned.
  p.wholesale_price,
  p.retail_price,
  p.carton_price,
  p.minimum_order_quantity,
  p.is_featured,
  p.tags,
  public.public_stock_label(cfg.mode, coalesce(s.available, 0), p.low_stock_threshold)
    as stock_status,
  p.updated_at
from public.products p
cross join (select public.public_stock_mode() as mode) cfg
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join lateral (
  select sum(i.quantity - i.reserved_quantity)::integer as available
  from public.inventory i where i.product_id = p.id
) s on true
where p.is_active and c.is_active;

comment on view public.catalogue_products is
  'Public product projection. Active products only, no cost price, no supplier, no quantity — stock is a status word. Read by anonymous visitors and by the site build.';

-- ----------------------------------------------- catalogue_categories -----

drop view if exists public.catalogue_categories;
create view public.catalogue_categories
with (security_invoker = false) as
select
  c.id, c.name, c.slug, c.description, c.image,
  count(p.id)::integer as product_count
from public.categories c
left join public.products p on p.category_id = c.id and p.is_active
where c.is_active
group by c.id, c.name, c.slug, c.description, c.image;

-- --------------------------------------------------- catalogue_brands -----

drop view if exists public.catalogue_brands;
create view public.catalogue_brands
with (security_invoker = false) as
select
  b.id, b.name, b.slug, b.logo,
  count(p.id)::integer as product_count
from public.brands b
left join public.products p on p.brand_id = b.id and p.is_active
where b.is_active
group by b.id, b.name, b.slug, b.logo;

grant select on public.catalogue_products   to anon, authenticated;
grant select on public.catalogue_categories to anon, authenticated;
grant select on public.catalogue_brands     to anon, authenticated;
grant execute on function public.public_stock_label(text, integer, integer) to anon, authenticated;
grant execute on function public.public_stock_mode() to anon, authenticated;

-- ============================================================================
--  ADMIN READ SURFACE
-- ============================================================================
--  Joined views for the screens that would otherwise make four requests to
--  draw one table. These run as the caller (`security_invoker = true`), so
--  every policy from the previous migration still applies to them — a member
--  of staff reading `product_stock` is reading `products` and `inventory`
--  under their own permissions, through a convenience shape.

drop view if exists public.product_stock;
create view public.product_stock
with (security_invoker = true) as
select
  p.id,
  p.sku,
  p.name,
  p.slug,
  p.product_image,
  p.is_active,
  p.is_featured,
  p.units_per_carton,
  p.cost_price,
  p.wholesale_price,
  p.retail_price,
  p.carton_price,
  p.minimum_order_quantity,
  p.low_stock_threshold,
  p.brand_id,
  b.name as brand_name,
  p.category_id,
  c.name as category_name,
  coalesce(s.quantity, 0)  as quantity,
  coalesce(s.reserved, 0)  as reserved_quantity,
  coalesce(s.quantity, 0) - coalesce(s.reserved, 0) as available_quantity,
  s.locations,
  s.warehouse_location,
  case
    when coalesce(s.quantity, 0) - coalesce(s.reserved, 0) <= 0 then 'out_of_stock'
    when coalesce(s.quantity, 0) - coalesce(s.reserved, 0) <= p.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end as stock_status,
  -- Value at cost, matching the dashboard. Kept here so a CSV export of this
  -- view is already the inventory report.
  round(coalesce(s.quantity, 0) * p.cost_price, 2) as inventory_value,
  p.created_at,
  p.updated_at
from public.products p
join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join lateral (
  select
    sum(i.quantity)::integer          as quantity,
    sum(i.reserved_quantity)::integer as reserved,
    array_agg(distinct l.name)        as locations,
    min(i.warehouse_location)         as warehouse_location
  from public.inventory i
  join public.inventory_locations l on l.id = i.location_id
  where i.product_id = p.id
) s on true;

-- Supabase grants anon everything in `public` by default, and a view created
-- after that default is no exception. product_stock runs as the caller, so
-- anon would already read nothing through it — but a grant that is never
-- meant to be used is a grant to remove, not to reason about.
revoke all on public.product_stock from anon;
grant select on public.product_stock to authenticated;

-- Movements with the names already resolved, so the activity tables and the
-- movement report do not each re-invent the same four joins.
drop view if exists public.stock_movement_log;
create view public.stock_movement_log
with (security_invoker = true) as
select
  m.id,
  m.created_at,
  m.movement_type,
  m.quantity,
  m.quantity_after,
  public.movement_sign(m.movement_type) * m.quantity as signed_quantity,
  m.reference_number,
  m.customer_name,
  m.reason,
  m.notes,
  m.unit_cost,
  m.product_id,
  p.name as product_name,
  p.sku  as product_sku,
  m.supplier_id,
  sup.name as supplier_name,
  m.location_id,
  loc.name as location_name,
  m.created_by,
  coalesce(pr.full_name, m.created_by_name, 'Unknown') as created_by_name
from public.stock_movements m
join public.products p on p.id = m.product_id
left join public.suppliers sup on sup.id = m.supplier_id
left join public.inventory_locations loc on loc.id = m.location_id
left join public.profiles pr on pr.id = m.created_by;

revoke all on public.stock_movement_log from anon;
grant select on public.stock_movement_log to authenticated;
