/**
 * ============================================================================
 *  REPORTS — /admin/reports/
 * ============================================================================
 *  Four reports behind one screen, chosen with a tab and remembered in the
 *  URL so a particular report with particular filters can be sent to somebody
 *  as a link.
 *
 *    Inventory        what is held, and what it cost
 *    Stock movements  every change, filterable by date, product, type,
 *                     supplier and user
 *    Low stock        at or below the reorder level
 *    Out of stock     nothing available
 *
 *  Each is exportable as CSV and printable. The print stylesheet in
 *  console.css drops the sidebar, the toolbar and the paging, so what comes
 *  off the printer is the table and its heading — a report, rather than a
 *  photograph of an application.
 * ============================================================================
 */

import {
  el, mount, table, badge, empty, errorState, loading, pagination, thumb,
  input, select as selectEl, stockBadge, debounce, $, toast,
} from '../ui.js';
import {
  money, integer, cartons, dateTime, date, MOVEMENT_LABELS, movementSign,
} from '../format.js';
import { can } from '../session.js';
import { categories, brands, suppliers, locations } from '../data.js';
import { select } from '../client.js';

const PAGE_SIZE = 50;

const REPORTS = {
  inventory: { label: 'Inventory', view: 'product_stock' },
  movements: { label: 'Stock movements', view: 'stock_movement_log' },
  low:       { label: 'Low stock', view: 'product_stock' },
  out:       { label: 'Out of stock', view: 'product_stock' },
};

function readState() {
  const q = new URLSearchParams(location.search);
  const report = REPORTS[q.get('report')] ? q.get('report') : 'inventory';
  return {
    report,
    from: q.get('from') || '',
    to: q.get('to') || '',
    product: q.get('product') || '',
    type: q.get('type') || '',
    supplier: q.get('supplier') || '',
    user: q.get('user') || '',
    category: q.get('category') || '',
    brand: q.get('brand') || '',
    page: Math.max(0, Number(q.get('page') || 0)),
  };
}

function writeState(state) {
  const q = new URLSearchParams();
  for (const key of ['report', 'from', 'to', 'product', 'type', 'supplier', 'user',
                     'category', 'brand']) {
    if (state[key]) q.set(key, state[key]);
  }
  if (state.page) q.set('page', String(state.page));
  history.pushState(null, '', `${location.pathname}?${q}`);
}

/* ------------------------------------------------------------- queries --- */

export function queryFor(state, { pageSize = PAGE_SIZE } = {}) {
  if (state.report === 'movements') {
    const params = {
      select:
        'id,created_at,movement_type,quantity,quantity_after,reference_number,customer_name,' +
        'reason,notes,unit_cost,product_id,product_name,product_sku,supplier_id,supplier_name,' +
        'location_name,created_by,created_by_name',
      order: 'created_at.desc',
      limit: pageSize,
    };
    // Dates are inclusive at both ends, which is what a person means by
    // "from the 1st to the 7th". The upper bound is the start of the next
    // day rather than 23:59:59, so a movement at 23:59:30 is not lost.
    if (state.from) params.created_at = `gte.${state.from}T00:00:00`;
    if (state.to) {
      const next = new Date(`${state.to}T00:00:00`);
      next.setDate(next.getDate() + 1);
      const upper = `lt.${next.toISOString().slice(0, 10)}T00:00:00`;
      params.created_at = state.from ? [params.created_at, upper] : upper;
    }
    if (state.product) params.product_id = `eq.${state.product}`;
    if (state.type) params.movement_type = `eq.${state.type}`;
    if (state.supplier) params.supplier_id = `eq.${state.supplier}`;
    if (state.user) params.created_by = `eq.${state.user}`;
    return params;
  }

  const params = {
    select:
      'id,sku,name,product_image,units_per_carton,cost_price,wholesale_price,quantity,' +
      'reserved_quantity,available_quantity,low_stock_threshold,stock_status,inventory_value,' +
      'category_name,brand_name,category_id,brand_id,locations',
    is_active: 'eq.true',
    limit: pageSize,
  };
  if (state.report === 'low') {
    params.stock_status = 'eq.low_stock';
    params.order = 'available_quantity.asc,name.asc';
  } else if (state.report === 'out') {
    params.stock_status = 'eq.out_of_stock';
    params.order = 'name.asc';
  } else {
    params.order = 'inventory_value.desc,name.asc';
  }
  if (state.category) params.category_id = `eq.${state.category}`;
  if (state.brand) params.brand_id = `eq.${state.brand}`;
  return params;
}

/* --------------------------------------------------------------- render -- */

const productColumns = (opts = {}) => [
  { label: 'Product', cell: (r) => el('a.row', { href: `/admin/products/view/?id=${r.id}` }, [
      thumb(r.product_image, ''),
      el('span', {}, [
        el('span.table__main', { text: r.name }),
        el('span.table__sub', { text: r.sku }),
      ]),
    ]) },
  { label: 'Category', narrow: true, cell: (r) => r.category_name },
  { label: 'Brand', narrow: true, cell: (r) => r.brand_name || '—' },
  { label: 'Stock', numeric: true, cell: (r) => integer(r.quantity) },
  { label: 'Available', numeric: true, cell: (r) => integer(r.available_quantity) },
  opts.threshold
    ? { label: 'Reorder at', numeric: true, cell: (r) => integer(r.low_stock_threshold) }
    : null,
  { label: 'Cartons', numeric: true, narrow: true, cell: (r) => {
      const c = cartons(r.quantity, r.units_per_carton);
      return c.hasCartons ? c.text : '—';
    } },
  { label: 'Cost price', numeric: true, narrow: true, cell: (r) => money(r.cost_price) },
  { label: 'Inventory value', numeric: true, cell: (r) => money(r.inventory_value) },
].filter(Boolean);

const movementColumns = [
  { label: 'Date', cell: (r) => dateTime(r.created_at) },
  { label: 'Product', cell: (r) => el('a', { href: `/admin/products/view/?id=${r.product_id}` }, [
      el('span.table__main', { text: r.product_name }),
      el('span.table__sub', { text: r.product_sku }),
    ]) },
  { label: 'Type', cell: (r) => badge(MOVEMENT_LABELS[r.movement_type] || r.movement_type,
      movementSign(r.movement_type) > 0 ? 'ok' : 'info') },
  { label: 'Quantity', numeric: true, cell: (r) => {
      const sign = movementSign(r.movement_type);
      return el('span', { class: sign > 0 ? 'pos' : 'neg',
        text: `${sign > 0 ? '+' : '−'}${integer(r.quantity)}` });
    } },
  { label: 'Stock after', numeric: true, narrow: true,
    cell: (r) => (r.quantity_after === null ? '—' : integer(r.quantity_after)) },
  { label: 'Reference', narrow: true, cell: (r) => r.reference_number || '—' },
  { label: 'Supplier / customer', narrow: true,
    cell: (r) => r.supplier_name || r.customer_name || '—' },
  { label: 'User', narrow: true, cell: (r) => r.created_by_name },
  { label: 'Notes', narrow: true,
    cell: (r) => [r.reason, r.notes].filter(Boolean).join(' — ') || '—' },
];

export default async function reports({ me, root }) {
  let state = readState();
  let refs;

  mount(root, loading('Loading reports…'));
  try {
    refs = {
      categories: await categories(),
      brands: await brands(),
      suppliers: can('manageSuppliers', me.role) ? await suppliers() : [],
      users: (await select('profiles', {
        params: { select: 'id,full_name,email', order: 'full_name.asc' },
      })).rows,
    };
  } catch (err) {
    mount(root, errorState(err, () => reports({ me, root })));
    return;
  }

  const tabs = el('div.row', {}, Object.entries(REPORTS).map(([key, r]) =>
    el(`button.btn.btn--${state.report === key ? 'primary' : 'ghost'}.btn--sm`, {
      type: 'button',
      'aria-pressed': String(state.report === key),
      onclick: () => { state = { ...state, report: key, page: 0 }; writeState(state); draw(); },
    }, [r.label])));

  const filters = el('div.toolbar#filters');
  const results = el('div#results', {}, [loading()]);
  const summary = el('p.small.muted#summary');

  mount(root, el('div.stack', {}, [
    tabs,
    el('div.card', {}, [
      el('div.card__head', {}, [
        el('h2.card__title#report-title', { text: REPORTS[state.report].label }),
        el('div.row', {}, [
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button', onclick: () => window.print(),
          }, ['Print']),
          can('exportData', me.role)
            ? el('button.btn.btn--ghost.btn--sm', { type: 'button', id: 'export' }, ['Export CSV'])
            : null,
        ]),
      ]),
      filters,
      summary,
      results,
    ]),
  ]));

  function drawFilters() {
    const nodes = [];
    if (state.report === 'movements') {
      const from = input({ type: 'date', value: state.from, 'aria-label': 'From date' });
      const to = input({ type: 'date', value: state.to, 'aria-label': 'To date' });
      const type = selectEl([{ value: '', label: 'Every movement type' },
        ...Object.entries(MOVEMENT_LABELS).map(([v, l]) =>
          ({ value: v, label: l, selected: v === state.type }))], { 'aria-label': 'Movement type' });
      const supplier = selectEl([{ value: '', label: 'Any supplier' },
        ...refs.suppliers.map((s) =>
          ({ value: s.id, label: s.name, selected: s.id === state.supplier }))],
        { 'aria-label': 'Supplier' });
      const user = selectEl([{ value: '', label: 'Anyone' },
        ...refs.users.map((u) =>
          ({ value: u.id, label: u.full_name || u.email, selected: u.id === state.user }))],
        { 'aria-label': 'User' });

      const apply = (patch) => { state = { ...state, ...patch, page: 0 }; writeState(state); draw(); };
      from.addEventListener('change', () => apply({ from: from.value }));
      to.addEventListener('change', () => apply({ to: to.value }));
      type.addEventListener('change', () => apply({ type: type.value }));
      supplier.addEventListener('change', () => apply({ supplier: supplier.value }));
      user.addEventListener('change', () => apply({ user: user.value }));

      nodes.push(
        el('label.small.muted', {}, ['From ', from]),
        el('label.small.muted', {}, ['to ', to]),
        type, refs.suppliers.length ? supplier : null, user,
        state.product
          ? el('button.btn.btn--ghost.btn--sm', {
              type: 'button', onclick: () => apply({ product: '' }),
            }, ['Clear product filter'])
          : null,
      );
    } else {
      const category = selectEl([{ value: '', label: 'All categories' },
        ...refs.categories.map((c) =>
          ({ value: c.id, label: c.name, selected: c.id === state.category }))],
        { 'aria-label': 'Category' });
      const brand = selectEl([{ value: '', label: 'All brands' },
        ...refs.brands.map((b) =>
          ({ value: b.id, label: b.name, selected: b.id === state.brand }))],
        { 'aria-label': 'Brand' });
      const apply = (patch) => { state = { ...state, ...patch, page: 0 }; writeState(state); draw(); };
      category.addEventListener('change', () => apply({ category: category.value }));
      brand.addEventListener('change', () => apply({ brand: brand.value }));
      nodes.push(category, brand);
    }
    mount(filters, ...nodes.filter(Boolean));
  }

  async function draw() {
    $('#report-title').textContent = REPORTS[state.report].label;
    for (const [i, key] of Object.keys(REPORTS).entries()) {
      const button = tabs.children[i];
      button.className = `btn btn--${state.report === key ? 'primary' : 'ghost'} btn--sm`;
      button.setAttribute('aria-pressed', String(state.report === key));
    }
    drawFilters();
    mount(results, loading());

    try {
      const view = REPORTS[state.report].view;
      const { rows, total } = await select(view, {
        params: queryFor(state),
        range: { from: state.page * PAGE_SIZE, to: state.page * PAGE_SIZE + PAGE_SIZE - 1 },
      });

      if (state.report === 'movements') {
        summary.textContent = `${integer(total ?? rows.length)} movement${
          (total ?? rows.length) === 1 ? '' : 's'}`;
      } else {
        // The value of the page in view, labelled as such. A total across
        // every page would need another query, and a figure that silently
        // covered only fifty rows would be worse than no figure at all.
        const value = rows.reduce((sum, r) => sum + Number(r.inventory_value || 0), 0);
        const units = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
        summary.textContent =
          `${integer(total ?? rows.length)} product${(total ?? rows.length) === 1 ? '' : 's'}` +
          ` · this page: ${integer(units)} units, ${money(value)} at cost`;
      }

      const columns = state.report === 'movements'
        ? movementColumns
        : productColumns({ threshold: state.report === 'low' });

      mount(results, [
        table(columns, rows, {
          caption: REPORTS[state.report].label,
          empty: empty(
            state.report === 'low' ? 'Nothing is running low'
              : state.report === 'out' ? 'Nothing is out of stock'
              : state.report === 'movements' ? 'No movements match those filters'
              : 'No products yet',
            state.report === 'movements'
              ? 'Try a wider date range, or clear a filter.'
              : 'That is the good version of this report.',
          ),
        }),
        rows.length
          ? pagination({ page: state.page, pageSize: PAGE_SIZE, total,
              onPage: (p) => { state.page = p; writeState(state); draw(); window.scrollTo(0, 0); } })
          : null,
      ]);
    } catch (err) {
      mount(results, errorState(err, draw));
    }
  }

  $('#export')?.addEventListener('click', async () => {
    const mod = await import('./export.js');
    const params = queryFor(state, { pageSize: 1000 });
    if (state.report === 'movements') await mod.exportMovements(params);
    else await mod.exportInventory(params);
  });

  window.addEventListener('popstate', () => { state = readState(); draw(); });

  await draw();
}
