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
  var SYMBOL = bar.getAttribute('data-symbol') || 'Rs.';

  var dialog = document.getElementById('enq-dialog');
  var listEl = document.getElementById('enq-list');
  var countEl = document.getElementById('enq-count');
  var noteEl = document.getElementById('enq-note');
  var sendEl = document.getElementById('enq-send');

  /**
   * [{ slug, name, image, price, pack, cartons, pieces }] in the order they
   * were added. `price` is the rate for one piece and `pack` how many pieces
   * are in a carton — both copied off the control that added the product, so
   * the message can do the arithmetic without asking the network for anything.
   */
  var items = read();

  /** Which of the two buyers this is, so the shop can answer accordingly. */
  var WHO_STORE = 'pk-enquiry-who';
  var who = readWho();

  function readWho() {
    try {
      var v = localStorage.getItem(WHO_STORE);
      return v === 'personal' ? 'personal' : 'business';
    } catch (e) { return 'business'; }
  }

  function saveWho() {
    try { localStorage.setItem(WHO_STORE, who); } catch (e) { /* private mode */ }
  }

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
            price: money(it.price),
            pack: money(it.pack),
            cartons: wasPieces ? 0 : clampQty(it.qty),
            pieces: wasPieces ? clampQty(it.qty) : 0,
          };
        }
        return {
          slug: it.slug,
          name: it.name,
          image: typeof it.image === 'string' ? it.image : '',
          price: money(it.price),
          pack: money(it.pack),
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

  /**
   * A price or a pack size as a positive number, or 0 for "not known".
   *
   * Unlike a quantity this is not the reader's to type, so anything that does
   * not parse is dropped rather than corrected: a wrong number in a price is
   * worse than no number, and the message says "price on enquiry" instead.
   */
  function money(n) {
    var v = Number(n);
    return isFinite(v) && v > 0 ? v : 0;
  }

  /**
   * Rupees, grouped the way Nepal groups them: Rs. 1,45,000 — last three
   * digits, then pairs.
   *
   * Done by hand rather than through Intl. The site formats its prices with
   * Intl on the server, where Node carries the full locale data; a phone's
   * browser may not, and Chrome here quietly resolves ne-NP to en-US and
   * groups in thousands. That would print a different figure in the message
   * from the one on the card the buyer just read, and differently again on
   * the next phone. Must stay in step with formatPrice() in src/lib/html.js.
   */
  function rupees(n) {
    var digits = String(Math.round(n));
    var head = digits.slice(0, -3);
    var out = digits.slice(-3);
    while (head.length > 2) { out = head.slice(-2) + ',' + out; head = head.slice(0, -2); }
    if (head) out = head + ',' + out;
    return SYMBOL + ' ' + out;
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

  /**
   * The loose pieces on a line, costed at the rate the site quoted.
   *
   * Only the loose pieces. The site lists one rate — the price of a single
   * piece — and a carton is not that rate multiplied out, so multiplying it
   * out for cartons would put a number in the shop's inbox that nobody
   * quoted. Cartons ask instead.
   */
  function looseTotal(it) {
    return it.price > 0 && it.pieces > 0 ? it.price * it.pieces : 0;
  }

  /**
   * The lines one product contributes: what was asked for, and what it comes
   * to.
   *
   * Labelled rather than run together, because the shop reads this on a phone
   * and the two quantities are priced differently — a money figure sitting
   * next to an unlabelled number is the one thing that must not be
   * misreadable. The carton rate is not repeated per line; the summary says
   * it once at the foot.
   */
  function messageLines(it, i) {
    var out = [(i + 1) + '. ' + it.name];

    if (it.cartons > 0) {
      var line = '   Cartons: ' + it.cartons;
      // Spelling the pieces out matters: "10 cartons" is not a quantity until
      // both sides agree how many pieces that is.
      if (it.pack > 0) {
        line += ' (' + it.pack + ' pcs each = ' + (it.cartons * it.pack) + ' pcs)';
      }
      out.push(line);
    }

    if (it.pieces > 0) {
      var loose = '   Loose: ' + it.pieces + ' pcs';
      out.push(it.price > 0
        ? loose + ' x ' + rupees(it.price) + ' = ' + rupees(looseTotal(it))
        : loose + ' - price on enquiry');
    }

    return out.join('\n');
  }

  function buildMessage() {
    var parts = [GREETING, ''];
    parts.push(items.map(messageLines).join('\n\n'));

    var total = items.reduce(function (t, it) { return t + looseTotal(it); }, 0);
    var cartons = items.filter(function (it) { return it.cartons > 0; }).length;
    var unpriced = items.filter(function (it) {
      return it.pieces > 0 && !(it.price > 0);
    }).length;

    var summary = [];
    if (total > 0) {
      summary.push('Loose pieces at your listed rate: ' + rupees(total)
        + (unpriced ? ' (plus ' + unpriced + ' with no price listed)' : ''));
    }
    if (cartons > 0) {
      summary.push('Carton rates are not listed on the site — please quote them for '
        + amount(cartons, 'product', 'products') + '.');
    }
    if (summary.length) parts.push('', summary.join('\n'));

    parts.push('', who === 'personal'
      ? 'Buying for: myself, a few pieces.'
      : 'Buying for: my shop or business.');
    parts.push('', CLOSING);
    return parts.join('\n');
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
    renderWho();
    renderTotal();
    say(items.length >= MAX
      ? 'That is the most one message can carry. Send these, then start another list.'
      : '');
  }

  /**
   * The same arithmetic the message carries, shown before it is sent.
   *
   * Loose pieces only, and labelled as such: the carton rate is a different
   * number the shop has not published, so a total that quietly included
   * cartons would be a figure nobody quoted.
   */
  function renderTotal() {
    var el = document.getElementById('enq-total');
    if (!el) return;
    var total = items.reduce(function (t, it) { return t + looseTotal(it); }, 0);
    var cartons = items.filter(function (it) { return it.cartons > 0; }).length;
    var bits = [];
    if (total > 0) bits.push('Loose pieces: <strong>' + esc(rupees(total)) + '</strong>');
    if (cartons > 0) bits.push('carton rates quoted when we reply');
    el.innerHTML = bits.join(' &middot; ');
    el.hidden = bits.length === 0;
  }

  function render() {
    renderBar();
    renderButtons();
    if (dialog.open) renderList();
  }

  /* --------------------------------------------------------------- adding -- */

  /**
   * A list entry read off whichever control was pressed. One place, so an Add
   * button on a card and the Enquire button on a product page cannot put
   * differently-shaped entries on the same list.
   */
  function itemFrom(el) {
    return {
      slug: el.getAttribute('data-enq-slug'),
      name: el.getAttribute('data-enq-name'),
      image: el.getAttribute('data-enq-image') || '',
      price: money(el.getAttribute('data-enq-price')),
      pack: money(el.getAttribute('data-enq-pack')),
      cartons: 1, pieces: 0,
    };
  }

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
    items.push(itemFrom(btn));
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
      items.push(itemFrom(opener));
      save(); render();
      track('enquiry_add', { product: opener.getAttribute('data-enq-name'), items: items.length });
    }
    openPanel(slug ? 'product_cta' : 'floating_button');
  });

  var whoEl = document.getElementById('enq-who');
  if (whoEl) {
    whoEl.addEventListener('change', function (ev) {
      if (ev.target.name !== 'enq-who') return;
      who = ev.target.value === 'personal' ? 'personal' : 'business';
      saveWho();
      sendEl.href = sendHref();
      track('enquiry_who', { who: who });
    });
  }

  /** Put the stored answer back on the radios each time the panel opens. */
  function renderWho() {
    if (!whoEl) return;
    var chosen = whoEl.querySelector('input[value="' + who + '"]');
    if (chosen) chosen.checked = true;
  }

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
    // Only the link and the total need updating — re-rendering the list here
    // would pull the caret out of the number the reader is still typing into.
    sendEl.href = sendHref();
    renderTotal();
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
      if (it.image && it.price !== undefined && it.pack !== undefined) return;
      var control = document.querySelector('[data-enq-slug="' + cssEscape(it.slug) + '"]');
      if (!control) return;
      var src = control.getAttribute('data-enq-image');
      if (src && !it.image) { it.image = src; changed = true; }
      // A list built before prices were carried has none, and the message
      // would silently drop the arithmetic for those lines.
      var price = money(control.getAttribute('data-enq-price'));
      var pack = money(control.getAttribute('data-enq-pack'));
      if (price !== it.price) { it.price = price; changed = true; }
      if (pack !== it.pack) { it.pack = pack; changed = true; }
    });
    var stored = '';
    try { stored = localStorage.getItem(STORE) || ''; } catch (e) { /* private mode */ }
    if (changed || stored !== JSON.stringify(items)) save();
  }());

  render();
}());
