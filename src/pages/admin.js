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

import { esc } from '../lib/html.js';
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

function text(id, { placeholder = '', type = 'text' } = {}) {
  return `<input class="af__input" id="${esc(id)}" type="${esc(type)}" placeholder="${esc(placeholder)}" autocomplete="off">`;
}

function checkbox(id, label, hint) {
  return `<label class="af__check">
  <input type="checkbox" id="${esc(id)}">
  <span><strong>${esc(label)}</strong>${hint ? `<br><span class="af__hint">${esc(hint)}</span>` : ''}</span>
</label>`;
}

export function adminPage() {
  const { owner, name, branch } = siteConfig.repo;
  const repoPath = `${owner}/${name}`;
  // Pre-fills the token form on GitHub with exactly the scope this needs, so
  // an editor is not left choosing permissions from a long list.
  const tokenUrl = 'https://github.com/settings/personal-access-tokens/new';

  const body = `
<div class="admin" id="admin"
     data-owner="${esc(owner)}" data-repo="${esc(name)}" data-branch="${esc(branch)}">

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
      <button type="button" class="admin__tab is-active" id="tab-products"
              role="tab" aria-selected="true" aria-controls="view-products">Products</button>
      <button type="button" class="admin__tab" id="tab-categories"
              role="tab" aria-selected="false" aria-controls="view-categories">Categories</button>
    </nav>

    <p class="admin__msg admin__msg--sticky" id="work-msg" role="status" aria-live="polite"></p>

    <!-- products list -->
    <div id="view-products" role="tabpanel" aria-labelledby="tab-products">
      <div class="admin__toolbar">
        <input class="af__input" id="filter" type="search" placeholder="Search products…" autocomplete="off">
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

  <!-- --------------------------------------------------------- product form -->
  <section class="admin__pane" id="pane-edit" hidden>
    <div class="admin__narrow">
      <button type="button" class="admin__back" id="edit-back">${icon('arrow', { size: 16, className: 'admin__back-icon' })} Back to the list</button>
      <h2 id="edit-title">Add product</h2>

      <form id="edit-form" autocomplete="off">
        ${field('f-name', 'Product name', text('f-name', { placeholder: 'Kisonli K21 40W Portable Speaker' }), 'As printed on the box. This is the page heading and the name sent in a WhatsApp enquiry.')}
        ${field('f-slug', 'Web address', text('f-slug', { placeholder: 'kisonli-k21-40w-speaker' }), 'Filled in from the name. Changing it on a product that is already published breaks the old link.')}
        ${field('f-brand', 'Brand', text('f-brand', { placeholder: 'Kisonli' }), 'Leave as <code>[CONFIRM BRAND]</code> if the carton shows no brand — better a visible gap than a guess.')}
        ${field('f-category', 'Category', '<select class="af__input" id="f-category"></select>')}
        ${field('f-description', 'Description', '<textarea class="af__input" id="f-description" rows="5" placeholder="What the box actually states."></textarea>', 'One to three sentences. Also used as the page description in Google. Write down what the carton says rather than what it probably means.')}

        <div class="af">
          <span class="af__label">Photo</span>
          <div class="admin__photo">
            <img id="f-image-preview" alt="" hidden>
            <div class="admin__photo-empty" id="f-image-empty">No photo yet</div>
          </div>
          <input class="af__file" id="f-image" type="file" accept="image/*">
          <p class="af__hint">
            Resized to a 600&nbsp;×&nbsp;600 tile on white to match the rest of the
            catalogue, so a photo straight off a phone is fine. Uploaded when you save.
          </p>
        </div>

        ${field('f-sku', 'Model / SKU', text('f-sku', { placeholder: 'K21' }), 'The model number on the box. Searchable.')}
        ${field('f-packsize', 'Pack size', text('f-packsize', { placeholder: '20 pcs per carton' }), 'How many come in a carton. This is the first thing a wholesale buyer asks and it is empty on every product so far.')}
        ${field('f-unit', 'Sold as', text('f-unit', { placeholder: 'Per carton' }))}
        ${field('f-tags', 'Extra search words', text('f-tags', { placeholder: 'bluetooth, party, rgb' }), 'Comma separated. Words a buyer might search that are not already in the name or description.')}

        <div class="af">
          ${checkbox('f-featured', 'Featured', 'Candidate for the homepage row. It shows the first eight featured products, in catalogue order.')}
          ${checkbox('f-available', 'Available', 'Unticked shows "Currently unavailable" on the product, which stays listed.')}
          ${checkbox('f-sample', 'Sample placeholder', 'Marks it as demo data with a badge. Real products leave this unticked.')}
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
    scripts: '<script src="/assets/admin.js" defer></script>',
  });
}

export default adminPage;
