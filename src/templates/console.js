/**
 * ============================================================================
 *  ADMIN CONSOLE PAGE SHELLS
 * ============================================================================
 *  Each screen under /admin/ is a real HTML file so that a bookmark, a
 *  refresh or a link shared between two people all land on the right page
 *  without needing JavaScript to have run first.
 *
 *  What is in the file is deliberately almost nothing: a <main> naming its
 *  module, and the module. The sidebar and the header are drawn by
 *  assets/console/app.js only after the session has been checked, so a signed
 *  out visitor never sees the shape of the system, and there is no moment
 *  where a page looks signed-in before it has established that it is.
 *
 *  Every one of these carries noindex. They are also excluded from
 *  sitemap.xml and disallowed in robots.txt — see build.js.
 * ============================================================================
 */

import { esc } from '../lib/html.js';
import { layout } from './layout.js';

/**
 * @param {object} o
 * @param {string} o.page    module key in assets/console/app.js PAGES
 * @param {string} o.title   heading, and the browser tab
 * @param {string} o.path    the route this file is emitted at
 * @param {string} [o.description]
 */
export function consolePage({ page, title, path, description }) {
  const body = `
  <noscript>
    <div class="state state--error">
      <h3 class="state__title">JavaScript is switched off</h3>
      <p class="state__text">
        The inventory console needs it to reach the database. The public
        catalogue at <a href="/">powerkingnepal.com</a> works without it.
      </p>
    </div>
  </noscript>`;

  return layout({
    title,
    description: description || 'PowerKing Nepal inventory management.',
    path,
    noindex: true,
    chrome: false,
    bodyClass: 'page-console',
    body,
    mainAttrs: `class="shell__main" data-page="${esc(page)}" data-title="${esc(title)}"`,
    // One stylesheet, not two. console.css already carries the fonts and the
    // shared foundation; loading the public site's on top of it is what used
    // to give the console a sticky toolbar and clipping cards.
    siteCss: false,
    headExtra: '<link rel="stylesheet" href="/assets/console.css">',
    scripts: '<script type="module" src="/assets/console/app.js"></script>',
  });
}

/**
 * The sign-in page. Its own shell rather than a consolePage: it must not load
 * the session guard that every other page loads, because that guard's whole
 * job is to send people here.
 */
export function loginPage() {
  const body = `
  <div class="login__card">
    <div class="login__brand">
      <span class="login__wordmark">PWRKNG</span>
      <span class="login__sub">Inventory</span>
    </div>
    <h1 class="login__title">Sign in</h1>
    <p class="login__lead">
      Staff access to the PowerKing Nepal stock system.
    </p>

    <form id="login-form" class="login__form" novalidate>
      <div class="f">
        <label class="f__label" for="email">Email address</label>
        <input class="f__input" id="email" name="email" type="email"
               autocomplete="username" required
               spellcheck="false" autocapitalize="none" enterkeyhint="next">
        <p class="f__error" role="alert" hidden></p>
      </div>

      <div class="f">
        <label class="f__label" for="password">Password</label>
        <div class="login__reveal">
          <input class="f__input" id="password" name="password" type="password"
                 autocomplete="current-password" required enterkeyhint="go">
          <button type="button" class="login__eye" id="toggle-password"
                  aria-pressed="false" aria-label="Show password">Show</button>
        </div>
        <p class="f__error" role="alert" hidden></p>
      </div>

      <p class="login__msg" id="login-msg" role="alert" aria-live="assertive" hidden></p>

      <button class="btn btn--primary login__go" type="submit" id="login-go">Sign in</button>
    </form>

    <p class="login__note">
      Accounts are created by an administrator — there is no public sign-up.
      If you cannot get in, ask whoever runs the shop to check your account is
      still active.
    </p>
    <p class="login__back"><a href="/">← PowerKing Nepal website</a></p>
  </div>`;

  return layout({
    title: 'Sign in',
    description:
      'Staff sign-in for the PowerKing Nepal inventory system. Accounts are created by an ' +
      'administrator; the public wholesale catalogue needs no account at all.',
    path: '/admin/login/',
    noindex: true,
    chrome: false,
    bodyClass: 'page-login',
    body,
    mainAttrs: 'class="login"',
    siteCss: false,
    headExtra: '<link rel="stylesheet" href="/assets/console.css">',
    scripts: '<script type="module" src="/assets/console/login.js"></script>',
  });
}

export default consolePage;
