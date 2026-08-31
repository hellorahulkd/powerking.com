import { esc, jsonForScript, absoluteUrl } from '../lib/html.js';
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
      <input id="product-search" name="q" type="search" autocomplete="off"
             placeholder="Search products, brands or SKU…"
             aria-describedby="search-status">
      <button type="button" class="toolbar__clear" id="search-clear" hidden aria-label="Clear search">Clear</button>
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
 * How many cards are built into the page's render tree at once.
 * Everything past this is parsed but not rendered — see productGrid().
 */
export const PAGE_SIZE = 48;

/**
 * The product grid.
 *
 * Beyond PAGE_SIZE products the remainder is emitted inside an inert
 * <template>. The browser still parses those cards, but it builds no render
 * tree, no style and no layout for them, which is where the time actually
 * goes: at 2000 products this cut first render from 5.5s to 1.7s on a
 * 4x-throttled phone over slow 4G, with the page byte-for-byte the same size.
 *
 * The cards in the template are the same cards the server rendered — the
 * script clones them into place, it never re-renders them — so there is no
 * second card renderer in JavaScript to drift out of step with this one.
 *
 * Without JS the tail is unreachable here, so `more` links to a real
 * paginated page. That is also the path crawlers follow.
 *
 * @param {object[]} products  every product in this listing, in order
 * @param {object} o { location, page, basePath }
 */
export function productGrid(products, { location = 'catalogue', page = 1, basePath = '/products/' } = {}) {
  const paged = products.length > PAGE_SIZE;
  const start = (page - 1) * PAGE_SIZE;
  const live = paged ? products.slice(start, start + PAGE_SIZE) : products;

  // Only the first page carries the tail: it is what client-side search reads,
  // and search is only reachable with JS, which never leaves page one.
  const tail = paged && page === 1 ? products.slice(PAGE_SIZE) : [];

  const card = (p, i) => productCard(p, { eager: page === 1 && i < 4, location });

  const grid = `<div class="grid grid--cards" id="product-grid">${live.map(card).join('')}</div>`;

  const template = tail.length
    ? `<template id="catalogue-tail">${tail.map((p) => card(p, 99)).join('')}</template>`
    : '';

  const totalPages = Math.ceil(products.length / PAGE_SIZE);
  const nextHref = page < totalPages ? `${basePath}page/${page + 1}/` : '';

  // Only page one expands in place — it is the only page holding the tail.
  // Later pages are navigated with the pager instead.
  const more = nextHref && page === 1
    ? `<div class="grid-more">
    <a class="btn btn--ghost" id="load-more" href="${esc(nextHref)}"
       data-total="${products.length}">Show more products</a>
  </div>`
    : '';

  return grid + template + more;
}

/**
 * Prev/next links for readers and crawlers without JS. Hidden when JS takes
 * over the listing, because then there is only ever one page.
 */
function pager(page, totalPages, basePath) {
  if (totalPages < 2) return '';
  const href = (n) => (n === 1 ? basePath : `${basePath}page/${n}/`);
  const prev = page > 1
    ? `<a class="pager__link" rel="prev" href="${esc(href(page - 1))}">← Previous</a>`
    : '<span class="pager__link is-disabled" aria-hidden="true">← Previous</span>';
  const next = page < totalPages
    ? `<a class="pager__link" rel="next" href="${esc(href(page + 1))}">Next →</a>`
    : '<span class="pager__link is-disabled" aria-hidden="true">Next →</span>';
  return `<nav class="pager" id="pager" aria-label="Catalogue pages">
    ${prev}
    <span class="pager__count">Page ${page} of ${totalPages}</span>
    ${next}
  </nav>`;
}

/**
 * The full catalogue index at /products/.
 */
export function cataloguePage({ products, categories, brands, page = 1 }) {
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const path = page === 1 ? '/products/' : `/products/page/${page}/`;
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products/' },
  ];

  const listing = productGrid(products, {
    location: 'catalogue', page, basePath: '/products/',
  });

  const catGrid = `<section class="section section--tight" id="categories">
  <div class="container">
    <h2 class="section__title section__title--sm">Categories</h2>
    <ul class="cat-strip">
      ${categories
        .map(
          (c) => `<li><a class="cat-strip__item" href="/products/${esc(c.slug)}/"
             data-track-category="${esc(c.name)}">${esc(c.name)}</a></li>`,
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
    ${listing}
    <div id="no-results" hidden>
      ${emptyState({
        title: 'No products found',
        message: 'Try searching for another product, brand or category.',
        action: `<button type="button" class="btn btn--ghost btn--sm" id="reset-filters">Clear filters</button>`,
      })}
    </div>
    ${pager(page, totalPages, '/products/')}
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

  const suffix = page > 1 ? ` — Page ${page}` : '';

  return layout({
    title: `Wholesale Product Catalogue${suffix}`,
    description:
      `Browse the PowerKing Nepal wholesale catalogue — speakers, headphones, earbuds, chargers, data cables, multiplugs and mobile accessories. Search by product, brand or SKU and enquire on WhatsApp for pricing.${page > 1 ? ` Page ${page} of ${totalPages}.` : ''}`,
    path,
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
export function categoryPage({ category, products, categories, brands, page = 1 }) {
  const base = `/products/${category.slug}/`;
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const path = page === 1 ? base : `${base}page/${page}/`;
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products/' },
    { label: category.name, href: `/products/${category.slug}/` },
  ];

  const grid = products.length
    ? productGrid(products, { location: 'category', page, basePath: base })
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
      data-track-category="${esc(c.name)}">${esc(c.name)}</a></li>`,
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
    ${pager(page, totalPages, base)}
  </div>
</section>
<section class="section section--alt section--tight">
  <div class="container">
    <h2 class="section__title section__title--sm">Other categories</h2>
    <ul class="cat-strip">${otherCats}</ul>
  </div>
</section>`;

  const suffix = page > 1 ? ` — Page ${page}` : '';

  return layout({
    title: `${category.name} — Wholesale Supply${suffix}`,
    description: `${category.description} Browse PowerKing Nepal's wholesale ${category.name.toLowerCase()} range and enquire on WhatsApp for trade pricing, availability and minimum order quantities.${page > 1 ? ` Page ${page} of ${totalPages}.` : ''}`,
    path,
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
        url: absoluteUrl(path),
      },
    ],
    scripts: products.length
      ? `<script>window.PK_CATEGORY=${jsonForScript(category.name)};</script>
<script src="/assets/catalogue.js" defer></script>`
      : '',
  });
}
