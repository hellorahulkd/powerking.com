/**
 * PowerKing Nepal — catalogue search & filtering.
 * Loaded only on /products/ and category pages.
 *
 * Every product card is already in the DOM (rendered at build time, so the
 * page works and indexes without JS). This script only shows/hides cards, so
 * search results appear instantly with no page reload and no network request.
 */
(function () {
  'use strict';

  var grid = document.getElementById('product-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-product]'));
  var input = document.getElementById('product-search');
  var clearBtn = document.getElementById('search-clear');
  var brandSelect = document.getElementById('brand-filter');
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter-cat]'));
  var statusEl = document.getElementById('search-status');
  var noResults = document.getElementById('no-results');
  var resetBtn = document.getElementById('reset-filters');
  var form = document.getElementById('search-form');

  // On a category page the category is fixed and the chips navigate away.
  var lockedCategory = window.PK_CATEGORY || '';

  var state = { q: '', category: '', brand: '' };
  var searchTimer = null;

  function track(name, params) {
    if (typeof window.pkTrack === 'function') window.pkTrack(name, params);
  }

  /**
   * Normalise a query the same way the build normalised each card's haystack
   * (see searchText() in src/templates/components.js).
   */
  function normalise(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  /**
   * A term matches when some word in the haystack *starts with* it.
   * Anchoring to word starts keeps type-ahead working ("choco" still finds
   * chocolate) while avoiding nonsense middle-of-word hits — without it,
   * "cola" would match "cho-cola-te".
   */
  function matches(hay, term) {
    return (' ' + hay).indexOf(' ' + term) !== -1;
  }

  function apply() {
    var q = normalise(state.q);
    var terms = q ? q.split(' ') : [];
    var visible = 0;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var hay = card.getAttribute('data-search') || '';
      // Every term must match — so "coca cola" narrows rather than widens.
      var matchesQuery = true;
      for (var t = 0; t < terms.length; t++) {
        if (!matches(hay, terms[t])) { matchesQuery = false; break; }
      }
      var matchesCat = !state.category || card.getAttribute('data-category') === state.category;
      var matchesBrand = !state.brand || card.getAttribute('data-brand') === state.brand;
      var show = matchesQuery && matchesCat && matchesBrand;
      card.hidden = !show;
      if (show) visible++;
    }

    if (noResults) noResults.hidden = visible !== 0;
    grid.hidden = visible === 0;

    if (statusEl) {
      if (!q && !state.category && !state.brand) {
        statusEl.textContent = '';
      } else {
        var bits = [];
        if (q) bits.push('“' + state.q.trim() + '”');
        if (state.category) bits.push('in ' + state.category);
        if (state.brand) bits.push('by ' + state.brand);
        statusEl.textContent =
          visible + (visible === 1 ? ' product' : ' products') +
          (bits.length ? ' for ' + bits.join(' ') : '');
      }
    }
    if (clearBtn) clearBtn.hidden = !state.q;
    return visible;
  }

  /* ------------------------------------------------------------ search -- */
  if (input) {
    // Prefill from ?q= so shared/searched URLs work and the no-JS form submit
    // lands somewhere useful.
    var params = new URLSearchParams(window.location.search);
    var initialQ = params.get('q');
    if (initialQ) { input.value = initialQ; state.q = initialQ; }

    input.addEventListener('input', function () {
      state.q = input.value;
      apply();
      // Debounce the analytics event so we log finished searches, not keystrokes.
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        var term = state.q.trim();
        if (term.length < 2) return;
        track('product_search', {
          search_term: term,
          results: apply(),
          category: state.category || lockedCategory || '(all)',
          page: window.location.pathname,
        });
      }, 700);
    });

    // Prevent a full page reload when JS is available.
    if (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        input.blur();
      });
    }
  }

  if (clearBtn && input) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      state.q = '';
      apply();
      input.focus();
    });
  }

  /* ------------------------------------------------- category filtering -- */
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var value = chip.getAttribute('data-filter-cat');
      // On a category page, switching category means going to that page.
      if (lockedCategory) {
        window.location.href = value
          ? '/products/' + slugify(value) + '/'
          : '/products/';
        return;
      }
      state.category = value;
      chips.forEach(function (c) {
        var active = c === chip;
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      apply();
      if (value) track('category_filter', { category: value, page: window.location.pathname });
    });
  });

  /* ---------------------------------------------------- brand filtering -- */
  if (brandSelect) {
    brandSelect.addEventListener('change', function () {
      state.brand = brandSelect.value;
      apply();
      if (state.brand) track('brand_filter', { brand: state.brand, page: window.location.pathname });
    });
  }

  /* --------------------------------------------------------------- reset -- */
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      state.q = ''; state.brand = '';
      if (!lockedCategory) state.category = '';
      if (input) input.value = '';
      if (brandSelect) brandSelect.value = '';
      chips.forEach(function (c) {
        var active = c.getAttribute('data-filter-cat') === state.category;
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      apply();
      if (input) input.focus();
    });
  }

  /** Must match slugifyCategory() in src/templates/components.js. */
  function slugify(name) {
    return String(name)
      .toLowerCase()
      .replace(/&/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  apply();
})();
