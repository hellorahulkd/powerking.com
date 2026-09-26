/**
 * ============================================================================
 *  ADMIN PANEL — /admin/
 * ============================================================================
 *  A catalogue editor that runs entirely in the browser and writes to this
 *  repository through the GitHub API.
 *
 *  ── WHAT AUTHENTICATES AN EDITOR ─────────────────────────────────────────
 *  GitHub does, not this page. An editor pastes a fine-grained access token
 *  scoped to this one repository; it is kept in their own browser's storage
 *  and sent to api.github.com with each request. Every write is authorised
 *  server-side by GitHub against that token's permissions.
 *
 *  This page is therefore NOT a security boundary and does not pretend to be
 *  one. Anyone may open it. Without a token that GitHub accepts, nothing can
 *  be read that is not already public and nothing at all can be written. That
 *  is the opposite of a password checked in JavaScript, which would have to
 *  ship the password to every visitor to compare against.
 *
 *  No credential is stored in this repository, and there is no server to
 *  compromise, because there is no server.
 *
 *  ── WHAT A SAVE DOES ──────────────────────────────────────────────────────
 *  Commits data/products.json (and any uploaded photo) to the branch named in
 *  site.config.js. The existing Actions workflow rebuilds and republishes the
 *  site, so an edit is live in about a minute.
 * ============================================================================
 */

import { esc, addressLine } from '../lib/html.js';
import { layout } from '../templates/layout.js';
import { siteConfig } from '../config/site.config.js';
import { lockup } from '../templates/brand.js';
import { icon } from '../templates/icons.js';

/** A field's markup, so the product form reads as a list of fields. */
function field(id, label, control, hint = '') {
  return `<div class="af">
  <label class="af__label" for="${esc(id)}">${esc(label)}</label>
  ${control}
  ${hint ? `<p class="af__hint">${hint}</p>` : ''}
</div>`;
}

/**
 * `numeric` asks for a number without making the field a number input. A
 * number input silently discards anything it cannot parse, so opening an
 * older product whose pack size reads "40 Pcs Cartoon" would blank the field
 * and the next save would commit the loss. A text field with a number pad
 * asks for the same thing and keeps what is already there.
 */
function text(id, { placeholder = '', type = 'text', numeric = false } = {}) {
  const num = type === 'number' || numeric;
  return `<input class="af__input" id="${esc(id)}" type="${esc(numeric ? 'text' : type)}"${num ? ' inputmode="numeric"' : ''}${type === 'number' ? ' min="1" step="1"' : ''} placeholder="${esc(placeholder)}" autocomplete="off">`;
}

function checkbox(id, label, hint, { checked = false } = {}) {
  return `<label class="af__check">
  <input type="checkbox" id="${esc(id)}"${checked ? ' checked' : ''}>
  <span><strong>${esc(label)}</strong>${hint ? `<br><span class="af__hint">${esc(hint)}</span>` : ''}</span>
</label>`;
}

/**
 * The shop's own details, in the order they read on a letterhead. Written
 * into the page once and used by both the masthead template and the PDF, so
 * the config file stays the only place they live.
 */
function sheetLines() {
  return [
    siteConfig.tagline,
    addressLine(),
    [siteConfig.phone, siteConfig.email].filter(Boolean).join(' · '),
    siteConfig.domain.replace(/^https?:\/\//, ''),
  ].filter(Boolean);
}

export function adminPage() {
  const { owner, name, branch } = siteConfig.repo;
  const repoPath = `${owner}/${name}`;
  // Pre-fills the token form on GitHub with exactly the scope this needs, so
  // an editor is not left choosing permissions from a long list.
  const tokenUrl = 'https://github.com/settings/personal-access-tokens/new';

  const body = `
<div class="admin" id="admin"
     data-owner="${esc(owner)}" data-repo="${esc(name)}" data-branch="${esc(branch)}"
     data-symbol="${esc(siteConfig.currency.symbol)}"
     data-business="${esc(siteConfig.businessName)}"
     data-supply="${esc(siteConfig.supplyTerms)}"
     data-lines="${esc(sheetLines().join('|'))}">

  <header class="admin__bar">
    <span class="admin__brand">${lockup({ height: 16 })}</span>
    <h1 class="admin__title">Catalogue admin</h1>
    <div class="admin__who" id="who" hidden>
      <span id="who-name"></span>
      <button type="button" class="btn btn--ghost btn--sm" id="sign-out">Sign out</button>
    </div>
  </header>

  <!-- ------------------------------------------------------------ sign in -->
  <section class="admin__pane" id="pane-auth">
    <div class="admin__narrow">
      <h2>Sign in to edit the catalogue</h2>
      <p class="admin__lead">
        Editing is authorised by GitHub, using an access token scoped to the
        <code>${esc(repoPath)}</code> repository. Your browser keeps the token;
        this website never contains it, and it is never sent anywhere except
        <code>api.github.com</code>.
      </p>

      <ol class="admin__steps">
        <li>Open <a href="${esc(tokenUrl)}" target="_blank" rel="noopener">GitHub's fine-grained token page</a>.</li>
        <li>Under <strong>Repository access</strong> choose <strong>Only select repositories</strong> and pick <strong>${esc(repoPath)}</strong>.</li>
        <li>Under <strong>Permissions → Repository permissions</strong>, set <strong>Contents</strong> to <strong>Read and write</strong>. Nothing else is needed.</li>
        <li>Set an expiry you are comfortable with, generate the token, and paste it below.</li>
      </ol>

      <form id="auth-form" class="admin__auth">
        <label class="af__label" for="token">Access token</label>
        <input class="af__input" id="token" type="password" autocomplete="off"
               spellcheck="false" placeholder="github_pat_…">
        <label class="af__check">
          <input type="checkbox" id="token-remember" checked>
          <span>Stay signed in on this device</span>
        </label>
        <button class="btn btn--primary" type="submit" id="auth-go">Sign in</button>
        <p class="admin__msg" id="auth-msg" role="status" aria-live="polite"></p>
      </form>

      <p class="admin__note">
        Anyone can open this page — it is a static file like every other page
        here. Without a token GitHub accepts, it can change nothing. To give
        someone else access, add them to the repository on GitHub and have
        them make their own token; to remove them, revoke it there.
      </p>
    </div>
  </section>

  <!-- ----------------------------------------------------------- workspace -->
  <section class="admin__pane" id="pane-work" hidden>
    <nav class="admin__tabs" role="tablist" aria-label="Sections">
      <button type="button" class="admin__tab is-active" id="tab-prices"
              role="tab" aria-selected="true" aria-controls="view-prices">Price book</button>
      <button type="button" class="admin__tab" id="tab-products"
              role="tab" aria-selected="false" aria-controls="view-products">Products</button>
      <button type="button" class="admin__tab" id="tab-categories"
              role="tab" aria-selected="false" aria-controls="view-categories">Categories</button>
    </nav>

    <p class="admin__msg admin__msg--sticky" id="work-msg" role="status" aria-live="polite"></p>

    <!-- price book -->
    <!--
      The tab this pane opens on, because looking a rate up happens many times
      a day and editing a product happens now and then. It is a reader, not a
      form: no field here can be changed, so there is nothing to save and
      nothing to get wrong with a buyer waiting.
    -->
    <div id="view-prices" role="tabpanel" aria-labelledby="tab-prices">
      <p class="admin__lead">
        Your rates, and only yours — none of these figures are on the website
        or anywhere in its pages. Search a name, a brand or a model number, and
        the line to send back is one tap away.
      </p>
      <div class="admin__toolbar">
        <label class="sr-only" for="price-find">Search the price book</label>
        <input class="af__input" id="price-find" type="search" enterkeyhint="search"
               placeholder="Search a product, brand or model…" autocomplete="off">
        <button type="button" class="btn btn--primary btn--sm" id="sheet-open">Make a price sheet</button>
      </div>
      <p class="admin__count" id="price-count"></p>
      <p class="admin__msg" id="price-note" role="status" aria-live="polite" hidden></p>
      <ul class="pricebook" id="price-list"></ul>
    </div>

    <!-- products list -->
    <div id="view-products" role="tabpanel" aria-labelledby="tab-products" hidden>
      <div class="admin__toolbar">
        <input class="af__input" id="filter" type="search" placeholder="Search products…" autocomplete="off">
        <button type="button" class="btn btn--ghost btn--sm" id="bulk-open">Add many</button>
        <button type="button" class="btn btn--primary btn--sm" id="new-product">Add product</button>
      </div>
      <p class="admin__count" id="count"></p>
      <ul class="admin__list" id="list"></ul>
    </div>

    <!-- categories -->
    <div id="view-categories" role="tabpanel" aria-labelledby="tab-categories" hidden>
      <p class="admin__lead">
        A category name is referenced by every product in it. Renaming one here
        renames it on those products too, so nothing is left pointing at a
        category that no longer exists. A category still holding products
        cannot be deleted.
      </p>
      <ul class="admin__list" id="cat-list"></ul>
      <button type="button" class="btn btn--primary btn--sm" id="new-category">Add category</button>
    </div>
  </section>

  <!-- --------------------------------------------------------- price sheet -->
  <!--
    A document to send someone, rather than an account to give them.
    A trusted buyer gets a file with the rates in it; everybody else keeps
    getting the website, which has none. The file is made here and saved
    through the browser's own print dialogue — there is no PDF library in
    this project and no server to make one.
  -->
  <section class="admin__pane" id="pane-sheet" hidden>
    <button type="button" class="admin__back" id="sheet-back">${icon('arrow', { size: 16, className: 'admin__back-icon' })} Back to the price book</button>
    <h2>Make a price sheet</h2>
    <p class="admin__lead">
      Pick what goes in, then save it as a PDF and send that. It is made fresh
      each time from today's catalogue, so a sheet is never quoting a rate you
      changed last week.
    </p>

    <div class="af__grid">
      ${field('sheet-for', 'Who it is for', text('sheet-for', { placeholder: 'Ram Traders, Birgunj' }), 'Printed at the top and along the foot of every page, so a sheet that gets passed on still says who it was sent to. Leave blank to print no name.')}
      ${field('sheet-valid', 'Rates hold until', text('sheet-valid', { placeholder: '15 Kartik 2082' }), 'Optional. Anything you type is printed as written.')}
    </div>
    ${field('sheet-note', 'A line of your own', '<textarea class="af__input" id="sheet-note" rows="2" placeholder="Delivery free inside the Ring Road on orders over one carton."></textarea>', 'Optional. You can still change this on the preview before saving.')}

    <div class="af">
      ${checkbox('sheet-prices', 'Include the rates', 'Untick to send a picture catalogue with no prices in it — for a buyer you do not quote to yet.', { checked: true })}
      ${checkbox('sheet-photos', 'Include the photos', 'Untick for a plain list. A sheet with no photos is a much smaller file to send.', { checked: true })}
    </div>

    <div class="admin__toolbar">
      <label class="sr-only" for="sheet-category">Category</label>
      <select class="af__input" id="sheet-category"></select>
      <label class="sr-only" for="sheet-find">Search</label>
      <input class="af__input" id="sheet-find" type="search" enterkeyhint="search"
             placeholder="Search…" autocomplete="off">
    </div>
    <div class="sheet__picks">
      <button type="button" class="btn btn--ghost btn--sm" id="sheet-all">Tick everything shown</button>
      <button type="button" class="btn btn--ghost btn--sm" id="sheet-none">Untick everything</button>
      <span class="admin__count" id="sheet-count"></span>
    </div>
    <ul class="sheetpick" id="sheet-list"></ul>

    <div class="admin__actions">
      <button type="button" class="btn btn--primary" id="sheet-make">Preview the sheet</button>
    </div>
    <p class="admin__msg" id="sheet-msg" role="status" aria-live="polite"></p>
  </section>

  <!--
    The shop's own details on the sheet, written from the config file at build
    time rather than copied into the script — there is one place the address
    and the phone number live, and this is not it.
  -->
  <template id="sheet-masthead">
    <div class="sheet__brand">${lockup({ height: 18 })}</div>
    <div class="sheet__who">
      <strong>${esc(siteConfig.businessName)}</strong>
      ${sheetLines().map((line) => `<span>${esc(line)}</span>`).join('\n      ')}
    </div>
  </template>

  <!-- ------------------------------------------------------- the sheet itself -->
  <section class="admin__pane admin__pane--print" id="pane-print" hidden>
    <div class="printbar">
      <button type="button" class="admin__back" id="print-back">${icon('arrow', { size: 16, className: 'admin__back-icon' })} Change what is in it</button>
      <button type="button" class="btn btn--primary" id="pdf-go">Download the PDF</button>
      <button type="button" class="btn btn--ghost" id="print-go">Print instead</button>
      <p class="af__hint">
        The file is written here rather than printed, so it carries your
        letterhead and nothing else — no web address, no page title, nothing
        saying where it was made. Anything underlined below can be clicked and
        re-typed first; the file takes it as you leave it.
      </p>
      <!--
        Only for the print path, which is now the second way out of here. The
        browser signs whatever it prints — Chrome puts the document title along
        the top and this page's address along the foot, and no stylesheet can
        stop it. The downloaded file is written by assets/pdf.js and has
        neither.
      -->
      <p class="af__hint printbar__tip">
        <strong>Printing on paper instead?</strong> Your browser adds the date
        and this page's web address around the edge. In the print box open
        <strong>More settings</strong> and untick
        <strong>Headers and footers</strong> to stop it. The downloaded file
        never has them.
      </p>
    </div>
    <p class="admin__msg" id="print-msg" role="status" aria-live="polite"></p>
    <div class="sheet" id="sheet"></div>
  </section>

  <!-- ------------------------------------------------------------ bulk add -->
  <section class="admin__pane" id="pane-bulk" hidden>
    <button type="button" class="admin__back" id="bulk-back">${icon('arrow', { size: 16, className: 'admin__back-icon' })} Back to the list</button>
    <h2>Add many products</h2>
    <p class="admin__lead">
      Choose or drop all the photos at once — one product per photo. Each name
      is filled in from its file name, so rename the files first if that saves
      you typing. Everything is saved together in one go, and nothing is
      committed until every row is complete.
    </p>

    <!-- Reading the box. The key is the editor's own and lives in their own
         browser, exactly like the GitHub token — never in this repository. -->
    <details class="bulk__vision" id="vision-setup">
      <summary id="vision-summary">Fill in from the photos — not set up</summary>
      <p class="af__hint">
        With a key from one of these, dropping photos in fills the name, brand,
        model and the specification text <strong>printed on the box</strong>.
        Anything not legible on the packaging is left blank for you to type.
        Everything it fills is marked and needs checking — it reads, it does
        not know the product.
      </p>
      <p class="af__hint">
        The key is stored in this browser only, next to your GitHub token. It
        is never committed, and you can clear it here at any time.
      </p>
      <div class="af__row">
        <label class="sr-only" for="vision-provider">Provider</label>
        <select class="af__input" id="vision-provider">
          <option value="">Off</option>
          <option value="gemini">Google Gemini</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
        </select>
        <label class="sr-only" for="vision-model">Model</label>
        <input class="af__input" id="vision-model" placeholder="Model" autocomplete="off">
      </div>
      <div class="af__row">
        <label class="sr-only" for="vision-key">API key</label>
        <input class="af__input" id="vision-key" type="password"
               placeholder="Paste the API key" autocomplete="off">
        <button type="button" class="btn btn--primary btn--sm" id="vision-save">Save</button>
        <button type="button" class="btn btn--ghost btn--sm" id="vision-forget">Forget</button>
      </div>
      <p class="admin__msg" id="vision-msg" role="status" aria-live="polite"></p>
    </details>

    <div class="bulk__pick">
      <label class="admin__photo admin__photo--wide" id="bulk-drop" for="bulk-files">
        <span class="admin__photo-empty">Tap to choose photos, or drop them here</span>
      </label>
      <input class="af__file" id="bulk-files" type="file" multiple
             accept="image/jpeg,image/png,image/webp" aria-label="Choose product photos">
      <p class="af__hint">On your phone, choose Photo Library or take a photo. Photos are resized before uploading.</p>
    </div>

    <div class="af" id="bulk-shared" hidden>
      <label class="af__label" for="bulk-category">Category for all of them</label>
      <div class="af__row">
        <select class="af__input" id="bulk-category"></select>
        <button type="button" class="btn btn--ghost btn--sm" id="bulk-category-new">+ New category</button>
      </div>
      <p class="af__hint">Each row can be changed on its own below.</p>
    </div>

    <div class="bulk__rows" id="bulk-rows"></div>

    <div class="admin__actions" id="bulk-actions" hidden>
      <button type="button" class="btn btn--primary" id="bulk-save">Save and publish all</button>
      <button type="button" class="btn btn--ghost" id="bulk-clear">Discard these</button>
    </div>
    <p class="admin__msg" id="bulk-msg" role="status" aria-live="polite"></p>
  </section>

  <!-- --------------------------------------------------------- product form -->
  <section class="admin__pane" id="pane-edit" hidden>
    <div class="admin__narrow">
      <button type="button" class="admin__back" id="edit-back">${icon('arrow', { size: 16, className: 'admin__back-icon' })} Back to the list</button>
      <h2 id="edit-title">Add product</h2>

      <form id="edit-form" autocomplete="off">
        ${field('f-name', 'Product name', text('f-name', { placeholder: 'Kisonli K21 40W Portable Speaker' }), 'As printed on the box. This is the page heading and the name sent in a WhatsApp enquiry.')}
        ${field('f-slug', 'Web address', text('f-slug', { placeholder: 'kisonli-k21-40w-speaker' }), 'Filled in from the name. Changing it on a product that is already published breaks the old link.')}
        ${field('f-brand', 'Brand', text('f-brand', { placeholder: 'Kisonli' }), 'Leave as <code>[CONFIRM BRAND]</code> if the carton shows no brand — better a visible gap than a guess.')}
        ${field(
          'f-category',
          'Category',
          `<div class="af__row">
            <select class="af__input" id="f-category"></select>
            <button type="button" class="btn btn--ghost btn--sm" id="f-category-new">+ New category</button>
          </div>`,
          'Not in the list? Add it here — it is created when you save this product, so a category never appears empty on the site.',
        )}
        ${field('f-description', 'Description', '<textarea class="af__input" id="f-description" rows="5" placeholder="What the box actually states."></textarea>', 'One to three sentences. Also used as the page description in Google. Write down what the carton says rather than what it probably means.')}

        <div class="af">
          <span class="af__label">Photos</span>
          <!--
            A drop area and a strip of what this product already has. The first
            photo is the one the catalogue card and the search results show;
            the rest appear as thumbnails on the product page, which has
            rendered a gallery since long before anything could fill it.
          -->
          <label class="admin__photo admin__photo--drop" id="f-image-drop" for="f-image">
            <span class="admin__photo-empty" id="f-image-empty">Tap to choose photos, or drop them here</span>
          </label>
          <input class="af__file" id="f-image" type="file" multiple
                 accept="image/jpeg,image/png,image/webp" aria-label="Choose photos">
          <ul class="shots" id="f-shots"></ul>
          <p class="admin__msg" id="photo-msg" role="status" aria-live="polite"></p>
          <p class="af__actions-inline">
            <button type="button" class="btn btn--ghost btn--sm" id="f-read" hidden>Read the box</button>
            <span class="af__hint af__hint--inline" id="f-read-note"></span>
          </p>
          <p class="af__hint">
            Choose several at once. <strong>The first one is the main photo</strong> —
            use "Set main" on any other to move it to the front. On your phone,
            choose Photo Library or take a photo. They are resized for the
            catalogue and uploaded when you save. If an iPhone photo will not
            open, try choosing it from Photo Library in Safari.
          </p>
        </div>

        ${field('f-sku', 'Model / SKU', text('f-sku', { placeholder: 'K21' }), 'The model number on the box. Searchable.')}
        ${field('f-packsize', 'Pieces per carton', text('f-packsize', { placeholder: '48', numeric: true }), 'Just the number — how many pieces come in one carton. The site writes it out as "48 pieces per carton", so a bare number on a card never leaves a buyer wondering what it counts.')}
        ${field('f-price-piece', 'Price for ONE loose piece (Rs.)', text('f-price-piece', { placeholder: '550', type: 'number' }), 'What a buyer pays for a single piece. <strong>This is the only price the catalogue cards show</strong> — the number under the product name, and what the listing sorts on. Numbers only: no "Rs." and no commas. Leave it blank and the product reads "Price on enquiry".')}
        ${field('f-price-carton', 'Price per piece when buying a full carton (Rs.)', text('f-price-carton', { placeholder: '540', type: 'number' }), 'Still the price of <strong>one piece</strong> — the lower rate a buyer gets for taking a whole carton, not the total for a carton. For a Rs. 550 piece this is a number like 540, not 54,000; the site works the carton total out itself from the pieces-per-carton above. Shown only on the product page, never on a card. Leave blank if there is no carton discount to quote yet.')}
        ${field('f-tags', 'Extra search words', text('f-tags', { placeholder: 'bluetooth, party, rgb' }), 'Comma separated. Words a buyer might search that are not already in the name or description.')}

        <div class="af">
          ${checkbox('f-featured', 'Featured', 'Candidate for the homepage row. It shows the first eight featured products, in catalogue order.')}
          ${checkbox('f-available', 'Available', 'Unticked shows "Currently unavailable" on the product, which stays listed.')}
        </div>

        <div class="admin__actions">
          <button class="btn btn--primary" type="submit" id="save">Save and publish</button>
          <button class="btn btn--ghost" type="button" id="delete" hidden>Delete product</button>
        </div>
        <p class="admin__msg" id="edit-msg" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>
</div>`;

  return layout({
    title: 'Catalogue admin',
    description: 'Private catalogue editor for PowerKing Nepal.',
    path: '/admin/',
    noindex: true,
    chrome: false,
    bodyClass: 'page-admin',
    body,
    headExtra: '<link rel="stylesheet" href="/assets/admin.css">',
    scripts: '<script src="/assets/pdf.js" defer></script>\n'
      + '<script src="/assets/admin.js" defer></script>',
  });
}

export default adminPage;
