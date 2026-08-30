import { siteConfig } from '../config/site.config.js';
import { esc, absoluteUrl } from '../lib/html.js';
import { layout } from '../templates/layout.js';
import {
  pageHead, whatsappButton, breadcrumbSchema, slugifyCategory, productCard,
} from '../templates/components.js';

/* ---------------------------------------------------------------- Brands -- */

export function brandsPage({ products }) {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Brands', href: '/brands/' },
  ];

  const byBrand = new Map();
  for (const p of products) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
    byBrand.get(p.brand).push(p);
  }
  const brands = [...byBrand.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const sections = brands
    .map(([brand, items]) => {
      const cats = [...new Set(items.map((p) => p.category))].join(', ');
      return `<section class="brand-block" id="${esc(slugifyCategory(brand))}">
    <div class="brand-block__head">
      <div>
        <h2>${esc(brand)}</h2>
        <p>${items.length} ${items.length === 1 ? 'product' : 'products'} · ${esc(cats)}</p>
      </div>
      ${whatsappButton({
        location: 'brand_page',
        product: { name: `the ${brand} range`, id: `brand-${slugifyCategory(brand)}` },
        label: 'Enquire',
        size: 'sm',
      })}
    </div>
    <div class="grid grid--cards">
      ${items.map((p) => productCard(p, { location: 'brand_page' })).join('')}
    </div>
  </section>`;
    })
    .join('');

  const body = `
${pageHead({
  eyebrow: 'Brands',
  title: 'Brands We Supply',
  lead: 'The brands currently listed in our catalogue. As we add products, the brands they belong to appear here automatically.',
  crumbs,
})}
<section class="section section--top-0">
  <div class="container">
    <nav class="brand-jump" aria-label="Jump to brand">
      ${brands
        .map(
          ([brand]) =>
            `<a class="chip" href="#${esc(slugifyCategory(brand))}">${esc(brand)}</a>`,
        )
        .join('')}
    </nav>
    ${sections}
  </div>
</section>`;

  return layout({
    title: 'Brands We Supply',
    description:
      'Brands available through PowerKing Nepal wholesale supply. Browse by brand and enquire on WhatsApp for trade pricing and minimum order quantities.',
    path: '/brands/',
    activeNav: 'products',
    bodyClass: 'page-brands',
    body,
    schema: [breadcrumbSchema(crumbs, absoluteUrl)],
  });
}

/* --------------------------------------------------------------- Privacy -- */

export function privacyPage() {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Privacy Policy', href: '/privacy/' },
  ];
  const hasGA = Boolean(String(siteConfig.googleAnalyticsId || '').trim());
  const contactLine = siteConfig.email
    ? `email us at <a href="mailto:${esc(siteConfig.email)}">${esc(siteConfig.email)}</a>`
    : 'contact us using the details on our <a href="/contact/">contact page</a>';

  const body = `
${pageHead({ eyebrow: 'Legal', title: 'Privacy Policy', crumbs })}
<section class="section section--top-0">
  <div class="container">
    <div class="prose prose--narrow">
      <p class="prose__updated">Last updated: ${new Date().toISOString().slice(0, 10)}</p>

      <h2>Overview</h2>
      <p>
        This website is an online product catalogue for PowerKing Nepal. It has
        no customer accounts, no shopping cart and no online payments. We do not
        ask you to create a login or submit personal details to browse it.
      </p>

      <h2>Information we collect</h2>
      <p>
        We do not operate any form or database that collects your personal
        information through this website. If you contact us via WhatsApp, phone
        or email, we will see the details you choose to send us — such as your
        name, phone number and what you are enquiring about — and we use those
        only to respond to your enquiry.
      </p>

      <h2>Analytics</h2>
      ${
        hasGA
          ? `<p>
        We use Google Analytics 4 to understand how many people visit the site
        and which products are viewed. This records anonymous usage information
        such as pages viewed, approximate location by country or city, device
        type and referring website. We also record when a WhatsApp button is
        clicked and which product it related to. We do not use analytics to
        identify individual visitors, and we do not collect names, phone numbers
        or email addresses through analytics.
      </p>
      <p>
        Google Analytics is provided by Google. You can read Google's practices
        at <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">policies.google.com/privacy</a>.
        You may block analytics using your browser settings or an ad blocker;
        the website works normally either way.
      </p>`
          : `<p>
        Analytics are not currently enabled on this website, so no visitor
        measurement data is collected. If we enable Google Analytics 4 in
        future, this page will be updated to describe it.
      </p>`
      }

      <h2>Cookies</h2>
      <p>
        ${
          hasGA
            ? 'The only cookies this site may set are those used by Google Analytics for visitor measurement. We do not use advertising or tracking cookies.'
            : 'This site does not set any cookies of its own.'
        }
      </p>

      <h2>WhatsApp</h2>
      <p>
        WhatsApp buttons on this site open WhatsApp with a pre-written message.
        Nothing is sent until you choose to send it. Once you message us, the
        conversation is governed by WhatsApp's own privacy terms.
      </p>

      <h2>Third-party links</h2>
      <p>
        This site links to WhatsApp and may link to social media profiles. We
        are not responsible for the privacy practices of those services.
      </p>

      <h2>Contact</h2>
      <p>
        For any question about this policy or about information you have sent
        us, please ${contactLine}.
      </p>
    </div>
  </div>
</section>`;

  return layout({
    title: 'Privacy Policy',
    description:
      'How PowerKing Nepal handles information on its online product catalogue. No accounts, no online payments, and no personal data collected through the website.',
    path: '/privacy/',
    bodyClass: 'page-privacy',
    body,
    schema: [breadcrumbSchema(crumbs, absoluteUrl)],
  });
}

/* ------------------------------------------------------------------- 404 -- */

export function notFoundPage() {
  const body = `
<section class="section notfound">
  <div class="container notfound__inner">
    <p class="notfound__code" aria-hidden="true">404</p>
    <h1>Oops! We couldn’t find that page.</h1>
    <p class="notfound__lead">
      The page you were looking for may have been moved, or the link may be
      out of date. Here is where to go next.
    </p>
    <div class="notfound__actions">
      <a class="btn btn--primary btn--lg" href="/">Back to Home</a>
      <a class="btn btn--outline btn--lg" href="/products/">Browse Products</a>
      ${whatsappButton({ location: '404_page', label: 'WhatsApp Us', size: 'lg' })}
    </div>
    <p class="notfound__hint">
      Looking for a specific product? Try the
      <a href="/products/">catalogue search</a>.
    </p>
  </div>
</section>`;

  return layout({
    title: 'Page Not Found',
    description: 'The page you were looking for could not be found on the PowerKing Nepal website.',
    path: '/404.html',
    bodyClass: 'page-404',
    body,
    noindex: true,
  });
}
