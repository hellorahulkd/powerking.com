import { siteConfig } from '../config/site.config.js';
import { esc, whatsappUrl, hasWhatsApp } from '../lib/html.js';
import { icon } from './icons.js';
import { categories } from '../data/categories.js';

const NAV = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'products', label: 'Products', href: '/products/' },
  { key: 'categories', label: 'Categories', href: '/products/#categories' },
  { key: 'about', label: 'About', href: '/about/' },
  { key: 'contact', label: 'Contact', href: '/contact/' },
];

export function logo() {
  // The mark: a gradient tile carrying a power ring and lightning bolt —
  // reads as "electronics / power" instantly, and stays legible at 32px.
  return `<a class="logo" href="/" aria-label="${esc(siteConfig.businessName)} — home">
  <span class="logo__mark" aria-hidden="true">
    <svg viewBox="0 0 40 40" width="38" height="38">
      <defs>
        <linearGradient id="pkMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#00C2FF"/>
          <stop offset="1" stop-color="#7C5CFF"/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#pkMark)"/>
      <circle cx="20" cy="20.5" r="11.5" fill="none" stroke="#fff"
              stroke-opacity=".38" stroke-width="2.4"
              stroke-linecap="round" stroke-dasharray="47 25"
              transform="rotate(-115 20 20.5)"/>
      <path d="M23.4 7.6 14 22.2h5.1l-2.3 10.4 9.6-14.9h-5.2l2.2-10.1Z"
            fill="#fff"/>
    </svg>
  </span>
  <span class="logo__text">
    <span class="logo__name">PowerKing<span class="logo__np"> Nepal</span></span>
    <span class="logo__tag">${esc(siteConfig.tagline)}</span>
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
