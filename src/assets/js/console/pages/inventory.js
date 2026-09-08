/**
 * ============================================================================
 *  INVENTORY — /admin/inventory/
 * ============================================================================
 *  The stock overview. The same server-side filtering and paging as the
 *  product list, over the columns somebody counting stock cares about:
 *  what is there, what is spoken for, what is left, and how many cartons
 *  that is.
 * ============================================================================
 */

import {
  el, mount, table, thumb, badge, stockBadge, empty, errorState, loading,
  pagination, input, select as selectEl, debounce, $,
} from '../ui.js';
import { money, integer, cartons } from '../format.js';
import { can } from '../session.js';
import { categories, brands, locations } from '../data.js';
import { select } from '../client.js';

const PAGE_SIZE = 25;

const SORTS = [
  { value: 'name.asc',                label: 'Name A–Z' },
  { value: 'available_quantity.asc',  label: 'Least stock first' },
  { value: 'available_quantity.desc', label: 'Most stock first' },
  { value: 'inventory_value.desc',    label: 'Most valuable first' },
  { value: 'sku.asc',                 label: 'SKU' },
];

const FILTERS = [
  { value: '',    label: 'All active products' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'in',  label: 'In stock' },
  { value: 'all', label: 'Including inactive' },
];

function readState() {
  const q = new URLSearchParams(location.search);
  return {
    search: q.get('q') || '',
    category: q.get('category') || '',
    brand: q.get('brand') || '',
    location: q.get('location') || '',
    filter: FILTERS.some((f) => f.value === q.get('filter')) ? q.get('filter') : '',
    sort: SORTS.some((s) => s.value === q.get('sort')) ? q.get('sort') : 'name.asc',
    page: Math.max(0, Number(q.get('page') || 0)),
  };
}

function writeState(state, { replace = false } = {}) {
  const q = new URLSearchParams();
  for (const [key, short] of [['search', 'q'], ['category', 'category'], ['brand', 'brand'],
                              ['location', 'location'], ['filter', 'filter'], ['sort', 'sort']]) {
    if (state[key] && !(key === 'sort' && state.sort === 'name.asc')) q.set(short, state[key]);
  }
  if (state.page) q.set('page', String(state.page));
  const url = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

export function queryFor(state, { pageSize = PAGE_SIZE } = {}) {
  const params = {
    select:
      'id,sku,name,product_image,is_active,units_per_carton,cost_price,low_stock_threshold,' +
      'quantity,reserved_quantity,available_quantity,stock_status,locations,warehouse_location,' +
      'brand_name,category_name,brand_id,category_id,inventory_value',
    order: state.sort,
    limit: pageSize,
  };
  if (state.filter !== 'all') params.is_active = 'eq.true';
  if (state.filter === 'low') params.stock_status = 'eq.low_stock';
  if (state.filter === 'out') params.stock_status = 'eq.out_of_stock';
  if (state.filter === 'in') params.stock_status = 'eq.in_stock';
  if (state.category) params.category_id = `eq.${state.category}`;
  if (state.brand) params.brand_id = `eq.${state.brand}`;
  // locations is a text[] on the view, so this is a containment test rather
  // than an equality one — a product can sit in more than one place.
  if (state.location) params.locations = `cs.{"${state.location}"}`;

  const term = state.search.trim().replace(/[(),*]/g, ' ').trim();
  if (term) params.or = `(name.ilike.*${term}*,sku.ilike.*${term}*)`;
  return params;
}

export default async function inventory({ me, root }) {
  let state = readState();
  let refs;

  mount(root, loading('Loading inventory…'));
  try {
    refs = {
      categories: await categories(),
      brands: await brands(),
      locations: await locations(),
    };
  } catch (err) {
    mount(root, errorState(err, () => inventory({ me, root })));
    return;
  }

  const searchBox = input({ type: 'search', placeholder: 'Search name or SKU…',
    value: state.search, class: 'toolbar__search', 'aria-label': 'Search inventory' });
  const categoryBox = selectEl([{ value: '', label: 'All categories' },
    ...refs.categories.map((c) => ({ value: c.id, label: c.name, selected: c.id === state.category }))],
    { 'aria-label': 'Category' });
  const brandBox = selectEl([{ value: '', label: 'All brands' },
    ...refs.brands.map((b) => ({ value: b.id, label: b.name, selected: b.id === state.brand }))],
    { 'aria-label': 'Brand' });
  const locationBox = selectEl([{ value: '', label: 'All locations' },
    ...refs.locations.map((l) => ({ value: l.name, label: l.name, selected: l.name === state.location }))],
    { 'aria-label': 'Location' });
  const filterBox = selectEl(FILTERS.map((f) => ({ ...f, selected: f.value === state.filter })),
    { 'aria-label': 'Stock filter' });
  const sortBox = selectEl(SORTS.map((s) => ({ ...s, selected: s.value === state.sort })),
    { 'aria-label': 'Sort' });

  const results = el('div#results', {}, [loading()]);

  const heading = el('div.row', {}, [
    el('p.small.muted#count'),
    el('span.spacer'),
    can('exportData', me.role)
      ? el('button.btn.btn--ghost.btn--sm', { type: 'button', id: 'export' }, ['Export CSV'])
      : null,
    can('moveStock', me.role)
      ? el('a.btn.btn--ghost.btn--sm', { href: '/admin/inventory/stock-out/' }, ['Stock out'])
      : null,
    can('moveStock', me.role)
      ? el('a.btn.btn--primary.btn--sm', { href: '/admin/inventory/stock-in/' }, ['Stock in'])
      : null,
  ]);

  mount(root, el('div.stack', {}, [
    heading,
    el('div.card', {}, [
      el('div.toolbar', {}, [
        searchBox,
        el('div.toolbar__filters', {}, [categoryBox, brandBox, locationBox, filterBox, sortBox]),
      ]),
      results,
    ]),
  ]));

  const columns = [
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
    { label: 'Reserved', numeric: true, narrow: true, cell: (r) => integer(r.reserved_quantity) },
    { label: 'Available', numeric: true, cell: (r) => el('span.table__main', {
        text: integer(r.available_quantity) }) },
    { label: 'Cartons', numeric: true, narrow: true, cell: (r) => {
        const c = cartons(r.quantity, r.units_per_carton);
        return c.hasCartons ? c.text : '—';
      } },
    { label: 'Status', cell: (r) => el('div.row', {}, [
        stockBadge(r.stock_status),
        r.is_active ? null : badge('Inactive', 'info'),
      ]) },
    { label: 'Location', narrow: true, cell: (r) =>
        [(r.locations || []).filter(Boolean).join(', '), r.warehouse_location]
          .filter(Boolean).join(' · ') || '—' },
    { label: 'Value', numeric: true, narrow: true, cell: (r) => money(r.inventory_value) },
  ];

  let inFlight;
  async function load() {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    mount(results, loading());
    try {
      const { rows, total } = await select('product_stock', {
        params: queryFor(state),
        range: { from: state.page * PAGE_SIZE, to: state.page * PAGE_SIZE + PAGE_SIZE - 1 },
        signal: controller.signal,
      });

      $('#count').textContent = total === null
        ? `${rows.length} products`
        : `${integer(total)} product${total === 1 ? '' : 's'}`;

      if (!rows.length && state.page > 0 && total) {
        state.page = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
        writeState(state, { replace: true });
        return load();
      }

      mount(results, [
        table(columns, rows, {
          caption: 'Inventory',
          empty: empty('Nothing matches', 'Try a different search, or clear the filters.'),
        }),
        rows.length
          ? pagination({ page: state.page, pageSize: PAGE_SIZE, total,
              onPage: (p) => { state.page = p; writeState(state); load(); window.scrollTo(0, 0); } })
          : null,
      ]);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      mount(results, errorState(err, load));
    }
  }

  const change = (patch) => {
    state = { ...state, ...patch, page: 0 };
    writeState(state);
    load();
  };
  searchBox.addEventListener('input', debounce(() => change({ search: searchBox.value }), 250));
  categoryBox.addEventListener('change', () => change({ category: categoryBox.value }));
  brandBox.addEventListener('change', () => change({ brand: brandBox.value }));
  locationBox.addEventListener('change', () => change({ location: locationBox.value }));
  filterBox.addEventListener('change', () => change({ filter: filterBox.value }));
  sortBox.addEventListener('change', () => change({ sort: sortBox.value }));

  window.addEventListener('popstate', () => {
    state = readState();
    searchBox.value = state.search;
    categoryBox.value = state.category;
    brandBox.value = state.brand;
    locationBox.value = state.location;
    filterBox.value = state.filter;
    sortBox.value = state.sort;
    load();
  });

  $('#export')?.addEventListener('click', async () => {
    const { exportInventory } = await import('./export.js');
    await exportInventory(queryFor(state, { pageSize: 1000 }));
  });

  await load();
}
