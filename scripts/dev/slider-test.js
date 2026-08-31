import { launch, newPage } from './cdp.js';
import { products } from '../../src/data/products.js';

const BASE = 'http://localhost:4321';
let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const { proc, port } = await launch();

// --- desktop behaviour ------------------------------------------------------
{
  const page = await newPage(port);
  await page.setViewport(1280, 800, false);
  await page.goto(`${BASE}/`);
  await page.eval(`await document.fonts.ready; return 1;`);

  const n = await page.eval(`return document.querySelectorAll('#hero-track .slide').length;`);
  check('carousel renders every featured product', n === 8, `got ${n}`);

  const arrows = await page.eval(`
    const a = document.querySelector('[data-slide-prev]');
    return { exists: !!a, visible: a && getComputedStyle(a).display !== 'none' };
  `);
  check('arrows are shown at desktop width', arrows.visible === true);

  const nextRes = await page.eval(`
    const t = document.getElementById('hero-track');
    const before = t.scrollLeft;
    document.querySelector('[data-slide-next]').click();
    await new Promise(r => setTimeout(r, 700));
    return { before, after: t.scrollLeft };
  `);
  check('next arrow advances the track', nextRes.after > nextRes.before, JSON.stringify(nextRes));

  const dotRes = await page.eval(`
    const t = document.getElementById('hero-track');
    document.querySelectorAll('[data-slide-to]')[4].click();
    await new Promise(r => setTimeout(r, 800));
    const active = [...document.querySelectorAll('[data-slide-to]')].findIndex(d => d.classList.contains('is-active'));
    return { scroll: t.scrollLeft, active };
  `);
  check('dots jump to their slide and mark themselves current', dotRes.active === 4, JSON.stringify(dotRes));

  const kb = await page.eval(`
    const t = document.getElementById('hero-track');
    t.focus();
    const before = t.scrollLeft;
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    return { before, after: t.scrollLeft, focusable: document.activeElement === t };
  `);
  check('track is focusable', kb.focusable === true);
  check('left arrow key moves back', kb.after < kb.before, JSON.stringify(kb));

  const pauseRes = await page.eval(`
    const b = document.getElementById('slider-pause');
    const first = b.textContent.trim();
    b.click();
    const second = b.textContent.trim();
    return { first, second, label: b.getAttribute('aria-label') };
  `);
  check('pause control toggles its own label', pauseRes.first !== pauseRes.second, JSON.stringify(pauseRes));

  const a11y = await page.eval(`
    const s = document.getElementById('hero-slider');
    return {
      roledesc: s.getAttribute('aria-roledescription'),
      labelled: !!s.getAttribute('aria-label'),
      slideLabels: [...s.querySelectorAll('.slide')].every(x => x.getAttribute('aria-label')),
      h1: document.querySelectorAll('h1').length,
      h1Text: (document.querySelector('h1') || {}).textContent || '',
    };
  `);
  check('carousel exposes a carousel role description', a11y.roledesc === 'carousel');
  check('every slide is labelled for screen readers', a11y.slideLabels === true);
  check('page still has exactly one h1 naming the business',
    a11y.h1 === 1 && /PowerKing Nepal/.test(a11y.h1Text), JSON.stringify(a11y));

  // Whichever product leads the carousel, its CTA must carry that product —
  // not a hard-coded name, which only tracked whatever the data happened to be.
  const firstFeatured = products.filter((x) => x.featured)[0];
  const wa = await page.eval(`
    const l = document.querySelector('.slide [data-wa-location="hero_slider"]');
    return { href: l && l.getAttribute('href'), product: l && l.getAttribute('data-wa-product') };
  `);
  check('slide WhatsApp CTA is per-product',
    /wa\.me\/9779863215831/.test(wa.href || '')
      && wa.product === firstFeatured.name
      && decodeURIComponent(wa.href || '').includes(firstFeatured.name),
    JSON.stringify(wa));

  await page.close();
}

// --- autoplay ---------------------------------------------------------------
{
  const page = await newPage(port);
  await page.setViewport(1280, 800, false);
  await page.goto(`${BASE}/`);
  const auto = await page.eval(`
    const t = document.getElementById('hero-track');
    t.scrollLeft = 0;
    const before = t.scrollLeft;
    await new Promise(r => setTimeout(r, 7200));
    return { before, after: t.scrollLeft };
  `);
  check('autoplay advances on its own', auto.after > auto.before, JSON.stringify(auto));
  await page.close();
}

// --- reduced motion ---------------------------------------------------------
{
  const page = await newPage(port);
  await page.setViewport(1280, 800, false);
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await page.goto(`${BASE}/`);
  const rm = await page.eval(`
    const t = document.getElementById('hero-track');
    t.scrollLeft = 0;
    const before = t.scrollLeft;
    await new Promise(r => setTimeout(r, 7200));
    return { before, after: t.scrollLeft, pauseHidden: document.getElementById('slider-pause').hidden };
  `);
  check('reduced motion suppresses autoplay entirely', rm.after === rm.before, JSON.stringify(rm));
  await page.close();
}

// --- no JavaScript ----------------------------------------------------------
{
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  const slideCount = (html.match(/class="slide"/g) || []).length;
  check('all slides are in the served HTML without JS', slideCount === 8, `found ${slideCount}`);
  check('first slide image is eager, others lazy',
    /loading="eager"/.test(html) && (html.match(/loading="lazy"/g) || []).length >= 7);
}

console.log('\n' + '-'.repeat(56));
console.log(fails.length ? `  ${pass} passed, ${fails.length} FAILED` : `  All ${pass} carousel checks passed`);
fails.forEach((f) => console.log(`  ✗ ${f}`));
proc.kill();
