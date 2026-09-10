/**
 * ============================================================================
 *  SHARED QUERIES
 * ============================================================================
 *  The reads more than one screen needs, in one place, so that the shape of a
 *  query lives next to every other query rather than being retyped slightly
 *  differently on each page.
 *
 *  The small reference lists — categories, brands, locations — are cached for
 *  the life of the page. Every form needs the same three dropdowns and they
 *  change perhaps twice a year; fetching them once per page rather than once
 *  per widget is the difference between a form that appears and a form that
 *  assembles itself in front of you.
 * ============================================================================
 */

import { select, selectOne, rpc } from './client.js';

const cache = new Map();

function cached(key, loader) {
  if (!cache.has(key)) {
    // The promise is cached, not the value, so ten simultaneous callers make
    // one request rather than ten.
    cache.set(key, loader().catch((err) => {
      cache.delete(key);
      throw err;
    }));
  }
  return cache.get(key);
}

/** Forget the cached reference lists — after adding a category, say. */
export function invalidate(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

export const categories = () =>
  cached('categories', async () => {
    const { rows } = await select('categories', {
      params: { select: 'id,name,slug,description,image,is_active', order: 'name.asc' },
    });
    return rows;
  });

export const brands = () =>
  cached('brands', async () => {
    const { rows } = await select('brands', {
      params: { select: 'id,name,slug,logo,is_active', order: 'name.asc' },
    });
    return rows;
  });

export const locations = () =>
  cached('locations', async () => {
    const { rows } = await select('inventory_locations', {
      params: {
        select: 'id,name,address,description,is_default,is_active',
        is_active: 'eq.true',
        order: 'is_default.desc,name.asc',
      },
    });
    return rows;
  });

export const suppliers = () =>
  cached('suppliers', async () => {
    const { rows } = await select('suppliers', {
      params: { select: 'id,name,is_active', is_active: 'eq.true', order: 'name.asc' },
    });
    return rows;
  });

export const summary = () => rpc('dashboard_summary');

/**
 * Product search for the pickers on the stock screens.
 *
 * `or=(…)` is PostgREST's syntax for a disjunction; the two ILIKE patterns
 * are what make typing either a name or a SKU find the same product. The
 * trigram indexes on both columns are what stop that being a table scan.
 */
export async function searchProducts(term, { limit = 20, activeOnly = true } = {}) {
  const params = {
    select:
      'id,sku,name,product_image,units_per_carton,quantity,available_quantity,' +
      'low_stock_threshold,stock_status,is_active,category_name,brand_name,cost_price',
    order: 'name.asc',
    limit,
  };
  if (activeOnly) params.is_active = 'eq.true';
  const clean = String(term || '').trim();
  if (clean) {
    // Commas and parentheses would end the or() list early, so they are
    // stripped rather than escaped — no search term needs them.
    const safe = clean.replace(/[(),*]/g, ' ').trim();
    if (safe) params.or = `(name.ilike.*${safe}*,sku.ilike.*${safe}*)`;
  }
  const { rows } = await select('product_stock', { params });
  return rows;
}

export const productById = (id) =>
  selectOne('product_stock', { select: '*', id: `eq.${id}` });

export const productRow = (id) =>
  selectOne('products', { select: '*', id: `eq.${id}` });

/**
 * Recent movements, newest first.
 *
 * `page` asks for a counted page, so the caller gets a real total and its
 * pager can say "1–20 of 34" and disable Next on the last page. Without a
 * range PostgREST sends no Content-Range, the total is null, and a pager
 * showing one row still offers a Next that leads nowhere.
 */
export async function recentMovements({
  limit = 10, page = null, productId, params = {},
} = {}) {
  const query = {
    select:
      'id,created_at,movement_type,quantity,signed_quantity,quantity_after,reference_number,' +
      'customer_name,reason,notes,unit_cost,product_id,product_name,product_sku,' +
      'supplier_name,location_name,created_by_name',
    order: 'created_at.desc',
    limit,
    ...params,
  };
  if (productId) query.product_id = `eq.${productId}`;
  const range = page === null
    ? undefined
    : { from: page * limit, to: page * limit + limit - 1 };
  const { rows, total } = await select('stock_movement_log', { params: query, range });
  return { rows, total };
}
