/**
 * ============================================================================
 *  CONSOLE BOOTSTRAP
 * ============================================================================
 *  Every admin page is a real HTML file with a `data-page` attribute naming
 *  its module. This file reads that, checks the session, draws the shell, and
 *  hands over.
 *
 *  ── WHY REAL FILES RATHER THAN A SINGLE-PAGE APP ─────────────────────────
 *  The site is served as static files. A staff member who bookmarks
 *  /admin/inventory/stock-in/ must land on it, and a router that only exists
 *  once JavaScript has run cannot answer the first request. One file per
 *  screen also means a broken screen is one broken screen.
 *
 *  Record ids travel in the query string — /admin/products/view/?id=… —
 *  because a static host has no way to serve /admin/products/<uuid>/. On
 *  Vercel a rewrite in vercel.json restores the tidier URL; both resolve to
 *  the same file, so neither is a special case in here.
 * ============================================================================
 */

import { CONFIGURED, onSessionChange } from './client.js';
import { requireSession, signOutAndRedirect, can, cachedProfile } from './session.js';
import { el, mount, toastError, $ } from './ui.js';
import { ROLE_LABELS } from './format.js';

/** The sidebar. `need` is the permission required to see the entry at all. */
const NAV = [
  { href: '/admin/',                     label: 'Dashboard', icon: 'grid' },
  { href: '/admin/products/',            label: 'Products',  icon: 'box' },
  { href: '/admin/inventory/',           label: 'Inventory', icon: 'layers' },
  { href: '/admin/inventory/stock-in/',  label: 'Stock in',  icon: 'in',  need: 'moveStock' },
  { href: '/admin/inventory/stock-out/', label: 'Stock out', icon: 'out', need: 'moveStock' },
  { href: '/admin/inventory/adjustment/', label: 'Adjustment', icon: 'tune', need: 'adjustStock' },
  { href: '/admin/suppliers/',           label: 'Suppliers', icon: 'truck', need: 'manageSuppliers' },
  { href: '/admin/categories/',          label: 'Categories', icon: 'tag' },
  { href: '/admin/brands/',              label: 'Brands',    icon: 'star' },
  { href: '/admin/reports/',             label: 'Reports',   icon: 'chart' },
  { href: '/admin/settings/',            label: 'Settings',  icon: 'cog' },
];

const ICONS = {
  grid:   'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  box:    'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  in:     'M12 3v12m0 0 4-4m-4 4-4-4M3 21h18',
  out:    'M12 21V9m0 0 4 4m-4-4-4 4M3 3h18',
  tune:   'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4',
  truck:  'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  tag:    'M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01',
  star:   'm12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.1-5.6-3.2L6.4 20l1.3-6.1L3 9.6l6.3-.7z',
  chart:  'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cog:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
};

export function icon(name, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || ICONS.grid);
  svg.append(path);
  return svg;
}

/* ---------------------------------------------------------------- shell -- */

function sidebar(me) {
  const here = location.pathname.replace(/\/+$/, '/') || '/admin/';
  const links = NAV.filter((item) => !item.need || can(item.need, me.role)).map((item) => {
    // Dashboard is only active on an exact match; every other entry also
    // matches its children, so /admin/products/new/ still lights Products.
    const active = item.href === '/admin/'
      ? here === '/admin/'
      : here.startsWith(item.href);
    return el(`a.nav__link${active ? '.is-active' : ''}`, {
      href: item.href,
      ...(active ? { 'aria-current': 'page' } : {}),
    }, [icon(item.icon), el('span', { text: item.label })]);
  });

  return el('aside.shell__side', { id: 'sidebar' }, [
    el('div.shell__brand', {}, [
      el('a.shell__mark', { href: '/admin/', 'aria-label': 'PowerKing inventory' }, [
        el('span.shell__wordmark', { text: 'PWRKNG' }),
        el('span.shell__sub', { text: 'Inventory' }),
      ]),
    ]),
    el('nav.nav', { 'aria-label': 'Sections' }, links),
    el('div.shell__user', {}, [
      el('div.shell__who', {}, [
        el('span.shell__name', { text: me.full_name || me.email || 'Signed in' }),
        el('span.shell__role', { text: ROLE_LABELS[me.role] || me.role }),
      ]),
      el('button.btn.btn--ghost.btn--sm', {
        type: 'button',
        onclick: () => signOutAndRedirect(),
      }, ['Sign out']),
    ]),
  ]);
}

function topbar() {
  const toggle = el('button.shell__burger', {
    type: 'button',
    'aria-label': 'Menu',
    'aria-expanded': 'false',
    'aria-controls': 'sidebar',
    onclick: () => {
      const open = document.body.classList.toggle('is-nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    },
  }, [el('span.shell__burger-bars', { 'aria-hidden': 'true' })]);

  return el('header.shell__top', {}, [
    toggle,
    el('h1.shell__title#page-title', { text: document.querySelector('main')?.dataset.title || '' }),
    el('div.shell__actions#page-actions'),
  ]);
}

/* ----------------------------------------------------------- not set up -- */

function notConfigured() {
  return el('div.setup', {}, [
    el('h1.setup__title', { text: 'Not connected to a database yet' }),
    el('p.setup__lead', {
      text:
        'The inventory system needs a Supabase project. Two environment variables connect it, ' +
        'and both are public values that are meant to be shipped to the browser.',
    }),
    el('ol.setup__steps', {}, [
      el('li', { html: 'Create a project at <code>supabase.com</code>.' }),
      el('li', { html: 'Run the files in <code>supabase/migrations/</code> in the SQL editor, in filename order.' }),
      el('li', { html: 'Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> where the site is built.' }),
      el('li', { html: 'Rebuild and deploy. The full walk-through is in <code>README.md</code>.' }),
    ]),
    el('p.setup__note', {
      text:
        'The public catalogue is unaffected and is running from the JSON files in data/, ' +
        'exactly as it always has.',
    }),
    el('a.btn.btn--ghost', { href: '/' }, ['Back to the website']),
  ]);
}

/* ------------------------------------------------------------- bootstrap -- */

const PAGES = {
  dashboard:      () => import('./pages/dashboard.js'),
  products:       () => import('./pages/products.js'),
  'product-form': () => import('./pages/product-form.js'),
  'product-view': () => import('./pages/product-view.js'),
  'product-import': () => import('./pages/product-import.js'),
  inventory:      () => import('./pages/inventory.js'),
  'stock-in':     () => import('./pages/stock-in.js'),
  'stock-out':    () => import('./pages/stock-out.js'),
  adjustment:     () => import('./pages/adjustment.js'),
  suppliers:      () => import('./pages/suppliers.js'),
  'supplier-view': () => import('./pages/supplier-view.js'),
  categories:     () => import('./pages/categories.js'),
  brands:         () => import('./pages/brands.js'),
  reports:        () => import('./pages/reports.js'),
  settings:       () => import('./pages/settings.js'),
};

async function boot() {
  const main = document.querySelector('main[data-page]');
  if (!main) return;
  const name = main.dataset.page;

  if (!CONFIGURED) {
    document.body.classList.add('is-unconfigured');
    mount(main, notConfigured());
    return;
  }

  let me;
  try {
    me = await requireSession();
  } catch {
    // requireSession has already redirected, or the site is unconfigured.
    return;
  }

  document.body.prepend(sidebar(me));
  main.before(topbar());
  document.body.classList.add('is-ready');

  // Closing the mobile drawer by tapping the page behind it.
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('is-nav-open')) return;
    if (e.target.closest('#sidebar') || e.target.closest('.shell__burger')) return;
    document.body.classList.remove('is-nav-open');
  });

  // Signed out in another tab, or the refresh token was revoked: do not leave
  // this tab sitting on a screen full of data it can no longer refresh.
  onSessionChange((session) => {
    if (!session) location.replace('/admin/login/?reason=expired');
  });

  try {
    const module = await PAGES[name]?.();
    await module?.default?.({ me, root: main });
  } catch (err) {
    toastError(err);
    console.error('[powerking] page failed', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
