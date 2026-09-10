/**
 * ============================================================================
 *  ONE PRODUCT — /admin/products/view/?id=…
 * ============================================================================
 *  Everything known about a product, including the two things the public
 *  catalogue must never show: what it cost, and exactly how many there are.
 *
 *  The stock figure is given twice — as units, and as cartons plus loose
 *  units — because those are two different questions. "How many can I sell?"
 *  is answered in units; "how many boxes am I carrying down?" is answered in
 *  cartons, and getting the second one wrong by rounding sends somebody to the
 *  warehouse for a carton that is not there.
 * ============================================================================
 */

import {
  el, mount, table, badge, stockBadge, empty, errorState, loading, pagination,
  idParam, setTitle, thumb, confirmDialog, toast, toastError,
} from '../ui.js';
import {
  money, priceOrDash, integer, cartons, dateTime, relative,
  MOVEMENT_LABELS, movementSign,
} from '../format.js';
import { can } from '../session.js';
import { productById, recentMovements } from '../data.js';
import { update, remove, rpc } from '../client.js';

const HISTORY_PAGE = 20;

function dl(pairs) {
  const nodes = [];
  for (const [term, value, opts = {}] of pairs) {
    if (value === null || value === undefined) continue;
    nodes.push(el('dt', { text: term }));
    nodes.push(
      value instanceof Node
        ? el(`dd${opts.numeric ? '.is-numeric' : ''}`, {}, [value])
        : el(`dd${opts.numeric ? '.is-numeric' : ''}`, { text: String(value) }),
    );
  }
  return el('dl.dl', {}, nodes);
}

/* ------------------------------------------------------------- history ---- */

async function history(productId, page, onPage) {
  const { rows, total } = await recentMovements({
    productId,
    limit: HISTORY_PAGE,
    page,
  });

  const rendered = table(
    [
      { label: 'Date', cell: (r) => el('span', { title: dateTime(r.created_at), text: dateTime(r.created_at) }) },
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
      { label: 'Notes', narrow: true, cell: (r) => [r.reason, r.notes].filter(Boolean).join(' — ') || '—' },
    ],
    rows,
    {
      caption: 'Stock history',
      empty: empty('No movements yet',
        'Every stock-in, stock-out and adjustment for this product will be listed here.'),
    },
  );

  return el('div', {}, [
    rendered,
    // Only worth a pager when there is more than one page of history.
    rows.length && (page > 0 || (total ?? rows.length) > HISTORY_PAGE)
      ? pagination({ page, pageSize: HISTORY_PAGE, total, onPage })
      : null,
  ]);
}

/* -------------------------------------------------------------- actions --- */

async function setActive(product, active, reload) {
  if (!active) {
    const ok = await confirmDialog({
      title: `Deactivate ${product.name}?`,
      message:
        'It disappears from the public catalogue straight away. Nothing is lost — the ' +
        'stock, the history and the reports all stay, and it can be switched back on.',
      confirmLabel: 'Deactivate',
      danger: true,
    });
    if (!ok) return;
  }
  try {
    await update('products', { id: `eq.${product.id}` }, { is_active: active });
    toast(active ? 'Back in the public catalogue.' : 'No longer public.');
    reload();
  } catch (err) {
    toastError(err);
  }
}

/**
 * Permanent deletion, offered only when it is actually possible.
 *
 * The database refuses to delete a product any movement refers to — the
 * foreign key is ON DELETE RESTRICT — so this asks first whether it would be
 * allowed, and explains rather than offering a button that would fail.
 */
async function hardDelete(product) {
  let allowed = false;
  try {
    allowed = await rpc('product_can_be_deleted', { p_product_id: product.id });
  } catch {
    allowed = false;
  }
  if (!allowed) {
    toast(
      'This product has stock history, so it cannot be deleted — that history is what ' +
      'the reports are made of. Deactivate it instead.',
      { type: 'error' },
    );
    return;
  }
  const ok = await confirmDialog({
    title: `Delete ${product.name} for good?`,
    message: 'It has never held stock, so there is nothing to lose. This cannot be undone.',
    confirmLabel: 'Delete permanently',
    danger: true,
  });
  if (!ok) return;
  try {
    await remove('products', { id: `eq.${product.id}` });
    toast('Deleted.');
    location.href = '/admin/products/';
  } catch (err) {
    toastError(err);
  }
}

/* --------------------------------------------------------------- render --- */

export default async function productView({ me, root }) {
  const id = idParam();
  if (!id) {
    mount(root, errorState({ message: 'No product was named in the address.' }));
    return;
  }

  const reload = () => productView({ me, root });
  mount(root, loading('Loading the product…'));

  let p;
  try {
    p = await productById(id);
  } catch (err) {
    mount(root, errorState(err, reload));
    return;
  }
  if (!p) {
    mount(root, errorState({ message: 'That product does not exist. It may have been deleted.' }));
    return;
  }

  setTitle(p.name);

  const packing = cartons(p.quantity, p.units_per_carton);

  const header = el('div.row', {}, [
    el('div', {}, [
      el('div.row', {}, [
        stockBadge(p.stock_status),
        p.is_active ? badge('Active', 'ok') : badge('Inactive', 'info'),
        p.is_featured ? badge('Featured', 'warn') : null,
      ]),
    ]),
    el('span.spacer'),
    el('a.btn.btn--ghost.btn--sm', { href: `/${'products'}/${p.slug}/`, target: '_blank', rel: 'noopener' },
      ['View public page']),
    can('moveStock', me.role)
      ? el('a.btn.btn--ghost.btn--sm', { href: `/admin/inventory/stock-in/?product=${p.id}` }, ['Stock in'])
      : null,
    can('moveStock', me.role)
      ? el('a.btn.btn--ghost.btn--sm', { href: `/admin/inventory/stock-out/?product=${p.id}` }, ['Stock out'])
      : null,
    can('manageProducts', me.role)
      ? el('a.btn.btn--primary.btn--sm', { href: `/admin/products/edit/?id=${p.id}` }, ['Edit'])
      : null,
  ]);

  const identity = el('div.card', {}, [
    el('h2.card__title', { text: 'Product' }),
    p.product_image
      ? el('div.hero-figure', {}, [el('img', { src: p.product_image, alt: p.name, loading: 'lazy' })])
      : el('div.hero-figure', {}, [el('p.faint.small', { text: 'No photo yet' })]),
    dl([
      ['Name', p.name],
      ['SKU', p.sku],
      ['Brand', p.brand_name || '—'],
      ['Category', p.category_name],
      ['Web address', `/products/${p.slug}/`],
    ]),
    p.description ? el('p.small.muted', { text: p.description }) : null,
  ]);

  const pricing = el('div.card', {}, [
    el('h2.card__title', { text: 'Pricing' }),
    el('p.f__hint', { text: 'Cost price is internal and never leaves this system.' }),
    dl([
      ['Cost price', priceOrDash(p.cost_price), { numeric: true }],
      ['Wholesale (piece)', priceOrDash(p.wholesale_price), { numeric: true }],
      ['Carton price', priceOrDash(p.carton_price), { numeric: true }],
      ['Retail price', priceOrDash(p.retail_price), { numeric: true }],
      ['Minimum order', `${integer(p.minimum_order_quantity)} pcs`, { numeric: true }],
      ['Stock value at cost', money(p.inventory_value), { numeric: true }],
    ]),
  ]);

  const stock = el('div.card', {}, [
    el('h2.card__title', { text: 'Inventory' }),
    el('p.big-number', {}, [
      `${integer(p.available_quantity)} available`,
      // The carton reading, spelled out. 247 at 20 per carton is twelve
      // cartons and seven loose — never 12.35, never 13.
      packing.hasCartons
        ? el('span.big-number__sub', { text: cartons(p.available_quantity, p.units_per_carton).text })
        : null,
    ]),
    dl([
      ['In stock', integer(p.quantity), { numeric: true }],
      ['Reserved', integer(p.reserved_quantity), { numeric: true }],
      ['Available', integer(p.available_quantity), { numeric: true }],
      ['Units per carton', p.units_per_carton > 1 ? integer(p.units_per_carton) : 'sold loose', { numeric: true }],
      packing.hasCartons ? ['Full cartons', integer(packing.cartons), { numeric: true }] : null,
      packing.hasCartons ? ['Loose units', integer(packing.loose), { numeric: true }] : null,
      ['Low-stock level', integer(p.low_stock_threshold), { numeric: true }],
      ['Location', (p.locations || []).filter(Boolean).join(', ') || '—'],
      ['Shelf or rack', p.warehouse_location || '—'],
    ].filter(Boolean)),
  ]);

  const historySlot = el('div#history', {}, [loading()]);

  const danger = can('manageProducts', me.role)
    ? el('div.card', {}, [
        el('h2.card__title', { text: 'Availability' }),
        el('p.f__hint', {
          text:
            'A product that has ever moved stock is kept for good — the reports are made ' +
            'from that history. Deactivating hides it from customers without losing any of it.',
        }),
        el('div.row', {}, [
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onclick: () => setActive(p, !p.is_active, reload),
          }, [p.is_active ? 'Deactivate' : 'Reactivate']),
          can('deleteProducts', me.role)
            ? el('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => hardDelete(p) },
                ['Delete permanently'])
            : null,
        ]),
      ])
    : null;

  mount(root, el('div.stack', {}, [
    header,
    el('div.grid.grid--2', {}, [identity, el('div.stack', {}, [stock, pricing])]),
    el('div.card', {}, [
      el('div.card__head', {}, [
        el('h2.card__title', { text: 'Stock history' }),
        el('a.card__link', { href: `/admin/reports/?report=movements&product=${p.id}` }, ['In reports →']),
      ]),
      historySlot,
    ]),
    danger,
  ]));

  const loadHistory = (page = 0) => {
    mount(historySlot, loading());
    history(p.id, page, loadHistory)
      .then((node) => mount(historySlot, node))
      .catch((err) => mount(historySlot, errorState(err, () => loadHistory(page))));
  };
  loadHistory(0);
}
