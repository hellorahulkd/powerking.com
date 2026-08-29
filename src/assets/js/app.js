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
