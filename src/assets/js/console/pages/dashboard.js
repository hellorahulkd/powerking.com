/**
 * ============================================================================
 *  DASHBOARD — /admin/
 * ============================================================================
 *  What somebody opening this at eight in the morning needs to know: how much
 *  stock there is, what is about to run out, what has already run out, and
 *  what happened yesterday.
 *
 *  The five figures come from one database function rather than five queries,
 *  because five round trips to a Supabase region from Kathmandu is most of a
 *  second before anything is drawn.
 * ============================================================================
 */

import { el, mount, table, thumb, badge, stockBadge, empty, errorState, loading } from '../ui.js';
import { money, integer, stockText, dateTime, relative, MOVEMENT_LABELS, movementSign } from '../format.js';
import { can } from '../session.js';
import { summary, recentMovements } from '../data.js';
import { select } from '../client.js';

function kpi(label, value, { note, tone, href } = {}) {
  const children = [
    el('span.kpi__label', { text: label }),
    el('span.kpi__value', { text: value }),
    note ? el('span.kpi__note', { text: note }) : null,
  ];
  const cls = `kpi${tone ? `.kpi--${tone}` : ''}`;
  return href ? el(`a.${cls}`, { href }, children) : el(`div.${cls}`, {}, children);
}

/** The four buttons that are the reason somebody opened this page. */
function quickActions(role) {
  const actions = [
    can('manageProducts', role) && ['Add product', '/admin/products/new/', 'primary'],
    can('moveStock', role) && ['Stock in', '/admin/inventory/stock-in/', 'ghost'],
    can('moveStock', role) && ['Stock out', '/admin/inventory/stock-out/', 'ghost'],
    can('manageSuppliers', role) && ['Add supplier', '/admin/suppliers/?new=1', 'ghost'],
  ].filter(Boolean);
  if (!actions.length) return null;
  return el('div.row', {}, actions.map(([label, href, kind]) =>
    el(`a.btn.btn--${kind}.btn--sm`, { href }, [label])));
}

function movementCell(row) {
  const sign = movementSign(row.movement_type);
  return el('span', { class: sign > 0 ? 'pos' : 'neg', text: `${sign > 0 ? '+' : '−'}${integer(row.quantity)}` });
}

async function activity() {
  const { rows } = await recentMovements({ limit: 8 });
  return table(
    [
      { label: 'Product', cell: (r) => el('a', { href: `/admin/products/view/?id=${r.product_id}` }, [
          el('span.table__main', { text: r.product_name }),
          el('span.table__sub', { text: r.product_sku }),
        ]) },
      { label: 'Type', cell: (r) => badge(MOVEMENT_LABELS[r.movement_type] || r.movement_type,
          movementSign(r.movement_type) > 0 ? 'ok' : 'info') },
      { label: 'Qty', numeric: true, cell: movementCell },
      { label: 'User', narrow: true, cell: (r) => r.created_by_name },
      { label: 'Date', narrow: true, cell: (r) => el('span', { title: dateTime(r.created_at), text: relative(r.created_at) }) },
    ],
    rows,
    { empty: empty('No stock movements yet', 'The first stock-in will appear here.'), caption: 'Recent stock activity' },
  );
}

/**
 * Low stock and out of stock.
 *
 * `available_quantity <= low_stock_threshold` cannot be expressed as a
 * PostgREST filter — it compares two columns — so the low-stock query filters
 * on the threshold column being at least the available quantity using the
 * view's own stock_status, which the database has already computed. Doing the
 * comparison in the view rather than in the query is also what lets it be
 * indexed later without changing any caller.
 */
async function lowStockList(status, { limit = 6 } = {}) {
  const { rows, total } = await select('product_stock', {
    params: {
      select: 'id,sku,name,product_image,units_per_carton,quantity,available_quantity,low_stock_threshold,stock_status',
      is_active: 'eq.true',
      stock_status: `eq.${status}`,
      order: 'available_quantity.asc,name.asc',
      limit,
    },
    range: { from: 0, to: limit - 1 },
  });
  return { rows, total };
}

function productList(rows, { showThreshold = true } = {}) {
  return table(
    [
      { label: 'Product', cell: (r) => el('a.row', { href: `/admin/products/view/?id=${r.id}` }, [
          thumb(r.product_image, ''),
          el('span', {}, [
            el('span.table__main', { text: r.name }),
            el('span.table__sub', { text: r.sku }),
          ]),
        ]) },
      { label: 'Available', numeric: true, cell: (r) => el('span', {}, [
          el('span.table__main', { text: integer(r.available_quantity) }),
          showThreshold ? el('span.table__sub', { text: `of ${integer(r.low_stock_threshold)} minimum` }) : null,
        ]) },
    ],
    rows,
    { empty: empty('Nothing here', 'Good news — no products in this state.') },
  );
}

export default async function dashboard({ me, root }) {
  mount(root, loading('Loading the dashboard…'));

  let stats;
  try {
    stats = await summary();
  } catch (err) {
    mount(root, errorState(err, () => dashboard({ me, root })));
    return;
  }

  // A null summary means the database refused it, which for this function
  // means the profile is not active staff. requireSession has already checked
  // that, so this is belt and braces rather than an expected path.
  if (!stats) {
    mount(root, errorState({ message: 'This account cannot read the inventory.' }));
    return;
  }

  const kpis = el('div.grid.grid--kpi', {}, [
    kpi('Total products', integer(stats.total_products), {
      note: stats.inactive_products ? `${integer(stats.inactive_products)} inactive` : 'all active',
      href: '/admin/products/',
    }),
    kpi('Units in stock', integer(stats.total_units), {
      note: 'across every location', href: '/admin/inventory/',
    }),
    kpi('Low stock', integer(stats.low_stock), {
      note: 'at or below the minimum', tone: stats.low_stock ? 'warn' : undefined,
      href: '/admin/inventory/?filter=low',
    }),
    kpi('Out of stock', integer(stats.out_of_stock), {
      note: 'nothing available', tone: stats.out_of_stock ? 'bad' : undefined,
      href: '/admin/inventory/?filter=out',
    }),
    // At cost, never at retail: this is what the stock cost the business, not
    // what it might fetch. The dashboard_summary function computes it the
    // same way, so the two can never drift apart.
    kpi('Inventory value', money(stats.inventory_value), { note: 'at cost price' }),
  ]);

  const sections = el('div.stack', {}, [
    kpis,
    quickActions(me.role),
    el('div.card', {}, [
      el('div.card__head', {}, [
        el('h2.card__title', { text: 'Recent stock activity' }),
        el('a.card__link', { href: '/admin/reports/?report=movements' }, ['All movements →']),
      ]),
      el('div#activity', {}, [loading()]),
    ]),
    el('div.grid.grid--2', {}, [
      el('div.card', {}, [
        el('div.card__head', {}, [
          el('h2.card__title', { text: 'Running low' }),
          el('a.card__link', { href: '/admin/inventory/?filter=low' }, ['See all →']),
        ]),
        el('div#low', {}, [loading()]),
      ]),
      el('div.card', {}, [
        el('div.card__head', {}, [
          el('h2.card__title', { text: 'Out of stock' }),
          el('a.card__link', { href: '/admin/inventory/?filter=out' }, ['See all →']),
        ]),
        el('div#out', {}, [loading()]),
      ]),
    ]),
  ]);

  mount(root, sections);

  // The three tables load in parallel and each fills in when it arrives, so
  // the numbers at the top are readable immediately rather than waiting for
  // the slowest query on the page.
  activity()
    .then((node) => mount('activity', node))
    .catch((err) => mount('activity', errorState(err)));

  lowStockList('low_stock')
    .then(({ rows }) => mount('low', productList(rows)))
    .catch((err) => mount('low', errorState(err)));

  lowStockList('out_of_stock')
    .then(({ rows }) => mount('out', productList(rows, { showThreshold: false })))
    .catch((err) => mount('out', errorState(err)));
}
