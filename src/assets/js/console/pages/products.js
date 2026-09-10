/**
 * ============================================================================
 *  PRODUCTS — /admin/products/
 * ============================================================================
 *  The catalogue as the shop sees it, with the stock figure alongside.
 *
 *  Every filter, the sort and the paging happen in Postgres, not here. At the
 *  ten-thousand-product target the alternative is downloading the catalogue to
 *  filter it in a phone browser, which is slow at a hundred products and
 *  impossible at ten thousand.
 *
 *  The filter state lives in the query string, so a filtered view can be
 *  bookmarked, shared, or returned to with the browser's Back button after
 *  opening a product — which is what somebody working through a list of
 *  forty actually does.
 * ============================================================================
 */

import {
  el, mount, table, thumb, badge, stockBadge, empty, errorState, loading,
  pagination, input, select as selectEl, debounce, toast, toastError, confirmDialog, $,
} from '../ui.js';
import { money, priceOrDash, integer, stockText, slugify } from '../format.js';
import { can } from '../session.js';
import { categories, brands, invalidate } from '../data.js';
import { select, update, rpc, AppError } from '../client.js';

const PAGE_SIZE = 25;

const SORTS = [
  { value: 'name.asc',              label: 'Name A–Z' },
  { value: 'name.desc',             label: 'Name Z–A' },
  { value: 'created_at.desc',       label: 'Newest first' },
  { value: 'available_quantity.asc', label: 'Least stock first' },
  { value: 'available_quantity.desc', label: 'Most stock first' },
  { value: 'wholesale_price.desc',  label: 'Price high to low' },
  { value: 'wholesale_price.asc',   label: 'Price low to high' },
];

/** Read the whole filter state out of the URL. One source of truth. */
function readState() {
  const q = new URLSearchParams(location.search);
  return {
    search: q.get('q') || '',
    category: q.get('category') || '',
    brand: q.get('brand') || '',
    status: q.get('status') || 'active',
    sort: SORTS.some((s) => s.value === q.get('sort')) ? q.get('sort') : 'name.asc',
    page: Math.max(0, Number(q.get('page') || 0)),
  };
}

function writeState(state, { replace = false } = {}) {
  const q = new URLSearchParams();
  if (state.search) q.set('q', state.search);
  if (state.category) q.set('category', state.category);
  if (state.brand) q.set('brand', state.brand);
  if (state.status !== 'active') q.set('status', state.status);
  if (state.sort !== 'name.asc') q.set('sort', state.sort);
  if (state.page) q.set('page', String(state.page));
  const url = `${location.pathname}${q.toString() ? `?${q}` : ''}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

/** The filter state, as PostgREST query parameters. */
export function queryFor(state, { pageSize = PAGE_SIZE } = {}) {
  const params = {
    select:
      'id,sku,name,slug,product_image,is_active,units_per_carton,cost_price,' +
      'wholesale_price,retail_price,low_stock_threshold,quantity,reserved_quantity,' +
      'available_quantity,stock_status,brand_name,category_name,brand_id,category_id,' +
      'warehouse_location,inventory_value,created_at',
    order: state.sort,
    limit: pageSize,
  };
  if (state.category) params.category_id = `eq.${state.category}`;
  if (state.brand) params.brand_id = `eq.${state.brand}`;
  if (state.status === 'active') params.is_active = 'eq.true';
  if (state.status === 'inactive') params.is_active = 'eq.false';
  if (state.status === 'low') params.stock_status = 'eq.low_stock';
  if (state.status === 'out') params.stock_status = 'eq.out_of_stock';

  const term = state.search.trim().replace(/[(),*]/g, ' ').trim();
  if (term) {
    // Name or SKU. Both columns carry a trigram index, so a contains-match is
    // an index scan rather than a walk through the table.
    params.or = `(name.ilike.*${term}*,sku.ilike.*${term}*)`;
  }
  return params;
}

/* ---------------------------------------------------------------- actions -- */

async function deactivate(row, refresh) {
  const ok = await confirmDialog({
    title: `Deactivate ${row.name}?`,
    message:
      'It disappears from the public catalogue immediately. Its stock, its history ' +
      'and its reports are all kept, and you can switch it back on at any time.',
    confirmLabel: 'Deactivate',
    danger: true,
  });
  if (!ok) return;
  try {
    await update('products', { id: `eq.${row.id}` }, { is_active: false });
    toast(`${row.name} is no longer public.`);
    refresh();
  } catch (err) {
    toastError(err);
  }
}

async function reactivate(row, refresh) {
  try {
    await update('products', { id: `eq.${row.id}` }, { is_active: true });
    toast(`${row.name} is public again.`);
    refresh();
  } catch (err) {
    toastError(err);
  }
}

/**
 * Copy a product as the starting point for a new one.
 *
 * A wholesaler carries the same speaker in four colours, and the second, third
 * and fourth differ from the first by a word. What is deliberately NOT copied
 * is the SKU, the web address and the stock: those are the three things that
 * must be unique or true, and a duplicate that silently inherited them would
 * be a bug wearing a convenience's clothes.
 */
async function duplicate(row) {
  const suffix = ' (copy)';
  const name = `${row.name}${suffix}`;
  try {
    const created = await rpc('create_product', {
      p_product: {
        sku: `${row.sku}-COPY`,
        name,
        slug: slugify(name),
        description: row.description || '',
        brand_id: row.brand_id,
        category_id: row.category_id,
        product_image: row.product_image,
        units_per_carton: row.units_per_carton,
        cost_price: row.cost_price,
        wholesale_price: row.wholesale_price,
        retail_price: row.retail_price,
        minimum_order_quantity: row.minimum_order_quantity ?? 1,
        low_stock_threshold: row.low_stock_threshold,
        // A copy starts hidden. Publishing something nobody has checked, with
        // a SKU ending "-COPY", is not what anyone meant by "duplicate".
        is_active: false,
      },
      p_opening_stock: 0,
    });
    toast('Copied. Give it its own SKU and web address, then switch it on.');
    location.href = `/admin/products/edit/?id=${created.id}`;
  } catch (err) {
    if (err instanceof AppError && err.code === 'DUPLICATE_SKU') {
      toast('A copy of this product already exists — edit that one instead.', { type: 'error' });
      return;
    }
    toastError(err);
  }
}

/* ------------------------------------------------------------------ render -- */

function actions(row, role, refresh) {
  const links = [el('a.btn.btn--ghost.btn--sm', { href: `/admin/products/view/?id=${row.id}` }, ['View'])];
  if (can('manageProducts', role)) {
    links.push(el('a.btn.btn--ghost.btn--sm', { href: `/admin/products/edit/?id=${row.id}` }, ['Edit']));
    links.push(el('button.btn.btn--ghost.btn--sm', {
      type: 'button', onclick: () => duplicate(row),
    }, ['Duplicate']));
    links.push(
      row.is_active
        ? el('button.btn.btn--ghost.btn--sm', {
            type: 'button', onclick: () => deactivate(row, refresh),
          }, ['Deactivate'])
        : el('button.btn.btn--ghost.btn--sm', {
            type: 'button', onclick: () => reactivate(row, refresh),
          }, ['Reactivate']),
    );
  }
  return el('div.row.row--end', {}, links);
}

function columns(role, refresh) {
  return [
    {
      label: 'Product',
      cell: (r) => el('a.row', { href: `/admin/products/view/?id=${r.id}` }, [
        thumb(r.product_image, ''),
        el('span', {}, [
          el('span.table__main', { text: r.name }),
          el('span.table__sub', { text: r.sku }),
        ]),
      ]),
    },
    { label: 'Brand', narrow: true, cell: (r) => r.brand_name || '—' },
    { label: 'Category', narrow: true, cell: (r) => r.category_name },
    {
      label: 'Stock',
      numeric: true,
      cell: (r) => el('span', {}, [
        el('span.table__main', { text: integer(r.available_quantity) }),
        r.units_per_carton > 1
          ? el('span.table__sub', { text: `${Math.floor(r.quantity / r.units_per_carton)} ctn` })
          : null,
      ]),
    },
    { label: 'Wholesale', numeric: true, narrow: true, cell: (r) => priceOrDash(r.wholesale_price) },
    {
      label: 'Status',
      cell: (r) => el('div.row', {}, [
        stockBadge(r.stock_status),
        r.is_active ? null : badge('Inactive', 'info'),
      ]),
    },
    { label: 'Actions', cell: (r) => actions(r, role, refresh) },
  ];
}

export default async function products({ me, root }) {
  let state = readState();
  let refs;

  mount(root, loading('Loading products…'));
  try {
    refs = { categories: await categories(), brands: await brands() };
  } catch (err) {
    mount(root, errorState(err, () => products({ me, root })));
    return;
  }

  const searchBox = input({
    type: 'search',
    placeholder: 'Search name or SKU…',
    value: state.search,
    'aria-label': 'Search products',
    class: 'toolbar__search',
  });
  const categoryBox = selectEl(
    [{ value: '', label: 'All categories' },
     ...refs.categories.map((c) => ({ value: c.id, label: c.name, selected: c.id === state.category }))],
    { 'aria-label': 'Filter by category' },
  );
  const brandBox = selectEl(
    [{ value: '', label: 'All brands' },
     ...refs.brands.map((b) => ({ value: b.id, label: b.name, selected: b.id === state.brand }))],
    { 'aria-label': 'Filter by brand' },
  );
  const statusBox = selectEl([
    { value: 'active',   label: 'Active only' },
    { value: 'all',      label: 'Active and inactive' },
    { value: 'inactive', label: 'Inactive only' },
    { value: 'low',      label: 'Low stock' },
    { value: 'out',      label: 'Out of stock' },
  ].map((o) => ({ ...o, selected: o.value === state.status })), { 'aria-label': 'Filter by status' });
  const sortBox = selectEl(
    SORTS.map((s) => ({ ...s, selected: s.value === state.sort })),
    { 'aria-label': 'Sort' },
  );

  const results = el('div#results', {}, [loading()]);

  const toolbar = el('div.toolbar', {}, [
    searchBox,
    el('div.toolbar__filters', {}, [categoryBox, brandBox, statusBox, sortBox]),
  ]);

  const heading = el('div.row', {}, [
    el('p.small.muted#count', { text: '' }),
    el('span.spacer'),
    can('exportData', me.role)
      ? el('button.btn.btn--ghost.btn--sm', { type: 'button', id: 'export' }, ['Export CSV'])
      : null,
    can('importProducts', me.role)
      ? el('a.btn.btn--ghost.btn--sm', { href: '/admin/products/import/' }, ['Import CSV'])
      : null,
    can('manageProducts', me.role)
      ? el('a.btn.btn--primary.btn--sm', { href: '/admin/products/new/' }, ['Add product'])
      : null,
  ]);

  mount(root, el('div.stack', {}, [heading, el('div.card', {}, [toolbar, results])]));

  let inFlight;
  async function load() {
    // A search that types faster than the network answers would otherwise
    // paint an older result over a newer one.
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    mount(results, loading());
    try {
      const params = queryFor(state);
      const { rows, total } = await select('product_stock', {
        params,
        range: { from: state.page * PAGE_SIZE, to: state.page * PAGE_SIZE + PAGE_SIZE - 1 },
        signal: controller.signal,
      });

      $('#count').textContent = total === null
        ? `${rows.length} products`
        : `${integer(total)} product${total === 1 ? '' : 's'}`;

      // A page beyond the end — after narrowing a filter, say — is a blank
      // screen that looks broken. Step back to the last page that has rows.
      if (!rows.length && state.page > 0 && total) {
        state.page = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
        writeState(state, { replace: true });
        return load();
      }

      mount(results, [
        table(columns(me.role, load), rows, {
          caption: 'Products',
          empty: empty(
            state.search || state.category || state.brand || state.status !== 'active'
              ? 'Nothing matches those filters'
              : 'No products yet',
            state.search || state.category || state.brand || state.status !== 'active'
              ? 'Try a different search, or clear the filters.'
              : 'Add the first product, or import a spreadsheet.',
            can('manageProducts', me.role)
              ? el('a.btn.btn--primary.btn--sm', { href: '/admin/products/new/' }, ['Add product'])
              : null,
          ),
        }),
        // A single page of results needs no paging controls.
        rows.length && (state.page > 0 || (total ?? rows.length) > PAGE_SIZE)
          ? pagination({
              page: state.page,
              pageSize: PAGE_SIZE,
              total,
              onPage: (p) => { state.page = p; writeState(state); load(); window.scrollTo(0, 0); },
            })
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
  statusBox.addEventListener('change', () => change({ status: statusBox.value }));
  sortBox.addEventListener('change', () => change({ sort: sortBox.value }));

  // Back and forward have to work: the filters are in the URL, so the browser
  // already remembers them, and not honouring that would be a bug people feel.
  window.addEventListener('popstate', () => {
    state = readState();
    searchBox.value = state.search;
    categoryBox.value = state.category;
    brandBox.value = state.brand;
    statusBox.value = state.status;
    sortBox.value = state.sort;
    load();
  });

  $('#export')?.addEventListener('click', async () => {
    const { exportProducts } = await import('./export.js');
    await exportProducts(queryFor(state, { pageSize: 1000 }));
  });

  await load();
}
