/**
 * Formatting shared by every console screen. No DOM, no network — so the
 * carton arithmetic can be tested on its own, which it is, in
 * scripts/dev/console-test.js.
 */

/**
 * Rupees as Nepal writes them: Rs. 1,25,000 — lakh grouping, Latin digits.
 *
 * A list rather than one locale, and deliberately the same list as
 * src/config/site.config.js, because the public page formats prices in Node
 * at build time and this formats them in a browser at run time — and the two
 * must agree to the digit. ne-NP first for correctness; en-IN second because
 * several Chromium builds have no Nepali locale data and would otherwise fall
 * back to 125,000. India and Nepal group digits identically, so the fallback
 * is right rather than merely close.
 */
const LOCALES = ['ne-NP-u-nu-latn', 'en-IN', 'en'];

const rupees = new Intl.NumberFormat(LOCALES, { maximumFractionDigits: 0 });
const rupeesExact = new Intl.NumberFormat(LOCALES, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function money(value, { exact = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `Rs. ${(exact ? rupeesExact : rupees).format(n)}`;
}

/** A price that has never been set reads as a gap, not as "Rs. 0". */
export function priceOrDash(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return money(n);
}

export const integer = new Intl.NumberFormat(LOCALES).format;

/**
 * ── CARTON ARITHMETIC ─────────────────────────────────────────────────────
 * 247 units at 20 per carton is 12 cartons and 7 loose, not 12.35 cartons and
 * not 13. Integer division and remainder, so it cannot round the wrong way:
 * a buyer told "13 cartons" turns up expecting 260 units.
 *
 * A product with no carton size — units_per_carton of 1, which is the default
 * — has no carton reading at all, and saying "247 cartons + 0 units" would be
 * worse than saying nothing.
 */
export function cartons(quantity, unitsPerCarton) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const per = Math.trunc(Number(unitsPerCarton) || 0);
  if (per <= 1) return { cartons: 0, loose: qty, hasCartons: false, text: '' };
  const full = Math.floor(qty / per);
  const loose = qty % per;
  const parts = [];
  if (full) parts.push(`${integer(full)} carton${full === 1 ? '' : 's'}`);
  if (loose || !full) parts.push(`${integer(loose)} unit${loose === 1 ? '' : 's'}`);
  return { cartons: full, loose, hasCartons: true, text: parts.join(' + ') };
}

/** "247 units — 12 cartons + 7 units", or just "247 units". */
export function stockText(quantity, unitsPerCarton) {
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const c = cartons(qty, unitsPerCarton);
  const base = `${integer(qty)} unit${qty === 1 ? '' : 's'}`;
  return c.hasCartons && qty > 0 ? `${base} — ${c.text}` : base;
}

/* ---------------------------------------------------------------- dates -- */

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function date(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function dateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : timeFmt.format(d);
}

/** "3 minutes ago" for the activity feed, falling back to a date after a week. */
export function relative(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units = [
    ['minute', 60], ['hour', 3600], ['day', 86400],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [name, size] = units[i];
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      if (name === 'day' && n > 6) return date(value);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

/** Today, as the value an <input type="date"> expects. */
export function todayInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* --------------------------------------------------------------- labels -- */

export const MOVEMENT_LABELS = {
  STOCK_IN: 'Stock in',
  STOCK_OUT: 'Stock out',
  ADJUSTMENT_IN: 'Adjustment in',
  ADJUSTMENT_OUT: 'Adjustment out',
  RETURN_IN: 'Return in',
  RETURN_OUT: 'Return out',
};

export const STOCK_STATUS_LABELS = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  contact: 'Contact for availability',
};

/** +1 for the movement types that add stock, -1 for the ones that remove it. */
export function movementSign(type) {
  return ['STOCK_IN', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(type) ? 1 : -1;
}

export const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', staff: 'Staff' };

/* ------------------------------------------------------------------ url -- */

/**
 * A URL-safe slug. Matches the shape the products table enforces, so the
 * form cannot offer something the database will refuse.
 */
export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/, '');
}

/* ------------------------------------------------------------------ csv -- */

/**
 * One CSV cell. Quotes anything containing a delimiter, a quote or a newline,
 * and doubles embedded quotes, which is RFC 4180 and what Excel expects.
 *
 * The leading apostrophe guard is not decoration: a cell beginning =, +, - or
 * @ is executed as a formula when the file is opened in Excel or Sheets. A
 * product called "=cmd|..." in a supplier's spreadsheet is the whole of that
 * attack, and an inventory export is exactly the kind of file that gets
 * opened without thinking.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(columns, rows) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(',')).join('\n');
  // The BOM makes Excel read it as UTF-8; without it Nepali text and the
  // rupee sign arrive as mojibake.
  return `﻿${head}\n${body}\n`;
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in Safari before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
