/**
 * ============================================================================
 *  UI PRIMITIVES — PowerKing inventory console
 * ============================================================================
 *  Toasts, dialogs, tables, and the four states every screen has to be able
 *  to show: loading, empty, error, and the real thing.
 *
 *  Everything here builds DOM nodes rather than assembling HTML strings. That
 *  is not a style preference: this console renders supplier names, product
 *  names and CSV cells that people typed, and one forgotten escape in a
 *  template literal is a script injection into a page that holds an admin
 *  session. textContent cannot be talked into running anything.
 * ============================================================================
 */

import { integer } from './format.js';

/* ------------------------------------------------------------ elements --- */

/**
 * el('div.card', { onclick }, ['text', childNode])
 * The tag string takes an optional #id and any number of .classes.
 */
export function el(spec, props = {}, children = []) {
  const [tag, ...rest] = String(spec).split(/(?=[.#])/);
  const node = document.createElement(tag || 'div');
  for (const part of rest) {
    if (part.startsWith('#')) node.id = part.slice(1);
    else node.classList.add(part.slice(1));
  }
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;      // only ever called with our own markup
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'value') node.value = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Replace everything inside a node. */
export function mount(target, ...children) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (!node) return null;
  node.replaceChildren(...children.flat().filter(Boolean));
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* -------------------------------------------------------------- toasts --- */

let toastHost = null;

/**
 * A short confirmation or failure notice.
 *
 * Errors stay until dismissed. Something went wrong is not a message to show
 * for three seconds while somebody is looking at their keyboard — and if a
 * stock movement failed, the person needs to know it did not happen.
 */
export function toast(message, { type = 'success', timeout } = {}) {
  if (!toastHost) {
    toastHost = el('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const life = timeout ?? (type === 'error' ? 0 : 4000);
  const node = el(`div.toast.toast--${type}`, {}, [
    el('span.toast__text', { text: message }),
    el('button.toast__close', {
      type: 'button',
      'aria-label': 'Dismiss',
      onclick: () => node.remove(),
    }, ['×']),
  ]);
  toastHost.append(node);
  if (life) setTimeout(() => node.remove(), life);
  return node;
}

export function toastError(err) {
  const message = err?.message || String(err);
  return toast(message, { type: 'error' });
}

/* -------------------------------------------------------------- dialog --- */

/**
 * A confirmation the user has to answer. Resolves true or false.
 *
 * Uses <dialog>, so the browser handles the focus trap, Escape, and the
 * inert background — all things a hand-rolled modal gets subtly wrong.
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
      dialog.close();
      dialog.remove();
    };
    const dialog = el('dialog.dialog', { onclose: () => done(false) }, [
      el('h2.dialog__title', { text: title }),
      message ? el('p.dialog__body', { text: message }) : null,
      el('div.dialog__actions', {}, [
        el('button.btn.btn--ghost', { type: 'button', onclick: () => done(false) }, [cancelLabel]),
        el(`button.btn.${danger ? 'btn--danger' : 'btn--primary'}`, {
          type: 'button',
          onclick: () => done(true),
        }, [confirmLabel]),
      ]),
    ]);
    document.body.append(dialog);
    dialog.showModal();
  });
}

/* -------------------------------------------------------------- states --- */

export function loading(label = 'Loading…') {
  return el('div.state.state--loading', {}, [
    el('span.spinner', { 'aria-hidden': 'true' }),
    el('p.state__text', { text: label }),
  ]);
}

/**
 * An empty state says what would be here and how to put something here. "No
 * results" on its own leaves somebody staring at a screen wondering whether
 * it is broken.
 */
export function empty(title, detail, action) {
  return el('div.state.state--empty', {}, [
    el('h3.state__title', { text: title }),
    detail ? el('p.state__text', { text: detail }) : null,
    action || null,
  ]);
}

export function errorState(err, retry) {
  const message = err?.message || String(err);
  return el('div.state.state--error', {}, [
    el('h3.state__title', { text: 'That did not work' }),
    el('p.state__text', { text: message }),
    retry ? el('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: retry }, ['Try again']) : null,
  ]);
}

/**
 * Run an async load into a container, showing the loading, error and content
 * states in turn. Every screen loads data this way, so no screen can forget
 * one of the three.
 */
export async function render(target, loader, { label } = {}) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (!node) return;
  mount(node, loading(label));
  try {
    const content = await loader();
    mount(node, content);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    mount(node, errorState(err, () => render(node, loader, { label })));
  }
}

/* --------------------------------------------------------------- table --- */

/**
 * A data table.
 *
 * Each column carries a `label` and a `cell(row)` that returns a node or a
 * string. `narrow` columns are the ones that collapse away on a phone; the
 * stylesheet hides them, and the row still reads because the first column
 * carries the name.
 */
export function table(columns, rows, { empty: emptyNode, caption } = {}) {
  if (!rows.length && emptyNode) return emptyNode;
  const head = el('tr', {}, columns.map((c) =>
    el(`th${c.numeric ? '.is-numeric' : ''}${c.narrow ? '.is-narrow' : ''}`, {
      scope: 'col',
      text: c.label,
    })));
  const body = rows.map((row) =>
    el('tr', { dataset: row.__id ? { id: row.__id } : {} }, columns.map((c) => {
      const cell = el(`td${c.numeric ? '.is-numeric' : ''}${c.narrow ? '.is-narrow' : ''}`, {
        // Repeated on every cell so the stylesheet can show it as a label
        // when the table becomes a stack of cards on a narrow screen.
        'data-label': c.label,
      });
      const content = c.cell(row);
      if (content instanceof Node) cell.append(content);
      else cell.textContent = content ?? '—';
      return cell;
    })));
  return el('div.table-wrap', {}, [
    el('table.table', {}, [
      caption ? el('caption.sr-only', { text: caption }) : null,
      el('thead', {}, [head]),
      el('tbody', {}, body),
    ]),
  ]);
}

/** A coloured status pill. */
export function badge(text, tone = 'neutral') {
  return el(`span.pill.pill--${tone}`, { text });
}

export function stockBadge(status) {
  const tones = { in_stock: 'ok', low_stock: 'warn', out_of_stock: 'bad', contact: 'neutral' };
  const labels = {
    in_stock: 'In stock', low_stock: 'Low', out_of_stock: 'Out of stock',
    contact: 'On request',
  };
  return badge(labels[status] || status, tones[status] || 'neutral');
}

/* ---------------------------------------------------------- pagination --- */

/**
 * Page controls that state where you are. `total` may be null when the count
 * is unknown, in which case the range is shown without a total rather than
 * inventing one.
 */
export function pagination({ page, pageSize, total, onPage }) {
  const pages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = total === null ? (page + 1) * pageSize : Math.min(total, (page + 1) * pageSize);

  return el('nav.pager', { 'aria-label': 'Pagination' }, [
    el('p.pager__count', {
      text: total === null
        ? `Showing ${from}–${to}`
        : `${from}–${to} of ${integer(total)}`,
    }),
    el('div.pager__buttons', {}, [
      el('button.btn.btn--ghost.btn--sm', {
        type: 'button',
        disabled: page === 0,
        onclick: () => onPage(page - 1),
      }, ['Previous']),
      el('button.btn.btn--ghost.btn--sm', {
        type: 'button',
        disabled: pages !== null && page + 1 >= pages,
        onclick: () => onPage(page + 1),
      }, ['Next']),
    ]),
  ]);
}

/* ---------------------------------------------------------------- form --- */

/** A labelled field. `control` is the input node itself. */
export function field(label, control, { hint, required = false, id } = {}) {
  const controlId = id || control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = controlId;
  if (required) control.required = true;
  return el('div.f', {}, [
    el('label.f__label', { for: controlId }, [
      label,
      required ? el('span.f__req', { 'aria-hidden': 'true', text: ' *' }) : null,
    ]),
    control,
    hint ? el('p.f__hint', { text: hint }) : null,
    el('p.f__error', { hidden: true, role: 'alert' }),
  ]);
}

export function input(props = {}) {
  return el('input.f__input', { type: 'text', autocomplete: 'off', ...props });
}

export function textarea(props = {}) {
  return el('textarea.f__input', { rows: 4, ...props });
}

export function select(options, props = {}) {
  const node = el('select.f__input', props);
  for (const opt of options) {
    node.append(el('option', { value: opt.value, selected: opt.selected }, [opt.label]));
  }
  return node;
}

export function checkbox(label, props = {}) {
  const box = el('input', { type: 'checkbox', ...props });
  return el('label.f__check', {}, [box, el('span', { text: label })]);
}

/** Show a validation message under a field, or clear it. */
export function setFieldError(control, message) {
  const wrap = control.closest('.f');
  if (!wrap) return;
  const slot = wrap.querySelector('.f__error');
  wrap.classList.toggle('is-invalid', Boolean(message));
  control.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (slot) {
    slot.textContent = message || '';
    slot.hidden = !message;
  }
}

export function clearFieldErrors(form) {
  for (const wrap of $$('.f.is-invalid', form)) {
    wrap.classList.remove('is-invalid');
    const slot = wrap.querySelector('.f__error');
    if (slot) { slot.textContent = ''; slot.hidden = true; }
  }
}

/**
 * Disable a submit button while its action is in flight, restoring the label
 * afterwards. Double-submitting a stock movement books it twice, and the
 * database has no way to tell that apart from somebody genuinely doing it
 * twice — so it has to be prevented here.
 */
export async function submitting(button, work) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/* ---------------------------------------------------------------- misc --- */

/** Debounce, for search boxes that would otherwise query on every keystroke. */
export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Read the query string, which is how this static site passes a record id. */
export function param(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

/**
 * A record id from the URL, or ''.
 *
 * Every id in this system is a UUID, so anything else is either a typo or
 * somebody probing. Rejecting it here means the screen says "that does not
 * exist" instead of passing the string into a PostgREST filter and showing
 * whatever the database says about it.
 *
 * This is tidiness, not the security boundary: Row Level Security decides what
 * any id can reach, and a crafted one cannot read a row the caller is not
 * entitled to. But a query string is untrusted input and should be checked
 * where it enters, not where it lands.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function idParam(name = 'id') {
  const value = param(name);
  return UUID.test(value) ? value : '';
}

export function setTitle(text) {
  const heading = document.getElementById('page-title');
  if (heading) heading.textContent = text;
  document.title = `${text} | PowerKing Nepal`;
}

/** A product thumbnail, or a neutral placeholder when there is no photo. */
export function thumb(src, alt = '') {
  if (!src) return el('span.thumb.thumb--empty', { 'aria-hidden': 'true' });
  return el('img.thumb', {
    src,
    alt,
    loading: 'lazy',
    decoding: 'async',
    onerror: (e) => e.target.replaceWith(el('span.thumb.thumb--empty', { 'aria-hidden': 'true' })),
  });
}
