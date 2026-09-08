#!/usr/bin/env node
/**
 * ============================================================================
 *  GENERATE THE CATALOGUE MIGRATION — data/*.json  →  SQL
 * ============================================================================
 *  Turns the catalogue that is in this repository today into one SQL file that
 *  loads it into Supabase.
 *
 *      node scripts/seed-from-json.js
 *      → supabase/seed/0001_catalogue_from_json.sql
 *
 *  This is real business data, not demo data, and the generated file reflects
 *  that in three ways:
 *
 *    • Everything is ON CONFLICT DO NOTHING, keyed on the natural key (slug,
 *      lower(sku), category name). Running it twice adds nothing the second
 *      time and overwrites nothing that has been edited since the first.
 *    • Opening stock is zero for every product, and no stock movement is
 *      invented. Nobody has counted this stock yet; a made-up number in an
 *      audit ledger is worse than an empty one.
 *    • Cost prices are left at zero rather than guessed. They are the one
 *      figure the site has never held, and the inventory valuation is wrong
 *      until somebody enters them.
 *
 *  Demo data, if it is ever wanted, is a separate file — supabase/seed/
 *  demo-data.sql — so that the two can never be confused for one another.
 * ============================================================================
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'supabase/seed/0001_catalogue_from_json.sql');

/** Single-quote a value for SQL, or NULL. */
const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(n) : 'NULL';
};
const arr = (list) =>
  !list || !list.length ? `'{}'` : `ARRAY[${list.map((s) => q(s)).join(', ')}]::text[]`;

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * How many pieces are in a carton, read out of the free-text pack size the
 * catalogue has been using. "40 Pcs cartoon", "40Pcs Cartoon" and "40" all
 * mean forty. "Power Socket J08" means somebody typed in the wrong box, and
 * becomes 1 rather than a guess.
 */
function unitsPerCarton(packSize) {
  const m = String(packSize || '').match(/(\d{1,5})/);
  if (!m) return 1;
  const n = Number(m[1]);
  return n >= 1 && n <= 100000 ? n : 1;
}

/**
 * Brand names in the JSON are uneven — "PowerKing" and "Powerking" are the
 * same supplier typed twice, and a few hold a whole product name because the
 * carton showed no brand. Collapse the casing duplicates onto whichever
 * spelling is used most, and drop the placeholder entirely: a null brand is
 * an honest gap, and the site already renders one as [CONFIRM BRAND].
 */
function brandIndex(products) {
  const counts = new Map();
  for (const p of products) {
    const raw = String(p.brand || '').trim();
    if (!raw || raw === '[CONFIRM BRAND]') continue;
    const key = raw.toLowerCase();
    const bucket = counts.get(key) || new Map();
    bucket.set(raw, (bucket.get(raw) || 0) + 1);
    counts.set(key, bucket);
  }
  const canonical = new Map();
  for (const [key, bucket] of counts) {
    const best = [...bucket.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    canonical.set(key, best);
  }
  return canonical;
}

/**
 * A SKU has to be unique and five products have none at all, while three
 * share "LP". Anything missing or already taken is given a stable code
 * derived from the product slug, so re-running produces the same SKU rather
 * than a new one each time.
 */
function skuIndex(products) {
  const taken = new Set();
  const out = new Map();
  const claim = (code) => {
    let candidate = code;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) candidate = `${code}-${n++}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };
  // Give the products that already carry a distinct SKU first refusal on it.
  for (const p of products) {
    const sku = String(p.sku || '').trim();
    if (sku && !taken.has(sku.toLowerCase())) out.set(p.slug, claim(sku));
  }
  for (const p of products) {
    if (out.has(p.slug)) continue;
    const stem = String(p.sku || '').trim() || slugify(p.slug).replace(/-/g, '').slice(0, 12);
    out.set(p.slug, claim(`PK-${stem.toUpperCase()}`.slice(0, 40)));
  }
  return out;
}

async function main() {
  const products = JSON.parse(await readFile(path.join(ROOT, 'data/products.json'), 'utf8'));
  const categories = JSON.parse(await readFile(path.join(ROOT, 'data/categories.json'), 'utf8'));

  const brands = brandIndex(products);
  const skus = skuIndex(products);

  const lines = [];
  const w = (s = '') => lines.push(s);

  w('-- ==========================================================================');
  w('--  POWERKING NEPAL — CATALOGUE MIGRATION (generated)');
  w('-- ==========================================================================');
  w('--  Generated by scripts/seed-from-json.js from data/products.json and');
  w('--  data/categories.json. Do not edit by hand — regenerate it.');
  w('--');
  w('--  This is the real catalogue, not demo data. Every statement is');
  w('--  ON CONFLICT DO NOTHING keyed on a natural key, so running it a second');
  w('--  time changes nothing and cannot overwrite an edit made in /admin.');
  w('--');
  w('--  Opening stock is deliberately zero on every product and no stock');
  w('--  movement is created: the stock has not been counted yet, and inventing');
  w('--  a number would put a figure nobody measured into the audit trail.');
  w('--  Cost prices are zero for the same reason — they have never been');
  w('--  recorded, so the inventory valuation reads zero until they are entered.');
  w(`--  ${products.length} products · ${categories.length} categories · ${brands.size} brands`);
  w('-- ==========================================================================');
  w('');
  w('begin;');
  w('');
  w('-- ------------------------------------------------------- categories ----');
  for (const c of categories) {
    w(`insert into public.categories (name, slug, description) values (${q(c.name)}, ${q(c.slug)}, ${q(c.description || '')})`);
    w('  on conflict (slug) do nothing;');
  }
  w('');
  w('-- ----------------------------------------------------------- brands ----');
  for (const name of [...brands.values()].sort((a, b) => a.localeCompare(b))) {
    w(`insert into public.brands (name, slug) values (${q(name)}, ${q(slugify(name))})`);
    w('  on conflict (slug) do nothing;');
  }
  w('');
  w('-- --------------------------------------------------------- products ----');
  w('-- brand_id and category_id are looked up by slug rather than pasted in as');
  w('-- literals, so this file stays correct if the rows above already existed');
  w('-- with different generated ids.');
  w('');

  for (const p of products) {
    const brandRaw = String(p.brand || '').trim();
    const brandName = brandRaw && brandRaw !== '[CONFIRM BRAND]' ? brands.get(brandRaw.toLowerCase()) : null;
    const category = categories.find((c) => c.name === p.category);
    if (!category) {
      process.stderr.write(`  ! skipping "${p.name}" — unknown category "${p.category}"\n`);
      continue;
    }
    const upc = unitsPerCarton(p.packSize);
    w(`-- ${p.name}`);
    w('insert into public.products (');
    w('  sku, name, slug, description, brand_id, category_id, product_image,');
    w('  gallery_images, units_per_carton, cost_price, wholesale_price,');
    w('  retail_price, carton_price, minimum_order_quantity, low_stock_threshold,');
    w('  is_active, is_featured, tags');
    w(') select');
    w(`  ${q(skus.get(p.slug))}, ${q(p.name)}, ${q(p.slug)}, ${q(p.description || '')},`);
    w(`  ${brandName ? `(select id from public.brands where slug = ${q(slugify(brandName))})` : 'NULL'},`);
    w(`  (select id from public.categories where slug = ${q(category.slug)}),`);
    w(`  ${q(p.image || null)}, ${arr(p.gallery)}, ${upc},`);
    // cost_price stays 0 — see the header. wholesale_price is the loose-piece
    // trade rate the catalogue already publishes; carton_price is the carton
    // rate, kept separate because it is not a multiple of the piece rate.
    w(`  0, ${num(p.pricePiece) === 'NULL' ? '0' : num(p.pricePiece)}, 0, ${num(p.priceCarton)},`);
    w(`  1, 10, ${p.available === false ? 'false' : 'true'}, ${p.featured ? 'true' : 'false'}, ${arr(p.tags)}`);
    w('where not exists (');
    w(`  select 1 from public.products where slug = ${q(p.slug)} or lower(sku) = lower(${q(skus.get(p.slug))})`);
    w(');');
    w('');
  }

  w('-- ------------------------------------------------------- inventory ----');
  w('-- One stock row per product at the default location, all at zero. It has');
  w('-- to exist before the first stock-in so the inventory screens have');
  w('-- something to list; record_stock_movement() would create it anyway.');
  w('insert into public.inventory (product_id, location_id, quantity)');
  w('select p.id, l.id, 0');
  w('from public.products p');
  w('cross join (select id from public.inventory_locations where is_default limit 1) l');
  w('on conflict (product_id, location_id) do nothing;');
  w('');
  w('commit;');
  w('');

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, lines.join('\n'), 'utf8');

  const rel = path.relative(ROOT, OUT);
  process.stdout.write(
    `\n  ✓ ${rel}\n` +
      `      ${products.length} products · ${categories.length} categories · ${brands.size} brands\n` +
      `      ${lines.length} lines\n\n` +
      `  Apply it in the Supabase SQL editor, after the files in\n` +
      `  supabase/migrations/ have been run.\n\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
