import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from './icons.js';
import { glitchWordmark } from './brand.js';
import { categories } from '../data/categories.js';

const NAV = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'products', label: 'Products', href: '/products/' },
  { key: 'categories', label: 'Categories', href: '/products/#categories' },
  { key: 'about', label: 'About', href: '/about/' },
  { key: 'contact', label: 'Contact', href: '/contact/' },
];

export function logo() {
  // The subline is set to the exact width of the wordmark's glyphs and
  // justified to fill it, so the two lines align on both edges. The glitch
  // svg carries padding for the displaced slices, so the visible mark is
  // narrower than its box — these figures back that padding out.
  const H = 26;                    // rendered wordmark height
  const GLYPHS = 448;              // wordmark width in em units
  const PAD = 30;                  // viewBox padding either side
  const EM = 128;
  const inner = Math.round((H * GLYPHS) / EM);
  const offset = Math.round((H * PAD) / EM);

  return `<a class="logo" href="/" aria-label="${esc(siteConfig.businessName)} — home">
  <span class="logo__word">${glitchWordmark({ height: H, amount: 0.5, id: 'hw' })}</span>
  <span class="logo__tag" style="width:${inner}px;margin-left:${offset}px">PowerKing Nepal</span>
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
</header>`;
}

export default header;
