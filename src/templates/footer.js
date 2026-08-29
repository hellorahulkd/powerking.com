import { siteConfig } from '../config/site.config.js';
import {
  esc, whatsappUrl, hasWhatsApp, orPlaceholder, addressLine, telHref,
} from '../lib/html.js';
import { icon } from './icons.js';
import { categories } from '../data/categories.js';

const SOCIAL_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

function socialLinks() {
  const entries = Object.entries(siteConfig.social || {}).filter(([, url]) => url);
  if (!entries.length) return '';
  return `<div class="footer__social">
    ${entries
      .map(
        ([key, url]) =>
          `<a href="${esc(url)}" target="_blank" rel="noopener me"
              aria-label="${esc(SOCIAL_LABELS[key] || key)}"
              data-track-social="${esc(key)}">${icon(key, { size: 20 })}</a>`,
      )
      .join('')}
  </div>`;
}

/** A contact row that degrades to a visible placeholder when unconfigured. */
function contactRow(iconName, value, label, href) {
  const { text, isPlaceholder } = orPlaceholder(value, label);
  const inner = `${icon(iconName, { size: 18 })}<span>${esc(text)}</span>`;
  if (isPlaceholder || !href) {
    return `<li class="${isPlaceholder ? 'is-placeholder' : ''}">${inner}</li>`;
  }
  return `<li><a href="${esc(href)}">${inner}</a></li>`;
}

export function footer() {
  const year = new Date().getFullYear();
  const addr = addressLine();

  const catLinks = categories
    .slice(0, 6)
    .map((c) => `<li><a href="/products/${c.slug}/">${esc(c.name)}</a></li>`)
    .join('');

  return `<footer class="site-footer">
  <div class="container footer__grid">

    <div class="footer__brand">
      <p class="footer__name">PowerKing Nepal</p>
      <p class="footer__tagline">${esc(siteConfig.tagline)}</p>
      <p class="footer__blurb">${esc(siteConfig.shortDescription)}</p>
      ${socialLinks()}
    </div>

    <nav class="footer__col" aria-label="Quick links">
      <h2 class="footer__heading">Quick Links</h2>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/products/">Products</a></li>
        <li><a href="/about/">About Us</a></li>
        <li><a href="/contact/">Contact</a></li>
        ${siteConfig.features.showBrandsPage ? '<li><a href="/brands/">Brands</a></li>' : ''}
      </ul>
    </nav>

    <nav class="footer__col" aria-label="Categories">
      <h2 class="footer__heading">Categories</h2>
      <ul>${catLinks}</ul>
    </nav>

    <div class="footer__col footer__contact">
      <h2 class="footer__heading">Contact</h2>
      <ul>
        ${contactRow('phone', siteConfig.phone, 'BUSINESS PHONE NUMBER', telHref(siteConfig.phone))}
        ${contactRow('mail', siteConfig.email, 'BUSINESS EMAIL', siteConfig.email ? `mailto:${siteConfig.email}` : '')}
        ${contactRow('pin', addr, 'BUSINESS ADDRESS', siteConfig.googleMapsLinkUrl)}
      </ul>
      <a class="btn btn--whatsapp btn--sm"
         href="${esc(whatsappUrl('general'))}"
         ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
         data-wa-track data-wa-location="footer">
        ${icon('whatsapp', { size: 18 })}<span>WhatsApp Us</span>
      </a>
    </div>
  </div>

  <div class="container footer__bar">
    <p>&copy; ${year} PowerKing Nepal. All rights reserved.</p>
    <ul>
      <li><a href="/privacy/">Privacy Policy</a></li>
      <li><a href="/contact/">Contact</a></li>
    </ul>
  </div>
</footer>`;
}

export default footer;
