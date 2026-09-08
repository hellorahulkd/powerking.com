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

  /** [{ slug, name, image, cartons, pieces }] in the order they were added. */
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
        // Lists saved before cartons and pieces were separate boxes carry a
        // single qty and a unit. Carry them across rather than dropping a
        // list somebody had already built.
        if (typeof it.qty === 'number' && it.cartons === undefined) {
          var wasPieces = it.unit === 'pieces';
          return {
            slug: it.slug,
            name: it.name,
            image: typeof it.image === 'string' ? it.image : '',
            cartons: wasPieces ? 0 : clampQty(it.qty),
            pieces: wasPieces ? clampQty(it.qty) : 0,
          };
        }
        return {
          slug: it.slug,
          name: it.name,
          image: typeof it.image === 'string' ? it.image : '',
          cartons: clampQty(it.cartons),
          pieces: clampQty(it.pieces),
        };
      });
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(items)); } catch (e) { /* private mode */ }
  }

  /** Either box may legitimately be zero — but not both, which send() checks. */
  function clampQty(n) {
    var q = Math.floor(Number(n));
    if (!isFinite(q) || q < 0) return 0;
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
  function amount(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** "1 carton + 10 pieces", or just whichever of the two was asked for. */
  function quantityOf(it) {
    var parts = [];
    if (it.cartons > 0) parts.push(amount(it.cartons, 'carton', 'cartons'));
    if (it.pieces > 0) parts.push(amount(it.pieces, 'piece', 'pieces'));
    return parts.join(' + ');
  }

  function buildMessage() {
    var lines = items.map(function (it, i) {
      return (i + 1) + '. ' + it.name + ' (' + quantityOf(it) + ')';
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
    countEl.textContent = n === 1
      ? '1 product on your enquiry'
      : n + ' products on your enquiry';

    // The bottom bar's Enquire tab carries the same number, so the list is
    // never out of sight on a phone.
    var badge = document.getElementById('tab-enq-count');
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n;
      var tab = document.getElementById('tab-enquire');
      if (tab) {
        tab.setAttribute('aria-label', n === 0
          ? 'Open your enquiry list'
          : 'Open your enquiry list — ' + n + (n === 1 ? ' product' : ' products'));
      }
    }
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
      btn.setAttribute('title', on ? 'Remove from your enquiry list' : 'Add to your enquiry list');
      btn.setAttribute('aria-label',
        (on ? 'Remove ' : 'Add ') + name + (on ? ' from' : ' to') + ' your enquiry list');
    }
  }

  function renderList() {
    // An empty panel that just says "0 products" teaches nobody what to do.
    var empty = items.length === 0;
    document.getElementById('enq-empty').hidden = !empty;
    document.getElementById('enq-more').hidden = empty;
    listEl.hidden = empty;
    sendEl.hidden = empty;
    document.querySelector('.enq__fine').hidden = empty;

    listEl.innerHTML = items.map(function (it, i) {
      var id = escAttr(it.slug);
      // Two boxes rather than a number and a unit menu: the shop supplies both
      // ways, so a buyer wanting a carton AND a few loose pieces can say so on
      // one line instead of adding the product twice.
      function box(kind, label, value) {
        return '<span class="enq__box">'
          + '<label class="enq__box-label" for="' + kind + '-' + id + '">' + label + '</label>'
          + '<input class="enq__num" id="' + kind + '-' + id + '" type="number"'
          + ' inputmode="numeric" min="0" max="9999" step="1" value="' + value + '"'
          + ' data-' + kind + ' aria-label="' + label + ' of ' + escAttr(it.name) + '">'
          + '</span>';
      }
      return '<li class="enq__row" data-slug="' + id + '">'
        + (it.image
          ? '<img class="enq__thumb" src="' + escAttr(it.image) + '" alt="" width="56" height="56"'
            + ' loading="lazy" decoding="async"'
            + ' onerror="this.style.visibility=\'hidden\'">'
          : '<span class="enq__thumb enq__thumb--none" aria-hidden="true"></span>')
        + '<span class="enq__main">'
        + '<span class="enq__name">' + esc(it.name) + '</span>'
        + '<span class="enq__qty">' + box('cartons', 'Cartons', it.cartons)
        + box('pieces', 'Pieces', it.pieces) + '</span>'
        + '</span>'
        + '<button type="button" class="enq__remove" data-remove'
        + ' aria-label="Remove ' + escAttr(it.name) + ' from the enquiry list">Remove</button>'
        + '</li>';
    }).join('');

    sendEl.href = sendHref();
    say(items.length >= MAX
      ? 'That is the most one message can carry. Send these, then start another list.'
      : '');
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
    items.push({
      slug: slug, name: name,
      image: btn.getAttribute('data-enq-image') || '',
      cartons: 1, pieces: 0,
    });
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

  function openPanel(from) {
    renderList();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // Land on the quantity for whatever was just added, so "how many?" is the
    // obvious next thing rather than something to go hunting for.
    var first = listEl.querySelector('[data-cartons]');
    if (first) { first.focus(); first.select(); }
    track('enquiry_open', { items: items.length, from: from || 'bar' });
  }

  document.getElementById('enq-open').addEventListener('click', function () {
    openPanel('bar');
  });

  /**
   * The Enquire buttons — on a product page and the floating bubble — are real
   * wa.me links so they work without JavaScript. With JavaScript they open the
   * list instead, because a message with no quantity in it only starts the
   * conversation the shop then has to have anyway.
   */
  document.addEventListener('click', function (ev) {
    var opener = ev.target.closest('[data-enq-open]');
    if (!opener || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    var slug = opener.getAttribute('data-enq-slug');
    if (slug && indexOf(slug) === -1) {
      if (items.length >= MAX) {
        flash(opener, 'Your enquiry is full (' + MAX + ' products). Send it first.');
        return;
      }
      items.push({
        slug: slug,
        name: opener.getAttribute('data-enq-name'),
        image: opener.getAttribute('data-enq-image') || '',
        cartons: 1, pieces: 0,
      });
      save(); render();
      track('enquiry_add', { product: opener.getAttribute('data-enq-name'), items: items.length });
    }
    openPanel(slug ? 'product_cta' : 'floating_button');
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
    if (ev.target.hasAttribute('data-cartons')) items[at].cartons = clampQty(ev.target.value);
    if (ev.target.hasAttribute('data-pieces')) items[at].pieces = clampQty(ev.target.value);
    row.classList.remove('is-empty');
    save();
    // Only the link needs updating — re-rendering the list here would pull the
    // caret out of the number the reader is still typing into.
    sendEl.href = sendHref();
  });

  listEl.addEventListener('change', function (ev) {
    var which = ev.target.hasAttribute('data-cartons') ? 'cartons'
      : ev.target.hasAttribute('data-pieces') ? 'pieces' : '';
    if (!which) return;
    // Normalise on blur so an emptied box shows the 0 it is actually holding.
    var row = ev.target.closest('[data-slug]');
    var at = indexOf(row.getAttribute('data-slug'));
    if (at !== -1) ev.target.value = items[at][which];
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

  sendEl.addEventListener('click', function (ev) {
    // Both boxes at zero is not a quantity, and sending it would produce a
    // line the shop has to ask about. Point at the row instead of guessing.
    var blank = items.filter(function (it) { return it.cartons < 1 && it.pieces < 1; });
    if (blank.length) {
      ev.preventDefault();
      for (var i = 0; i < blank.length; i++) {
        var row = listEl.querySelector('[data-slug="' + cssEscape(blank[i].slug) + '"]');
        if (row) row.classList.add('is-empty');
      }
      say(blank.length === 1
        ? 'How many of ' + blank[0].name + '? Fill in cartons, pieces, or both.'
        : 'Fill in cartons or pieces for the ' + blank.length + ' highlighted products.');
      var first = listEl.querySelector('.is-empty [data-cartons]');
      if (first) { first.focus(); first.select(); }
      return;
    }
    // Rebuild rather than trust the last render: the reader may have changed a
    // quantity and clicked straight through.
    sendEl.href = sendHref();
    track('enquiry_send', {
      items: items.length,
      products: items.map(function (i) { return i.name; }).join(' | '),
    });
  });

  /** Slugs are [a-z0-9-] by construction, but a selector should not assume it. */
  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
  }

  function say(message) {
    noteEl.textContent = message;
    noteEl.className = 'enq__note' + (message ? ' enq__note--warn' : '');
  }

  /**
   * A list built before this version has no pictures in it. Any control on
   * this page knows its own product's image, so fill the gaps from those and
   * write the upgraded shape back once, rather than re-migrating on every
   * page load for the rest of the list's life.
   */
  (function upgradeStoredList() {
    var changed = false;
    items.forEach(function (it) {
      if (it.image) return;
      var control = document.querySelector('[data-enq-image][data-enq-slug="' + cssEscape(it.slug) + '"]');
      var src = control && control.getAttribute('data-enq-image');
      if (src) { it.image = src; changed = true; }
    });
    var stored = '';
    try { stored = localStorage.getItem(STORE) || ''; } catch (e) { /* private mode */ }
    if (changed || stored !== JSON.stringify(items)) save();
  }());

  render();
}());
