import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { productCard, sampleNotice, whatsappButton } from '../templates/components.js';

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
      const specs = [p.packSize, p.unit, p.sku && `SKU ${p.sku}`]
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
            label: 'Enquire on WhatsApp',
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

/** Compact band under the carousel: who this is, and the two primary actions. */
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
      <a class="btn btn--primary btn--lg" href="/products/">
        <span>Explore Products</span><span class="btn__arrow" aria-hidden="true">→</span>
      </a>
      <a class="btn btn--outline btn--lg"
         href="${esc(whatsappUrl('hero'))}"
         ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
         data-wa-track data-wa-location="intro">
        <span>Contact Us on WhatsApp</span>
      </a>
    </div>
  </div>
</section>`;
}

function categorySection(categories, countsByCategory) {
  return `<section class="section section--top" id="categories">
  <div class="container">
    <div class="section__head">
      <div>
        <p class="eyebrow">Browse Our Catalogue</p>
        <h2 class="section__title">Shop by category</h2>
      </div>
      <a class="link-arrow" href="/products/">All products <span aria-hidden="true">→</span></a>
    </div>
    <ul class="cat-grid">
      ${categories
        .map((c) => {
          const n = countsByCategory[c.name] || 0;
          return `<li>
        <a class="cat-tile" href="/products/${esc(c.slug)}/"
           data-track-category="${esc(c.name)}">
          <span class="cat-tile__name">${esc(c.name)}</span>
          <span class="cat-tile__count">${n} ${n === 1 ? 'product' : 'products'}</span>
          <span class="cat-tile__go" aria-hidden="true">→</span>
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
    sampleNotice(),
    heroSlider(featured),
    categorySection(categories, countsByCategory),
    intro(),
    moreSection(rest),
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
