/**
 * ============================================================================
 *  ONE SUPPLIER — /admin/suppliers/view/?id=…
 * ============================================================================
 *  Their details, what has been bought from them, and what they supply.
 *
 *  "Products supplied" is derived from the stock-in history rather than kept
 *  as a list somebody has to maintain. A supplier supplies what they have
 *  actually delivered; a hand-kept list would be wrong within a month and
 *  nobody would know which parts.
 * ============================================================================
 */

import {
  el, mount, table, badge, empty, errorState, loading, param, setTitle,
} from '../ui.js';
import { money, integer, dateTime, MOVEMENT_LABELS } from '../format.js';
import { can } from '../session.js';
import { select, selectOne } from '../client.js';

function dl(pairs) {
  const nodes = [];
  for (const [term, value] of pairs) {
    nodes.push(el('dt', { text: term }));
    nodes.push(value instanceof Node ? el('dd', {}, [value]) : el('dd', { text: value || '—' }));
  }
  return el('dl.dl', {}, nodes);
}

export default async function supplierView({ me, root }) {
  const id = param('id');
  if (!can('manageSuppliers', me.role)) {
    mount(root, errorState({ message: 'Supplier records are available to managers and admins.' }));
    return;
  }
  if (!id) {
    mount(root, errorState({ message: 'No supplier was named in the address.' }));
    return;
  }

  mount(root, loading('Loading the supplier…'));

  let supplier;
  let purchases;
  try {
    supplier = await selectOne('suppliers', { select: '*', id: `eq.${id}` });
    if (!supplier) {
      mount(root, errorState({ message: 'That supplier does not exist.' }));
      return;
    }
    const { rows } = await select('stock_movement_log', {
      params: {
        select: 'id,created_at,movement_type,quantity,unit_cost,reference_number,notes,' +
          'product_id,product_name,product_sku,created_by_name',
        supplier_id: `eq.${id}`,
        order: 'created_at.desc',
        limit: 100,
      },
    });
    purchases = rows;
  } catch (err) {
    mount(root, errorState(err, () => supplierView({ me, root })));
    return;
  }

  setTitle(supplier.name);

  // Products supplied, and what has been spent, read off the deliveries.
  const byProduct = new Map();
  let totalUnits = 0;
  let totalSpend = 0;
  for (const row of purchases) {
    if (row.movement_type !== 'STOCK_IN') continue;
    totalUnits += row.quantity;
    if (row.unit_cost) totalSpend += row.unit_cost * row.quantity;
    const entry = byProduct.get(row.product_id) || {
      product_id: row.product_id, name: row.product_name, sku: row.product_sku,
      units: 0, deliveries: 0, last: row.created_at,
    };
    entry.units += row.quantity;
    entry.deliveries += 1;
    if (row.created_at > entry.last) entry.last = row.created_at;
    byProduct.set(row.product_id, entry);
  }
  const supplied = [...byProduct.values()].sort((a, b) => b.units - a.units);

  mount(root, el('div.stack', {}, [
    el('div.row', {}, [
      supplier.is_active ? badge('Active', 'ok') : badge('Inactive', 'info'),
      el('span.spacer'),
      el('a.btn.btn--ghost.btn--sm', { href: '/admin/suppliers/' }, ['All suppliers']),
      el('a.btn.btn--primary.btn--sm', { href: `/admin/inventory/stock-in/?supplier=${id}` },
        ['Record a delivery']),
    ]),

    el('div.grid.grid--2', {}, [
      el('div.card', {}, [
        el('h2.card__title', { text: 'Details' }),
        dl([
          ['Name', supplier.name],
          ['Contact', supplier.contact_person],
          ['Phone', supplier.phone
            ? el('a', { href: `tel:${supplier.phone.replace(/[^\d+]/g, '')}` }, [supplier.phone])
            : null],
          ['Email', supplier.email
            ? el('a', { href: `mailto:${supplier.email}` }, [supplier.email]) : null],
          ['Address', supplier.address],
          ['Added', dateTime(supplier.created_at)],
        ]),
        supplier.notes
          ? el('p.small.muted', { text: supplier.notes })
          : null,
      ]),
      el('div.card', {}, [
        el('h2.card__title', { text: 'Trading' }),
        el('p.big-number', {}, [
          integer(totalUnits),
          el('span.big-number__sub', {
            text: `units received across ${purchases.length} recorded movement${
              purchases.length === 1 ? '' : 's'}`,
          }),
        ]),
        dl([
          ['Distinct products', integer(supplied.length)],
          // Only counts deliveries where a unit cost was entered, and says so
          // — a total that silently ignored the rest would read as complete.
          ['Recorded spend', totalSpend ? money(totalSpend) : 'no unit costs entered'],
          ['Last delivery', purchases[0] ? dateTime(purchases[0].created_at) : '—'],
        ]),
      ]),
    ]),

    el('div.card', {}, [
      el('h2.card__title', { text: 'Products supplied' }),
      el('p.f__hint', { text: 'Taken from what has actually been delivered, not a list kept by hand.' }),
      table(
        [
          { label: 'Product', cell: (r) => el('a', { href: `/admin/products/view/?id=${r.product_id}` }, [
              el('span.table__main', { text: r.name }),
              el('span.table__sub', { text: r.sku }),
            ]) },
          { label: 'Units received', numeric: true, cell: (r) => integer(r.units) },
          { label: 'Deliveries', numeric: true, narrow: true, cell: (r) => integer(r.deliveries) },
          { label: 'Last', narrow: true, cell: (r) => dateTime(r.last) },
        ],
        supplied,
        { empty: empty('Nothing received yet',
            'Record a stock-in against this supplier and it will be listed here.') },
      ),
    ]),

    el('div.card', {}, [
      el('h2.card__title', { text: 'Recent stock-ins' }),
      table(
        [
          { label: 'Date', cell: (r) => dateTime(r.created_at) },
          { label: 'Product', cell: (r) => el('a', { href: `/admin/products/view/?id=${r.product_id}` }, [
              el('span.table__main', { text: r.product_name }),
              el('span.table__sub', { text: r.product_sku }),
            ]) },
          { label: 'Type', narrow: true, cell: (r) => MOVEMENT_LABELS[r.movement_type] },
          { label: 'Quantity', numeric: true, cell: (r) => integer(r.quantity) },
          { label: 'Unit cost', numeric: true, narrow: true,
            cell: (r) => (r.unit_cost ? money(r.unit_cost, { exact: true }) : '—') },
          { label: 'Invoice', narrow: true, cell: (r) => r.reference_number || '—' },
          { label: 'Recorded by', narrow: true, cell: (r) => r.created_by_name },
        ],
        purchases,
        { empty: empty('No deliveries recorded', 'Stock-ins naming this supplier will appear here.') },
      ),
    ]),
  ]));
}
