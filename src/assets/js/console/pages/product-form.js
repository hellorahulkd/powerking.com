/**
 * ============================================================================
 *  ADD AND EDIT A PRODUCT — /admin/products/new/ and /admin/products/edit/
 * ============================================================================
 *  One form for both, because they are the same form: the only differences
 *  are what it is filled with, where it posts, and that a new product may
 *  carry an opening stock figure while an existing one may not — stock on a
 *  product that already exists is a movement, recorded on the stock screens,
 *  never a number quietly typed over the old one.
 *
 *  Validation is doubled on purpose. Everything checked here is checked again
 *  by a constraint or a function in Postgres; this copy exists so that a
 *  mistake is caught before a round trip and pointed at the field that caused
 *  it, not so that the database can trust it.
 * ============================================================================
 */

import {
  el, mount, field, input, textarea, select as selectEl, checkbox, loading, errorState,
  toast, toastError, setFieldError, clearFieldErrors, submitting, param, setTitle, $,
} from '../ui.js';
import { slugify } from '../format.js';
import { can } from '../session.js';
import { categories, brands, locations, invalidate, productRow, productById } from '../data.js';
import { rpc, update, insert, uploadImage, publicImageUrl, AppError } from '../client.js';

/* -------------------------------------------------------------- picker ---- */

/**
 * The photo. Chosen or dropped, previewed straight away from a local object
 * URL, and uploaded only when the form is saved — so abandoning a half-filled
 * form leaves nothing behind in storage.
 */
function imagePicker(existing) {
  const file = el('input.picker__file', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/avif',
  });
  const preview = el('img', { alt: '', hidden: !existing, ...(existing ? { src: existing } : {}) });
  const placeholder = el('span.picker__empty', {
    text: 'Click, or drop a photo here',
    hidden: Boolean(existing),
  });
  const drop = el('label.picker', {}, [preview, placeholder]);

  let chosen = null;
  let objectUrl = null;

  const show = (f) => {
    chosen = f;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    preview.src = objectUrl;
    preview.hidden = false;
    placeholder.hidden = true;
  };

  const accept = (f) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|avif)$/.test(f.type)) {
      toast('That file is not a JPEG, PNG, WebP or AVIF image.', { type: 'error' });
      return;
    }
    // The bucket refuses anything over 5 MB, so say so here rather than after
    // the upload has spent somebody's data allowance getting there.
    if (f.size > 5 * 1024 * 1024) {
      toast('That image is larger than 5 MB. Please use a smaller one.', { type: 'error' });
      return;
    }
    show(f);
  };

  drop.append(file);
  drop.addEventListener('click', () => file.click());
  file.addEventListener('change', () => accept(file.files[0]));
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, () => drop.classList.remove('is-over'));
  }
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    accept(e.dataTransfer?.files?.[0]);
  });

  return {
    node: el('div.f', {}, [
      el('span.f__label', { text: 'Photo' }),
      drop,
      el('p.f__hint', {
        text:
          'JPEG, PNG or WebP, up to 5 MB. Uploaded when you save, so nothing is left ' +
          'behind if you change your mind.',
      }),
    ]),
    /** Uploads if a new file was chosen; otherwise keeps what was there. */
    async resolve(sku) {
      if (!chosen) return existing || null;
      const ext = (chosen.name.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg').toLowerCase();
      // Named for the product and stamped, so replacing a photo does not have
      // to fight a CDN cache holding the old one under the same name.
      const name = `${slugify(sku) || 'product'}-${Date.now()}${ext}`;
      return uploadImage(chosen, name);
    },
    hasNew: () => Boolean(chosen),
  };
}

/* ---------------------------------------------------------- validation ---- */

const num = (v) => (String(v).trim() === '' ? null : Number(v));

function validate(values, { isNew }) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'A product needs a name.';
  if (!values.sku.trim()) errors.sku = 'A SKU is required, and must be unique.';
  if (!values.slug.trim()) errors.slug = 'A web address is required.';
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug)) {
    errors.slug = 'Lowercase letters, numbers and hyphens only.';
  }
  if (!values.category_id) errors.category_id = 'Choose a category.';

  for (const [key, label] of [
    ['cost_price', 'Cost price'],
    ['wholesale_price', 'Wholesale price'],
    ['retail_price', 'Retail price'],
    ['carton_price', 'Carton price'],
  ]) {
    const v = values[key];
    if (v === null) continue;
    if (!Number.isFinite(v)) errors[key] = `${label} must be a number.`;
    else if (v < 0) errors[key] = `${label} cannot be negative.`;
  }

  if (!Number.isInteger(values.units_per_carton) || values.units_per_carton < 1) {
    errors.units_per_carton = 'Units per carton must be a whole number of at least 1.';
  }
  if (!Number.isInteger(values.minimum_order_quantity) || values.minimum_order_quantity < 1) {
    errors.minimum_order_quantity = 'The minimum order must be at least 1.';
  }
  if (!Number.isInteger(values.low_stock_threshold) || values.low_stock_threshold < 0) {
    errors.low_stock_threshold = 'The low-stock level cannot be negative.';
  }
  if (isNew && (!Number.isInteger(values.opening_stock) || values.opening_stock < 0)) {
    errors.opening_stock = 'Opening stock cannot be negative.';
  }
  return errors;
}

/**
 * Map a database refusal back onto the field that caused it, so the message
 * appears under the box the person has to change rather than as a banner
 * they then have to interpret.
 *
 * These are AppError codes — the PK_ prefix the database raises is stripped
 * by toAppError, so DUPLICATE_SKU and not PK_DUPLICATE_SKU.
 */
const FIELD_FOR_CODE = {
  DUPLICATE_SKU: 'sku',
  DUPLICATE_SLUG: 'slug',
  DUPLICATE: 'sku',
  BAD_REFERENCE: 'category_id',
};

/* -------------------------------------------------------------- render ---- */

export default async function productForm({ me, root }) {
  const id = param('id');
  const isNew = !id;

  if (!can('manageProducts', me.role)) {
    mount(root, errorState({
      message: 'Only a manager or an admin can add or change products. You can still view them.',
    }));
    return;
  }

  mount(root, loading(isNew ? 'Preparing the form…' : 'Loading the product…'));

  let refs;
  let existing = null;
  try {
    const [cats, brandList, locs] = await Promise.all([categories(), brands(), locations()]);
    refs = { categories: cats, brands: brandList, locations: locs };
    if (!isNew) {
      existing = await productRow(id);
      if (!existing) {
        mount(root, errorState({ message: 'That product does not exist. It may have been deleted.' }));
        return;
      }
    }
  } catch (err) {
    mount(root, errorState(err, () => productForm({ me, root })));
    return;
  }

  setTitle(isNew ? 'Add product' : `Edit ${existing.name}`);

  const f = {
    name: input({ value: existing?.name || '', placeholder: 'Kisonli K21 40W Portable Speaker' }),
    sku: input({ value: existing?.sku || '', placeholder: 'PK-KIS-K21', spellcheck: 'false' }),
    slug: input({ value: existing?.slug || '', placeholder: 'kisonli-k21-40w-speaker', spellcheck: 'false' }),
    description: textarea({ rows: 5, value: existing?.description || '' }),
    brand_id: selectEl(
      [{ value: '', label: 'No brand' },
       ...refs.brands.map((b) => ({ value: b.id, label: b.name, selected: b.id === existing?.brand_id }))],
    ),
    category_id: selectEl(
      [{ value: '', label: 'Choose a category…' },
       ...refs.categories.filter((c) => c.is_active || c.id === existing?.category_id)
         .map((c) => ({ value: c.id, label: c.name, selected: c.id === existing?.category_id }))],
    ),
    units_per_carton: input({ type: 'number', min: '1', step: '1', value: existing?.units_per_carton ?? 1 }),
    cost_price: input({ type: 'number', min: '0', step: '0.01', value: existing?.cost_price ?? '' }),
    wholesale_price: input({ type: 'number', min: '0', step: '0.01', value: existing?.wholesale_price ?? '' }),
    carton_price: input({ type: 'number', min: '0', step: '0.01', value: existing?.carton_price ?? '' }),
    retail_price: input({ type: 'number', min: '0', step: '0.01', value: existing?.retail_price ?? '' }),
    minimum_order_quantity: input({ type: 'number', min: '1', step: '1', value: existing?.minimum_order_quantity ?? 1 }),
    low_stock_threshold: input({ type: 'number', min: '0', step: '1', value: existing?.low_stock_threshold ?? 10 }),
    opening_stock: input({ type: 'number', min: '0', step: '1', value: 0 }),
    warehouse_location: input({ value: '', placeholder: 'Rack B, shelf 3' }),
    location_id: selectEl(refs.locations.map((l) => ({ value: l.id, label: l.name, selected: l.is_default }))),
  };

  const activeBox = checkbox('Active — visible in the public catalogue', {
    checked: existing ? existing.is_active : true,
  });
  const featuredBox = checkbox('Featured on the home page', {
    checked: existing ? existing.is_featured : false,
  });

  const picker = imagePicker(existing?.product_image || null);

  // The web address follows the name until somebody edits it by hand. On an
  // existing product it does not follow at all: the old address is already in
  // WhatsApp messages and in Google, and changing it breaks every one.
  let slugTouched = !isNew;
  f.slug.addEventListener('input', () => { slugTouched = true; });
  f.name.addEventListener('input', () => {
    if (!slugTouched) f.slug.value = slugify(f.name.value);
  });

  const form = el('form.stack', { novalidate: true }, [
    el('div.card', {}, [
      el('h2.card__title', { text: 'What it is' }),
      field('Product name', f.name, { required: true, hint: 'As printed on the box.' }),
      el('div.form-grid', {}, [
        field('SKU', f.sku, { required: true, hint: 'Unique. Used on every stock record.' }),
        field('Web address', f.slug, {
          required: true,
          hint: isNew
            ? 'Filled in from the name. /products/…'
            : 'Changing this breaks links already shared for this product.',
        }),
      ]),
      el('div.form-grid', {}, [
        field('Category', f.category_id, { required: true }),
        field('Brand', f.brand_id, { hint: 'Leave as “No brand” if the carton shows none.' }),
      ]),
      field('Description', f.description, {
        hint: 'One to three sentences. Also used as the description Google shows.',
      }),
      picker.node,
    ]),

    el('div.card', {}, [
      el('h2.card__title', { text: 'Trade terms' }),
      el('p.f__hint', {
        text: 'Cost price is private — it is never sent to the public catalogue.',
      }),
      el('div.form-grid', {}, [
        field('Cost price (Rs.)', f.cost_price, { hint: 'What it cost you. Used for inventory value.' }),
        field('Wholesale price per piece (Rs.)', f.wholesale_price),
        field('Carton price (Rs.)', f.carton_price, { hint: 'The keener rate for a full carton.' }),
        field('Retail price (Rs.)', f.retail_price),
      ]),
      el('div.form-grid', {}, [
        field('Units per carton', f.units_per_carton, {
          required: true, hint: 'Used to show stock as cartons plus loose units.',
        }),
        field('Minimum order quantity', f.minimum_order_quantity, { required: true }),
        field('Low-stock level', f.low_stock_threshold, {
          required: true, hint: 'Below this it is flagged on the dashboard.',
        }),
      ]),
    ]),

    el('div.card', {}, [
      el('h2.card__title', { text: isNew ? 'Opening stock' : 'Stock' }),
      isNew
        ? el('div', {}, [
            el('p.f__hint', {
              text:
                'Optional. Anything above zero is recorded as a stock-in movement, so day ' +
                'one is in the history like every other change.',
            }),
            el('div.form-grid', {}, [
              field('Opening stock', f.opening_stock),
              field('Location', f.location_id),
              field('Shelf or rack', f.warehouse_location, { hint: 'Where in the warehouse.' }),
            ]),
          ])
        : el('p.f__hint', {
            text:
              'Stock is changed on the stock-in, stock-out and adjustment screens, never ' +
              'by typing over it here — that is what keeps the history complete.',
          }),
      el('div.stack', {}, [activeBox, featuredBox]),
      el('div.form-actions', {}, [
        el('button.btn.btn--primary', { type: 'submit', id: 'save' },
          [isNew ? 'Create product' : 'Save changes']),
        el('a.btn.btn--ghost', { href: isNew ? '/admin/products/' : `/admin/products/view/?id=${id}` },
          ['Cancel']),
        el('p.f__error#form-error', { hidden: true, role: 'alert' }),
      ]),
    ]),
  ]);

  mount(root, form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    $('#form-error').hidden = true;

    const values = {
      name: f.name.value.trim(),
      sku: f.sku.value.trim(),
      slug: f.slug.value.trim(),
      description: f.description.value.trim(),
      brand_id: f.brand_id.value || null,
      category_id: f.category_id.value || null,
      units_per_carton: Number.parseInt(f.units_per_carton.value, 10),
      cost_price: num(f.cost_price.value),
      wholesale_price: num(f.wholesale_price.value),
      carton_price: num(f.carton_price.value),
      retail_price: num(f.retail_price.value),
      minimum_order_quantity: Number.parseInt(f.minimum_order_quantity.value, 10),
      low_stock_threshold: Number.parseInt(f.low_stock_threshold.value, 10),
      opening_stock: isNew ? Number.parseInt(f.opening_stock.value || '0', 10) : 0,
      is_active: activeBox.querySelector('input').checked,
      is_featured: featuredBox.querySelector('input').checked,
    };

    const errors = validate(values, { isNew });
    if (Object.keys(errors).length) {
      for (const [key, message] of Object.entries(errors)) setFieldError(f[key], message);
      const first = f[Object.keys(errors)[0]];
      first.focus();
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    await submitting($('#save'), async () => {
      try {
        const imageUrl = await picker.resolve(values.sku);

        const payload = {
          sku: values.sku,
          name: values.name,
          slug: values.slug,
          description: values.description,
          brand_id: values.brand_id,
          category_id: values.category_id,
          product_image: imageUrl,
          units_per_carton: values.units_per_carton,
          cost_price: values.cost_price ?? 0,
          wholesale_price: values.wholesale_price ?? 0,
          retail_price: values.retail_price ?? 0,
          carton_price: values.carton_price,
          minimum_order_quantity: values.minimum_order_quantity,
          low_stock_threshold: values.low_stock_threshold,
          is_active: values.is_active,
          is_featured: values.is_featured,
        };

        if (isNew) {
          // One call: the product, its inventory row and — if an opening
          // balance was given — the stock-in that explains it, all in one
          // transaction. Three separate writes could leave a product with
          // stock nobody can account for.
          const created = await rpc('create_product', {
            p_product: payload,
            p_opening_stock: values.opening_stock || 0,
            p_location_id: f.location_id.value || null,
            p_warehouse_note: f.warehouse_location.value.trim() || null,
          });
          toast(`${created.name} created.`);
          location.href = `/admin/products/view/?id=${created.id}`;
        } else {
          await update('products', { id: `eq.${id}` }, payload);
          toast('Saved.');
          location.href = `/admin/products/view/?id=${id}`;
        }
      } catch (err) {
        const appErr = err instanceof AppError ? err : null;
        const target = appErr && FIELD_FOR_CODE[appErr.code];
        if (target && f[target]) {
          setFieldError(f[target], appErr.message);
          f[target].focus();
          f[target].scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else {
          const slot = $('#form-error');
          slot.textContent = appErr?.message || 'That could not be saved. Please try again.';
          slot.hidden = false;
          toastError(err);
        }
      }
    });
  });
}
