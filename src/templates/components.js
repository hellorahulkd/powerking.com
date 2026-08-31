import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from './icons.js';

/** Attributes shared by every WhatsApp link so analytics can track them. */
function waAttrs(location, product) {
  const parts = [
    'data-wa-track',
    `data-wa-location="${esc(location)}"`,
  ];
  if (product) {
    parts.push(`data-wa-product="${esc(product.name)}"`);
    parts.push(`data-wa-product-id="${esc(product.id)}"`);
  }
  if (hasWhatsApp()) parts.push('target="_blank" rel="noopener"');
  return parts.join(' ');
}

/**
 * Primary WhatsApp call-to-action.
 * @param {object} o { location, product, label, variant, block }
 */
export function whatsappButton({
  location = 'page',
  product = null,
  label = 'Enquire on WhatsApp',
  size = '',
  block = false,
} = {}) {
  const href = product
    ? whatsappUrl('product', { product: product.name })
    : whatsappUrl('general');
  const cls = ['btn', 'btn--whatsapp', size && `btn--${size}`, block && 'btn--block']
    .filter(Boolean)
    .join(' ');
  return `<a class="${cls}" href="${esc(href)}" ${waAttrs(location, product)}>
    ${icon('whatsapp', { size: 20 })}<span>${esc(label)}</span>
  </a>`;
}

/** Floating WhatsApp bubble. Hidden while the mobile menu is open (see app.js). */
export function floatingWhatsApp() {
  return `<a class="wa-float" href="${esc(whatsappUrl('general'))}"
   ${waAttrs('floating_button', null)}
   aria-label="Enquire on WhatsApp">
  ${icon('whatsapp', { size: 28 })}
  <span class="wa-float__label">Enquire</span>
</a>`;
}

/** "SAMPLE" / "Unavailable" badges. */
function badges(product) {
  const out = [];
  if (product.sample) out.push('<span class="badge badge--sample">Sample</span>');
  if (product.available === false)
    out.push('<span class="badge badge--out">Currently unavailable</span>');
  return out.length ? `<div class="card__badges">${out.join('')}</div>` : '';
}

/**
 * Product card used on the homepage, catalogue and category pages.
 * @param {object} product
 * @param {object} opts { eager } — set eager on the first few cards so the
 *                       largest contentful paint is not lazy-loaded.
 */
export function productCard(product, { eager = false, location = 'product_card' } = {}) {
  // The card carries only what someone needs to decide whether to open it:
  // what it is, what it is called, and how it is packed. Description, SKU and
  // the pricing line all live on the product page.
  const url = `/products/${product.slug}/`;

  // The search haystack is built here, at build time, so filtering at runtime
  // is a handful of string tests per card — fast even on a low-end phone.
  // Punctuation becomes whitespace so "PK-SAMPLE-001" is findable as "sample",
  // and so the runtime can anchor matches to word starts (see catalogue.js).
  const haystack = searchText([
    product.name, product.brand, product.category, product.sku,
    product.packSize, ...(product.tags || []),
  ]);

  return `<article class="card${product.available === false ? ' card--out' : ''}"
  data-product
  data-brand="${esc(product.brand)}"
  data-category="${esc(product.category)}"
  data-search="${esc(haystack)}">
  <div class="card__media">
    <img src="${esc(product.image)}" alt="" width="400" height="400"
         loading="${eager ? 'eager' : 'lazy'}"
         ${eager ? 'fetchpriority="high"' : ''} decoding="async"
         onerror="this.closest('.card__media').classList.add('card__media--fallback');this.remove()">
  </div>
  ${badges(product)}
  <div class="card__body">
    <p class="card__eyebrow">${esc(product.category)}</p>
    <h3 class="card__title"><a href="${esc(url)}">${esc(product.name)}</a></h3>
    ${product.packSize ? `<p class="card__meta">${esc(product.packSize)}</p>` : ''}
  </div>
  <div class="card__actions">
    <a class="btn btn--ghost btn--icon" href="${esc(url)}"
       aria-label="View ${esc(product.name)}" title="View product">
      ${icon('arrow', { size: 19 })}
    </a>
    <a class="btn btn--whatsapp btn--icon"
       href="${esc(whatsappUrl('product', { product: product.name }))}"
       ${waAttrs(location, product)}
       aria-label="Enquire about ${esc(product.name)} on WhatsApp"
       title="Enquire on WhatsApp">
      ${icon('whatsapp', { size: 19 })}
    </a>
  </div>
</article>`;
}

/**
 * Normalise text for searching: lowercase, punctuation to single spaces.
 * The runtime mirror of this lives in src/assets/js/catalogue.js — keep the
 * two in step so the query and the haystack are normalised identically.
 */
export function searchText(parts) {
  return (Array.isArray(parts) ? parts : [parts])
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Local mirror of the category slug rule (kept identical to build.js). */
export function slugifyCategory(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Reusable empty state. */
export function emptyState({
  title = 'No products found',
  message = 'Try searching for another product or category.',
  action = '',
} = {}) {
  return `<div class="empty">
  <p class="empty__title">${esc(title)}</p>
  <p class="empty__msg">${esc(message)}</p>
  ${action}
</div>`;
}

/** Page hero used by the inner pages. */
export function pageHead({ eyebrow = '', title, lead = '', crumbs = [] } = {}) {
  const breadcrumbs = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs
        .map((c, i) =>
          c.href && i < crumbs.length - 1
            ? `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`
            : `<li><span aria-current="page">${esc(c.label)}</span></li>`,
        )
        .join('')}</ol></nav>`
    : '';
  return `<section class="page-head">
  <div class="container">
    ${breadcrumbs}
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="page-head__lead">${esc(lead)}</p>` : ''}
  </div>
</section>`;
}

/** Notice shown while the catalogue still contains sample products. */
export function sampleNotice() {
  if (!siteConfig.features.showSampleDataNotice) return '';
  // The catalogue is now part real, part placeholder, so the banner must not
  // claim everything is a demo — that would make a buyer distrust the real
  // products too. Placeholders carry a "Sample" badge on their own card.
  return `<div class="notice" role="note">
  <div class="container">
    <strong>We are still adding products.</strong> Items marked
    <em>Sample</em> are placeholders used to build the site — everything else
    is a line we supply. Message us on WhatsApp for anything you cannot find.
  </div>
</div>`;
}

/** Breadcrumb JSON-LD. */
export function breadcrumbSchema(crumbs, absolute) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: absolute(c.href),
    })),
  };
}
