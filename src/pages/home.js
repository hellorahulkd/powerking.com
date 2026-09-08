import { siteConfig } from '../config/site.config.js';
import { esc } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { productCard, whatsappButton } from '../templates/components.js';

/**
 * Hero carousel of featured products.
 *
 * Built on native CSS scroll-snap rather than a JS-driven track: it swipes
 * with a thumb on a phone, keyboard-scrolls, and still works with JavaScript
 * off — the arrows, dots and auto-advance are enhancements layered on top.
 */
function heroSlider(featured) {
  const slides = featured
    .map((p, i) => {
      const url = `/products/${p.slug}/`;
      const specs = [p.packSize, p.sku && `SKU ${p.sku}`]
        .filter(Boolean)
        .map((x) => `<li>${esc(x)}</li>`)
        .join('');
      return `<article class="slide" id="slide-${i}"
       role="group" aria-roledescription="slide"
       aria-label="${i + 1} of ${featured.length}: ${esc(p.name)}">
    <div class="slide__inner container">
      <div class="slide__copy">
        <p class="slide__eyebrow">${esc(p.brand)} · ${esc(p.category)}</p>
        <h2 class="slide__title"><a href="${esc(url)}">${esc(p.name)}</a></h2>
        ${specs ? `<ul class="slide__specs">${specs}</ul>` : ''}
        <p class="slide__price">Contact us for wholesale pricing</p>
        <div class="slide__actions">
          <a class="btn btn--primary btn--lg" href="${esc(url)}">View Product</a>
          ${whatsappButton({
            location: 'hero_slider',
            product: p,
            opensList: true,
            // Short, because on a phone this button shares a row with "View
            // Product" and the longer label wrapped onto two lines.
            label: 'Enquire',
            size: 'lg',
          })}
        </div>
      </div>
      <div class="slide__media">
        <img src="${esc(p.image)}" alt="${esc(p.name)} — ${esc(p.brand)}"
             width="600" height="600"
             loading="${i === 0 ? 'eager' : 'lazy'}"
             ${i === 0 ? 'fetchpriority="high"' : ''} decoding="async">
      </div>
    </div>
  </article>`;
    })
    .join('');

  const dots = featured
    .map(
      (p, i) =>
        `<button type="button" class="slider__dot${i === 0 ? ' is-active' : ''}"
       data-slide-to="${i}" aria-label="Show ${esc(p.name)}"
       aria-current="${i === 0 ? 'true' : 'false'}"></button>`,
    )
    .join('');

  return `<section class="hero-slider" id="hero-slider"
   aria-roledescription="carousel" aria-label="Featured products">
  <h1 class="sr-only">PowerKing Nepal — Electronics Wholesale &amp; Supply</h1>
  <div class="hero-slider__track" id="hero-track" tabindex="0"
       aria-live="polite" aria-label="Featured products, scrollable">
    ${slides}
  </div>
  <button type="button" class="slider__arrow slider__arrow--prev" data-slide-prev
          aria-controls="hero-track" aria-label="Previous product">
    <span aria-hidden="true">‹</span>
  </button>
  <button type="button" class="slider__arrow slider__arrow--next" data-slide-next
          aria-controls="hero-track" aria-label="Next product">
    <span aria-hidden="true">›</span>
  </button>
  <div class="slider__controls">
    <div class="slider__dots">${dots}</div>
    <button type="button" class="slider__pause" id="slider-pause"
            aria-label="Pause automatic slideshow">Pause</button>
  </div>
</section>`;
}

/**
 * Who this is, in three lines. It closes the page rather than opening it, so
 * it carries one link out to the catalogue — the closing call to action
 * directly below already offers WhatsApp, and four stacked buttons in a row
 * is not a choice, it is noise.
 */
function intro() {
  return `<section class="intro">
  <div class="container intro__inner">
    <div>
      <p class="eyebrow">Electronics Wholesale · Nepal</p>
      <h2 class="intro__title">Supplied by the carton to shops across Nepal</h2>
      <p class="intro__lead">
        Speakers, earbuds, headphones, chargers, data cables, multiplugs and
        mobile accessories. Browse the catalogue, then message us on WhatsApp
        for trade pricing, stock and minimum order quantities.
      </p>
    </div>
    <div class="intro__actions">
      <a class="btn btn--primary" href="/products/">
        <span>Explore Products</span><span class="btn__arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </div>
</section>`;
}

/**
 * Search, as one strip at the very top of the page.
 *
 * It was a full section — eyebrow, a two-line heading, a big field — which
 * cost most of a screen before a visitor saw a single product. Everything a
 * buyer needs is the box and a way into the most-stocked brands, so it is one
 * row above the hero now.
 *
 * A plain GET form, so it works with JavaScript off: the catalogue reads ?q=
 * on load and filters before anything else runs. The shortcuts are counted
 * from the catalogue, so they cannot go stale as the range changes.
 */
function searchStrip(products) {
  const counts = new Map();
  for (const p of products) {
    if (!p.brand || p.brand.startsWith('[')) continue;
    counts.set(p.brand, (counts.get(p.brand) || 0) + 1);
  }
  const popular = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([brand]) => brand);

  const chips = popular
    .map(
      (term) => `<a class="hsearch__chip" href="/products/?q=${encodeURIComponent(term)}">${esc(term)}</a>`,
    )
    .join('');

  return `<div class="hsearch">
  <div class="container hsearch__inner">
    <form class="hsearch__form" role="search" action="/products/" method="get">
      <label class="sr-only" for="home-search">Search products by name, brand, category or SKU</label>
      <input class="hsearch__input" id="home-search" name="q" type="search"
             placeholder="Search speakers, chargers, trimmers or a model number…"
             autocomplete="off" enterkeyhint="search">
      <button class="btn btn--primary hsearch__go" type="submit">Search</button>
    </form>
    ${popular.length ? `<p class="hsearch__popular">
      <span class="hsearch__popular-label">Most stocked</span>${chips}
    </p>` : ''}
  </div>
</div>`;
}

/**
 * The category grid. Categories holding nothing are left out: a tile reading
 * "0 products" is a dead end for a buyer, and the category still has its own
 * page for anyone who reaches it another way. Add a product in /admin/ and the
 * tile comes back on the next build.
 */
/**
 * Categories as a row of round photographs, scrolled sideways.
 *
 * This was a two-up grid of text tiles: six categories meant three rows and
 * about 870px on a phone — most of a screen spent on six words and six
 * arrows, before a single product appeared. A row of thumbnails does the same
 * job in a fifth of the height, and a picture of what is in a category says
 * more than its name does.
 *
 * The thumbnail is the first product in that category. Nothing is invented or
 * commissioned: it is a photograph the shop already uploaded, of something
 * actually in there.
 */
function categorySection(allCategories, countsByCategory, products) {
  const categories = allCategories.filter((c) => (countsByCategory[c.name] || 0) > 0);
  if (!categories.length) return '';

  const faceOf = (name) => {
    const first = products.find((p) => p.category === name && p.image);
    return first ? first.image : '';
  };

  return `<section class="section section--top section--tight" id="categories">
  <div class="container">
    <div class="section__head section__head--tight">
      <div>
        <p class="eyebrow">Browse Our Catalogue</p>
        <h2 class="section__title">Shop by category</h2>
      </div>
      <a class="link-arrow" href="/products/">All products <span aria-hidden="true">→</span></a>
    </div>
    <ul class="cat-row">
      ${categories
        .map((c) => {
          const n = countsByCategory[c.name] || 0;
          const face = faceOf(c.name);
          return `<li>
        <a class="cat-face" href="/products/${esc(c.slug)}/"
           data-track-category="${esc(c.name)}">
          <span class="cat-face__shot">${
            face
              ? `<img src="${esc(face)}" alt="" width="200" height="200" loading="lazy" decoding="async">`
              : ''
          }</span>
          <span class="cat-face__name">${esc(c.name)}</span>
          <span class="cat-face__count">${n} ${n === 1 ? 'item' : 'items'}</span>
        </a>
      </li>`;
        })
        .join('')}
    </ul>
  </div>
</section>`;
}

function moreSection(rest) {
  if (!rest.length) return '';
  return `<section class="section section--alt">
  <div class="container">
    <div class="section__head">
      <div>
        <p class="eyebrow">The Range</p>
        <h2 class="section__title">More from the catalogue</h2>
      </div>
      <a class="link-arrow" href="/products/">View all products <span aria-hidden="true">→</span></a>
    </div>
    <div class="grid grid--cards">
      ${rest.map((p) => productCard(p, { location: 'home_more' })).join('')}
    </div>
    <div class="section__foot">
      <a class="btn btn--primary btn--lg" href="/products/">
        <span>View All Products</span><span class="btn__arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </div>
</section>`;
}

/**
 * The shop's own clips, at the bottom of the home page.
 *
 * Cards that link out, not embeds. An embedded TikTok or YouTube player loads
 * a third-party script into every visit to the home page, tracks whoever
 * scrolls past it, and costs more to load than the rest of this site put
 * together. A link costs nothing and goes to the same video.
 *
 * Renders nothing at all while site.config.js has no videos in it — an empty
 * "Our videos" heading is worse than no heading.
 */
function videoSection() {
  const videos = (siteConfig.videos || []).filter((v) => v && v.url);
  if (!videos.length) return '';

  return `<section class="section section--tight" id="videos">
  <div class="container">
    <div class="section__head section__head--tight">
      <div>
        <p class="eyebrow">From our channel</p>
        <h2 class="section__title section__title--sm">Trending videos</h2>
      </div>
    </div>
    <ul class="vids">
      ${videos
        .map(
          (v) => `<li>
        <a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">
          <span class="vid__shot">${
            v.poster
              ? `<img src="${esc(v.poster)}" alt="" loading="lazy" decoding="async">`
              : ''
          }<span class="vid__play" aria-hidden="true"></span></span>
          ${v.caption ? `<span class="vid__caption">${esc(v.caption)}</span>` : ''}
        </a>
      </li>`,
        )
        .join('')}
    </ul>
  </div>
</section>`;
}

function ctaSection() {
  return `<section class="cta">
  <div class="container cta__inner">
    <div>
      <h2 class="cta__title">Need wholesale pricing?</h2>
      <p class="cta__body">
        Send us a message with the products you need. We will reply with trade
        pricing, current availability and minimum order quantities.
      </p>
    </div>
    <div class="cta__actions">
      ${whatsappButton({ location: 'home_cta', label: 'Enquire on WhatsApp', size: 'lg' })}
      <a class="btn btn--outline btn--lg" href="/contact/">Contact details</a>
    </div>
  </div>
</section>`;
}

export function homePage({ products, categories, countsByCategory }) {
  const featured = products.filter((p) => p.featured).slice(0, 8);
  const featuredIds = new Set(featured.map((p) => p.id));
  const rest = products.filter((p) => !featuredIds.has(p.id));
  const body = [
    searchStrip(products),
    heroSlider(featured),
    categorySection(categories, countsByCategory, products),
    moreSection(rest),
    // The "who we are" band is background, not what a buyer came for. It sits
    // after the products now, above the closing call to action.
    videoSection(),
    intro(),
    ctaSection(),
  ].join('\n');

  return layout({
    title: siteConfig.businessName,
    description:
      'PowerKing Nepal is a wholesale distribution and supply business in Nepal. Browse our product catalogue and enquire on WhatsApp for wholesale pricing, availability and minimum order quantities.',
    path: '/',
    activeNav: 'home',
    bodyClass: 'page-home',
    body,
    scripts: `<script src="/assets/slider.js" defer></script>`,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteConfig.businessName,
        url: siteConfig.domain,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteConfig.domain}/products/?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  });
}

export default homePage;
