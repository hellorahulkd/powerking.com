/**
 * PowerKing Nepal — site behaviour.
 * Vanilla JS, no dependencies, ~3KB. Loaded with `defer` on every page.
 *
 * Responsibilities:
 *   1. Mobile menu
 *   2. Sticky-header shadow
 *   3. Google Analytics 4 custom events (whatsapp_click, product_view, …)
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- analytics -- */

  /**
   * Send a GA4 event. Safe to call when analytics is not configured — the
   * events are simply queued into dataLayer and dropped.
   */
  function track(name, params) {
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', name, params || {});
      } else {
        (window.dataLayer = window.dataLayer || []).push(
          Object.assign({ event: name }, params || {}),
        );
      }
    } catch (e) {
      /* never let analytics break the page */
    }
  }
  window.pkTrack = track;

  var pagePath = window.location.pathname;

  /* -------------------------------------------------- whatsapp tracking -- */
  // Delegated so it also covers anything rendered later (filtered cards).
  document.addEventListener(
    'click',
    function (ev) {
      var wa = ev.target.closest('[data-wa-track]');
      if (wa) {
        track('whatsapp_click', {
          location: wa.getAttribute('data-wa-location') || 'unknown',
          product: wa.getAttribute('data-wa-product') || '(none)',
          product_id: wa.getAttribute('data-wa-product-id') || '(none)',
          page: pagePath,
        });
        return;
      }

      var cat = ev.target.closest('[data-track-category]');
      if (cat) {
        track('category_click', {
          category: cat.getAttribute('data-track-category'),
          page: pagePath,
        });
        return;
      }

      var contact = ev.target.closest('[data-track-contact]');
      if (contact) {
        track('contact_click', {
          method: contact.getAttribute('data-track-contact'),
          page: pagePath,
        });
        return;
      }

      var social = ev.target.closest('[data-track-social]');
      if (social) {
        track('social_click', {
          network: social.getAttribute('data-track-social'),
          page: pagePath,
        });
      }
    },
    { passive: true },
  );

  /* ------------------------------------------------------- product_view -- */
  if (window.PK_PRODUCT) {
    track('product_view', {
      product: window.PK_PRODUCT.name,
      product_id: window.PK_PRODUCT.id,
      brand: window.PK_PRODUCT.brand,
      category: window.PK_PRODUCT.category,
      sku: window.PK_PRODUCT.sku,
      page: pagePath,
    });
  }

  /* ------------------------------------------------------- category_view -- */
  if (window.PK_CATEGORY) {
    track('category_view', { category: window.PK_CATEGORY, page: pagePath });
  }

  /* -------------------------------------------------------- mobile menu -- */
  /* ------------------------------------------------------- header search -- */
  // The panel hangs below the header rather than growing it, so opening it
  // never shifts --header-h out from under the site's sticky offsets.
  var searchToggle = document.getElementById('search-toggle');
  var searchPanel = document.getElementById('hdr-search');
  if (searchToggle && searchPanel) {
    searchToggle.addEventListener('click', function () {
      var open = searchPanel.hidden;
      searchPanel.hidden = !open;
      searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) searchPanel.querySelector('input').focus();
    });
    searchPanel.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      searchPanel.hidden = true;
      searchToggle.setAttribute('aria-expanded', 'false');
      searchToggle.focus();
    });
    // Clicking away closes it; a search box left hanging open over the page
    // reads as a bug.
    document.addEventListener('click', function (ev) {
      if (searchPanel.hidden) return;
      if (searchPanel.contains(ev.target) || searchToggle.contains(ev.target)) return;
      searchPanel.hidden = true;
      searchToggle.setAttribute('aria-expanded', 'false');
    });
  }

  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('mobile-menu');

  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // Close on navigation or Escape.
    menu.addEventListener('click', function (ev) {
      if (ev.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });
    // Reset when resizing up to the desktop breakpoint.
    var mq = window.matchMedia('(min-width: 900px)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(
      function () {
        if (mq.matches) setMenu(false);
      },
    );
  }

  /* ------------------------------------------------------ header shadow -- */
  var header = document.getElementById('site-header');
  if (header) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle('is-scrolled', window.scrollY > 4);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------- compare columns -- */
  // Let a visitor drop products they are not interested in. Columns are keyed
  // by index on both the header cell and every body cell.
  var compareToggles = document.querySelectorAll('[data-compare-toggle]');
  if (compareToggles.length) {
    var applyCompare = function (col, on) {
      var cells = document.querySelectorAll('[data-compare-col="' + col + '"]');
      for (var i = 0; i < cells.length; i++) {
        cells[i].classList.toggle('is-hidden', !on);
      }
    };
    compareToggles.forEach(function (input) {
      input.addEventListener('change', function () {
        var col = input.getAttribute('data-compare-toggle');
        applyCompare(col, input.checked);
        track('compare_toggle', {
          column: col,
          shown: input.checked,
          product: (window.PK_PRODUCT || {}).name || '',
        });
      });
    });
    if (window.PK_PRODUCT) {
      track('compare_view', {
        product: window.PK_PRODUCT.name,
        category: window.PK_PRODUCT.category,
        compared: compareToggles.length + 1,
      });
    }
  }

  /* ------------------------------------------------- product gallery -- */
  var thumbs = document.querySelectorAll('.pd-thumb');
  var mainImg = document.getElementById('pd-main-image');
  if (thumbs.length && mainImg) {
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        mainImg.src = btn.getAttribute('data-full');
        thumbs.forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
      });
    });
  }
})();
