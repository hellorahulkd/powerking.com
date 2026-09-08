/**
 * ============================================================================
 *  CSV EXPORT
 * ============================================================================
 *  Shared by the products list, the inventory list and the reports, so a
 *  column means the same thing whichever screen it was exported from.
 *
 *  Rows are fetched a page at a time and assembled in the browser. The obvious
 *  alternative — one request with no limit — is a request that gets slower
 *  every month until the day it times out on a phone, and the failure would
 *  arrive as a blank file rather than as an error.
 *
 *  Loaded on demand: an export is a button most people never press, and the
 *  code for it should not be in the critical path of every list screen.
 * ============================================================================
 */

import { select } from '../client.js';
import { toCsv, downloadCsv, money, MOVEMENT_LABELS, movementSign } from '../format.js';
import { toast, toastError } from '../ui.js';

const CHUNK = 500;
/** A hard ceiling, so a mistyped filter cannot try to assemble a million rows. */
const MAX_ROWS = 50000;

/** Fetch every row matching a query, in pages, with progress. */
async function fetchAll(view, params, onProgress) {
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { rows, total } = await select(view, {
      params: { ...params, limit: CHUNK },
      range: { from, to: from + CHUNK - 1 },
    });
    out.push(...rows);
    onProgress?.(out.length, total);
    if (rows.length < CHUNK) break;
    if (total !== null && out.length >= total) break;
  }
  return out;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Run an export with a progress toast, and say plainly if it fails. */
async function run(label, work) {
  const note = toast(`Preparing ${label}…`, { type: 'info', timeout: 0 });
  try {
    const count = await work((n) => {
      note.querySelector('.toast__text').textContent = `Preparing ${label} — ${n} rows…`;
    });
    note.remove();
    toast(`${count} rows exported.`);
  } catch (err) {
    note.remove();
    toastError(err);
  }
}

/* ------------------------------------------------------------- products -- */

export async function exportProducts(params) {
  await run('the product export', async (progress) => {
    const rows = await fetchAll('product_stock', params, progress);
    downloadCsv(
      `powerking-products-${stamp()}.csv`,
      toCsv(
        [
          { label: 'SKU', value: (r) => r.sku },
          { label: 'Product Name', value: (r) => r.name },
          { label: 'Brand', value: (r) => r.brand_name || '' },
          { label: 'Category', value: (r) => r.category_name },
          { label: 'Units Per Carton', value: (r) => r.units_per_carton },
          { label: 'Cost Price', value: (r) => r.cost_price },
          { label: 'Wholesale Price', value: (r) => r.wholesale_price },
          { label: 'Retail Price', value: (r) => r.retail_price },
          { label: 'Minimum Order Quantity', value: (r) => r.minimum_order_quantity },
          { label: 'Low Stock Threshold', value: (r) => r.low_stock_threshold },
          { label: 'Stock', value: (r) => r.quantity },
          { label: 'Available', value: (r) => r.available_quantity },
          { label: 'Status', value: (r) => (r.is_active ? 'Active' : 'Inactive') },
        ],
        rows,
      ),
    );
    return rows.length;
  });
}

/* ------------------------------------------------------------ inventory -- */

export async function exportInventory(params) {
  await run('the inventory export', async (progress) => {
    const rows = await fetchAll('product_stock', params, progress);
    downloadCsv(
      `powerking-inventory-${stamp()}.csv`,
      toCsv(
        [
          { label: 'SKU', value: (r) => r.sku },
          { label: 'Product', value: (r) => r.name },
          { label: 'Category', value: (r) => r.category_name },
          { label: 'Brand', value: (r) => r.brand_name || '' },
          { label: 'Location', value: (r) => (r.locations || []).join('; ') },
          { label: 'Stock', value: (r) => r.quantity },
          { label: 'Reserved', value: (r) => r.reserved_quantity },
          { label: 'Available', value: (r) => r.available_quantity },
          { label: 'Units Per Carton', value: (r) => r.units_per_carton },
          { label: 'Cartons', value: (r) =>
              (r.units_per_carton > 1 ? Math.floor(r.quantity / r.units_per_carton) : '') },
          { label: 'Loose Units', value: (r) =>
              (r.units_per_carton > 1 ? r.quantity % r.units_per_carton : r.quantity) },
          { label: 'Low Stock Threshold', value: (r) => r.low_stock_threshold },
          { label: 'Stock Status', value: (r) => r.stock_status.replace(/_/g, ' ') },
          { label: 'Cost Price', value: (r) => r.cost_price },
          { label: 'Inventory Value', value: (r) => r.inventory_value },
        ],
        rows,
      ),
    );
    return rows.length;
  });
}

/* ------------------------------------------------------------ movements -- */

export async function exportMovements(params) {
  await run('the stock movement export', async (progress) => {
    const rows = await fetchAll('stock_movement_log', params, progress);
    downloadCsv(
      `powerking-stock-movements-${stamp()}.csv`,
      toCsv(
        [
          { label: 'Date', value: (r) => new Date(r.created_at).toISOString() },
          { label: 'SKU', value: (r) => r.product_sku },
          { label: 'Product', value: (r) => r.product_name },
          { label: 'Type', value: (r) => MOVEMENT_LABELS[r.movement_type] || r.movement_type },
          // Signed, so a column of these sums to the net change rather than
          // needing the type column read alongside it.
          { label: 'Quantity', value: (r) => movementSign(r.movement_type) * r.quantity },
          { label: 'Stock After', value: (r) => r.quantity_after ?? '' },
          { label: 'Reference', value: (r) => r.reference_number || '' },
          { label: 'Supplier', value: (r) => r.supplier_name || '' },
          { label: 'Customer', value: (r) => r.customer_name || '' },
          { label: 'Location', value: (r) => r.location_name || '' },
          { label: 'Unit Cost', value: (r) => r.unit_cost ?? '' },
          { label: 'Reason', value: (r) => r.reason || '' },
          { label: 'Notes', value: (r) => r.notes || '' },
          { label: 'User', value: (r) => r.created_by_name },
        ],
        rows,
      ),
    );
    return rows.length;
  });
}
