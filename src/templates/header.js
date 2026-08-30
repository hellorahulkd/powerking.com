import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from './icons.js';
import { markTile, glitchWordmark } from './brand.js';
import { categories } from '../data/categories.js';

const NAV = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'products', label: 'Products', href: '/products/' },
  { key: 'categories', label: 'Categories', href: '/products/#categories' },
  { key: 'about', label: 'About', href: '/about/' },
  { key: 'contact', label: 'Contact', href: '/contact/' },
];

export function logo() {
  // The glitched wordmark is the logo. At header size the displacement is
  // scaled back — full amplitude below ~20px reads as blur, not as an effect.
  // "PowerKing Nepal" stays the accessible and indexed name.
  return `<a class="logo" href="/" aria-label="${esc(siteConfig.businessName)} — home">
  <span class="logo__mark">${markTile({ size: 34, bg: 'var(--volt)', fg: '#000', radius: 0.18 })}</span>
  <span class="logo__text">
    <span class="logo__word">${glitchWordmark({ height: 26, amount: 0.5, id: 'hw' })}</span>
    <span class="logo__tag"><span class="logo__tag-name">PowerKing Nepal</span><span
      class="logo__tag-more"> · ${esc(siteConfig.tagline)}</span></span>
  </span>
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
        `<li><a href="/products/${c.slug}/">${icon(c.icon, { size: 18 })}<span>${esc(
          c.name,
        )}</span></a></li>`,
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
        <span class="nav-toggle__open">${icon('menu', { size: 24 })}</span>
        <span class="nav-toggle__close">${icon('close', { size: 24 })}</span>
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
