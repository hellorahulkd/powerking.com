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
  tagline: 'Electronics Wholesale & Supply',
  shortDescription:
    'Wholesale electronics distribution in Nepal — speakers, headphones, earbuds, chargers, data cables, multiplugs and mobile accessories. Browse the catalogue and enquire on WhatsApp for trade pricing, availability and minimum order quantities.',

  // --- Money -----------------------------------------------------------------
  // Prices are entered as plain numbers and formatted here. The locale is
  // ne-NP forced to Latin digits: plain "ne-NP" renders Devanagari numerals
  // (१,२५,०००), which is not what a trade buyer reads, while the tag below
  // keeps Nepal's lakh grouping — 1,25,000 rather than 125,000.
  currency: {
    symbol: 'Rs.',
    code: 'NPR',
    locale: 'ne-NP-u-nu-latn',
  },

  // --- How stock is supplied ------------------------------------------------
  // The same for every line we carry, so it is stated once here rather than
  // being a field on each product that would only ever hold one answer.
  supplyTerms: 'Supplied by the carton, or in loose pieces.',

  // --- Domain ---------------------------------------------------------------
  // Used for canonical URLs, Open Graph URLs and sitemap.xml. No trailing slash.
  domain: 'https://powerkingnepal.com',

  // --- Repository -----------------------------------------------------------
  // Where the catalogue lives. The admin panel at /admin/ reads and writes
  // these files through the GitHub API, so it needs to know the repository.
  // None of this is secret — it is the same address anyone can see in the
  // repository URL. The credential that authorises a write is the access
  // token each editor holds in their own browser; it is never stored here,
  // and nothing in this repository can write to it.
  //
  // THE BRANCH IS NOT main, AND THAT IS DELIBERATE.
  // GitHub Pages will only publish this repository from the branch named
  // below. Deploying from main fails before a single step runs — the
  // `github-pages` environment does not list main among the branches allowed
  // to deploy through it. Measured, not guessed: the same commit and the same
  // workflow were dispatched from main, from a branch called `live`, from
  // `claude/live` and from this branch, and only this one published.
  //
  // So the admin writes here, where a save actually reaches the site. The
  // workflow fast-forwards main to match after every deploy, so main is never
  // behind, it is simply not the branch Pages will take.
  //
  // To move publishing back to main once main is allowed to deploy
  // (Settings → Environments → github-pages → Deployment branches and tags):
  // change `branch` below to 'main' and change the push trigger and the sync
  // step in .github/workflows/deploy.yml to match. Nothing else depends on it.
  repo: {
    owner: 'hellorahulkd',
    name: 'powerking.com',
    branch: 'claude/powerking-nepal-website-tave3g',
  },

  // --- WhatsApp -------------------------------------------------------------
  // International format, digits ONLY. No "+", no spaces, no dashes.
  // Nepal country code is 977. Example: a number 98XXXXXXXX becomes 97798XXXXXXXX
  // While this is left blank, every WhatsApp button safely links to /contact/
  // instead of producing a broken wa.me link.
  whatsappNumber: '9779863215831',

  // --- Contact --------------------------------------------------------------
  phone: '+977 9863215831',
  phoneSecondary: '',
  email: 'businesskd@gmail.com',
  address: {
    line1: 'Mahabaudha',
    line2: '',
    city: 'Kathmandu',
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
  // --- Trending videos ------------------------------------------------------
  // Shown as a row at the bottom of the home page. Empty means the section is
  // not rendered at all, which is why it starts empty: a video nobody has
  // linked is not a video.
  //
  // Add one entry per clip. `url` is the link people follow — a TikTok,
  // Instagram or YouTube address, whatever the shop actually posts. `caption`
  // is what the card says. `poster` is optional: a path under public/ to a
  // still frame; without one the card shows the play mark on the brand's
  // black. Nothing is embedded and no third-party script is loaded — the card
  // is a link, so the page stays fast and nobody is tracked for scrolling
  // past it.
  //
  //   videos: [
  //     { url: 'https://www.tiktok.com/@powerkingnepal/video/1234567890',
  //       caption: 'PowerKing V35 solar speaker, unboxed',
  //       poster: '/images/videos/v35.jpg' },
  //   ],
  videos: [],

  googleAnalyticsId: '',

  // --- Branding -------------------------------------------------------------
  // Colours live in src/assets/css/styles.css under :root as CSS variables.
  themeColor: '#000000',

  // --- Feature flags --------------------------------------------------------
  features: {
    showBrandsPage: true,
    showFloatingWhatsApp: true,
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

  // The multi-product enquiry. The products and their quantities are written
  // between these two lines by the enquiry list.
  list: {
    greeting: 'Hi PowerKing Nepal, I would like to enquire about the following:',
    closing:
      'Please send wholesale pricing, availability and minimum order quantities.',
  },
};

/**
 * How many products one enquiry may carry. The whole message travels in a
 * wa.me URL, so this is a length limit rather than a preference — past this
 * the link risks being truncated by the phone before WhatsApp ever sees it.
 */
export const ENQUIRY_MAX = 20;

export default siteConfig;
