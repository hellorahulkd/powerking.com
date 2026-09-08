-- ============================================================================
--  POWERKING NEPAL — ROLES AND ROW LEVEL SECURITY
-- ============================================================================
--  Every permission in the brief is enforced here, in Postgres, against the
--  caller's JWT. The admin console checks the same rules in JavaScript only to
--  decide which buttons to draw; if that check were removed entirely, or the
--  page were replaced with a hand-written fetch, nothing below would change.
--
--  ── WHY THE HELPERS ARE SECURITY DEFINER ─────────────────────────────────
--  A policy on `profiles` that reads `profiles` to find the caller's role
--  recurses. These functions run as their owner and so read the table without
--  re-entering its policies. They are the only place that happens, they take
--  no arguments, and they return one row about the caller and nothing else.
-- ============================================================================

-- --------------------------------------------------------- role helpers ----

-- The caller's role, or null for anonymous callers and for a user whose
-- profile has been deactivated. Deactivating a profile therefore revokes
-- everything immediately, without touching their auth account.
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() is not null, false)
$$;

-- coalesce, and not a bare comparison: auth_role() is null for a signed-out
-- or deactivated caller, and `null = 'admin'` is null, not false. A guard
-- written `if not is_admin() then raise` would then not raise at all, because
-- `not null` is null and the branch is skipped. These must return a real
-- boolean or every caller has to remember that they might not.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

-- "Manager or above". Named for the permission it grants rather than for the
-- role, because every caller wants the question and not the enumeration.
create or replace function public.can_manage()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('admin', 'manager'), false)
$$;

comment on function public.auth_role is
  'Role of the calling user, or null if anonymous or deactivated. SECURITY DEFINER to avoid recursive policy evaluation on profiles.';

-- ------------------------------------------------------------ profiles ----
-- Everyone signed in can see the team: a stock movement is worthless as an
-- audit record if the name beside it cannot be resolved. Only an admin can
-- create, change roles, or deactivate. A user may edit their own name.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_staff() or id = auth.uid());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Own name only. The USING clause picks the row; the WITH CHECK clause makes
-- sure the row still belongs to the caller afterwards. Role and is_active are
-- guarded by the trigger below, because a policy cannot see old vs new.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Stops a non-admin from promoting themselves through the self-update policy.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    -- An admin must not be able to lock the system by removing the last one.
    if (old.role = 'admin' and (new.role <> 'admin' or new.is_active = false))
       and (select count(*) from public.profiles
            where role = 'admin' and is_active and id <> old.id) = 0 then
      raise exception 'PK_LAST_ADMIN: the last active admin cannot be demoted or deactivated';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
    raise exception 'PK_FORBIDDEN: only an admin may change a role or activation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

-- --------------------------------------- reference data: read for staff ----
-- brands, categories, suppliers, locations: any signed-in user reads them,
-- because every form needs the dropdown. Writing is manager-and-above, and
-- deleting is admin only.
--
-- Suppliers are commercially sensitive (business rule 7) but that means "not
-- public", not "not visible to the team" — a stock-in screen has to name the
-- supplier the goods came from. They are unreachable to anon; see the public
-- catalogue migration, which grants anon nothing on any base table.

do $$
declare t text;
begin
  foreach t in array array['brands', 'categories', 'suppliers', 'inventory_locations']
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.is_staff())', t, t);

    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (public.can_manage())', t, t);

    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (public.can_manage()) with check (public.can_manage())', t, t);

    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------ products ----
-- Staff read everything, including inactive products, because they still have
-- to find one to reactivate it. Manager and above write. Only an admin may
-- DELETE, and even then only a product with no history: stock_movements holds
-- ON DELETE RESTRICT, so the delete fails at the foreign key rather than
-- taking the ledger with it.

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (public.is_staff());

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated with check (public.can_manage());

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.can_manage()) with check (public.can_manage());

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------- inventory ----
-- Read for all staff. NOT writable by anybody through the table, at any role:
-- there is deliberately no INSERT, UPDATE or DELETE policy here. The only way
-- stock changes is record_stock_movement(), which writes the ledger in the
-- same transaction. That is business rule 3 made structural — you cannot
-- forget to record a movement, because you cannot reach the quantity column.

drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory
  for select to authenticated using (public.is_staff());

-- Bin/shelf text is a label, not a quantity, so a manager may edit it
-- directly. The column list is not restrictable in a policy, so the trigger
-- below rejects any attempt to move a number through this door.
drop policy if exists inventory_update_label on public.inventory;
create policy inventory_update_label on public.inventory
  for update to authenticated
  using (public.can_manage()) with check (public.can_manage());

create or replace function public.guard_inventory_quantities()
returns trigger language plpgsql set search_path = public as $$
begin
  -- record_stock_movement() sets this flag for the duration of its
  -- transaction; anything else changing a quantity is a bug or an attack.
  if current_setting('powerking.stock_rpc', true) = 'on' then
    return new;
  end if;
  if new.quantity is distinct from old.quantity
     or new.reserved_quantity is distinct from old.reserved_quantity then
    raise exception
      'PK_NO_SILENT_STOCK: stock is changed with record_stock_movement(), so that a movement is always recorded';
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_guard on public.inventory;
create trigger inventory_guard before update on public.inventory
  for each row execute function public.guard_inventory_quantities();

-- ----------------------------------------------------- stock_movements ----
-- Read for all staff — the audit trail is the point, hiding it from the
-- people doing the work would defeat it. Insert only through the RPC (which
-- is SECURITY DEFINER and so is not subject to this policy); there is no
-- direct INSERT policy, and no UPDATE or DELETE policy for anyone at all.
-- Business rule 4: history cannot be casually deleted, by anybody, ever.

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select to authenticated using (public.is_staff());

-- -------------------------------------------------------- app_settings ----

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated using (public.is_staff());

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
