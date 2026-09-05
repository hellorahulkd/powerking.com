/**
 * ============================================================================
 *  POWERKING NEPAL — PRODUCT CATALOGUE DATA
 * ============================================================================
 *
 *  The catalogue itself lives in data/products.json. This module only reads
 *  that file and hands it to the build, so there is exactly one place a
 *  product is written down and three ways to edit it:
 *
 *    • the admin panel at /admin/ — forms, photo upload, no code
 *    • a spreadsheet — node scripts/import-products.js (see below)
 *    • the JSON file directly, for anyone comfortable doing that
 *
 *  It is JSON rather than JavaScript because the admin panel has to read and
 *  rewrite it safely; a .js file can hold comments and expressions that no
 *  editor can round-trip without losing something.
 *
 *  ── HOW TO ADD A PRODUCT ──────────────────────────────────────────────────
 *  Open https://powerkingnepal.com/admin/, sign in and use the form. Saving
 *  commits to this repository and the site rebuilds within about a minute.
 *
 *  ── OR, FOR A LARGE CATALOGUE ─────────────────────────────────────────────
 *  Hundreds of lines are faster in a spreadsheet. Export it to data/products.csv
 *  and run:
 *
 *      node scripts/import-products.js && node build.js
 *
 *  That REPLACES data/products.json with the spreadsheet's contents. See
 *  data/products.example.csv for the format — one row per product, with the
 *  column names this file's field list uses.
 *
 *  ── FIELDS ────────────────────────────────────────────────────────────────
 *  id          number   Unique. Never reuse an id.
 *  name        string   Shown as the product H1 and in the WhatsApp message.
 *  slug        string   URL segment → /products/<slug>/  (lowercase, hyphens).
 *  brand       string   Brand name. Also searchable and filterable.
 *  category    string   MUST match a `name` in data/categories.json.
 *  description string   1–3 sentences. Used for the page and meta description.
 *  image       string   Path from the site root, e.g. '/images/products/x.jpg'.
 *  gallery     string[] Optional extra images. Omit or leave [] if none.
 *  packSize    string   e.g. '20 pcs per carton'. Use '' if not known.
 *  unit        string   Optional: how it is sold, e.g. 'Per carton'.
 *  sku         string   Optional internal code. Searchable. Use '' if none.
 *  featured    boolean  true → appears in the homepage Featured row (first 8).
 *  available   boolean  false → shown as "Currently unavailable", still listed.
 *  sample      boolean  true → shows a "SAMPLE" badge. Remove for real products.
 *  tags        string[] Optional extra search keywords.
 *
 *  ⚠️  PACK SIZE IS EMPTY ON EVERY REAL PRODUCT. No carton photographed so
 *      far states one, and it is the number a wholesale buyer asks for first.
 * ==========================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const PRODUCTS_JSON = path.join(ROOT, 'data/products.json');

export const products = JSON.parse(readFileSync(PRODUCTS_JSON, 'utf8'));

export default products;
