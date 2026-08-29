import { siteConfig } from '../config/site.config.js';
import {
  esc, absoluteUrl, whatsappUrl, hasWhatsApp, orPlaceholder, addressLine, telHref,
} from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { pageHead, breadcrumbSchema } from '../templates/components.js';

/** One contact detail. Renders a visible placeholder if not configured yet. */
function detail({ iconName, label, value, href, placeholder, trackAs }) {
  const { text, isPlaceholder } = orPlaceholder(value, placeholder);
  const inner = `
    <span class="detail__icon" aria-hidden="true">${icon(iconName, { size: 20 })}</span>
    <span class="detail__body">
      <span class="detail__label">${esc(label)}</span>
      <span class="detail__value">${esc(text)}</span>
    </span>`;
  // Only a genuinely missing value is styled as a placeholder. A real value
  // with nothing to link to (the business name, for instance) is still real.
  if (isPlaceholder) {
    return `<li class="detail is-placeholder">${inner}</li>`;
  }
  if (!href) {
    return `<li class="detail">${inner}</li>`;
  }
  return `<li class="detail"><a href="${esc(href)}"${
    trackAs ? ` data-track-contact="${esc(trackAs)}"` : ''
  }>${inner}</a></li>`;
}

function hours() {
  const list = siteConfig.openingHours || [];
  if (!list.length) return '';
  return `<div class="hours">
    <h2 class="hours__title">${icon('clock', { size: 18 })}<span>Opening hours</span></h2>
    <dl>
      ${list
        .map(
          (h) =>
            `<div><dt>${esc(h.days)}</dt><dd${
              String(h.hours).startsWith('[ADD') ? ' class="is-placeholder"' : ''
            }>${esc(h.hours)}</dd></div>`,
        )
        .join('')}
    </dl>
  </div>`;
}

function mapSection() {
  if (!siteConfig.googleMapsEmbedUrl) {
    return `<!-- Google Maps: add siteConfig.googleMapsEmbedUrl in
         src/config/site.config.js and this section appears automatically. -->`;
  }
  return `<section class="section section--tight">
  <div class="container">
    <h2 class="section__title section__title--sm">Find us</h2>
    <div class="map-embed">
      <iframe src="${esc(siteConfig.googleMapsEmbedUrl)}"
              title="Map showing the location of PowerKing Nepal"
              loading="lazy" referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen></iframe>
    </div>
  </div>
</section>`;
}

export function contactPage() {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Contact', href: '/contact/' },
  ];

  const waHref = whatsappUrl('contact');
  const phoneHref = telHref(siteConfig.phone);

  const body = `
${pageHead({
  eyebrow: 'Contact',
  title: 'Contact PowerKing Nepal',
  lead: 'Wholesale enquiries are answered fastest on WhatsApp. Send us the products you are interested in and we will reply with pricing, availability and minimum order quantities.',
  crumbs,
})}

<section class="section section--top-0">
  <div class="container contact__grid">

    <div class="contact__primary">
      <div class="contact__cta-card">
        <span class="contact__cta-icon" aria-hidden="true">${icon('whatsapp', { size: 32 })}</span>
        <h2>Chat with us on WhatsApp</h2>
        <p>The quickest way to reach us. Opens WhatsApp with a message ready to send.</p>
        <a class="btn btn--whatsapp btn--lg btn--block" href="${esc(waHref)}"
           ${hasWhatsApp() ? 'target="_blank" rel="noopener"' : ''}
           data-wa-track data-wa-location="contact_page">
          ${icon('whatsapp', { size: 20 })}<span>Chat with us on WhatsApp</span>
        </a>
        ${
          hasWhatsApp()
            ? ''
            : `<p class="contact__warn">WhatsApp number not configured yet — add <code>whatsappNumber</code> in <code>src/config/site.config.js</code>.</p>`
        }
        ${
          phoneHref
            ? `<a class="btn btn--outline btn--lg btn--block" href="${esc(phoneHref)}"
                  data-track-contact="call">${icon('phone', { size: 20 })}<span>Call us</span></a>`
            : `<p class="contact__warn">Phone number not added yet — set <code>phone</code> in <code>src/config/site.config.js</code> to show a “Call us” button.</p>`
        }
      </div>
    </div>

    <div class="contact__details">
      <h2 class="section__title section__title--sm">Business details</h2>
      <ul class="details">
        ${detail({
          iconName: 'bolt',
          label: 'Business name',
          value: siteConfig.businessName,
          placeholder: 'BUSINESS NAME',
        })}
        ${detail({
          iconName: 'phone',
          label: 'Phone',
          value: siteConfig.phone,
          href: phoneHref,
          placeholder: 'BUSINESS PHONE NUMBER',
          trackAs: 'call',
        })}
        ${
          siteConfig.phoneSecondary
            ? detail({
                iconName: 'phone',
                label: 'Alternate phone',
                value: siteConfig.phoneSecondary,
                href: telHref(siteConfig.phoneSecondary),
                placeholder: 'ALTERNATE PHONE',
                trackAs: 'call',
              })
            : ''
        }
        ${detail({
          iconName: 'whatsapp',
          label: 'WhatsApp',
          value: hasWhatsApp() ? `+${siteConfig.whatsappNumber}` : '',
          href: waHref,
          placeholder: 'WHATSAPP NUMBER',
        })}
        ${detail({
          iconName: 'mail',
          label: 'Email',
          value: siteConfig.email,
          href: siteConfig.email ? `mailto:${siteConfig.email}` : '',
          placeholder: 'BUSINESS EMAIL',
          trackAs: 'email',
        })}
        ${detail({
          iconName: 'pin',
          label: 'Address',
          value: addressLine(),
          href: siteConfig.googleMapsLinkUrl,
          placeholder: 'BUSINESS ADDRESS',
        })}
      </ul>
      ${hours()}
    </div>
  </div>
</section>

${mapSection()}

<section class="cta cta--slim">
  <div class="container cta__inner">
    <div>
      <h2 class="cta__title">Ready to place a wholesale order?</h2>
      <p class="cta__body">Browse the catalogue and send us your list.</p>
    </div>
    <div class="cta__actions">
      <a class="btn btn--primary btn--lg" href="/products/">Browse products</a>
    </div>
  </div>
</section>`;

  return layout({
    title: 'Contact Us',
    description:
      'Contact PowerKing Nepal for wholesale supply. Message us on WhatsApp or call for wholesale pricing, product availability and minimum order quantities.',
    path: '/contact/',
    activeNav: 'contact',
    bodyClass: 'page-contact',
    body,
    schema: [breadcrumbSchema(crumbs, absoluteUrl)],
  });
}

export default contactPage;
