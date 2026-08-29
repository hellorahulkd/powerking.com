/**
 * ============================================================================
 *  POWERKING NEPAL — CENTRAL SITE CONFIGURATION
 * ============================================================================
 *
 *  This is the ONLY file you need to edit to change business details.
 *  Everything on the website (header, footer, contact page, WhatsApp buttons,
 *  SEO tags, structured data) reads from here.
 *
 *  Values written as "[ADD ...]" are placeholders that have NOT been supplied
 *  yet. They are rendered on the site as visible placeholders on purpose so
 *  nothing false is published. Replace them with real details and re-deploy.
 * ============================================================================
 */

export const siteConfig = {
  // --- Identity -------------------------------------------------------------
  businessName: 'PowerKing Nepal',
  legalName: 'PowerKing Nepal',
  tagline: 'Wholesale Distribution & Supply',
  shortDescription:
    'Wholesale distribution and supply in Nepal. Browse our product catalogue and enquire on WhatsApp for pricing, availability and minimum order quantities.',

  // --- Domain ---------------------------------------------------------------
  // Used for canonical URLs, Open Graph URLs and sitemap.xml. No trailing slash.
  domain: 'https://powerkingnepal.com',

  // --- WhatsApp -------------------------------------------------------------
  // International format, digits ONLY. No "+", no spaces, no dashes.
  // Nepal country code is 977. Example: a number 98XXXXXXXX becomes 97798XXXXXXXX
  // While this is left blank, every WhatsApp button safely links to /contact/
  // instead of producing a broken wa.me link.
  whatsappNumber: '', // e.g. '9779800000000'

  // --- Contact --------------------------------------------------------------
  phone: '', // e.g. '+977 1 4XXXXXX'  — leave blank to show a placeholder
  phoneSecondary: '',
  email: '', // e.g. 'info@powerkingnepal.com'
  address: {
    line1: '', // e.g. 'Shop 12, XYZ Market'
    line2: '',
    city: '', // e.g. 'Kathmandu'
    district: '',
    country: 'Nepal',
  },
  // Paste a Google Maps "Embed a map" iframe src here to switch the contact
  // page map section on. Left blank, the map section is hidden entirely.
  googleMapsEmbedUrl: '',
  googleMapsLinkUrl: '',

  openingHours: [
    // Edit freely. Leave the array empty to hide the opening-hours block.
    { days: 'Sunday – Friday', hours: '[ADD OPENING HOURS]' },
    { days: 'Saturday', hours: '[ADD OPENING HOURS]' },
  ],

  // --- Social ---------------------------------------------------------------
  // Leave any of these blank and the link is hidden automatically.
  social: {
    facebook: '',
    instagram: '',
    tiktok: '',
    linkedin: '',
    youtube: '',
  },

  // --- Analytics ------------------------------------------------------------
  // Google Analytics 4 measurement ID, e.g. 'G-XXXXXXXXXX'.
  // While blank, no analytics script is injected at all (no cookies, no
  // network requests) — the site stays fast and privacy-clean until you add it.
  googleAnalyticsId: '',

  // --- Branding -------------------------------------------------------------
  // Colours live in src/assets/css/styles.css under :root as CSS variables.
  themeColor: '#0E1726',

  // --- Feature flags --------------------------------------------------------
  features: {
    showBrandsPage: true,
    showFloatingWhatsApp: true,
    // Show the "sample data" notice banner. Set to false once you have
    // replaced the sample products with your real catalogue.
    showSampleDataNotice: true,
  },
};

/**
 * Pre-filled WhatsApp messages, kept in one place so the wording stays
 * consistent. `{product}` is replaced with the product name where relevant.
 */
export const whatsappMessages = {
  general:
    'Hi PowerKing Nepal, I would like to enquire about your wholesale products.',
  contact:
    'Hi PowerKing Nepal, I would like to speak with someone about wholesale supply.',
  product:
    'Hi PowerKing Nepal, I am interested in {product}. Could you please provide the wholesale price, availability and minimum order quantity?',
  category:
    'Hi PowerKing Nepal, I would like to enquire about your {product} range.',
  hero:
    'Hi PowerKing Nepal, I would like to enquire about wholesale supply for my business.',
};

export default siteConfig;
