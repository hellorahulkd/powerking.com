# How inventory works

Written for whoever has to change this next, and for whoever has to trust the
numbers it produces.

---

## The one rule everything else follows

**Stock cannot change without a movement being recorded.**

That is not a convention this codebase tries to keep. It is a fact about the
database, and it is worth understanding exactly how, because everything else
here is a consequence of it.

`public.inventory` — the table holding the current quantity — has **no INSERT,
UPDATE or DELETE policy for any role**. Not for staff, not for a manager, not
for an admin. There is one exception, and it is deliberately narrow: a manager
may edit the `warehouse_location` text, because a shelf label is not a
quantity. A trigger rejects any attempt to move a number through that door:

```
PK_NO_SILENT_STOCK: stock is changed with record_stock_movement(),
so that a movement is always recorded
```

So the only way to a quantity is `record_stock_movement()`, which writes the
inventory and the ledger in the same transaction. You cannot forget to record
a movement, because you cannot reach the column.

---

## The two tables, and why there are two

| | `inventory` | `stock_movements` |
| --- | --- | --- |
| Holds | what there is **now** | what has **happened** |
| Rows | one per product per location | one per change, forever |
| Written by | `record_stock_movement()` only | `record_stock_movement()` only |
| Deletable | no policy exists | no policy exists, for anybody |

`inventory` is derivable — replay every movement and you get it. It is kept
materialised anyway, because every screen reads the current quantity and no
screen should be summing a hundred thousand rows to draw a badge.

`stock_movements` is the record. It is append-only in the strongest available
sense: there is no UPDATE policy and no DELETE policy on it at all, including
for admins. And `products.id` is referenced `ON DELETE RESTRICT`, which is what
makes "a product with history cannot be deleted" a database fact rather than a
hope. Deactivate it instead — `is_active = false` — and it leaves the public
catalogue while every figure it contributed to the reports stays true.

---

## What a movement does, in order

`record_stock_movement()` — `supabase/migrations/…_stock_functions.sql`:

1. **Who is asking.** `auth_role()` reads the caller's role from `profiles`,
   not from the JWT, so an admin changing somebody's role takes effect on their
   next request rather than at their next sign-in. A null role — signed out, or
   deactivated — is refused. Staff may move stock in and out; only a manager or
   admin may record an adjustment.
2. **Is the request sane.** Quantity a whole number above zero. Unit cost not
   negative. Product exists. An inactive product may still take a return or a
   correction but not a sale or a delivery.
3. **Lock the row.** `SELECT … FOR UPDATE` on the inventory row.
4. **Compute and check.** New quantity below zero is refused. So is a quantity
   that would fall below what is reserved.
5. **Apply both writes.** The quantity, and the ledger entry — including the
   resulting balance in `quantity_after`, so the history reads without having
   to be re-totalled.

If any step raises, the whole transaction rolls back. `inventory` and
`stock_movements` cannot disagree.

### Why the lock is the whole point

Two people, two phones, one carton left. Both screens read "1 in stock". Both
press Stock out.

Without the lock, both read 1, both subtract 1, and the shop is at −1 with two
movements recorded and one carton to ship. `SELECT … FOR UPDATE` makes the
second transaction wait for the first to commit, so it reads 0 and is refused.

This is tested rather than asserted. `scripts/dev/db-race.sh` sets stock to 10
and fires twenty concurrent sessions at it: exactly ten succeed, ten are
refused, the quantity lands on 0 and never below, and there are exactly ten
ledger rows.

---

## Movement types

| Type | Effect | Who | Typical use |
| --- | --- | --- | --- |
| `STOCK_IN` | + | staff and above | a delivery arrived |
| `STOCK_OUT` | − | staff and above | sold or shipped |
| `ADJUSTMENT_IN` | + | manager and above | a count found more than the system said |
| `ADJUSTMENT_OUT` | − | manager and above | damaged, lost, written off |
| `RETURN_IN` | + | staff and above | a customer returned goods |
| `RETURN_OUT` | − | staff and above | goods returned to a supplier |

Adjustments require a reason from a fixed list, and staff cannot make them. An
adjustment is the only movement with no counterparty — no supplier, no
customer, no invoice to check it against — so a system that let one be made
with a blank reason would have an audit trail that proves nothing.

---

## Available, reserved, and the arithmetic

```
available = quantity − reserved_quantity
```

`reserved_quantity` is 0 everywhere in this version. It exists, is constrained
(`reserved_quantity <= quantity`), and is already checked by
`record_stock_movement()`, so switching reservations on later is a feature
rather than an audit of every caller.

### Cartons

```
cartons = floor(quantity ÷ units_per_carton)
loose   = quantity mod units_per_carton
```

247 units at 20 per carton is **12 cartons + 7 units**. Not 12.35, and not 13 —
somebody told "13 cartons" goes to the warehouse expecting 260. Integer
division and remainder, never rounding. 250 at 20 is 12 cartons + 10 units.

A product with `units_per_carton = 1` is sold loose and gets no carton reading
at all; "247 cartons + 0 units" would be worse than saying nothing.

Unit-tested in `scripts/dev/unit-test.js`, including zero, negatives, strings
and fractions.

### Inventory value

```
value = quantity × cost_price
```

**Cost price, never retail.** It is what the stock cost the business, not what
it might fetch. `dashboard_summary()` and the `product_stock` view compute it
the same way, so the dashboard and the reports cannot drift apart.

Cost prices are zero on every product migrated from the old JSON catalogue,
because they were never recorded there. The valuation reads zero until somebody
enters them — an honest zero rather than a guess.

---

## Who may do what

Enforced by Row Level Security in Postgres, against the caller's JWT. The
console checks the same rules only to decide which buttons to draw; delete that
check entirely and nothing below changes.

| | staff | manager | admin |
| --- | :-: | :-: | :-: |
| View products, inventory, history | ● | ● | ● |
| Stock in / stock out / returns | ● | ● | ● |
| Adjustments | | ● | ● |
| Add and edit products | | ● | ● |
| Categories, brands, suppliers | | ● | ● |
| Reports and exports | ● | ● | ● |
| Import a spreadsheet | | ● | ● |
| Delete a product (only if it has no history) | | | ● |
| Manage users and settings | | | ● |

A deactivated profile has no role, so it can read nothing at all — the same
path as being signed out, and immediate rather than at the next sign-in.

The last active admin cannot be demoted or deactivated. `PK_LAST_ADMIN`. A
system nobody can administer is not a safer system.

---

## What the public may see

The public catalogue reads `catalogue_products`, a **projection**, not a
filtered table. Row Level Security filters rows, not columns, so an `anon`
policy on `products` would hand out `cost_price` to anyone who asked. The view
does not contain the column, so no request can return it.

Anonymous callers hold **no grant at all** on `products`, `inventory`,
`stock_movements`, `suppliers`, `profiles`, `categories`, `brands`,
`inventory_locations` or `app_settings`. Tested by probing each one directly at
the API — see the `publicCatalogue` suite in `scripts/dev/console-test.js`.

Stock reaches the public as a **word**, never a number:

| Setting | What a visitor sees |
| --- | --- |
| `badge` (default) | In stock / Low stock / Out of stock |
| `binary` | In stock / Contact for availability |
| `off` | always Contact for availability |

Changed at **/admin/settings/**. Even on `badge` the quantity itself never
crosses the line, because there is no column for it to cross in.

---

## When the public site actually changes

The public catalogue is **pre-rendered at build time**. That is not laziness:
WhatsApp, Facebook and Messenger link crawlers do not run JavaScript, and most
of this shop's traffic is a product link pasted into a chat. A real HTML file
per product is the only way each one gets its own title, description and
preview image.

So an edit made in `/admin/` reaches the website on the next build. A push
triggers one; the workflow also runs daily, and can be run by hand from the
Actions tab. If the database is unreachable at build time the site falls back
to `data/products.json`, warns loudly, and publishes a complete catalogue
anyway — a site that cannot reach its database should still be a site.

---

## Adding a movement type

1. Add it to the `movement_type` enum.
2. Decide its direction in `movement_sign()`.
3. Decide who may use it, in `record_stock_movement()`'s role check.
4. Add its label to `MOVEMENT_LABELS` in `src/assets/js/console/format.js`.
5. Add a case to `scripts/dev/db-tests.sql`.

Steps 1–3 are the ones that matter. 4 is cosmetic; 5 is what stops the next
person breaking it.

---

## Where to look

| | |
| --- | --- |
| Schema, constraints, indexes | `supabase/migrations/…_inventory_core.sql` |
| Roles and policies | `…_rls_policies.sql` |
| The stock functions | `…_stock_functions.sql` |
| Public projection and admin views | `…_public_catalogue.sql` |
| Business rules under test | `scripts/dev/db-tests.sql` |
| The concurrency proof | `scripts/dev/db-race.sh` |
| Carton and CSV arithmetic | `scripts/dev/unit-test.js` |
| The console, end to end | `scripts/dev/console-test.js` |
