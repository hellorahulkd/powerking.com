#!/usr/bin/env node
/**
 * ============================================================================
 *  POWERKING NEPAL — BULK PRODUCT IMPORT
 * ============================================================================
 *  Turns a spreadsheet into data/products.json, so a catalogue of hundreds
 *  of lines can be maintained in Excel or Google Sheets instead of by editing
 *  JavaScript objects by hand.
 *
 *      1. Keep your catalogue in data/products.csv
 *         (File → Download → Comma-separated values, in Google Sheets)
 *      2. node scripts/import-products.js
 *      3. node build.js
 *
 *  Nothing is written unless every row passes validation, so a bad export
 *  cannot half-overwrite a good catalogue. Run with --dry-run to check a
 *  spreadsheet without touching anything.
 *
 *  Columns: only `name` and `category` are required. Everything else is
 *  optional and is filled in sensibly — see COLUMNS below. Column order does
 *  not matter and unknown columns are ignored, so you can keep your own
 *  working columns (supplier, cost, notes) in the same sheet.
 * ============================================================================
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories } from '../src/data/categories.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// resolve, not join: an absolute path passed on the command line must win.
const CSV = path.resolve(ROOT, process.argv.find((a) => a.endsWith('.csv')) || 'data/products.csv');
const OUT = path.join(ROOT, 'data/products.json');
const DRY = process.argv.includes('--dry-run');

/** Paths outside the project read better absolute than as a pile of "../". */
const show = (p) => {
  const rel = path.relative(ROOT, p);
  return rel.startsWith('..') ? p : rel;
};

/** Recognised columns and how a missing value is filled in. */
const COLUMNS = {
  id: 'auto — row order, if blank',
  name: 'REQUIRED',
  slug: 'auto — from name, if blank',
  brand: "''",
  category: 'REQUIRED — must match data/categories.json',
  description: "''",
  image: 'auto — /images/products/<slug>.jpg, if blank',
  gallery: 'empty — separate several paths with |',
  packsize: "''",
  unit: "''",
  sku: "''",
  featured: 'false — yes/true/1 to set',
  available: 'true — no/false/0 to clear',
  sample: 'false — yes/true/1 to set',
  tags: 'empty — separate several with |',
};

/* --------------------------------------------------------------- parsing -- */

/**
 * RFC 4180 CSV: quoted fields may contain commas, newlines and "" escapes.
 * Spreadsheet exports rely on all three, so this cannot be a split(',').
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  // Strip a UTF-8 BOM — Excel writes one and it would corrupt the first header.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // Drop trailing blank lines, and rows that are entirely empty cells.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const slugify = (s) =>
  String(s).toLowerCase().trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Spreadsheets have no booleans; people type yes/no/true/false/1/0/x. */
function bool(value, fallback) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '') return fallback;
  if (['yes', 'y', 'true', '1', 'x', '✓'].includes(v)) return true;
  if (['no', 'n', 'false', '0', '-'].includes(v)) return false;
  return null; // caller reports it
}

const list = (value) =>
  String(value ?? '')
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter(Boolean);

/* ------------------------------------------------------------- rendering -- */

/** JS string literal, single-quoted, safe for anything a spreadsheet holds. */
/**
 * The catalogue is written as JSON so that the admin panel at /admin/ and this
 * importer are reading and writing the same file in the same shape. Field
 * order is fixed rather than whatever the spreadsheet happened to use, so a
 * re-import produces a clean diff instead of a reshuffle.
 */
function render(products) {
  const ordered = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    category: p.category,
    description: p.description,
    image: p.image,
    gallery: p.gallery,
    packSize: p.packSize,
    unit: p.unit,
    sku: p.sku,
    featured: p.featured,
    available: p.available,
    sample: p.sample,
    tags: p.tags,
  }));
  return JSON.stringify(ordered, null, 2) + '\n';
}

/* ----------------------------------------------------------------- main -- */

if (!existsSync(CSV)) {
  console.error(`\n  No spreadsheet at ${show(CSV)}\n`);
  console.error('  Export your catalogue as CSV and save it there. Columns:\n');
  for (const [col, note] of Object.entries(COLUMNS)) {
    console.error(`      ${col.padEnd(12)} ${note}`);
  }
  console.error('\n  data/products.example.csv shows the format.\n');
  process.exit(1);
}

const rows = parseCsv(await readFile(CSV, 'utf8'));
if (rows.length < 2) {
  console.error(`\n  ${show(CSV)} has a header but no product rows.\n`);
  process.exit(1);
}

const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
const known = new Set(Object.keys(COLUMNS));
const index = {};
header.forEach((h, i) => { if (known.has(h)) index[h] = i; });

const errors = [];
const warnings = [];
for (const required of ['name', 'category']) {
  if (!(required in index)) errors.push(`missing required column "${required}"`);
}

const categoryNames = new Set(categories.map((c) => c.name));
// Match categories case-insensitively — a spreadsheet will not keep the case.
const categoryByLower = new Map(categories.map((c) => [c.name.toLowerCase(), c.name]));

const products = [];
const seenIds = new Map();
const seenSlugs = new Map();

if (!errors.length) {
  rows.slice(1).forEach((row, n) => {
    const line = n + 2; // 1-based, and the header is line 1
    const cell = (col) => (index[col] === undefined ? '' : (row[index[col]] ?? '').trim());
    const at = (msg) => errors.push(`row ${line}: ${msg}`);

    const name = cell('name');
    if (!name) { at('no product name'); return; }

    const rawCategory = cell('category');
    const category = categoryByLower.get(rawCategory.toLowerCase());
    if (!category) {
      at(`category "${rawCategory}" is not in data/categories.json `
        + `(known: ${[...categoryNames].join(', ')})`);
      return;
    }

    const slug = slugify(cell('slug') || name);
    if (!slug) { at(`"${name}" produces an empty slug — give it a slug column value`); return; }
    if (categories.some((c) => c.slug === slug)) {
      at(`slug "${slug}" collides with the ${category} category page URL`);
    }
    if (seenSlugs.has(slug)) at(`slug "${slug}" already used on row ${seenSlugs.get(slug)}`);
    seenSlugs.set(slug, line);

    const rawId = cell('id');
    const id = rawId ? Number(rawId) : n + 1;
    if (!Number.isFinite(id)) { at(`id "${rawId}" is not a number`); return; }
    if (seenIds.has(id)) at(`id ${id} already used on row ${seenIds.get(id)}`);
    seenIds.set(id, line);

    const flags = {};
    for (const [field, fallback] of [['featured', false], ['available', true], ['sample', false]]) {
      const v = bool(cell(field), fallback);
      if (v === null) { at(`${field} "${cell(field)}" — use yes or no`); flags[field] = fallback; }
      else flags[field] = v;
    }

    const image = cell('image') || `/images/products/${slug}.jpg`;
    if (!image.startsWith('/')) at(`image "${image}" must start with "/"`);
    else if (!existsSync(path.join(ROOT, 'public', image))) {
      warnings.push(`row ${line}: no image at public${image} — the card shows a fallback`);
    }

    const description = cell('description');
    if (!description) warnings.push(`row ${line}: "${name}" has no description`);

    products.push({
      id, name, slug,
      brand: cell('brand'),
      category,
      description,
      image,
      gallery: list(cell('gallery')),
      packSize: cell('packsize'),
      unit: cell('unit'),
      sku: cell('sku'),
      ...flags,
      tags: list(cell('tags')),
    });
  });
}

console.log(`\n  Reading ${show(CSV)}\n`);

if (errors.length) {
  console.error(`  ✗ ${errors.length} problem${errors.length === 1 ? '' : 's'} — nothing was written:\n`);
  errors.slice(0, 40).forEach((e) => console.error(`      ${e}`));
  if (errors.length > 40) console.error(`      … and ${errors.length - 40} more`);
  console.error('');
  process.exit(1);
}

for (const w of warnings.slice(0, 20)) console.log(`  ! ${w}`);
if (warnings.length > 20) console.log(`  ! … and ${warnings.length - 20} more warnings`);
if (warnings.length) console.log('');

const featured = products.filter((p) => p.featured).length;
if (featured === 0) {
  console.log('  ! No product is marked featured — the homepage carousel falls back to the first few.\n');
}

if (DRY) {
  console.log(`  ✓ ${products.length} products parsed cleanly. Nothing written (--dry-run).\n`);
  process.exit(0);
}

await writeFile(OUT, render(products), 'utf8');

const counts = {};
for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;
console.log(`  ✓ wrote ${products.length} products to data/products.json`);
console.log(`      ${Object.entries(counts).map(([c, n]) => `${c} ${n}`).join(' · ')}`);
console.log(`      ${featured} featured · ${products.filter((p) => !p.available).length} unavailable\n`);
console.log('  Next: node build.js\n');
