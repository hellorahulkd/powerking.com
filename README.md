# PowerKing Nepal — Wholesale Product Catalogue

The official online product catalogue for **PowerKing Nepal**, a wholesale
supplier of consumer electronics and mobile accessories — speakers,
headphones, earbuds, chargers, data cables, multiplugs, phone coolers and
phone accessories.

It is a **catalogue, not a shop**: there are no customer accounts, no cart, no
checkout and no online payments. Visitors browse products and enquire on
WhatsApp, where pricing and minimum order quantities are agreed.

**Live site:** https://powerkingnepal.com

---

## Quick reference

| I want to… | Do this |
| --- | --- |
| Add a product | Add one object to [`src/data/products.js`](src/data/products.js) + upload an image |
| Change the WhatsApp number | `whatsappNumber` in [`src/config/site.config.js`](src/config/site.config.js) |
| Add Google Analytics | `googleAnalyticsId` in the same config file |
| Change phone/email/address | Same config file |
| Add a category | Add an object to [`src/data/categories.js`](src/data/categories.js) |
| Publish changes | `git push` to `main` — GitHub Actions does the rest |

Everything about the business lives in **one config file**. You never need to
edit HTML.

---

## Contents

1. [How to add a product](#1-how-to-add-a-product)
2. [Product images](#2-product-images)
3. [Configuring WhatsApp](#3-configuring-whatsapp)
4. [Configuring Google Analytics](#4-configuring-google-analytics)
5. [Business details](#5-business-details)
6. [Categories](#6-categories)
7. [Running the site locally](#7-running-the-site-locally)
8. [Deploying to GitHub Pages](#8-deploying-to-github-pages)
9. [Connecting powerkingnepal.com](#9-connecting-powerkingnepalcom)
10. [Project structure](#10-project-structure)
11. [Why this architecture](#11-why-this-architecture)
12. [Removing the sample products](#12-removing-the-sample-products)
13. [What still needs your input](#13-what-still-needs-your-input)

---

## 1. How to add a product

**Step 1 — Add the photo.** Put the image in `public/images/products/`.
Name it after the product, in lowercase with hyphens:

```
public/images/products/coca-cola-500ml.jpg
```

**Step 2 — Add the product.** Open `src/data/products.js` and add one object
to the list:

```js
{
  id: 16,                                     // must be unique, never reuse
  name: 'Wireless Earbuds Pro',
  slug: 'wireless-earbuds-pro',               // → /products/wireless-earbuds-pro/
  brand: 'Your Brand',
  category: 'Earbuds',                        // must match a category name
  description: 'TWS earbuds with charging case, touch controls and 24h playback.',
  image: '/images/products/wireless-earbuds-pro.jpg',
  gallery: [],                                // optional extra images
  packSize: '50 pcs per carton',
  unit: 'Per carton',                         // optional
  sku: 'PK-EAR-010',                          // optional, searchable
  featured: true,                             // shows on the homepage
  available: true,
  tags: ['tws', 'bluetooth', 'earphones'],    // optional extra search keywords
},
```

**Step 3 — Publish.**

```bash
git add .
git commit -m "Add Wireless Earbuds Pro"
git push
```

GitHub Actions rebuilds and deploys automatically. The product now has its own
page, appears in the catalogue and category page, is searchable by name, brand,
category and SKU, is added to `sitemap.xml`, and has a WhatsApp button that
opens a message naming that product.

> **Tip:** run `npm run build` before pushing. It validates your product data
> and tells you about duplicate IDs, bad slugs, unknown categories or missing
> images before they reach the live site.

### Field reference

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique number. Never reuse. |
| `name` | yes | Page heading and the name in the WhatsApp message. |
| `slug` | yes | URL segment. Lowercase letters, numbers, hyphens. |
| `brand` | yes | Searchable and filterable. |
| `category` | yes | Must match a `name` in `categories.js`. |
| `description` | yes | 1–3 sentences. Also used as the meta description. |
| `image` | yes | Path from the site root, starting with `/`. |
| `gallery` | no | Extra images — adds thumbnails to the product page. |
| `packSize` | no | e.g. `12 x 500ml`. |
| `unit` | no | e.g. `Per case`. |
| `sku` | no | Internal code. Searchable. |
| `featured` | no | `true` puts it in the homepage Featured row (shows up to 8). |
| `available` | no | `false` marks it "Currently unavailable" but keeps it listed. |
| `sample` | no | `true` shows a "Sample" badge. Only for the demo products. |
| `tags` | no | Extra search keywords that are not shown on the page. |

---

## 2. Product images

- **Where:** `public/images/products/`
- **Format:** JPG for photographs, PNG if you need transparency, WebP if you have it.
- **Shape:** square (1:1). Cards and the product page both crop to a square.
- **Size:** 800×800 to 1200×1200 pixels is plenty. **Keep each file under
  200KB** — compress before uploading (e.g. [squoosh.app](https://squoosh.app)),
  otherwise the site gets slow on mobile data.
- **Missing image?** The card shows a tidy "Image coming soon" panel instead of
  a broken image, and `npm run build` warns you.

Images are lazy-loaded below the fold, given explicit dimensions to prevent
layout shift, and carry descriptive alt text automatically.

### The stand-in product drawings

Until real photography exists, each sample product shows a flat vector drawing
of its product *type* — a speaker, a charger, a cable — from
`scripts/product-art.js`. They are generic representations, carry no brand
marks, and depict no real manufacturer's item.

Point a product's `image` at a real photograph and none of this applies to it
any more. Delete `scripts/product-art.js` once every product has one.

### Social sharing previews

When a product link is shared on WhatsApp or Facebook, the preview uses the
product image. Those crawlers **cannot read SVG**, so the sample products ship
with a matching `.png` alongside each `.svg`. Once you use real `.jpg`/`.png`
photographs this is handled automatically with no extra step.

---

## 3. Configuring WhatsApp

Open `src/config/site.config.js` and set **one** value:

```js
whatsappNumber: '9779863215831',   // ← currently configured
```

- International format, **digits only** — no `+`, spaces or dashes.
- Nepal's country code is `977`. A number like `9800000000` becomes
  `9779800000000`.

That single value powers every WhatsApp button on the site: header, hero,
product cards, product pages, contact page, footer and the floating button.

If it is ever left blank, every WhatsApp button safely links to `/contact/`
instead of producing a broken `wa.me` link, and the contact page says what is
missing. Nothing on the site is left visibly broken.

### Pre-filled messages

The wording lives in `whatsappMessages` in the same file:

| Where the visitor clicks | Message |
| --- | --- |
| Product page / product card | *"Hi PowerKing Nepal, I am interested in **[product name]**. Could you please provide the wholesale price, availability and minimum order quantity?"* |
| Header, footer, floating button | *"Hi PowerKing Nepal, I would like to enquire about your wholesale products."* |
| Contact page | *"Hi PowerKing Nepal, I would like to speak with someone about wholesale supply."* |
| Hero | *"Hi PowerKing Nepal, I would like to enquire about wholesale supply for my business."* |

`{product}` in a message is replaced with the product name automatically.

---

## 4. Configuring Google Analytics

1. Create a **GA4** property at [analytics.google.com](https://analytics.google.com).
2. Copy the Measurement ID (it looks like `G-XXXXXXXXXX`).
3. Set it in `src/config/site.config.js`:

```js
googleAnalyticsId: 'G-XXXXXXXXXX',
```

4. Commit and push.

**While this is blank, no analytics script is loaded at all** — no third-party
requests and no cookies. The site stays fast and privacy-clean until you opt in.

### Events that are tracked

Beyond automatic page views, the site records:

| Event | Fires when | Data sent |
| --- | --- | --- |
| `whatsapp_click` | Any WhatsApp button is clicked | `product`, `product_id`, `location`, `page` |
| `product_view` | A product page loads | `product`, `product_id`, `brand`, `category`, `sku` |
| `product_search` | A visitor searches (debounced) | `search_term`, `results`, `category` |
| `category_view` | A category page loads | `category` |
| `category_click` | A category tile or link is clicked | `category` |
| `category_filter` | A category filter chip is used | `category` |
| `brand_filter` | The brand dropdown is used | `brand` |
| `contact_click` | Phone or email is clicked | `method` |
| `social_click` | A social icon is clicked | `network` |

`location` on `whatsapp_click` tells you *which* button converted:
`header`, `hero`, `mobile_menu`, `product_page`, `product_card`, `catalogue`,
`category`, `related_products`, `brand_page`, `home_cta`, `catalogue_cta`,
`about_cta`, `about_sidebar`, `contact_page`, `footer`, `floating_button`,
`404_page`.

**To see these in GA4:** Admin → Custom definitions → create custom dimensions
for `product` and `location` so they appear in reports. Events show up in
Realtime immediately.

No personal information is collected.

---

## 5. Business details

All in `src/config/site.config.js`:

```js
phone: '+977 1 4XXXXXX',
email: 'info@powerkingnepal.com',
address: { line1: '…', city: 'Kathmandu', country: 'Nepal' },
openingHours: [{ days: 'Sunday – Friday', hours: '9:00 AM – 6:00 PM' }],
social: { facebook: 'https://facebook.com/…', instagram: '', tiktok: '' },
googleMapsEmbedUrl: '',   // paste a Google Maps embed URL to show a map
```

Anything left blank either shows a clearly marked `[ADD …]` placeholder (so you
can see what is missing) or hides itself — empty social links and the map
section simply do not render. **Nothing is invented.**

### Adding a Google Map

Google Maps → find your location → Share → **Embed a map** → copy the URL from
inside `src="…"` → paste it into `googleMapsEmbedUrl`. The map section appears
on the contact page automatically.

### The brand marks

The **pwrkng** wordmark is **set in type**, not drawn as polygons, in
[`src/templates/brand.js`](src/templates/brand.js).

An earlier pass constructed the letters from rectangles, which produced
squared modular forms — a different typeface to the reference, which has round
bowls on the p and g and an arched shoulder on the n. It is now set in
**Archivo 900** (self-hosted, SIL Open Font Licence, commercial use covered)
with tight negative tracking and a stroke that fattens the weight further.

| Function | Use it for |
| --- | --- |
| `glitchWordmark()` | The logo. Hero, social card, letterhead, signage. |
| `wordmark()` | The clean cut, for small sizes and single-colour printing. |

**The static treatment** slices the wordmark into horizontal bands and
displaces them, with torn streaks thrown clear of the letters. The
displacement table is **hard-coded, never random** — a logo that reshuffles
itself on every build is not a logo. `amount` scales it from 0 (clean) to 1
(full); the header runs at 0.55 because full amplitude below ~20px reads as
blur rather than as an effect.

**Rasterised assets.** An SVG loaded through `<img>` cannot pull in a
webfont, so anything shown that way — the product tiles, the favicon — is
generated as PNG by `scripts/rasterize.js`, which drives Chrome over CDP and
waits for `document.fonts.ready` before capturing. The header and hero use
inline SVG, so they stay vector and crisp at any size.

**There is no symbol and no icon set.** Categories, features and contact
details are set in type. The favicon is the **p** cut from the wordmark — a
full "pwrkng" is illegible at 32px, so the logotype's initial stands in, which
is how wordmark-only brands get a square mark. The one graphic kept anywhere
on the site is WhatsApp's own mark on the WhatsApp buttons, because it
identifies a third-party platform on the primary call to action.

To regenerate every asset after editing the geometry:

```bash
node scripts/gen-images.js    # SVG: favicon, logo lockup, OG card, tiles
node scripts/rasterize.js     # PNG versions (needs Chrome)
node scripts/optimize-png.js  # shrink them
```

### Changing the colours

The whole palette is a handful of CSS variables at the top of
`src/assets/css/styles.css`:

```css
:root {
  --volt: #F3D74B;   /* the accent — primary buttons, almost nothing else */
  --ink:  #1A1A1C;   /* near-black. Type and the wordmark, not surfaces.  */
  --bg-alt: #F5F5F7; /* the one grey, for banding sections                */
  --whatsapp: #25D366;
  ...
}
```

**The page is white and there is exactly one accent.** Ink is for type, not
for surfaces. The yellow appears on primary buttons and almost nowhere else,
so it still means something when it does. Categories carry no colour of their
own — the word does that job. Colour on the catalogue should come from real
product photography, not from the chrome.

WhatsApp buttons use dark ink on the brand green: the green cannot carry white
type at 4.5:1 without darkening so far it stops reading as WhatsApp.

### Changing the typefaces

Headings use **Archivo** at weight 900, body text uses **Inter** — both self-hosted
(no Google CDN request) from `public/fonts/`, both SIL Open Font Licence, so
commercial use is fine. To switch: edit the `FAMILIES` list in
`scripts/fetch-fonts.js`, run `node scripts/fetch-fonts.js`, then update
`--font-display` / `--font-sans` in `styles.css`.

⚠️ **A note on DaFont and similar sites:** most fonts there are licensed
*free for personal use only*, which does not cover a commercial business
website. Check the licence before using one, and prefer SIL OFL or Apache
licensed families.

Change these and the entire site re-skins.

---

## 6. Categories

Edit `src/data/categories.js`:

```js
{
  name: 'Smart Watches',      // must match the `category` on your products
  slug: 'smart-watches',      // becomes /products/smart-watches/
  icon: 'mobile',             // a key from src/templates/icons.js
  color: '#00D68F',           // tints the tile and the placeholder artwork
  description: 'Smart watches and fitness bands supplied by the carton.',
},
```

Adding a category automatically creates its page, its homepage tile, its filter
chip and its sitemap entry.

Available icons: `speaker`, `headphone`, `earbuds`, `charger`, `cable`, `plug`,
`cooler`, `mobile`, `bolt`, `truck`, `shield`, `tag`, `handshake`.

**`color` is what makes the homepage colourful** — each category tile is tinted
with it, and the placeholder product artwork is generated from it. Keep the
colours bright and clearly distinct from one another.

---

## 7. Running the site locally

Requires **Node.js 18 or newer**. There are **no dependencies to install**.

```bash
node build.js        # build into dist/
npm run dev          # build, then preview at http://localhost:4321
npm run check        # build + verify (the same checks CI runs)
```

`npm run build` prints a checklist of anything still unconfigured, warns about
missing images, and refuses to build on duplicate IDs, bad slugs or unknown
categories.

### Development-only scripts

These are **not** part of the deployment and are safe to delete once you have
real product photography:

| Script | Purpose |
| --- | --- |
| `scripts/fetch-fonts.js` | Re-downloads and self-hosts the webfonts |
| `scripts/gen-images.js` | Regenerates the placeholder SVG artwork |
| `scripts/product-art.js` | The generic product drawings used as stand-in photography |
| `scripts/rasterize.js` | Converts SVG artwork to PNG (needs Chrome) |
| `scripts/optimize-png.js` | Losslessly shrinks PNGs (typically 50–70%) |
| `scripts/dev/qa.js` | Browser tests: layout, search, menu, WhatsApp, analytics |
| `scripts/dev/slider-test.js` | Browser tests for the homepage product carousel |
| `scripts/dev/compare-test.js` | Browser tests for the product comparison table |

---

## 8. Deploying to GitHub Pages

### One-time setup

1. Push this repository to GitHub (branch `main`).
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.

That is all. `.github/workflows/deploy.yml` builds and publishes on every push
to `main`, and verifies the output before deploying — a broken build never goes
live.

### Deploying future updates

```bash
git add .
git commit -m "Add new products"
git push
```

Watch progress in the **Actions** tab. A deploy takes about a minute.

You can also re-deploy without a commit: **Actions → Build & Deploy to GitHub
Pages → Run workflow**.

---

## 9. Connecting powerkingnepal.com

The repository already contains `public/CNAME` with `powerkingnepal.com`, so
GitHub knows the custom domain. You need to add DNS records at whichever
company you bought the domain from.

### Step 1 — DNS records at your registrar

Log in to your domain registrar and open its DNS settings. Add **four A
records** for the apex domain and **one CNAME** for `www`:

| Type | Name / Host | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `185.199.108.153` | 3600 |
| A | `@` | `185.199.109.153` | 3600 |
| A | `@` | `185.199.110.153` | 3600 |
| A | `@` | `185.199.111.153` | 3600 |
| CNAME | `www` | `hellorahulkd.github.io.` | 3600 |

Notes:
- `@` means the domain itself. Some registrars want it blank, or the full
  `powerkingnepal.com`.
- The CNAME value is your **GitHub username**, not the repository name, and
  ends with `.github.io` (trailing dot if your registrar requires it).
- If IPv6 is offered, you may also add AAAA records:
  `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`,
  `2606:50c0:8003::153`.
- Delete any conflicting existing A, AAAA, CNAME or parking records for `@`
  and `www`, or the domain will not resolve to GitHub.

### Step 2 — Tell GitHub about the domain

1. **Settings → Pages → Custom domain**
2. Enter `powerkingnepal.com` and click **Save**.
3. Wait for the DNS check to pass (green tick). This can take from a few
   minutes up to 24 hours while DNS propagates.
4. Once it passes, tick **Enforce HTTPS**. GitHub issues a free Let's Encrypt
   certificate automatically.

### Step 3 — www and HTTPS

Setting the apex domain (`powerkingnepal.com`) as the custom domain makes
GitHub **automatically redirect** `www.powerkingnepal.com` → `powerkingnepal.com`,
provided the `www` CNAME record above exists. Both addresses work; one is
canonical, which is what search engines want.

HTTP is redirected to HTTPS once **Enforce HTTPS** is on.

### Verifying

```bash
dig powerkingnepal.com +short          # expect the four 185.199.x.153 addresses
dig www.powerkingnepal.com +short      # expect hellorahulkd.github.io
curl -sI https://powerkingnepal.com | head -1
curl -sI https://www.powerkingnepal.com | head -1   # expect a 301 to the apex
```

### Troubleshooting

| Problem | Cause |
| --- | --- |
| "Domain does not resolve to the GitHub Pages server" | DNS not propagated yet, or an old A/CNAME record still present. |
| Certificate error for a day or so | Normal — GitHub is still issuing the certificate. Wait, then re-tick Enforce HTTPS. |
| Custom domain keeps clearing itself | `public/CNAME` must stay in the repository. The build copies it into `dist/` on every deploy. |
| 404 on every page but the homepage | Pages source is not set to **GitHub Actions**. |

---

## 10. Project structure

```
powerking.com/
├── build.js                     ← the whole build (one file, no dependencies)
├── serve.js                     ← local preview server
├── package.json
│
├── src/
│   ├── config/site.config.js    ← ★ ALL business details live here
│   ├── data/
│   │   ├── products.js          ← ★ ALL products live here
│   │   └── categories.js        ← ★ ALL categories live here
│   ├── lib/html.js              ← escaping, WhatsApp URLs, helpers
│   ├── templates/               ← layout, header, footer, cards, icons
│   ├── pages/                   ← one module per page type
│   └── assets/
│       ├── css/styles.css       ← design system (CSS variables at the top)
│       └── js/
│           ├── app.js           ← nav, analytics events
│           └── catalogue.js     ← instant search & filtering
│
├── public/                      ← copied verbatim to the site root
│   ├── images/{products,brands,hero}/
│   ├── favicon.svg
│   └── CNAME                    ← custom domain for GitHub Pages
│
├── scripts/                     ← build checks + dev tooling
│   ├── check.js                 ← post-build verification (runs in CI)
│   ├── gen-images.js
│   ├── rasterize.js
│   ├── optimize-png.js
│   └── dev/                     ← browser test suite
│
├── .github/workflows/deploy.yml ← build + verify + deploy on push to main
└── dist/                        ← generated output (never edit, not committed)
```

### Pages generated

| URL | Page |
| --- | --- |
| `/` | Homepage — product carousel, catalogue, categories |
| `/products/` | Full catalogue with search and filters |
| `/products/<category>/` | One page per category |
| `/products/<product>/` | One page per product, with a comparison table against the rest of its category |
| `/about/` | About |
| `/contact/` | Contact |
| `/brands/` | Products grouped by brand |
| `/privacy/` | Privacy policy |
| `/404.html` | Not-found page |
| `/sitemap.xml`, `/robots.txt` | Generated from your data |

---

## 11. Why this architecture

**A static site generated by one dependency-free Node script**, rather than
React/Vite or a template engine.

- **Social previews actually work.** WhatsApp, Facebook and Messenger link
  crawlers do not run JavaScript. A single-page app would show the same generic
  preview for every product. Here each product is a real HTML file with its own
  title, description and image — and product links get shared on WhatsApp
  constantly, so this matters more than anything else.
- **Fast on a cheap Android phone on 4G.** Each page is one HTML file, ~37KB of
  CSS and under 8KB of JavaScript. No framework runtime, no hydration.
- **Nothing to install or maintain.** `node build.js` is the entire toolchain —
  no `npm install`, no lockfile, no dependency vulnerabilities, no framework
  upgrade treadmill. The site will still build in five years.
- **Search still feels instant.** All products are in the HTML already, so
  filtering is pure DOM work — no requests, no spinner. And the catalogue still
  works with JavaScript switched off.
- **Easy to hand over.** Adding a product is editing one object in one file.

---

## 12. Removing the sample products

The catalogue currently ships with **15 clearly-labelled sample products**
across all 8 categories, using stand-in brand names ("SampleAudio",
"SamplePower", "SampleLink", "SampleGear") so you can see the site working.
The pack sizes and SKUs are illustrative. Every one carries a visible "Sample"
badge plus a notice banner.

To replace them:

1. Delete the sample objects from `src/data/products.js` and add your real ones.
2. Delete the placeholder images: `rm public/images/products/sample-*`
3. Turn off the notice banner in `src/config/site.config.js`:
   ```js
   features: { showSampleDataNotice: false }
   ```
4. Optionally delete `scripts/gen-images.js` and `scripts/rasterize.js` — they
   only exist to generate placeholder artwork.
5. `npm run build` to confirm everything is valid, then push.

---

## 13. What still needs your input

The build prints this list every time. Currently outstanding:

- [x] ~~**WhatsApp number**~~ — configured: `+977 9863215831`
- [ ] **Phone number** — enables the "Call us" button
- [ ] **Email address**
- [ ] **Business address** and Google Maps link
- [ ] **Opening hours**
- [ ] **Social media profile URLs**
- [ ] **Google Analytics measurement ID**
- [ ] **Real products** to replace the 15 samples — and your real brand names
- [ ] **About page details** — company history, location, years in business,
      brands carried, distribution areas, mission. These are marked as
      placeholders in `src/pages/about.js`; nothing has been invented.
- [ ] **Confirm the distribution area.** The site deliberately does not claim
      nationwide coverage.

---

## Future additions

The structure is ready for, but does not yet include: PDF catalogues and
brochures, dealer login, live inventory, enquiry forms, multiple WhatsApp
numbers, a Nepali/English language switch, and a CMS or admin dashboard.
These were deliberately left out to keep the first version simple and fast.
