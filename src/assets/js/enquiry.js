/**
 * PowerKing Nepal — multi-product enquiry list.
 *
 * A buyer ticks several products, says how many of each they want, and sends
 * one WhatsApp message instead of a separate chat per line. The list is kept
 * in this browser only, so it survives moving between the catalogue, a
 * category and a product page.
 *
 * There is no server and nothing is ordered here: the whole feature ends in a
 * wa.me link with the message already written out. That is also its one hard
 * limit — the message travels inside a URL, so the list is capped (see
 * ENQUIRY_MAX in site.config.js) rather than risking a phone truncating it.
 *
 * Without JavaScript none of this renders: the add buttons ship `hidden` and
 * are only revealed here. The per-product WhatsApp link beside them is a
 * plain <a> that has always worked on its own.
 */
(function () {
  'use strict';

  var bar = document.getElementById('enq-bar');
  if (!bar) return;

  var STORE = 'pk-enquiry';
  var MAX = Number(bar.getAttribute('data-max')) || 20;
  var NUMBER = bar.getAttribute('data-number') || '';
  var GREETING = bar.getAttribute('data-greeting') || '';
  var CLOSING = bar.getAttribute('data-closing') || '';

  var dialog = document.getElementById('enq-dialog');
  var listEl = document.getElementById('enq-list');
  var countEl = document.getElementById('enq-count');
  var noteEl = document.getElementById('enq-note');
  var sendEl = document.getElementById('enq-send');

  /** [{ slug, name, qty, unit }] in the order they were added. */
  var items = read();

  /* --------------------------------------------------------------- store -- */

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || '[]');
      if (!Array.isArray(raw)) return [];
      // Anything stored by an older version, or edited by hand, is filtered
      // here rather than being allowed to reach the message.
      return raw.filter(function (it) {
        return it && typeof it.slug === 'string' && typeof it.name === 'string';
      }).slice(0, MAX).map(function (it) {
        return {
          slug: it.slug,
          name: it.name,
          qty: clampQty(it.qty),
          unit: it.unit === 'pieces' ? 'pieces' : 'cartons',
        };
      });
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(items)); } catch (e) { /* private mode */ }
  }

  function clampQty(n) {
    var q = Math.floor(Number(n));
    if (!isFinite(q) || q < 1) return 1;
    return q > 9999 ? 9999 : q;
  }

  function indexOf(slug) {
    for (var i = 0; i < items.length; i++) if (items[i].slug === slug) return i;
    return -1;
  }

  function track(name, params) {
    if (typeof window.pkTrack === 'function') window.pkTrack(name, params);
  }

  /* ------------------------------------------------------------- message -- */

  /**
   * The message the shop actually receives. Quantities carry their unit
   * because the same product is supplied by the carton and in loose pieces —
   * a bare number would have to be chased up.
   */
  function buildMessage() {
    var lines = items.map(function (it, i) {
      var unit = it.qty === 1 ? it.unit.replace(/s$/, '') : it.unit;
      return (i + 1) + '. ' + it.name + ' (' + it.qty + ' ' + unit + ')';
    });
    return GREETING + '\n\n' + lines.join('\n') + '\n\n' + CLOSING;
  }

  function sendHref() {
    if (!NUMBER) return '/contact/';
    return 'https://wa.me/' + NUMBER + '?text=' + encodeURIComponent(buildMessage());
  }

  /* -------------------------------------------------------------- render -- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function renderBar() {
    var n = items.length;
    bar.hidden = n === 0;
    // The bar occupies the corner the floating bubble sits in, and the two say
    // the same thing, so only one is ever on screen.
    document.body.classList.toggle('has-enquiry', n > 0);
    countEl.textContent = n === 1 ? '1 product selected' : n + ' products selected';
  }

  function renderButtons() {
    var buttons = document.querySelectorAll('[data-enq-add]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      btn.hidden = false;
      var on = indexOf(btn.getAttribute('data-enq-slug')) !== -1;
      var name = btn.getAttribute('data-enq-name');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('title', on ? 'Remove from enquiry list' : 'Add to enquiry list');
      btn.setAttribute('aria-label',
        (on ? 'Remove ' : 'Add ') + name + (on ? ' from' : ' to') + ' the enquiry list');
      var label = btn.querySelector('.enq-add__label');
      if (label) label.textContent = on ? 'In your enquiry list' : 'Add to enquiry list';
    }
  }

  function renderList() {
    listEl.innerHTML = items.map(function (it, i) {
      return '<li class="enq__row" data-slug="' + escAttr(it.slug) + '">'
        + '<span class="enq__n">' + (i + 1) + '</span>'
        + '<span class="enq__name">' + esc(it.name) + '</span>'
        + '<span class="enq__qty">'
        + '<label class="sr-only" for="q-' + escAttr(it.slug) + '">Quantity of '
        + esc(it.name) + '</label>'
        + '<input class="enq__num" id="q-' + escAttr(it.slug) + '" type="number" inputmode="numeric"'
        + ' min="1" max="9999" step="1" value="' + it.qty + '" data-qty>'
        + '<label class="sr-only" for="u-' + escAttr(it.slug) + '">Unit for '
        + esc(it.name) + '</label>'
        + '<select class="enq__unit" id="u-' + escAttr(it.slug) + '" data-unit>'
        + '<option value="cartons"' + (it.unit === 'cartons' ? ' selected' : '') + '>Cartons</option>'
        + '<option value="pieces"' + (it.unit === 'pieces' ? ' selected' : '') + '>Pieces</option>'
        + '</select></span>'
        + '<button type="button" class="enq__remove" data-remove'
        + ' aria-label="Remove ' + escAttr(it.name) + ' from the enquiry list">Remove</button>'
        + '</li>';
    }).join('');

    sendEl.href = sendHref();
    var full = items.length >= MAX;
    noteEl.textContent = full
      ? 'That is the most one message can carry. Send these, then start another list.'
      : '';
    noteEl.className = 'enq__note' + (full ? ' enq__note--warn' : '');
  }

  function render() {
    renderBar();
    renderButtons();
    if (dialog.open) renderList();
  }

  /* --------------------------------------------------------------- adding -- */

  function toggle(btn) {
    var slug = btn.getAttribute('data-enq-slug');
    var name = btn.getAttribute('data-enq-name');
    var at = indexOf(slug);

    if (at !== -1) {
      items.splice(at, 1);
      save(); render();
      track('enquiry_remove', { product: name, items: items.length });
      return;
    }
    if (items.length >= MAX) {
      // Say so where the reader is looking — at the button they just pressed.
      flash(btn, 'Your enquiry is full (' + MAX + ' products). Send it first.');
      return;
    }
    items.push({ slug: slug, name: name, qty: 1, unit: 'cartons' });
    save(); render();
    track('enquiry_add', { product: name, items: items.length });
  }

  var flashTimer = null;
  function flash(btn, message) {
    var host = document.getElementById('enq-flash');
    if (!host) {
      host = document.createElement('p');
      host.id = 'enq-flash';
      host.className = 'enq-flash';
      host.setAttribute('role', 'status');
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.classList.add('is-on');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(function () { host.classList.remove('is-on'); }, 4000);
  }

  /* --------------------------------------------------------------- wiring -- */

  document.addEventListener('click', function (ev) {
    var add = ev.target.closest('[data-enq-add]');
    if (add) { ev.preventDefault(); toggle(add); }
  });

  document.getElementById('enq-open').addEventListener('click', function () {
    renderList();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    track('enquiry_open', { items: items.length });
  });

  document.getElementById('enq-clear').addEventListener('click', function () {
    if (!items.length) return;
    if (!window.confirm('Clear all ' + items.length + ' products from your enquiry?')) return;
    items = [];
    save(); render();
    track('enquiry_clear', {});
  });

  listEl.addEventListener('input', function (ev) {
    var row = ev.target.closest('[data-slug]');
    if (!row) return;
    var at = indexOf(row.getAttribute('data-slug'));
    if (at === -1) return;
    if (ev.target.hasAttribute('data-qty')) items[at].qty = clampQty(ev.target.value);
    if (ev.target.hasAttribute('data-unit')) items[at].unit = ev.target.value;
    save();
    // Only the link needs updating — re-rendering the list here would pull the
    // caret out of the number the reader is still typing into.
    sendEl.href = sendHref();
  });

  listEl.addEventListener('change', function (ev) {
    if (!ev.target.hasAttribute('data-qty')) return;
    // Normalise on blur/commit so an emptied box does not stay empty.
    var row = ev.target.closest('[data-slug]');
    var at = indexOf(row.getAttribute('data-slug'));
    if (at !== -1) ev.target.value = items[at].qty;
  });

  listEl.addEventListener('click', function (ev) {
    if (!ev.target.hasAttribute('data-remove')) return;
    var row = ev.target.closest('[data-slug]');
    var at = indexOf(row.getAttribute('data-slug'));
    if (at === -1) return;
    var name = items[at].name;
    items.splice(at, 1);
    save(); render(); renderList();
    track('enquiry_remove', { product: name, items: items.length });
    if (!items.length && dialog.open) dialog.close();
  });

  sendEl.addEventListener('click', function () {
    // Rebuild rather than trust the last render: the reader may have changed a
    // quantity and clicked straight through.
    sendEl.href = sendHref();
    track('enquiry_send', {
      items: items.length,
      products: items.map(function (i) { return i.name; }).join(' | '),
    });
  });

  render();
}());
