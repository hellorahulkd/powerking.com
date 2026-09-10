/**
 * PowerKing Nepal — catalogue search & filtering.
 * Loaded only on /products/ and category pages.
 *
 * Cards are rendered at build time, never in JavaScript, so the page works
 * and indexes without JS and there is only one card renderer in the codebase.
 *
 * Past the first screenful the build puts the remaining cards in an inert
 * <template>: parsed, but with no render tree, no style resolution and no
 * layout. This script reads their filter attributes straight out of that
 * fragment — which is cheap, they are already parsed — and moves only the
 * cards that actually match into the live grid. A search stays instant at any
 * catalogue size because the DOM only ever holds a window of results, not the
 * whole catalogue.
 */
(function () {
  'use strict';

  var grid = document.getElementById('product-grid');
  if (!grid) return;

  var template = document.getElementById('catalogue-tail');
  var moreBtn = document.getElementById('load-more');
  var pagerEl = document.getElementById('pager');
  var input = document.getElementById('product-search');
  var clearBtn = document.getElementById('search-clear');
  var brandSelect = document.getElementById('brand-filter');
  var catSelect = document.getElementById('category-filter');
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter-cat]'));
  var statusEl = document.getElementById('search-status');
  var noResults = document.getElementById('no-results');
  var resetBtn = document.getElementById('reset-filters');
  var form = document.getElementById('search-form');

  // On a category page the category is fixed and the chips navigate away.
  var lockedCategory = window.PK_CATEGORY || '';

  /**
   * One entry per product, in catalogue order. `el` may still be sitting in
   * the template fragment; `placed` says whether it has reached the grid.
   */
  var entries = [];
  function collect(nodes, placed) {
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var price = Number(el.getAttribute('data-price'));
      entries.push({
        el: el,
        placed: placed,
        pos: entries.length,          // catalogue order, for a stable sort
        hay: el.getAttribute('data-search') || '',
        cat: el.getAttribute('data-category') || '',
        brand: el.getAttribute('data-brand') || '',
        // 0 for a product with no published price. Those never lead a price
        // order in either direction — see order() below.
        price: isFinite(price) && price > 0 ? price : 0,
      });
    }
  }
  collect(grid.querySelectorAll('[data-product]'), true);
  if (template) collect(template.content.querySelectorAll('[data-product]'), false);

  /**
   * Sorting, without a second card renderer.
   *
   * Cards arrive in the grid in match order rather than listing order, so
   * each one's position is pinned explicitly — CSS Grid honours `order`, so
   * the listing reads in the order chosen here whatever order the DOM holds.
   * Re-ordering is therefore just recomputing these numbers over a re-sorted
   * copy of `entries`; no card is ever rebuilt or moved for a sort.
   *
   * Must agree with SORTS in src/pages/catalogue.js, which orders the served
   * page. The catalogue-test checks the two agree by reading the rendered
   * order rather than by trusting either copy.
   */
  var SORTS = {
    'price-asc': function (a, b) { return a.price - b.price; },
    'price-desc': function (a, b) { return b.price - a.price; },
    'name-asc': function (a, b) { return name(a).localeCompare(name(b)); },
    featured: function (a, b) { return a.pos - b.pos; },
  };
  var BY_PRICE = { 'price-asc': 1, 'price-desc': 1 };

  function name(entry) {
    var el = entry.el.querySelector('.card__title');
    return el ? el.textContent.trim() : '';
  }

  /** `entries`, in the order the listing should read. */
  var order = entries.slice();

  function resort() {
    var compare = SORTS[state.sort] || SORTS.featured;
    // Sort a copy carrying its catalogue position, so equal keys keep the
    // order the shop entered them in rather than whatever the engine does.
    var stable = function (a, b) { return compare(a, b) || a.pos - b.pos; };
    if (BY_PRICE[state.sort]) {
      // A product with no published price has no place in a price order, so
      // it follows every priced one instead of sitting at either extreme.
      var priced = [], rest = [];
      for (var i = 0; i < entries.length; i++) {
        (entries[i].price > 0 ? priced : rest).push(entries[i]);
      }
      order = priced.sort(stable).concat(rest.sort(function (a, b) { return a.pos - b.pos; }));
    } else {
      order = entries.slice().sort(stable);
    }
    for (var j = 0; j < order.length; j++) order[j].el.style.order = j;
  }

  // Windowed listing: how many matching cards are allowed in the DOM at once.
  var STEP = grid.querySelectorAll('[data-product]').length || 48;
  var shown = STEP;

  // Must match DEFAULT_SORT in src/pages/catalogue.js — the served page is
  // already in this order, so the first render must not reshuffle it.
  var state = { q: '', category: '', brand: '', sort: 'price-asc' };
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
    var total = 0;

    // Walked in listing order, not catalogue order, so the window holds the
    // first N of what the reader asked to see — the twenty cheapest, not the
    // twenty cheapest among the first twenty.
    for (var i = 0; i < order.length; i++) {
      var entry = order[i];
      // Every term must match — so "coca cola" narrows rather than widens.
      var ok = true;
      for (var t = 0; t < terms.length; t++) {
        if (!matches(entry.hay, terms[t])) { ok = false; break; }
      }
      if (ok && state.category && entry.cat !== state.category) ok = false;
      if (ok && state.brand && entry.brand !== state.brand) ok = false;

      if (ok) {
        total++;
        if (total <= shown) {
          if (!entry.placed) { grid.appendChild(entry.el); entry.placed = true; }
          entry.el.hidden = false;
          continue;
        }
      }
      // Non-matching, or past the window. Cards still in the template cost
      // nothing to leave there; ones already placed just get hidden.
      if (entry.placed) entry.el.hidden = true;
    }

    if (noResults) noResults.hidden = total !== 0;
    grid.hidden = total === 0;

    if (moreBtn) {
      moreBtn.hidden = total <= shown;
      moreBtn.textContent = 'Show more products (' + (total - shown) + ' left)';
    }

    if (statusEl) {
      if (!q && !state.category && !state.brand) {
        statusEl.textContent = '';
      } else {
        var bits = [];
        if (q) bits.push('“' + state.q.trim() + '”');
        if (state.category) bits.push('in ' + state.category);
        if (state.brand) bits.push('by ' + state.brand);
        statusEl.textContent =
          total + (total === 1 ? ' product' : ' products') +
          (bits.length ? ' for ' + bits.join(' ') : '');
      }
    }
    if (clearBtn) clearBtn.hidden = !state.q;
    return total;
  }

  /** Any change to the filters starts the listing again from the top. */
  function refilter() {
    shown = STEP;
    return apply();
  }

  /* --------------------------------------------------------- show more -- */
  if (moreBtn) {
    // The button is a real link to the next paginated page for anyone without
    // JS. Here it expands the listing in place instead — but only on a plain
    // click, so opening it in a new tab still works.
    moreBtn.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
      ev.preventDefault();
      shown += STEP;
      apply();
      track('catalogue_load_more', { shown: shown, page: window.location.pathname });
    });
    // With JS the listing is one continuous page, so the pager is redundant.
    if (pagerEl && template) pagerEl.hidden = true;
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
      refilter();
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
      refilter();
      input.focus();
    });
  }

  /* ------------------------------------------------- category filtering -- */
  // Two controls, one state: the chips wrap on a wide screen, the select
  // stands in below 900px. Whichever one the reader used, the other has to
  // agree with it — so both go through here.
  function setCategory(value) {
    // On a category page, switching category means going to that page.
    if (lockedCategory) {
      window.location.href = value ? '/products/' + slugify(value) + '/' : '/products/';
      return;
    }
    state.category = value;
    syncCategoryControls();
    refilter();
    if (value) track('category_filter', { category: value, page: window.location.pathname });
  }

  function syncCategoryControls() {
    chips.forEach(function (c) {
      var active = c.getAttribute('data-filter-cat') === state.category;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (catSelect && catSelect.value !== state.category) catSelect.value = state.category;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      setCategory(chip.getAttribute('data-filter-cat'));
    });
  });

  if (catSelect) {
    catSelect.addEventListener('change', function () {
      setCategory(catSelect.value);
    });
  }

  /* ----------------------------------------------------------- sorting -- */
  var sortSelect = document.getElementById('sort-order');
  var sortWrap = document.getElementById('sort-wrap');
  if (sortSelect && sortWrap) {
    // Served hidden: the static site cannot answer ?sort= on its own, so the
    // control only appears once there is something here to answer it.
    sortWrap.hidden = false;

    var wanted = new URLSearchParams(window.location.search).get('sort');
    if (wanted && SORTS[wanted]) { state.sort = wanted; sortSelect.value = wanted; }

    sortSelect.addEventListener('change', function () {
      if (!SORTS[sortSelect.value]) return;
      state.sort = sortSelect.value;
      resort();
      refilter();
      // In the URL so an order can be linked and survives a reload. replace,
      // not push: the back button should leave the catalogue, not walk back
      // through every ordering the reader tried.
      try {
        var url = new URL(window.location.href);
        if (state.sort === 'price-asc') url.searchParams.delete('sort');
        else url.searchParams.set('sort', state.sort);
        window.history.replaceState(null, '', url);
      } catch (e) { /* older browser, or a file:// page — the sort still works */ }
      track('catalogue_sort', { sort: state.sort, page: window.location.pathname });
      grid.scrollIntoView({ block: 'start' });
    });
  }

  /* ---------------------------------------------------- brand filtering -- */
  if (brandSelect) {
    brandSelect.addEventListener('change', function () {
      state.brand = brandSelect.value;
      refilter();
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
      syncCategoryControls();
      refilter();
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

  resort();
  apply();
})();
