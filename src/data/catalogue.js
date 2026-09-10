/**
 * ============================================================================
 *  WHERE THE PUBLIC CATALOGUE COMES FROM
 * ============================================================================
 *  Supabase when it is configured and reachable; data/products.json when it
 *  is not. One function, so every consumer gets the same answer and none of
 *  them has to know which happened.
 *
 *  ── WHY THE PUBLIC SITE IS STILL PRE-RENDERED ────────────────────────────
 *  Because WhatsApp, Facebook and Messenger link crawlers do not run
 *  JavaScript, and most of this shop's traffic is a product link pasted into
 *  a chat. A real HTML file per product is the only way each one gets its own
 *  title, description and preview image. Fetching the catalogue in the
 *  browser instead would make every shared link preview identical and blank.
 *
 *  So Supabase is read once, at build time, and the result is baked into
 *  static files. The database is the single source of truth; the website is
 *  its published form. A product deactivated in /admin/ leaves the site on
 *  the next build, which the deploy workflow runs on every push and can run
 *  on a schedule.
 *
 *  ── WHY THE FALLBACK EXISTS ──────────────────────────────────────────────
 *  A build that cannot reach the database must not publish an empty shop. It
 *  is also what keeps this repository working for anyone who clones it before
 *  setting up Supabase, and what made it possible to build this system
 *  without breaking the site that was already live.
 *
 *  The anon key is used, exactly as a visitor's browser would. There is no
 *  privileged access here: the build can read what the public can read, which
 *  is why cost prices and quantities cannot leak into a built page even by
 *  mistake — catalogue_products has no such column to select.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { supabaseConfig } from '../config/supabase.config.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const PRODUCTS_JSON = path.join(ROOT, 'data/products.json');
export const CATEGORIES_JSON = path.join(ROOT, 'data/categories.json');

/** How long to wait for Supabase before falling back. */
const TIMEOUT_MS = Number(process.env.SUPABASE_TIMEOUT_MS || 15000);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/**
 * A product as the page templates expect it.
 *
 * The shape predates the database and is kept deliberately: it is what every
 * template, the search index and the enquiry list already speak, and changing
 * it would mean rewriting the public site to gain nothing a visitor can see.
 */
function toProduct(row) {
  const perCarton = Number(row.units_per_carton) || 1;
  const price = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : '';
  };
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    // A product with no brand shows the same visible placeholder the rest of
    // the site uses for a missing fact, rather than an empty gap that reads
    // as though somebody meant it.
    brand: row.brand || '[CONFIRM BRAND]',
    category: row.category,
    description: row.description || '',
    image: row.product_image || '',
    gallery: Array.isArray(row.gallery_images) ? row.gallery_images : [],
    packSize: perCarton > 1 ? `${perCarton} pcs per carton` : '',
    sku: row.sku || '',
    featured: Boolean(row.is_featured),
    // "Currently unavailable" is only said when the database says out of
    // stock. On the 'contact' setting nothing is claimed either way, which is
    // the point of that setting.
    available: row.stock_status !== 'out_of_stock',
    tags: Array.isArray(row.tags) ? row.tags : [],
    priceCarton: price(row.carton_price),
    pricePiece: price(row.wholesale_price),
    minimumOrder: Number(row.minimum_order_quantity) || 1,
    unitsPerCarton: perCarton,
    // 'in_stock' | 'low_stock' | 'out_of_stock' | 'contact'. A word, never a
    // number — the view has no quantity column to give one from.
    stockStatus: row.stock_status || 'contact',
  };
}

function toCategory(row) {
  return {
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    image: row.image || '',
  };
}

async function fetchJson(url, key, signal) {
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Read the catalogue.
 *
 * Never throws. A failure is reported in the returned `notes` and the JSON
 * files are used instead, because a site that cannot reach its database
 * should still be a site.
 *
 * @returns {Promise<{products: object[], categories: object[], source: 'supabase'|'json', notes: string[]}>}
 */
export async function loadCatalogue() {
  const notes = [];

  if (!supabaseConfig.configured) {
    return {
      products: readJson(PRODUCTS_JSON),
      categories: readJson(CATEGORIES_JSON),
      source: 'json',
      notes: ['Supabase is not configured, so the catalogue was read from data/*.json.'],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const base = `${supabaseConfig.url}/rest/v1`;
    const [productRows, categoryRows] = await Promise.all([
      // Ordered by name so the catalogue and the sitemap are stable between
      // builds; an unordered read would reshuffle pages on every deploy and
      // make every diff meaningless.
      fetchJson(`${base}/catalogue_products?select=*&order=name.asc`,
        supabaseConfig.anonKey, controller.signal),
      fetchJson(`${base}/catalogue_categories?select=*&order=name.asc`,
        supabaseConfig.anonKey, controller.signal),
    ]);

    if (!Array.isArray(productRows) || !Array.isArray(categoryRows)) {
      throw new Error('unexpected response shape');
    }
    // An empty database is almost always a project that has had the
    // migrations run and the catalogue not yet loaded. Publishing an empty
    // shop over a working one would be the worst possible reading of it.
    if (!productRows.length) {
      throw new Error('the catalogue is empty — has supabase/seed/ been applied?');
    }

    return {
      products: productRows.map(toProduct),
      categories: categoryRows.map(toCategory),
      source: 'supabase',
      notes: [],
    };
  } catch (err) {
    const reason = err?.name === 'AbortError'
      ? `no answer within ${TIMEOUT_MS}ms`
      : String(err.message || err);
    notes.push(
      `Could not read the catalogue from Supabase (${reason}).`,
      'Built from data/*.json instead — the site is complete but may be out of date.',
    );
    return {
      products: readJson(PRODUCTS_JSON),
      categories: readJson(CATEGORIES_JSON),
      source: 'json',
      notes,
    };
  } finally {
    clearTimeout(timer);
  }
}

export default loadCatalogue;
