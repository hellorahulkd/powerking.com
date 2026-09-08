-- ============================================================================
--  POWERKING NEPAL — INVENTORY CORE SCHEMA
-- ============================================================================
--  Creates every table the inventory system uses. Safe to run on a fresh
--  Supabase project; it creates nothing that already exists and touches no
--  data. RLS is enabled here but the policies live in the next migration, so
--  between the two nobody can read anything — which is the safe order.
--
--  Money is numeric(12,2), never float. A rupee figure that drifts by a
--  fraction because of binary floating point is a figure nobody quoted.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fast ILIKE search on name/sku

-- --------------------------------------------------------------- enums ----

do $$ begin
  create type public.user_role as enum ('admin', 'manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_type as enum (
    'STOCK_IN', 'STOCK_OUT',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'RETURN_IN', 'RETURN_OUT'
  );
exception when duplicate_object then null; end $$;

-- Shared updated_at trigger. Every table that carries updated_at uses it, so
-- the column is never something the application has to remember to set.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------ profiles ----
-- One row per Supabase Auth user. Role lives here, not in JWT claims, so an
-- admin can change somebody's role and have it take effect on their next
-- request rather than on their next login.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  role        public.user_role not null default 'staff',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A new auth user gets a profile automatically, inactive-by-default reasoning
-- does not apply: an admin had to create the auth user in the first place.
-- The very first user of an empty system becomes the admin, because otherwise
-- there is nobody able to promote anyone.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when first_user then 'admin'::public.user_role
      when (new.raw_user_meta_data ->> 'role') in ('admin', 'manager', 'staff')
        then (new.raw_user_meta_data ->> 'role')::public.user_role
      else 'staff'::public.user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -------------------------------------------------------------- brands ----

create table if not exists public.brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  logo        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------- categories ----

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  description text not null default '',
  image       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- suppliers ----

create table if not exists public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  contact_person text,
  phone          text,
  email          text,
  address        text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists suppliers_name_key on public.suppliers (lower(name));

drop trigger if exists suppliers_touch on public.suppliers;
create trigger suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------- inventory_locations ----
-- One warehouse today. The table exists so a second one is a row, not a
-- migration, and so every movement already records where it happened.

create table if not exists public.inventory_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  address     text,
  description text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Exactly one location may be the default, enforced by the database rather
-- than by whichever screen happens to be setting it.
create unique index if not exists inventory_locations_one_default
  on public.inventory_locations (is_default) where is_default;

insert into public.inventory_locations (name, description, is_default)
values ('Main Warehouse', 'Default storage location.', true)
on conflict (name) do nothing;

-- ------------------------------------------------------------ products ----

create table if not exists public.products (
  id                     uuid primary key default gen_random_uuid(),
  sku                    text not null,
  name                   text not null,
  slug                   text not null,
  description            text not null default '',
  brand_id               uuid references public.brands (id) on delete set null,
  category_id            uuid not null references public.categories (id) on delete restrict,
  product_image          text,
  gallery_images         text[] not null default '{}',
  units_per_carton       integer not null default 1  check (units_per_carton > 0),
  cost_price             numeric(12,2) not null default 0 check (cost_price      >= 0),
  wholesale_price        numeric(12,2) not null default 0 check (wholesale_price >= 0),
  retail_price           numeric(12,2) not null default 0 check (retail_price    >= 0),
  -- Not in the original field list, and here because this shop genuinely
  -- quotes two trade prices: one per loose piece and a keener one per carton.
  -- The carton rate is not units_per_carton x the piece rate — that is the
  -- discount — so it cannot be derived and has to be stored.
  carton_price           numeric(12,2) check (carton_price >= 0),
  minimum_order_quantity integer not null default 1  check (minimum_order_quantity > 0),
  low_stock_threshold    integer not null default 10 check (low_stock_threshold >= 0),
  is_active              boolean not null default true,
  is_featured            boolean not null default false,
  tags                   text[] not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint products_sku_not_blank  check (length(btrim(sku))  > 0),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_slug_shape     check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

-- SKU is unique case-insensitively: "pk-jbl-001" and "PK-JBL-001" are the
-- same code written by two different people, not two products.
create unique index if not exists products_sku_key  on public.products (lower(sku));
create unique index if not exists products_slug_key on public.products (slug);

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_brand_idx    on public.products (brand_id);
create index if not exists products_active_idx   on public.products (is_active);
create index if not exists products_created_idx  on public.products (created_at desc);
-- Trigram indexes make ILIKE '%term%' an index scan instead of a table scan,
-- which is what keeps search usable at the 10,000-product target.
create index if not exists products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists products_sku_trgm  on public.products using gin (sku  gin_trgm_ops);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------- inventory ----
-- Current state, one row per product per location. Derivable by replaying
-- stock_movements, kept materialised because every screen reads it and no
-- screen should be summing a hundred thousand rows to draw a badge.

create table if not exists public.inventory (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references public.products (id) on delete cascade,
  location_id        uuid not null references public.inventory_locations (id) on delete restrict,
  quantity           integer not null default 0 check (quantity >= 0),
  reserved_quantity  integer not null default 0 check (reserved_quantity >= 0),
  warehouse_location text,
  updated_at         timestamptz not null default now(),
  unique (product_id, location_id),
  -- Stock cannot go negative and cannot be reserved twice. Business rule 2
  -- of the brief, expressed where no application bug can get around it.
  constraint inventory_reserved_within_stock check (reserved_quantity <= quantity)
);

create index if not exists inventory_product_idx  on public.inventory (product_id);
create index if not exists inventory_location_idx on public.inventory (location_id);

drop trigger if exists inventory_touch on public.inventory;
create trigger inventory_touch before update on public.inventory
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------- stock_movements ----
-- The ledger. Append-only in practice: there is no UPDATE or DELETE policy on
-- this table for anybody, including admins, so history cannot be quietly
-- rewritten. product_id is ON DELETE RESTRICT, which is what makes "a product
-- with transactions cannot be deleted" a database fact rather than a hope.

create table if not exists public.stock_movements (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete restrict,
  location_id      uuid references public.inventory_locations (id) on delete set null,
  movement_type    public.movement_type not null,
  quantity         integer not null check (quantity > 0),
  quantity_after   integer,
  reference_number text,
  supplier_id      uuid references public.suppliers (id) on delete set null,
  customer_name    text,
  reason           text,
  notes            text,
  unit_cost        numeric(12,2) check (unit_cost >= 0),
  created_by       uuid references public.profiles (id) on delete set null,
  created_by_name  text,
  created_at       timestamptz not null default now()
);

create index if not exists stock_movements_product_idx  on public.stock_movements (product_id);
create index if not exists stock_movements_created_idx  on public.stock_movements (created_at desc);
create index if not exists stock_movements_type_idx     on public.stock_movements (movement_type);
create index if not exists stock_movements_supplier_idx on public.stock_movements (supplier_id);
create index if not exists stock_movements_user_idx     on public.stock_movements (created_by);
-- The product detail page asks for one product's history newest-first; the
-- composite index answers that without a sort.
create index if not exists stock_movements_product_date_idx
  on public.stock_movements (product_id, created_at desc);

-- ------------------------------------------------------------ settings ----
-- Small key/value store for things the shop can change without a deploy,
-- such as whether the public catalogue shows stock badges at all.

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

insert into public.app_settings (key, value) values
  ('public_stock_display', '{"mode":"badge"}'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------- RLS ----
-- Enabled on everything now. With no policies yet, this denies all access,
-- including to anon — the next migration opens exactly the doors intended.

alter table public.profiles            enable row level security;
alter table public.brands              enable row level security;
alter table public.categories          enable row level security;
alter table public.suppliers           enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.products            enable row level security;
alter table public.inventory           enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.app_settings        enable row level security;
