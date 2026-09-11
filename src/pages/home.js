import { siteConfig } from '../config/site.config.js';
import { esc, formatPrice } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { productCard, whatsappButton } from '../templates/components.js';
import { sortProducts } from './catalogue.js';

/**
 * Hero carousel of featured products.
 *
 * Built on native CSS scroll-snap rather than a JS-driven track: it swipes
 * with a thumb on a phone, keyboard-scrolls, and still works with JavaScript
 * off — the arrows, dots and auto-advance are enhancements layered on top.
 */
/** The carousel's price line. Every price on the site is a wholesale rate, so
 *  the slide says the rate rather than inviting a request for one. */
function slidePrice(p) {
  // The loose piece rate, same as every card. The carton rate is also a
  // per-piece number, so showing it here without room to say so would read as
  // the same thing at a different price.
  const piece = formatPrice(p.pricePiece);
  if (!piece) return '<p class="slide__price">Price on enquiry</p>';
  return `<p class="slide__price">${esc(piece)} <span>per piece, wholesale</span></p>`;
}

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
        ${slidePrice(p)}
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
        at wholesale rates, by the carton or in loose pieces. Send us an
        enquiry to confirm stock and arrange delivery.
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

/** How many of a category's products a home-page band shows. */
const BAND_SIZE = 8;

/**
 * The catalogue on the home page, one band per category.
 *
 * It used to be a single "More from the catalogue" grid with every category
 * mixed into it, so finding speakers meant scrolling back up to the category
 * row, choosing one, and landing on another page. Now a reader scrolls
 * straight down through Speakers, then the next range, and the next — each
 * band headed, counted, and linked to its own full page.
 *
 * Bands run largest range first: the categories the shop actually stocks in
 * depth lead, and the two- and three-product ones close. Within a band the
 * order is the catalogue's own — cheapest first — so a band and the page it
 * links to open on the same products rather than disagreeing.
 */
function categoryBands(categories, countsByCategory, products) {
  const bands = categories
    .map((c) => ({ c, all: products.filter((p) => p.category === c.name) }))
    .filter((b) => b.all.length > 0)
    .sort((a, b) => b.all.length - a.all.length);
  if (!bands.length) return '';

  return bands
    .map(({ c, all }, i) => {
      const shown = sortProducts(all).slice(0, BAND_SIZE);
      const total = countsByCategory[c.name] || all.length;
      const more = total > shown.length;
      // Alternating grounds, so one band reads as ending and the next as
      // beginning without a rule drawn between every one of them.
      const alt = i % 2 === 1 ? ' section--alt' : '';
      return `<section class="section section--tight${alt}" id="cat-${esc(c.slug)}">
  <div class="container">
    <div class="section__head section__head--tight">
      <div>
        <p class="eyebrow">${esc(total)} ${total === 1 ? 'product' : 'products'}</p>
        <h2 class="section__title section__title--sm">${esc(c.name)}</h2>
      </div>
      <a class="link-arrow" href="/products/${esc(c.slug)}/"
         data-track-category="${esc(c.name)}">${
        more ? `All ${esc(total)}` : 'Open'
      } <span aria-hidden="true">→</span></a>
    </div>
    <div class="grid grid--cards">
      ${shown.map((p) => productCard(p, { location: 'home_category', showCategory: false })).join('')}
    </div>
  </div>
</section>`;
    })
    .join('\n');
}

/** The one link out, after every band. */
function allProductsFoot() {
  return `<section class="section section--tight">
  <div class="container section__foot">
    <a class="btn btn--primary btn--lg" href="/products/">
      <span>View All Products</span><span class="btn__arrow" aria-hidden="true">→</span>
    </a>
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

/**
 * Three marks drifting behind the closing call to action, on wide screens
 * only. A phone has no room to spare and no attention to spend on decoration;
 * a laptop has both, and the band was a flat rectangle of colour.
 *
 * Each drifts on its own slow cycle so they never line up into a pattern, and
 * the whole thing stops dead for anyone who has asked their system for less
 * motion.
 */
function ctaMarks() {
  const marks = ['carton', 'truck', 'speaker'];
  return `<div class="cta-marks" aria-hidden="true">
    ${marks.map((m, i) => `<span class="cta-mark cta-mark--${i + 1}">${icon(m, { size: 40 })}</span>`).join('')}
  </div>`;
}

function ctaSection() {
  return `<section class="cta">
  ${ctaMarks()}
  <div class="container cta__inner">
    <div>
      <h2 class="cta__title">Ready to order?</h2>
      <p class="cta__body">
        Every price on this site is the wholesale rate for a single piece.
        Carton rates are different — put what you need on an enquiry and ask,
        and we will confirm the carton rate, stock and how it reaches you.
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
  const body = [
    searchStrip(products),
    heroSlider(featured),
    categorySection(categories, countsByCategory, products),
    categoryBands(categories, countsByCategory, products),
    allProductsFoot(),
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
