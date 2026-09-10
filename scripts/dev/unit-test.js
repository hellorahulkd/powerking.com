#!/usr/bin/env node
/**
 * ============================================================================
 *  UNIT TESTS — the pure functions
 * ============================================================================
 *  Carton arithmetic, CSV escaping and CSV parsing have no DOM and no
 *  network, so they can be tested in milliseconds instead of by driving a
 *  browser. They are also the three places where being subtly wrong produces
 *  a plausible-looking answer rather than an error: a carton count off by one
 *  sends somebody to the warehouse for a box that is not there.
 *
 *      node --test scripts/dev/unit-test.js
 * ============================================================================
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cartons, stockText, csvCell, toCsv, parseCsv, slugify, money, priceOrDash,
} from '../../src/assets/js/console/format.js';

test('carton arithmetic', async (t) => {
  await t.test('the examples from the brief', () => {
    // 247 units at 20 per carton is 12 cartons and 7 loose.
    assert.deepEqual(
      { c: cartons(247, 20).cartons, l: cartons(247, 20).loose }, { c: 12, l: 7 });
    assert.equal(cartons(247, 20).text, '12 cartons + 7 units');
    // 250 at 20 is 12 and 10 — not 13, and not 12.5.
    assert.equal(cartons(250, 20).text, '12 cartons + 10 units');
  });

  await t.test('an exact number of cartons has no loose remainder', () => {
    assert.equal(cartons(240, 20).text, '12 cartons');
    assert.equal(cartons(20, 20).text, '1 carton');
  });

  await t.test('fewer units than one carton is all loose', () => {
    assert.equal(cartons(7, 20).text, '0 cartons + 7 units'.replace('0 cartons + ', ''));
    assert.equal(cartons(7, 20).cartons, 0);
  });

  await t.test('zero stock still reads as zero rather than as nothing', () => {
    assert.equal(cartons(0, 20).text, '0 units');
  });

  await t.test('a product not sold by the carton has no carton reading', () => {
    assert.equal(cartons(247, 1).hasCartons, false);
    assert.equal(cartons(247, 1).text, '');
    assert.equal(cartons(247, 0).hasCartons, false);
  });

  await t.test('nonsense inputs do not produce nonsense output', () => {
    assert.equal(cartons(-5, 20).loose, 0);
    assert.equal(cartons(null, 20).loose, 0);
    assert.equal(cartons('247', '20').text, '12 cartons + 7 units');
    // A fractional quantity cannot exist, and rounding one up would invent
    // stock. Truncation is the only safe direction.
    assert.equal(cartons(247.9, 20).loose, 7);
  });

  await t.test('stockText gives units first, cartons as the gloss', () => {
    assert.equal(stockText(247, 20), '247 units — 12 cartons + 7 units');
    assert.equal(stockText(247, 1), '247 units');
    assert.equal(stockText(1, 1), '1 unit');
  });
});

test('CSV writing', async (t) => {
  await t.test('quotes only what needs quoting', () => {
    assert.equal(csvCell('plain'), 'plain');
    assert.equal(csvCell('with, comma'), '"with, comma"');
    assert.equal(csvCell('with "quotes"'), '"with ""quotes"""');
    assert.equal(csvCell('two\nlines'), '"two\nlines"');
  });

  await t.test('neutralises formulas', () => {
    // A cell beginning =, +, - or @ is executed when the file is opened in
    // Excel or Sheets. An inventory export is exactly the sort of file that
    // gets opened without thinking, and product names come from suppliers.
    assert.equal(csvCell('=1+1'), "'=1+1");
    assert.equal(csvCell('+44 123'), "'+44 123");
    assert.equal(csvCell('-5'), "'-5");
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvCell('=cmd|\' /c calc\'!A0'), "'=cmd|' /c calc'!A0");
  });

  await t.test('empty and missing values are empty cells, not "null"', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
    assert.equal(csvCell(0), '0');
    assert.equal(csvCell(false), 'false');
  });

  await t.test('toCsv writes a BOM so Excel reads it as UTF-8', () => {
    const csv = toCsv([{ label: 'A', value: (r) => r.a }], [{ a: 'काठमाडौं' }]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /काठमाडौं/);
  });
});

test('CSV parsing', async (t) => {
  await t.test('splits plain rows', () => {
    assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  });

  await t.test('a comma inside a quoted field stays in the field', () => {
    assert.deepEqual(parseCsv('a,b\n"one, two",3'), [['a', 'b'], ['one, two', '3']]);
  });

  await t.test('doubled quotes are one quote', () => {
    assert.deepEqual(parseCsv('a\n"say ""hi"""'), [['a'], ['say "hi"']]);
  });

  await t.test('a newline inside a quoted field does not end the row', () => {
    assert.deepEqual(parseCsv('a,b\n"line\nbreak",2'), [['a', 'b'], ['line\nbreak', '2']]);
  });

  await t.test('CRLF from Windows is handled', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  });

  await t.test('a byte-order mark from Excel is stripped', () => {
    // Without this the first heading is "﻿SKU" and matches nothing.
    assert.deepEqual(parseCsv('﻿SKU,Name\nX,Y'), [['SKU', 'Name'], ['X', 'Y']]);
  });

  await t.test('blank lines are not products', () => {
    assert.deepEqual(parseCsv('a,b\n1,2\n\n,\n'), [['a', 'b'], ['1', '2']]);
  });
});

test('slugs', () => {
  assert.equal(slugify('Kisonli K21 40W Speaker'), 'kisonli-k21-40w-speaker');
  assert.equal(slugify('  Chargers & Adapters  '), 'chargers-adapters');
  assert.equal(slugify('---'), '');
  // The shape the products table's CHECK constraint enforces, so the form
  // cannot offer something the database will refuse.
  assert.match(slugify('A  B__C'), /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test('money', async (t) => {
  await t.test('groups the way Nepal writes it', () => {
    // Node has the ne-NP locale; where an engine does not, the list in
    // format.js falls through to en-IN, which groups identically.
    assert.equal(money(125000), 'Rs. 1,25,000');
    assert.equal(money(999), 'Rs. 999');
  });

  await t.test('a price nobody set is a gap, not Rs. 0', () => {
    assert.equal(priceOrDash(0), '—');
    assert.equal(priceOrDash(null), '—');
    assert.equal(priceOrDash(''), '—');
    assert.equal(priceOrDash(550), 'Rs. 550');
  });
});
