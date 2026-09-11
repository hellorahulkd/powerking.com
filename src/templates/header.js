import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from './icons.js';
import { lockup } from './brand.js';
import { categories } from '../data/categories.js';

/**
 * There is no Categories entry, and there should not be one.
 *
 * It pointed at /products/#categories — the same page as Products, scrolled
 * to a strip of category links. Two words in the nav for one destination, and
 * once that strip gave way to the catalogue's own category chips the anchor
 * had nothing left to scroll to. Categories are a filter on the catalogue,
 * not a place: the chip row on /products/ is the control, and the footer
 * still links each category's own page for anyone arriving from a search.
 */
const NAV = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'products', label: 'Products', href: '/products/' },
  { key: 'about', label: 'About', href: '/about/' },
  { key: 'contact', label: 'Contact', href: '/contact/' },
];

export function logo() {
  // "Nothing else — no tagline, no rule, no seal." The plate holds the grille
  // and the word; the previous subline is gone, and the brand system's own
  // tagline placements are all specified at 24px and up, which a header lockup
  // is not.
  return `<a class="logo" href="/" aria-label="${esc(siteConfig.businessName)} — home">
  ${lockup({ height: 20 })}
</a>`;
}

export function header(active = '') {
  const links = NAV.map(
    (n) =>
      `<li><a href="${n.href}"${
        n.key === active ? ' aria-current="page"' : ''
      }>${esc(n.label)}</a></li>`,
  ).join('');

  const mobileCats = categories
    .map(
      (c) =>
        `<li><a href="/products/${c.slug}/">${esc(c.name)}</a></li>`,
    )
    .join('');

  return `<header class="site-header" id="site-header">
  <div class="container site-header__inner">
    ${logo()}
    <nav class="nav-desktop" aria-label="Primary">
      <ul>${links}</ul>
    </nav>
    <div class="site-header__actions">
      <button class="hdr-search__toggle" type="button" id="search-toggle"
              aria-expanded="false" aria-controls="hdr-search">
        ${icon('search', { size: 20 })}<span class="sr-only">Search products</span>
      </button>
      <a class="btn btn--whatsapp btn--sm nav-wa"
         href="${esc(whatsappUrl('general'))}"
         ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
         data-wa-track data-wa-location="header">
        ${icon('whatsapp', { size: 18 })}<span>WhatsApp Us</span>
      </a>
      <button class="nav-toggle" type="button"
              aria-expanded="false" aria-controls="mobile-menu"
              aria-label="Open menu">
        <span class="nav-toggle__open">Menu</span>
        <span class="nav-toggle__close">Close</span>
      </button>
    </div>
  </div>

  <div class="hdr-search" id="hdr-search" hidden>
    <form class="container hdr-search__form" role="search" action="/products/" method="get">
      <label class="sr-only" for="header-search">Search products by name, brand, category or SKU</label>
      <input class="hdr-search__input" id="header-search" name="q" type="search"
             placeholder="Search products, brands or model number…"
             autocomplete="off" enterkeyhint="search">
      <button class="btn btn--primary btn--sm" type="submit">Search</button>
    </form>
  </div>

  <div class="mobile-menu" id="mobile-menu" hidden>
    <nav class="container" aria-label="Mobile">
      <ul class="mobile-menu__main">${links}</ul>
      <p class="mobile-menu__heading">Browse by category</p>
      <ul class="mobile-menu__cats">${mobileCats}</ul>
      <a class="btn btn--whatsapp btn--block"
         href="${esc(whatsappUrl('general'))}"
         ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
         data-wa-track data-wa-location="mobile_menu">
        ${icon('whatsapp', { size: 20 })}<span>Enquire on WhatsApp</span>
      </a>
    </nav>
  </div>
  <div class="stripe" aria-hidden="true"></div>
</header>`;
}

export default header;
