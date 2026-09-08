import { siteConfig, whatsappMessages, ENQUIRY_MAX } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp, formatPrice } from '../lib/html.js';
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
  opensList = false,
} = {}) {
  const href = product
    ? whatsappUrl('product', { product: product.name })
    : whatsappUrl('general');
  const cls = ['btn', 'btn--whatsapp', size && `btn--${size}`, block && 'btn--block']
    .filter(Boolean)
    .join(' ');
  // opensList keeps the href — so it still works without JavaScript — and lets
  // the enquiry list intercept the click to ask how many first.
  const open = opensList
    ? ` data-enq-open${product ? ` ${enqData(product)}` : ''}`
    : '';
  return `<a class="${cls}" href="${esc(href)}" ${waAttrs(location, product)}${open}>
    ${icon('whatsapp', { size: 20 })}<span>${esc(label)}</span>
  </a>`;
}

/**
 * What the enquiry list needs in order to show a product without fetching
 * anything: its identity, its name and its picture. Emitted by every control
 * that can put something on the list, from one place so they cannot drift.
 */
function enqData(product) {
  return `data-enq-slug="${esc(product.slug)}" data-enq-name="${esc(product.name)}"`
    + ` data-enq-image="${esc(product.image)}"`;
}

/**
 * Add-to-enquiry toggle. Carries the product's own name and slug so the
 * enquiry list never has to go digging through the DOM to find out what was
 * added — the same control works on a card and on a product page.
 *
 * Without JavaScript it is not rendered at all: the single-product WhatsApp
 * link beside it already works, and a dead button would be worse than none.
 */
export function enquiryAdd(product, { label = false, pin = false } = {}) {
  // Three buttons do not fit a card's action row, and wrapping them onto a
  // second line made every card in the catalogue taller. On a card the toggle
  // is pinned to the corner opposite the badges instead.
  const cls = label
    ? 'btn btn--ghost btn--lg btn--block enq-add'
    : (pin ? 'enq-add enq-add--pin' : 'btn btn--ghost btn--icon enq-add');
  // A bare "+" told a first-time visitor nothing, so both variants say what
  // they do in words. The pinned one stays small enough for a two-up phone grid.
  const on = label ? 'Add to my enquiry list' : 'Add';
  const off = label ? 'In your enquiry list' : 'Added';
  return `<button type="button" class="${cls}" hidden
    data-enq-add ${enqData(product)}
    aria-pressed="false"
    title="Add to your enquiry list"
    aria-label="Add ${esc(product.name)} to your enquiry list">
    <span class="enq-add__on">${icon('plus', { size: label ? 20 : 15 })}<span class="enq-add__word">${on}</span></span>
    <span class="enq-add__off">${icon('check', { size: label ? 20 : 15 })}<span class="enq-add__word">${off}</span></span>
  </button>`;
}

/**
 * The enquiry list itself: a bar that appears once something is selected, and
 * the panel it opens. Rendered once per page from the layout.
 *
 * Quantities are asked for in cartons or pieces because the shop supplies
 * both, so "20" on its own would have to be chased up on WhatsApp anyway.
 */
export function enquiryList() {
  const { greeting, closing } = whatsappMessages.list;
  return `<div class="enq-bar" id="enq-bar" hidden
     data-greeting="${esc(greeting)}" data-closing="${esc(closing)}"
     data-number="${esc(hasWhatsApp() ? String(siteConfig.whatsappNumber).trim() : '')}"
     data-max="${ENQUIRY_MAX}">
  <p class="enq-bar__count" id="enq-count" role="status" aria-live="polite"></p>
  <div class="enq-bar__actions">
    <button type="button" class="btn btn--ghost btn--sm" id="enq-clear">Clear</button>
    <button type="button" class="btn btn--primary btn--sm" id="enq-open">Set quantities &amp; send</button>
  </div>
</div>

<dialog class="enq" id="enq-dialog" aria-labelledby="enq-title">
  <form method="dialog" class="enq__head">
    <h2 class="enq__title" id="enq-title">Your enquiry</h2>
    <button class="enq__close" value="close" aria-label="Close">${icon('close', { size: 20 })}</button>
  </form>
  <p class="enq__lead">
    Put as many products as you like on this list, say how many of each, and
    send it all in one WhatsApp message. ${esc(siteConfig.supplyTerms)}
  </p>
  <ul class="enq__list" id="enq-list"></ul>

  <div class="enq__empty" id="enq-empty" hidden>
    <p class="enq__empty-title">Nothing on your list yet</p>
    <p class="enq__empty-body">
      Browse the catalogue and press <strong>Add</strong> on anything you want
      a price for. You can put several products on one enquiry.
    </p>
    <a class="btn btn--primary" href="/products/">Browse products</a>
    <p class="enq__empty-or">
      Or <a href="${esc(whatsappUrl('general'))}"
        ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
        data-wa-track data-wa-location="enquiry_empty">just send us a message</a>
      if you would rather ask about something else.
    </p>
  </div>

  <p class="enq__more" id="enq-more">
    <a href="/products/">Add more products →</a>
  </p>
  <p class="enq__note" id="enq-note" role="status" aria-live="polite"></p>
  <div class="enq__foot">
    <a class="btn btn--whatsapp btn--lg btn--block" id="enq-send"
       data-wa-track data-wa-location="enquiry_list"
       ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''} href="#">
      ${icon('whatsapp', { size: 20 })}<span>Send on WhatsApp</span>
    </a>
    <p class="enq__fine">
      Opens WhatsApp with the list and quantities already written out. Nothing
      is ordered until we reply with pricing.
    </p>
  </div>
</dialog>`;
}

/** Floating WhatsApp bubble. Hidden while the mobile menu is open (see app.js). */
/**
 * The bar pinned to the bottom of a phone screen.
 *
 * On a phone the header's navigation is behind a Menu button, so getting from
 * a product back to the catalogue is two taps and a scroll. This is the same
 * three destinations always within thumb reach, which is what every shopping
 * app on the same phone does.
 *
 * Hidden above 900px, where the header's own navigation is already on screen.
 * The Enquire tab is a button, not a link: it opens the enquiry panel, and it
 * carries the running count so the list is never out of sight.
 */
export function tabBar() {
  return `<nav class="tabbar" aria-label="Quick navigation">
  <a class="tabbar__item" href="/">
    ${icon('home', { size: 22 })}<span class="tabbar__label">Home</span>
  </a>
  <a class="tabbar__item" href="/products/">
    ${icon('grid', { size: 22 })}<span class="tabbar__label">Categories</span>
  </a>
  <button type="button" class="tabbar__item" id="tab-enquire" data-enq-open
          aria-label="Open your enquiry list">
    <span class="tabbar__mark">
      ${icon('whatsapp', { size: 22 })}
      <!-- The count is decoration for a screen reader: the button's own label
           carries it in words, and read out here it became "1 Enquire". -->
      <span class="tabbar__badge" id="tab-enq-count" aria-hidden="true" hidden>0</span>
    </span>
    <span class="tabbar__label">Enquire</span>
  </button>
</nav>`;
}

export function floatingWhatsApp() {
  // Still a real wa.me link, so it works with JavaScript off. With JavaScript
  // the enquiry list intercepts it and opens the panel, where a visitor can
  // give quantities and add more products before anything is sent.
  return `<a class="wa-float" href="${esc(whatsappUrl('general'))}"
   ${waAttrs('floating_button', null)}
   data-enq-open
   aria-label="Enquire on WhatsApp">
  ${icon('whatsapp', { size: 28 })}
  <span class="wa-float__label">Enquire</span>
</a>`;
}

/** "SAMPLE" / "Unavailable" badges. */
function badges(product) {
  const out = [];
  if (product.available === false)
    out.push('<span class="badge badge--out">Currently unavailable</span>');
  return out.length ? `<div class="card__badges">${out.join('')}</div>` : '';
}

/**
 * The card shows the carton rate, since that is what a wholesale buyer scans
 * a listing for, and marks it as the carton rate so it is not mistaken for a
 * per-piece price. A product with no carton rate falls back to the piece rate
 * rather than showing nothing, and one with neither says so plainly.
 */
function cardPrice(product) {
  const carton = formatPrice(product.priceCarton);
  const piece = formatPrice(product.pricePiece);
  if (carton) {
    return `<p class="card__price">${esc(carton)}<span class="card__price-unit">per carton</span></p>`;
  }
  if (piece) {
    return `<p class="card__price">${esc(piece)}<span class="card__price-unit">per piece</span></p>`;
  }
  return '<p class="card__price card__price--ask">Price on enquiry</p>';
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
  // Punctuation becomes whitespace so "PK-60" is findable as "pk" or "60",
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
  ${enquiryAdd(product, { pin: true })}
  <div class="card__body">
    <p class="card__eyebrow">${esc(product.category)}</p>
    <h3 class="card__title"><a href="${esc(url)}">${esc(product.name)}</a></h3>
    ${product.packSize ? `<p class="card__meta">${esc(product.packSize)}</p>` : ''}
    ${cardPrice(product)}
  </div>
  <div class="card__actions">
    <a class="btn btn--ghost btn--icon" href="${esc(url)}"
       aria-label="View ${esc(product.name)}" title="View product">
      ${icon('arrow', { size: 19 })}
    </a>
    <a class="btn btn--whatsapp btn--icon"
       href="${esc(whatsappUrl('product', { product: product.name }))}"
       ${waAttrs(location, product)}
       data-enq-open ${enqData(product)}
       aria-label="Enquire about ${esc(product.name)} on WhatsApp"
       title="Enquire — asks how many first">
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
