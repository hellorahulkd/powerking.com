/**
 * PowerKing Nepal — hero product carousel.
 * Loaded only on the homepage.
 *
 * The track is a native CSS scroll-snap container, so swiping, keyboard
 * scrolling and no-JS use all work before this file runs. Everything here is
 * an enhancement: arrows, dots, and an auto-advance that stops the moment a
 * visitor shows any interest in the page.
 */
(function () {
  'use strict';

  var slider = document.getElementById('hero-slider');
  var track = document.getElementById('hero-track');
  if (!slider || !track) return;

  var slides = Array.prototype.slice.call(track.querySelectorAll('.slide'));
  if (slides.length < 2) {
    slider.classList.add('is-single');
    return;
  }

  var dots = Array.prototype.slice.call(slider.querySelectorAll('[data-slide-to]'));
  var prev = slider.querySelector('[data-slide-prev]');
  var next = slider.querySelector('[data-slide-next]');
  var pauseBtn = document.getElementById('slider-pause');

  var index = 0;
  var timer = null;
  var INTERVAL = 6000;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Paint the dots for the current index. */
  function paintDots() {
    for (var j = 0; j < dots.length; j++) {
      var active = j === index;
      dots[j].classList.toggle('is-active', active);
      dots[j].setAttribute('aria-current', active ? 'true' : 'false');
    }
  }

  /**
   * Move to a slide. Paints the dots immediately rather than waiting for the
   * scroll handler — that handler short-circuits when the index already
   * matches, so leaving it to do the painting left the dots stale on a
   * direct jump.
   */
  function goTo(i, smooth) {
    index = (i + slides.length) % slides.length;
    paintDots();
    track.scrollTo({
      left: slides[index].offsetLeft - track.offsetLeft,
      behavior: smooth === false || reduceMotion.matches ? 'auto' : 'smooth',
    });
  }

  /* Reflect whichever slide the visitor actually scrolled or swiped to. */
  function syncFromScroll() {
    var mid = track.scrollLeft + track.clientWidth / 2;
    var closest = 0;
    var best = Infinity;
    for (var i = 0; i < slides.length; i++) {
      var centre = slides[i].offsetLeft - track.offsetLeft + slides[i].offsetWidth / 2;
      var d = Math.abs(centre - mid);
      if (d < best) { best = d; closest = i; }
    }
    if (closest === index) return;
    index = closest;
    paintDots();
    if (typeof window.pkTrack === 'function') {
      window.pkTrack('hero_slide_view', {
        slide: index + 1,
        label: slides[index].getAttribute('aria-label') || '',
      });
    }
  }

  var scrollTick = null;
  track.addEventListener(
    'scroll',
    function () {
      window.clearTimeout(scrollTick);
      scrollTick = window.setTimeout(syncFromScroll, 90);
    },
    { passive: true },
  );

  /* ---------------------------------------------------------- autoplay -- */

  function playing() {
    return timer !== null;
  }

  function start() {
    // Never auto-advance for a visitor who has asked for reduced motion.
    if (reduceMotion.matches || playing()) return;
    timer = window.setInterval(function () {
      goTo(index + 1);
    }, INTERVAL);
    if (pauseBtn) {
      pauseBtn.textContent = 'Pause';
      pauseBtn.setAttribute('aria-label', 'Pause automatic slideshow');
    }
  }

  function stop() {
    if (!playing()) return;
    window.clearInterval(timer);
    timer = null;
    if (pauseBtn) {
      pauseBtn.textContent = 'Play';
      pauseBtn.setAttribute('aria-label', 'Resume automatic slideshow');
    }
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      playing() ? stop() : start();
    });
    if (reduceMotion.matches) pauseBtn.hidden = true;
  }

  // Any sign of engagement stops the carousel moving under the visitor.
  slider.addEventListener('mouseenter', stop);
  slider.addEventListener('focusin', stop);
  track.addEventListener('pointerdown', stop);
  track.addEventListener('touchstart', stop, { passive: true });

  // Do not animate while the tab is in the background.
  document.addEventListener('visibilitychange', function () {
    document.hidden ? stop() : start();
  });

  /* ----------------------------------------------------------- controls -- */

  if (prev) prev.addEventListener('click', function () { stop(); goTo(index - 1); });
  if (next) next.addEventListener('click', function () { stop(); goTo(index + 1); });

  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      stop();
      goTo(Number(dot.getAttribute('data-slide-to')));
    });
  });

  track.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft') { stop(); goTo(index - 1); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { stop(); goTo(index + 1); ev.preventDefault(); }
  });

  // Only run the carousel while it is actually on screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) { e.isIntersecting ? start() : stop(); });
      },
      { threshold: 0.35 },
    ).observe(slider);
  } else {
    start();
  }
})();

/**
 * The category bar's endless scroll.
 *
 * Swipe past the last category and the first comes round again; swipe back
 * before the first and the last is there. Done by cloning the row once and
 * wrapping scrollLeft at the seam, so there is no animation to fight and the
 * bar still scrolls at exactly the speed of the thumb pushing it.
 *
 * The clone is made here rather than in the HTML: the served markup lists
 * each category once, so a reader without JavaScript gets a plain scrolling
 * row instead of every category printed twice.
 */
(function () {
  'use strict';

  var row = document.querySelector('[data-catbar-loop]');
  if (!row) return;

  // Nothing to loop through if it all fits — and cloning then would put a
  // second copy of every category on screen at once.
  if (row.scrollWidth <= row.clientWidth + 4) return;

  var originals = Array.prototype.slice.call(row.children);
  var span = row.scrollWidth;

  for (var i = 0; i < originals.length; i++) {
    var copy = originals[i].cloneNode(true);
    // A duplicate of every link would be read out twice and tabbed through
    // twice. The copy is scenery: it exists to be scrolled past.
    copy.setAttribute('aria-hidden', 'true');
    var link = copy.querySelector('a');
    if (link) link.setAttribute('tabindex', '-1');
    row.appendChild(copy);
  }

  // Start on the real list, not the copy.
  row.scrollLeft = 0;

  var ticking = false;
  row.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      // Jumping by exactly one span lands on the identical pill, so the seam
      // is invisible: the row appears to keep going.
      //
      // Both bounds are strict, and the backward wrap lands a pixel short of
      // the seam. Wrapping 0 to exactly `span` put the row on the other
      // boundary, which the next frame wrapped straight back to 0 — the bar
      // sat at the start refusing to move, ping-ponging once per frame.
      if (row.scrollLeft > span) row.scrollLeft -= span;
      else if (row.scrollLeft < 1) row.scrollLeft = span - 1;
    });
  }, { passive: true });

  // The row is wider than it was, so the width to wrap at changes with the
  // window. Re-measured from the originals rather than from scrollWidth,
  // which now includes the clone.
  window.addEventListener('resize', function () {
    var last = originals[originals.length - 1];
    span = last.offsetLeft + last.offsetWidth - originals[0].offsetLeft;
  });
}());
