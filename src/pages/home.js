import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { productCard, sampleNotice, whatsappButton } from '../templates/components.js';

function hero() {
  return `<section class="hero">
  <div class="hero__bg" aria-hidden="true"></div>
  <div class="container hero__inner">
    <div class="hero__copy">
      <p class="hero__eyebrow">Electronics Wholesale · Nepal</p>
      <h1 class="hero__title">
        PowerKing Nepal
        <span class="hero__title-sub">Electronics Wholesale &amp; Supply</span>
      </h1>
      <p class="hero__lead">
        Speakers, earbuds, headphones, chargers, data cables, multiplugs and
        mobile accessories — supplied by the carton to shops and retailers
        across Nepal. Browse the catalogue, then message us on WhatsApp for
        trade pricing, stock and minimum order quantities.
      </p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="/products/">
          <span>Explore Products</span>${icon('arrow', { size: 20 })}
        </a>
        <a class="btn btn--whatsapp btn--lg"
           href="${esc(whatsappUrl('hero'))}"
           ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
           data-wa-track data-wa-location="hero">
          ${icon('whatsapp', { size: 20 })}<span>Contact Us on WhatsApp</span>
        </a>
      </div>
      <ul class="hero__points">
        <li>${icon('tag', { size: 18 })}<span>Trade pricing on enquiry</span></li>
        <li>${icon('truck', { size: 18 })}<span>Carton &amp; bulk quantities</span></li>
        <li>${icon('whatsapp', { size: 18 })}<span>Fast replies on WhatsApp</span></li>
      </ul>
    </div>
    <div class="hero__visual" aria-hidden="true">
      <img src="/images/hero/hero-electronics.svg" alt="" width="640" height="560"
           fetchpriority="high" decoding="async">
    </div>
  </div>
</section>`;
}

function valueProps() {
  const items = [
    {
      icon: 'truck',
      title: 'Consistent stock',
      body: 'The fast-moving lines — earbuds, cables, chargers — kept available carton after carton.',
    },
    {
      icon: 'tag',
      title: 'Trade pricing',
      body: 'Rates quoted per carton or master box, so you can price your counter with confidence.',
    },
    {
      icon: 'shield',
      title: 'Checked before dispatch',
      body: 'Stock arrives in sealed retail packaging, with any warranty terms confirmed up front.',
    },
    {
      icon: 'handshake',
      title: 'Long-term partners',
      body: 'We would rather be the supplier a shop keeps returning to than a one-off sale.',
    },
  ];
  return `<section class="section section--tight">
  <div class="container">
    <ul class="props">
      ${items
        .map(
          (i) => `<li class="prop">
        <span class="prop__icon" aria-hidden="true">${icon(i.icon, { size: 22 })}</span>
        <h2 class="prop__title">${esc(i.title)}</h2>
        <p class="prop__body">${esc(i.body)}</p>
      </li>`,
        )
        .join('')}
    </ul>
  </div>
</section>`;
}

function categorySection(categories, countsByCategory) {
  return `<section class="section" id="categories">
  <div class="container">
    <div class="section__head">
      <div>
        <p class="eyebrow">Browse Our Catalogue</p>
        <h2 class="section__title">Shop by category</h2>
      </div>
      <a class="link-arrow" href="/products/">All products ${icon('arrow', { size: 18 })}</a>
    </div>
    <ul class="cat-grid">
      ${categories
        .map((c) => {
          const n = countsByCategory[c.name] || 0;
          return `<li>
        <a class="cat-tile" href="/products/${esc(c.slug)}/"
           style="--cat: ${esc(c.color || 'var(--accent)')}"
           data-track-category="${esc(c.name)}">
          <span class="cat-tile__icon" aria-hidden="true">${icon(c.icon, { size: 26 })}</span>
          <span class="cat-tile__name">${esc(c.name)}</span>
          <span class="cat-tile__count">${n} ${n === 1 ? 'product' : 'products'}</span>
        </a>
      </li>`;
        })
        .join('')}
    </ul>
  </div>
</section>`;
}

function featuredSection(featured) {
  if (!featured.length) return '';
  return `<section class="section section--alt">
  <div class="container">
    <div class="section__head">
      <div>
        <p class="eyebrow">Featured Products</p>
        <h2 class="section__title">A selection from our catalogue</h2>
      </div>
      <a class="link-arrow" href="/products/">View all products ${icon('arrow', { size: 18 })}</a>
    </div>
    <div class="grid grid--cards">
      ${featured
        .map((p, i) => productCard(p, { eager: i < 2, location: 'home_featured' }))
        .join('')}
    </div>
    <div class="section__foot">
      <a class="btn btn--primary btn--lg" href="/products/">
        <span>View All Products</span>${icon('arrow', { size: 20 })}
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
  const body = [
    sampleNotice(),
    hero(),
    valueProps(),
    featuredSection(featured),
    categorySection(categories, countsByCategory),
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
