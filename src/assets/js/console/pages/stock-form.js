/**
 * ============================================================================
 *  THE STOCK MOVEMENT FORM
 * ============================================================================
 *  Stock in, stock out and adjustments are one form with different labels,
 *  because they are one operation: name a product, name a quantity, say why,
 *  and record it. Building them separately would mean three chances to forget
 *  a confirmation, three ways to double-submit, and three places to fix the
 *  next thing found wrong with any of them.
 *
 *  ── WHAT THIS SCREEN DOES NOT DECIDE ─────────────────────────────────────
 *  Whether the movement is allowed. It shows the stock on hand and refuses an
 *  obviously impossible quantity so the person is not made to wait for the
 *  server to say no — but the answer that counts comes from
 *  record_stock_movement(), which locks the row, re-checks against the
 *  quantity as it is at that instant, and writes the inventory and the ledger
 *  together or not at all.
 *
 *  That distinction is not academic. Two people on two phones selling the
 *  last carton both read "1 in stock" here, and both would pass this check.
 *  Only one of them gets past the lock.
 * ============================================================================
 */

import {
  el, mount, field, input, textarea, select as selectEl, loading, errorState, empty,
  toast, toastError, setFieldError, clearFieldErrors, submitting, debounce, param, thumb, $,
} from '../ui.js';
import { integer, stockText, cartons, todayInput, money, priceOrDash } from '../format.js';
import { locations, suppliers, searchProducts, productById } from '../data.js';
import { rpc, AppError } from '../client.js';

/* -------------------------------------------------------- product picker -- */

/**
 * Search-and-choose, rather than a dropdown of ten thousand options.
 *
 * Once something is chosen the search box is replaced by the chosen product
 * and its current stock, because at the moment of typing a quantity the one
 * thing that matters is what is there now.
 */
function productPicker({ onChange, activeOnly = true }) {
  const search = input({
    type: 'search',
    placeholder: 'Search by name or SKU…',
    autocomplete: 'off',
    'aria-label': 'Find a product',
  });
  const results = el('div.picker-results', { hidden: true });
  const chosenBox = el('div', { hidden: true });
  let chosen = null;

  const clear = () => {
    chosen = null;
    chosenBox.hidden = true;
    chosenBox.replaceChildren();
    search.hidden = false;
    search.value = '';
    search.focus();
    onChange(null);
  };

  const choose = (product) => {
    chosen = product;
    results.hidden = true;
    results.replaceChildren();
    search.hidden = true;
    chosenBox.hidden = false;
    const packing = cartons(product.available_quantity, product.units_per_carton);
    chosenBox.replaceChildren(
      el('div.row', {}, [
        thumb(product.product_image, ''),
        el('div', {}, [
          el('span.table__main', { text: product.name }),
          el('span.table__sub', {
            text: `${product.sku} · ${integer(product.available_quantity)} available${
              packing.hasCartons ? ` — ${packing.text}` : ''}`,
          }),
        ]),
        el('span.spacer'),
        el('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: clear }, ['Change']),
      ]),
    );
    onChange(product);
  };

  const run = debounce(async () => {
    const term = search.value.trim();
    if (term.length < 2) {
      results.hidden = true;
      return;
    }
    try {
      const rows = await searchProducts(term, { limit: 12, activeOnly });
      results.hidden = false;
      if (!rows.length) {
        results.replaceChildren(el('p.f__hint', { text: 'Nothing matches that name or SKU.' }));
        return;
      }
      results.replaceChildren(...rows.map((r) =>
        el('button.picker-result', { type: 'button', onclick: () => choose(r) }, [
          thumb(r.product_image, ''),
          el('span', {}, [
            el('span.table__main', { text: r.name }),
            el('span.table__sub', { text: `${r.sku} · ${integer(r.available_quantity)} in stock` }),
          ]),
        ])));
    } catch (err) {
      results.hidden = false;
      results.replaceChildren(errorState(err));
    }
  }, 220);

  search.addEventListener('input', run);
  // Enter in a search box would otherwise submit the form with no product.
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
    if (e.key === 'Escape') { results.hidden = true; }
  });

  return {
    node: el('div.f', {}, [
      el('label.f__label', { for: search.id || (search.id = 'product-search') }, [
        'Product', el('span.f__req', { 'aria-hidden': 'true', text: ' *' }),
      ]),
      search, chosenBox, results,
      el('p.f__error', { hidden: true, role: 'alert' }),
    ]),
    get value() { return chosen; },
    control: search,
    async preselect(id) {
      if (!id) return;
      try {
        const product = await productById(id);
        if (product) choose(product);
      } catch { /* the search box is still there; not worth an error for */ }
    },
  };
}

/* ------------------------------------------------------------------ form -- */

/**
 * @param {object} o
 * @param {string} o.movementType   STOCK_IN | STOCK_OUT | ADJUSTMENT_IN | …
 * @param {string} o.title
 * @param {string} o.lead
 * @param {boolean} [o.supplier]    show the supplier field
 * @param {boolean} [o.customer]    show the customer field
 * @param {boolean} [o.unitCost]    show the unit cost field
 * @param {string[]} [o.reasons]    when present, a required reason dropdown
 * @param {boolean} [o.direction]   when present, an in/out choice (adjustments)
 * @param {string} o.submitLabel
 */
export async function stockForm({ me, root }, options) {
  mount(root, loading('Preparing the form…'));

  let refs;
  try {
    refs = {
      locations: await locations(),
      suppliers: options.supplier ? await suppliers() : [],
    };
  } catch (err) {
    mount(root, errorState(err, () => stockForm({ me, root }, options)));
    return;
  }

  const picker = productPicker({
    onChange: () => { updateEffect(); },
    // An inactive product can still take a return or a correction, but not a
    // sale or a delivery — the same rule record_stock_movement() enforces.
    activeOnly: !options.reasons,
  });

  const qty = input({ type: 'number', min: '1', step: '1', inputmode: 'numeric',
    placeholder: '0', enterkeyhint: 'done' });
  const reference = input({ placeholder: options.supplier ? 'INV-1045' : 'ORD-2291' });
  const customer = input({ placeholder: 'Ram Traders, Birgunj' });
  const unitCost = input({ type: 'number', min: '0', step: '0.01', placeholder: '400' });
  const notes = textarea({ rows: 3, placeholder: 'Anything worth knowing later.' });
  const when = input({ type: 'date', value: todayInput(), max: todayInput() });
  const locationBox = selectEl(
    refs.locations.map((l) => ({ value: l.id, label: l.name, selected: l.is_default })));
  const supplierBox = options.supplier
    ? selectEl([{ value: '', label: 'No supplier recorded' },
        ...refs.suppliers.map((s) => ({ value: s.id, label: s.name }))])
    : null;
  const reasonBox = options.reasons
    ? selectEl([{ value: '', label: 'Choose a reason…' },
        ...options.reasons.map((r) => ({ value: r, label: r }))])
    : null;
  const directionBox = options.direction
    ? selectEl([
        { value: 'ADJUSTMENT_OUT', label: 'Decrease — there is less than the system says' },
        { value: 'ADJUSTMENT_IN', label: 'Increase — there is more than the system says' },
      ])
    : null;

  // A running "before and after", so the consequence is visible before the
  // button is pressed rather than reported afterwards.
  const effect = el('p.f__hint#effect', { text: '' });

  function currentType() {
    return directionBox ? directionBox.value : options.movementType;
  }

  function updateEffect() {
    const product = picker.value;
    const n = Number.parseInt(qty.value, 10);
    if (!product || !Number.isFinite(n) || n <= 0) {
      effect.textContent = '';
      effect.className = 'f__hint';
      return;
    }
    const sign = ['STOCK_IN', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(currentType()) ? 1 : -1;
    const before = product.quantity;
    const after = before + sign * n;
    if (after < 0) {
      effect.className = 'f__error';
      effect.textContent =
        `Only ${integer(before)} in stock — this would leave ${integer(after)}, which is not possible.`;
      return;
    }
    effect.className = 'f__hint';
    const pack = cartons(after, product.units_per_carton);
    effect.textContent =
      `${integer(before)} → ${integer(after)}${pack.hasCartons ? ` (${pack.text})` : ''}`;
  }

  qty.addEventListener('input', updateEffect);
  directionBox?.addEventListener('change', updateEffect);

  const form = el('form.stack', { novalidate: true }, [
    el('div.card', {}, [
      el('p.f__hint', { text: options.lead }),
      picker.node,
      directionBox ? field('Direction', directionBox, { required: true }) : null,
      el('div.form-grid', {}, [
        field('Quantity', qty, { required: true, hint: 'Whole units, not cartons.' }),
        options.unitCost ? field('Unit cost (Rs.)', unitCost, {
          hint: 'What each piece cost on this delivery. Optional.',
        }) : null,
      ]),
      reasonBox ? field('Reason', reasonBox, {
        required: true,
        hint: 'Why the count is wrong. This is the whole point of an adjustment record.',
      }) : null,
      el('div.form-grid', {}, [
        supplierBox ? field('Supplier', supplierBox) : null,
        options.customer ? field('Customer', customer, { hint: 'Who it went to.' }) : null,
        field(options.supplier ? 'Invoice number' : 'Order reference', reference, {
          hint: 'Optional, but it is what makes a movement findable later.',
        }),
      ]),
      el('div.form-grid', {}, [
        field('Location', locationBox),
        field('Date', when, { hint: 'Defaults to today. Use the real date if recording it late.' }),
      ]),
      field('Notes', notes),
      effect,
      el('div.form-actions', {}, [
        el('button.btn.btn--primary', { type: 'submit', id: 'submit' }, [options.submitLabel]),
        el('a.btn.btn--ghost', { href: '/admin/inventory/' }, ['Cancel']),
      ]),
    ]),
    el('div#receipt'),
  ]);

  mount(root, form);
  await picker.preselect(param('product'));
  if (!picker.value) picker.control.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);

    const product = picker.value;
    const n = Number.parseInt(qty.value, 10);

    if (!product) {
      setFieldError(picker.control, 'Choose a product first.');
      picker.control.focus();
      return;
    }
    if (!Number.isFinite(n) || n <= 0) {
      setFieldError(qty, 'Enter how many units, as a whole number above zero.');
      qty.focus();
      return;
    }
    if (reasonBox && !reasonBox.value) {
      setFieldError(reasonBox, 'Choose a reason. An adjustment without one is not an audit record.');
      reasonBox.focus();
      return;
    }

    const type = currentType();
    const sign = ['STOCK_IN', 'ADJUSTMENT_IN', 'RETURN_IN'].includes(type) ? 1 : -1;
    if (sign < 0 && n > product.quantity) {
      setFieldError(qty,
        `Only ${integer(product.quantity)} in stock. You cannot remove ${integer(n)}.`);
      qty.focus();
      return;
    }

    await submitting($('#submit'), async () => {
      try {
        const movement = await rpc('record_stock_movement', {
          p_product_id: product.id,
          p_movement_type: type,
          p_quantity: n,
          p_location_id: locationBox.value || null,
          p_reference_number: reference.value.trim() || null,
          p_supplier_id: supplierBox?.value || null,
          p_customer_name: customer.value.trim() || null,
          p_unit_cost: unitCost.value.trim() === '' ? null : Number(unitCost.value),
          p_reason: reasonBox?.value || null,
          p_notes: notes.value.trim() || null,
          // A date with no time is recorded at midday rather than midnight,
          // so a movement backdated from a different timezone cannot land on
          // the day before.
          p_occurred_at: when.value ? new Date(`${when.value}T12:00:00`).toISOString() : null,
        });

        mount($('#receipt'), receipt(product, movement, sign, n));
        toast(`${product.name}: ${sign > 0 ? '+' : '−'}${integer(n)} recorded.`);

        // Cleared for the next one, because these screens are used in runs of
        // twenty when a delivery arrives. The product stays chosen only if it
        // plainly would not — a delivery is many products, one after another.
        qty.value = '';
        reference.value = '';
        customer.value = '';
        notes.value = '';
        effect.textContent = '';
        picker.control.focus();
        // The chosen product's cached stock is now stale; re-read it so the
        // "before" figure on the next entry is the real one.
        const fresh = await productById(product.id).catch(() => null);
        if (fresh) Object.assign(product, fresh);
      } catch (err) {
        const appErr = err instanceof AppError ? err : null;
        if (appErr && ['INSUFFICIENT_STOCK', 'RESERVED_STOCK', 'BAD_QUANTITY'].includes(appErr.code)) {
          setFieldError(qty, appErr.message);
          qty.focus();
          // Somebody else moved this stock between the page loading and the
          // button being pressed. Show the real figure rather than the one
          // this page has been carrying.
          const fresh = await productById(product.id).catch(() => null);
          if (fresh) { Object.assign(product, fresh); updateEffect(); }
          return;
        }
        if (appErr && appErr.code === 'FORBIDDEN') {
          setFieldError(qty, appErr.message);
          return;
        }
        toastError(err);
      }
    });
  });
}

/** What happened, in the terms the person was thinking in. */
function receipt(product, movement, sign, n) {
  const after = movement.quantity_after;
  const before = after - sign * n;
  return el('div.card', {}, [
    el('h2.card__title', { text: 'Recorded' }),
    el('p.big-number', {}, [
      `${integer(before)} → ${integer(after)}`,
      el('span.big-number__sub', {
        text: `${product.name} · ${sign > 0 ? '+' : '−'}${integer(n)} units${
          movement.reference_number ? ` · ${movement.reference_number}` : ''}`,
      }),
    ]),
    el('div.row', {}, [
      el('a.btn.btn--ghost.btn--sm', { href: `/admin/products/view/?id=${product.id}` },
        ['See the product and its history']),
    ]),
  ]);
}

export default stockForm;
