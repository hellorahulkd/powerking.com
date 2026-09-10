/**
 * ============================================================================
 *  IMPORT PRODUCTS FROM A SPREADSHEET — /admin/products/import/
 * ============================================================================
 *  Three steps, in this order and not another: read the file, show what would
 *  happen, then do it.
 *
 *  ── WHY THE PREVIEW IS NOT OPTIONAL ──────────────────────────────────────
 *  A spreadsheet of two hundred products is somebody's afternoon. Importing
 *  it and reporting afterwards that row 147 had a duplicate SKU leaves them
 *  with 146 products in the system, no idea which, and a file they cannot
 *  simply run again. So nothing is written until the whole file has been
 *  checked, and the check is shown row by row.
 *
 *  ── AND WHY IT IS ALL OR NOTHING ─────────────────────────────────────────
 *  import_products() is one transaction. One bad row raises, and every row
 *  before it rolls back with it. There is no state where half a spreadsheet
 *  has been imported — requirement 23, made structural rather than promised.
 *
 *  The dry run is the same function with p_dry_run, which does the entire
 *  import against real constraints and then deliberately fails so nothing is
 *  kept. That is what makes the preview trustworthy: it is not a second
 *  implementation of the rules that might disagree with the first.
 * ============================================================================
 */

import {
  el, mount, table, badge, errorState, loading, empty, checkbox,
  toast, toastError, submitting, confirmDialog, $, $$,
} from '../ui.js';
import { money, integer, slugify, toCsv, downloadCsv, parseCsv } from '../format.js';
import { can } from '../session.js';
import { categories, brands, invalidate } from '../data.js';
import { select, insert, rpc, AppError } from '../client.js';

/* ------------------------------------------------------------ csv parse -- */

/** Column headings this understands, in the spellings people actually use. */
const COLUMNS = {
  sku: ['sku', 'code', 'product code', 'item code'],
  name: ['product name', 'name', 'product', 'title'],
  brand: ['brand', 'make'],
  category: ['category', 'type'],
  description: ['description', 'details', 'notes'],
  units_per_carton: ['units per carton', 'units/carton', 'pcs per carton', 'carton qty', 'pack size'],
  cost_price: ['cost price', 'cost', 'purchase price'],
  wholesale_price: ['wholesale price', 'wholesale', 'trade price'],
  carton_price: ['carton price', 'price per carton'],
  retail_price: ['retail price', 'retail', 'mrp'],
  minimum_order_quantity: ['minimum order quantity', 'moq', 'min order'],
  low_stock_threshold: ['low stock threshold', 'reorder level', 'low stock'],
  opening_stock: ['opening stock', 'stock', 'quantity', 'qty'],
};

function mapHeaders(header) {
  const normalised = header.map((h) => String(h).trim().toLowerCase().replace(/\s+/g, ' '));
  const map = {};
  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const index = normalised.findIndex((h) => aliases.includes(h));
    if (index > -1) map[field] = index;
  }
  return map;
}

/* ------------------------------------------------------------ validate --- */

const numberOrNull = (raw) => {
  const text = String(raw ?? '').trim().replace(/[, ]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Check every row against everything knowable without writing.
 *
 * The database checks all of this again — this exists so that two hundred
 * problems are reported at once, next to the rows that caused them, rather
 * than one per attempt.
 */
function validateRows(rows, { categoriesByName, brandsByName, existingSkus, createMissing }) {
  const seenSku = new Map();
  const seenSlug = new Map();

  return rows.map((row, i) => {
    const problems = [];
    const warnings = [];
    const lineNumber = i + 2;   // +1 for the header, +1 because people count from 1

    const sku = String(row.sku ?? '').trim();
    const name = String(row.name ?? '').trim();

    if (!sku) problems.push('No SKU');
    if (!name) problems.push('No product name');

    if (sku) {
      const key = sku.toLowerCase();
      if (seenSku.has(key)) problems.push(`SKU repeats row ${seenSku.get(key)}`);
      else seenSku.set(key, lineNumber);
      if (existingSkus.has(key)) problems.push('SKU already exists in the system');
    }

    const slug = slugify(name);
    if (name && !slug) problems.push('Name has no letters or numbers to make a web address from');
    if (slug) {
      if (seenSlug.has(slug)) problems.push(`Web address clashes with row ${seenSlug.get(slug)}`);
      else seenSlug.set(slug, lineNumber);
    }

    const categoryName = String(row.category ?? '').trim();
    let categoryId = null;
    if (!categoryName) problems.push('No category');
    else {
      categoryId = categoriesByName.get(categoryName.toLowerCase()) || null;
      if (!categoryId) {
        if (createMissing) warnings.push(`Category "${categoryName}" will be created`);
        else problems.push(`Unknown category "${categoryName}"`);
      }
    }

    const brandName = String(row.brand ?? '').trim();
    let brandId = null;
    if (brandName) {
      brandId = brandsByName.get(brandName.toLowerCase()) || null;
      if (!brandId) {
        if (createMissing) warnings.push(`Brand "${brandName}" will be created`);
        else problems.push(`Unknown brand "${brandName}"`);
      }
    }

    const numbers = {};
    for (const [field, label] of [
      ['cost_price', 'Cost price'], ['wholesale_price', 'Wholesale price'],
      ['carton_price', 'Carton price'], ['retail_price', 'Retail price'],
    ]) {
      const value = numberOrNull(row[field]);
      if (Number.isNaN(value)) problems.push(`${label} is not a number`);
      else if (value !== null && value < 0) problems.push(`${label} cannot be negative`);
      else numbers[field] = value;
    }

    for (const [field, label, min, fallback] of [
      ['units_per_carton', 'Units per carton', 1, 1],
      ['minimum_order_quantity', 'Minimum order', 1, 1],
      ['low_stock_threshold', 'Low-stock level', 0, 10],
      ['opening_stock', 'Opening stock', 0, 0],
    ]) {
      const value = numberOrNull(row[field]);
      if (Number.isNaN(value)) problems.push(`${label} is not a number`);
      else if (value === null) numbers[field] = fallback;
      else if (!Number.isInteger(value)) problems.push(`${label} must be a whole number`);
      else if (value < min) problems.push(`${label} cannot be below ${min}`);
      else numbers[field] = value;
    }

    return {
      lineNumber,
      raw: row,
      problems,
      warnings,
      value: {
        sku, name, slug,
        description: String(row.description ?? '').trim(),
        categoryName, brandName, categoryId, brandId,
        ...numbers,
      },
    };
  });
}

/* -------------------------------------------------------------- render --- */

const TEMPLATE_COLUMNS = [
  'SKU', 'Product Name', 'Brand', 'Category', 'Description', 'Units Per Carton',
  'Cost Price', 'Wholesale Price', 'Carton Price', 'Retail Price',
  'Minimum Order Quantity', 'Low Stock Threshold', 'Opening Stock',
];

function templateCsv() {
  return toCsv(
    TEMPLATE_COLUMNS.map((label) => ({ label, value: (r) => r[label] ?? '' })),
    [{
      SKU: 'PK-EXAMPLE-1',
      'Product Name': 'Example 40W Bluetooth Speaker',
      Brand: 'Kisonli',
      Category: 'Speakers',
      Description: 'What the box actually says.',
      'Units Per Carton': 20,
      'Cost Price': 400,
      'Wholesale Price': 550,
      'Carton Price': 9800,
      'Retail Price': 750,
      'Minimum Order Quantity': 1,
      'Low Stock Threshold': 10,
      'Opening Stock': 0,
    }],
  );
}

export default async function productImport({ me, root }) {
  if (!can('importProducts', me.role)) {
    mount(root, errorState({
      message: 'Importing products is available to managers and admins.',
    }));
    return;
  }

  mount(root, loading('Preparing…'));

  let refs;
  try {
    refs = { categories: await categories(), brands: await brands() };
  } catch (err) {
    mount(root, errorState(err, () => productImport({ me, root })));
    return;
  }

  const fileInput = el('input.f__input', { type: 'file', accept: '.csv,text/csv' });
  const createMissingBox = checkbox(
    'Create categories and brands that do not exist yet',
    { checked: false },
  );
  const previewSlot = el('div#preview');
  let checked = null;

  mount(root, el('div.stack', {}, [
    el('div.card', {}, [
      el('h2.card__title', { text: 'Import a spreadsheet' }),
      el('p.f__hint', {
        text:
          'Save the sheet as CSV and choose it below. Nothing is written until you have ' +
          'seen exactly what would happen, and if any row is wrong the whole file is ' +
          'refused rather than half-imported.',
      }),
      el('div.f', {}, [
        el('span.f__label', { text: 'CSV file' }),
        fileInput,
        el('p.f__hint', {
          text: `Columns: ${TEMPLATE_COLUMNS.join(', ')}. Only SKU, Product Name and ` +
            'Category are required; the rest take sensible defaults.',
        }),
      ]),
      createMissingBox,
      el('div.row', {}, [
        el('button.btn.btn--ghost.btn--sm', {
          type: 'button',
          onclick: () => downloadCsv('powerking-import-template.csv', templateCsv()),
        }, ['Download a template']),
        el('a.btn.btn--ghost.btn--sm', { href: '/admin/products/' }, ['Back to products']),
      ]),
    ]),
    previewSlot,
  ]));

  /* --------------------------------------------------------- read file -- */

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('That file is larger than 5 MB. Split it into smaller batches.', { type: 'error' });
      return;
    }
    mount(previewSlot, loading('Reading and checking the file…'));

    try {
      const grid = parseCsv(await file.text());
      if (grid.length < 2) {
        mount(previewSlot, el('div.card', {}, [
          empty('Nothing to import',
            'The file needs a header row and at least one product below it.'),
        ]));
        return;
      }

      const map = mapHeaders(grid[0]);
      const missing = ['sku', 'name', 'category'].filter((f) => map[f] === undefined);
      if (missing.length) {
        mount(previewSlot, el('div.card', {}, [
          errorState({
            message:
              `The file has no ${missing.join(', ')} column. The header row read: ` +
              `${grid[0].join(' | ')}. Download the template to see the expected headings.`,
          }),
        ]));
        return;
      }

      const rows = grid.slice(1).map((cells) => {
        const row = {};
        for (const [field, index] of Object.entries(map)) row[field] = cells[index];
        return row;
      });

      // Which of these SKUs already exist. Asked in one query per 200 rather
      // than one per row, and only for the codes actually in the file.
      const skus = [...new Set(rows.map((r) => String(r.sku ?? '').trim().toLowerCase())
        .filter(Boolean))];
      const existingSkus = new Set();
      for (let i = 0; i < skus.length; i += 200) {
        const batch = skus.slice(i, i + 200);
        const { rows: found } = await select('products', {
          params: {
            select: 'sku',
            // Quoted, because a SKU may contain a comma or a bracket and
            // either would end the in() list early.
            or: `(${batch.map((s) => `sku.ilike.${s.replace(/[(),*]/g, '')}`).join(',')})`,
            limit: 1000,
          },
        });
        for (const p of found) existingSkus.add(p.sku.toLowerCase());
      }

      checked = validateRows(rows, {
        categoriesByName: new Map(refs.categories.map((c) => [c.name.toLowerCase(), c.id])),
        brandsByName: new Map(refs.brands.map((b) => [b.name.toLowerCase(), b.id])),
        existingSkus,
        createMissing: createMissingBox.querySelector('input').checked,
      });

      drawPreview();
    } catch (err) {
      mount(previewSlot, errorState(err));
    }
  });

  // Re-checking on the toggle, because whether an unknown category is a
  // problem or a plan depends entirely on it.
  createMissingBox.querySelector('input').addEventListener('change', () => {
    if (fileInput.files?.[0]) fileInput.dispatchEvent(new Event('change'));
  });

  /* ---------------------------------------------------------- preview -- */

  function drawPreview() {
    const bad = checked.filter((r) => r.problems.length);
    const good = checked.filter((r) => !r.problems.length);
    const willCreate = new Set();
    for (const row of good) {
      if (row.value.categoryName && !row.value.categoryId) {
        willCreate.add(`category:${row.value.categoryName}`);
      }
      if (row.value.brandName && !row.value.brandId) willCreate.add(`brand:${row.value.brandName}`);
    }

    mount(previewSlot, el('div.card', {}, [
      el('div.card__head', {}, [
        el('h2.card__title', { text: 'What would happen' }),
      ]),
      el('div.grid.grid--kpi', {}, [
        el('div.kpi', {}, [
          el('span.kpi__label', { text: 'Rows read' }),
          el('span.kpi__value', { text: integer(checked.length) }),
        ]),
        el(`div.kpi${good.length ? '' : '.kpi--warn'}`, {}, [
          el('span.kpi__label', { text: 'Ready to import' }),
          el('span.kpi__value', { text: integer(good.length) }),
        ]),
        el(`div.kpi${bad.length ? '.kpi--bad' : ''}`, {}, [
          el('span.kpi__label', { text: 'With problems' }),
          el('span.kpi__value', { text: integer(bad.length) }),
        ]),
        el('div.kpi', {}, [
          el('span.kpi__label', { text: 'Opening stock' }),
          el('span.kpi__value', {
            text: integer(good.reduce((n, r) => n + (r.value.opening_stock || 0), 0)),
          }),
          el('span.kpi__note', { text: 'units, recorded as stock-in' }),
        ]),
      ]),

      bad.length
        ? el('p.f__error', {
            text:
              `${bad.length} row${bad.length === 1 ? '' : 's'} would be refused, so nothing ` +
              'will be imported until they are fixed. The whole file goes in together or ' +
              'not at all.',
          })
        : null,

      willCreate.size
        ? el('p.f__hint', {
            text: `Will also create: ${[...willCreate]
              .map((s) => s.replace(':', ' ')).join(', ')}.`,
          })
        : null,

      table(
        [
          { label: 'Row', numeric: true, cell: (r) => r.lineNumber },
          {
            label: 'Status',
            cell: (r) => (r.problems.length
              ? badge('Problem', 'bad')
              : r.warnings.length ? badge('New', 'warn') : badge('Ready', 'ok')),
          },
          { label: 'SKU', cell: (r) => r.value.sku || '—' },
          { label: 'Product', cell: (r) => r.value.name || '—' },
          { label: 'Category', narrow: true, cell: (r) => r.value.categoryName || '—' },
          { label: 'Brand', narrow: true, cell: (r) => r.value.brandName || '—' },
          { label: 'Per carton', numeric: true, narrow: true, cell: (r) => r.value.units_per_carton },
          { label: 'Cost', numeric: true, narrow: true,
            cell: (r) => (r.value.cost_price ? money(r.value.cost_price) : '—') },
          { label: 'Opening stock', numeric: true, narrow: true, cell: (r) => r.value.opening_stock },
          {
            label: 'Notes',
            cell: (r) => el('span', {
              class: r.problems.length ? 'neg' : 'muted',
              text: [...r.problems, ...r.warnings].join('; ') || 'Ready',
            }),
          },
        ],
        checked,
        { caption: 'Import preview' },
      ),

      el('div.form-actions', {}, [
        el('button.btn.btn--primary', {
          type: 'button', id: 'do-import', disabled: bad.length > 0 || good.length === 0,
        }, [bad.length ? 'Fix the problems first' : `Import ${good.length} products`]),
        el('button.btn.btn--ghost', {
          type: 'button',
          onclick: () => downloadCsv('powerking-import-check.csv', toCsv(
            [
              { label: 'Row', value: (r) => r.lineNumber },
              { label: 'SKU', value: (r) => r.value.sku },
              { label: 'Product Name', value: (r) => r.value.name },
              { label: 'Status', value: (r) => (r.problems.length ? 'Problem' : 'Ready') },
              { label: 'Notes', value: (r) => [...r.problems, ...r.warnings].join('; ') },
            ],
            checked,
          )),
        }, ['Download this check as CSV']),
      ]),
    ]));

    $('#do-import')?.addEventListener('click', () => runImport(good));
  }

  /* ----------------------------------------------------------- import -- */

  async function runImport(good) {
    const ok = await confirmDialog({
      title: `Import ${good.length} products?`,
      message:
        'They go in together or not at all. Any opening stock is recorded as a stock-in ' +
        'movement, so it appears in the history like every other change.',
      confirmLabel: 'Import',
    });
    if (!ok) return;

    await submitting($('#do-import'), async () => {
      try {
        // Create the missing categories and brands first, and re-read them,
        // so every row has a real id to point at. Done before the import
        // rather than inside it because a reference table is not something
        // to roll back — an extra brand nobody used is harmless, and having
        // it fail the import would be worse.
        const createMissing = createMissingBox.querySelector('input').checked;
        if (createMissing) {
          const newCategories = [...new Set(good
            .filter((r) => r.value.categoryName && !r.value.categoryId)
            .map((r) => r.value.categoryName))];
          const newBrands = [...new Set(good
            .filter((r) => r.value.brandName && !r.value.brandId)
            .map((r) => r.value.brandName))];

          for (const name of newCategories) {
            await insert('categories', { name, slug: slugify(name) });
          }
          for (const name of newBrands) {
            await insert('brands', { name, slug: slugify(name) });
          }
          if (newCategories.length || newBrands.length) {
            invalidate('categories');
            invalidate('brands');
            refs = { categories: await categories(), brands: await brands() };
            const catMap = new Map(refs.categories.map((c) => [c.name.toLowerCase(), c.id]));
            const brandMap = new Map(refs.brands.map((b) => [b.name.toLowerCase(), b.id]));
            for (const row of good) {
              row.value.categoryId ||= catMap.get(row.value.categoryName.toLowerCase()) || null;
              if (row.value.brandName) {
                row.value.brandId ||= brandMap.get(row.value.brandName.toLowerCase()) || null;
              }
            }
          }
        }

        const payload = good.map((r) => ({
          sku: r.value.sku,
          name: r.value.name,
          slug: r.value.slug,
          description: r.value.description,
          category_id: r.value.categoryId,
          brand_id: r.value.brandId,
          units_per_carton: r.value.units_per_carton,
          cost_price: r.value.cost_price ?? 0,
          wholesale_price: r.value.wholesale_price ?? 0,
          retail_price: r.value.retail_price ?? 0,
          carton_price: r.value.carton_price,
          minimum_order_quantity: r.value.minimum_order_quantity,
          low_stock_threshold: r.value.low_stock_threshold,
          opening_stock: r.value.opening_stock,
        }));

        // The same function, run twice: once proving the whole file against
        // real constraints and rolling itself back, then once for real. The
        // preview is therefore never a second implementation that might
        // disagree with the first.
        try {
          await rpc('import_products', { p_rows: payload, p_dry_run: true });
        } catch (err) {
          const appErr = err instanceof AppError ? err : null;
          if (appErr?.code !== 'DRY_RUN_OK') throw err;
        }

        const result = await rpc('import_products', { p_rows: payload, p_dry_run: false });
        toast(`${result.created} products imported.`);
        location.href = '/admin/products/?sort=created_at.desc';
      } catch (err) {
        const appErr = err instanceof AppError ? err : null;
        if (appErr?.code === 'IMPORT_FAILED') {
          // The database refused something the local check let through. Show
          // it against the rows, which is the only place it is actionable.
          let rows = [];
          try { rows = JSON.parse(appErr.message.replace(/^[^[]*/, '')); } catch { /* below */ }
          if (rows.length) {
            for (const problem of rows) {
              const row = checked.find((r) => r.value.sku === problem.sku);
              if (row) row.problems.push(problem.message.replace(/^PK_[A-Z_]+:\s*/, ''));
            }
            drawPreview();
            toast(
              `The database refused ${rows.length} row${rows.length === 1 ? '' : 's'}. ` +
              'Nothing was imported — see the notes on those rows.',
              { type: 'error' },
            );
            return;
          }
        }
        toastError(err);
      }
    });
  }
}
