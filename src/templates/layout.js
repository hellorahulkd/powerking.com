import { siteConfig } from '../config/site.config.js';
import { esc, absoluteUrl, metaDescription, jsonForScript } from '../lib/html.js';
import { header } from './header.js';
import { footer } from './footer.js';
import { floatingWhatsApp } from './components.js';
import { iconSprite } from './icons.js';

/**
 * Google Analytics 4 snippet. Injected only when a measurement ID is set, so
 * an unconfigured site makes zero third-party requests.
 */
function analytics() {
  const id = String(siteConfig.googleAnalyticsId || '').trim();
  if (!id) return '';
  return `
  <script async src="https://www.googletagmanager.com/gtag/js?id=${esc(id)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', ${jsonForScript(id)});
  </script>`;
}

/** Organization structured data — helps Google understand the business. */
function organizationSchema() {
  const a = siteConfig.address || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.businessName,
    url: siteConfig.domain,
    description: siteConfig.shortDescription,
    logo: absoluteUrl('/images/brands/powerking-nepal-logo.svg'),
  };
  if (siteConfig.email) data.email = siteConfig.email;
  if (siteConfig.phone) data.telephone = siteConfig.phone;
  const addressParts = {};
  if (a.line1) addressParts.streetAddress = [a.line1, a.line2].filter(Boolean).join(', ');
  if (a.city) addressParts.addressLocality = a.city;
  if (a.district) addressParts.addressRegion = a.district;
  if (a.country) addressParts.addressCountry = a.country;
  if (Object.keys(addressParts).length) {
    data.address = { '@type': 'PostalAddress', ...addressParts };
  }
  const sameAs = Object.values(siteConfig.social || {}).filter(Boolean);
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}

/**
 * Renders a complete HTML document.
 *
 * @param {object} o
 * @param {string} o.title        Page <title> (business name is appended).
 * @param {string} o.description  Meta description.
 * @param {string} o.path         Site-root path, e.g. '/products/'.
 * @param {string} o.body         Page HTML.
 * @param {string} [o.image]      Site-root path to the Open Graph image.
 * @param {string} [o.ogType]     'website' (default) or 'product'.
 * @param {object[]} [o.schema]   Extra JSON-LD objects.
 * @param {string} [o.bodyClass]
 * @param {string} [o.headExtra]
 * @param {string} [o.scripts]    Extra <script> tags before </body>.
 * @param {string} [o.activeNav]  Nav key to highlight.
 * @param {boolean} [o.noindex]
 */
export function layout(o) {
  const {
    title,
    description,
    path,
    body,
    image = '/images/hero/og-default.png',
    ogType = 'website',
    schema = [],
    bodyClass = '',
    headExtra = '',
    scripts = '',
    activeNav = '',
    noindex = false,
  } = o;

  const fullTitle =
    title === siteConfig.businessName
      ? `${siteConfig.businessName} — ${siteConfig.tagline}`
      : `${title} | ${siteConfig.businessName}`;
  const desc = metaDescription(description);
  const canonical = absoluteUrl(path);
  const ogImage = absoluteUrl(image);
  const allSchema = [organizationSchema(), ...schema];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}<meta name="theme-color" content="${esc(siteConfig.themeColor)}">

<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="${esc(siteConfig.businessName)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta property="og:locale" content="en_NP">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<link rel="icon" href="/images/brands/icon-192.png" type="image/png" sizes="192x192">
<link rel="icon" href="/images/brands/favicon-48.png" type="image/png" sizes="48x48">
<link rel="apple-touch-icon" href="/images/brands/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/styles.css">
${headExtra}
<script type="application/ld+json">${jsonForScript(
    allSchema.length === 1 ? allSchema[0] : allSchema,
  )}</script>
${analytics()}
</head>
<body class="${esc(bodyClass)}">
${iconSprite()}
<a class="skip-link" href="#main">Skip to main content</a>
${header(activeNav)}
<main id="main">
${body}
</main>
${footer()}
${siteConfig.features.showFloatingWhatsApp ? floatingWhatsApp() : ''}
<script src="/assets/app.js" defer></script>
${scripts}
</body>
</html>
`;
}

export default layout;
