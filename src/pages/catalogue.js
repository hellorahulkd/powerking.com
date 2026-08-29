import { esc, jsonForScript, absoluteUrl } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import {
  productCard, emptyState, sampleNotice, whatsappButton,
  pageHead, breadcrumbSchema,
} from '../templates/components.js';

/**
 * Search/filter toolbar. Rendered as a real <form> so it degrades gracefully:
 * without JS it simply submits ?q= and the page still lists every product.
 */
function toolbar(categories, brands, activeCategory) {
  const catChips = [
    `<button type="button" class="chip${
      activeCategory ? '' : ' is-active'
    }" data-filter-cat="" aria-pressed="${activeCategory ? 'false' : 'true'}">All</button>`,
    ...categories.map(
      (c) => `<button type="button" class="chip${
        activeCategory === c.name ? ' is-active' : ''
      }" data-filter-cat="${esc(c.name)}" aria-pressed="${
        activeCategory === c.name ? 'true' : 'false'
      }">${esc(c.name)}</button>`,
    ),
  ].join('');

  const brandOptions = brands
    .map((b) => `<option value="${esc(b)}">${esc(b)}</option>`)
    .join('');

  return `<div class="toolbar" id="toolbar">
  <div class="container">
    <form class="toolbar__search" role="search" id="search-form" action="/products/" method="get">
      <label class="sr-only" for="product-search">Search products by name, brand, category or SKU</label>
      <span class="toolbar__search-icon" aria-hidden="true">${icon('search', { size: 20 })}</span>
      <input id="product-search" name="q" type="search" autocomplete="off"
             placeholder="Search products, brands or SKU…"
             aria-describedby="search-status">
      <button type="button" class="toolbar__clear" id="search-clear" hidden aria-label="Clear search">
        ${icon('close', { size: 18 })}
      </button>
      <noscript><button class="btn btn--primary btn--sm" type="submit">Search</button></noscript>
    </form>

    <div class="toolbar__filters">
      <div class="chips" role="group" aria-label="Filter by category">${catChips}</div>
      <div class="toolbar__brand">
        <label class="sr-only" for="brand-filter">Filter by brand</label>
        <select id="brand-filter">
          <option value="">All brands</option>
          ${brandOptions}
        </select>
      </div>
    </div>

    <p class="toolbar__status" id="search-status" role="status" aria-live="polite"></p>
  </div>
</div>`;
}

/**
 * The full catalogue index at /products/.
 */
export function cataloguePage({ products, categories, brands }) {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products/' },
  ];

  const cards = products
    .map((p, i) => productCard(p, { eager: i < 4, location: 'catalogue' }))
    .join('');

  const catGrid = `<section class="section section--tight" id="categories">
  <div class="container">
    <h2 class="section__title section__title--sm">Categories</h2>
    <ul class="cat-strip">
      ${categories
        .map(
          (c) => `<li><a class="cat-strip__item" href="/products/${esc(c.slug)}/"
            style="--cat: ${esc(c.color || 'var(--accent)')}"
            data-track-category="${esc(c.name)}">
        ${icon(c.icon, { size: 20 })}<span>${esc(c.name)}</span></a></li>`,
        )
        .join('')}
    </ul>
  </div>
</section>`;

  const body = `
${sampleNotice()}
${pageHead({
  eyebrow: 'Product Catalogue',
  title: 'Our Products',
  lead: 'Browse the full PowerKing Nepal range. Prices are quoted on enquiry — message us on WhatsApp with the products you need.',
  crumbs,
})}
${catGrid}
${toolbar(categories, brands, null)}
<section class="section section--top-0">
  <div class="container">
    <div class="grid grid--cards" id="product-grid">${cards}</div>
    <div id="no-results" hidden>
      ${emptyState({
        title: 'No products found',
        message: 'Try searching for another product, brand or category.',
        action: `<button type="button" class="btn btn--ghost btn--sm" id="reset-filters">Clear filters</button>`,
      })}
    </div>
  </div>
</section>
<section class="cta cta--slim">
  <div class="container cta__inner">
    <div>
      <h2 class="cta__title">Can’t find what you need?</h2>
      <p class="cta__body">Tell us the product and we will confirm whether we can supply it.</p>
    </div>
    <div class="cta__actions">
      ${whatsappButton({ location: 'catalogue_cta', label: 'Ask on WhatsApp', size: 'lg' })}
    </div>
  </div>
</section>`;

  return layout({
    title: 'Wholesale Product Catalogue',
    description:
      'Browse the PowerKing Nepal wholesale catalogue — beverages, snacks, confectionery, grocery, personal care and household lines. Search by product, brand or SKU and enquire on WhatsApp for pricing.',
    path: '/products/',
    activeNav: 'products',
    bodyClass: 'page-catalogue',
    body,
    schema: [breadcrumbSchema(crumbs, absoluteUrl)],
    scripts: `<script src="/assets/catalogue.js" defer></script>`,
  });
}

/**
 * A single category page, e.g. /products/beverages/.
 * Pre-filtered server-side so it is indexable on its own.
 */
export function categoryPage({ category, products, categories, brands }) {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products/' },
    { label: category.name, href: `/products/${category.slug}/` },
  ];

  const grid = products.length
    ? `<div class="grid grid--cards" id="product-grid">${products
        .map((p, i) => productCard(p, { eager: i < 4, location: 'category' }))
        .join('')}</div>`
    : emptyState({
        title: `No products in ${category.name} yet`,
        message:
          'We are adding products to this category. Message us on WhatsApp and we will tell you what is available.',
        action: whatsappButton({
          location: 'empty_category',
          label: 'Ask on WhatsApp',
          size: 'sm',
        }),
      });

  const otherCats = categories
    .filter((c) => c.slug !== category.slug)
    .map(
      (c) => `<li><a class="cat-strip__item" href="/products/${esc(c.slug)}/"
      style="--cat: ${esc(c.color || 'var(--accent)')}"
      data-track-category="${esc(c.name)}">${icon(c.icon, { size: 20 })}<span>${esc(
        c.name,
      )}</span></a></li>`,
    )
    .join('');

  const body = `
${sampleNotice()}
${pageHead({
  eyebrow: 'Category',
  title: category.name,
  lead: category.description,
  crumbs,
})}
${products.length ? toolbar(categories, brands, category.name) : ''}
<section class="section section--top-0">
  <div class="container">
    ${grid}
    <div id="no-results" hidden>
      ${emptyState({
        title: 'No products found',
        message: 'Try another search term, or browse a different category.',
        action: `<button type="button" class="btn btn--ghost btn--sm" id="reset-filters">Clear filters</button>`,
      })}
    </div>
  </div>
</section>
<section class="section section--alt section--tight">
  <div class="container">
    <h2 class="section__title section__title--sm">Other categories</h2>
    <ul class="cat-strip">${otherCats}</ul>
  </div>
</section>`;

  return layout({
    title: `${category.name} — Wholesale Supply`,
    description: `${category.description} Browse PowerKing Nepal's wholesale ${category.name.toLowerCase()} range and enquire on WhatsApp for trade pricing, availability and minimum order quantities.`,
    path: `/products/${category.slug}/`,
    activeNav: 'products',
    bodyClass: 'page-category',
    body,
    schema: [
      breadcrumbSchema(crumbs, absoluteUrl),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${category.name} — PowerKing Nepal`,
        description: category.description,
        url: absoluteUrl(`/products/${category.slug}/`),
      },
    ],
    scripts: products.length
      ? `<script>window.PK_CATEGORY=${jsonForScript(category.name)};</script>
<script src="/assets/catalogue.js" defer></script>`
      : '',
  });
}
