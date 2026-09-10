/**
 * ============================================================================
 *  ADMIN CONSOLE ROUTES
 * ============================================================================
 *  Shared by build.js, which emits a file for each of these, and
 *  scripts/check.js, which verifies that it did and that none of them leaked
 *  into the sitemap. One list, so the two cannot disagree about what exists.
 * ============================================================================
 */

/**
 * Every screen of the inventory console. One real HTML file each, so a
 * bookmark or a refresh lands where it should without needing JavaScript to
 * have run first; `page` names the module in assets/console/app.js that fills
 * it in once the session has been checked.
 *
 * A record id travels in the query string — /admin/products/view/?id=… —
 * because a static host cannot serve /admin/products/<uuid>/. vercel.json
 * rewrites the tidier path onto the same file where the site is deployed on
 * Vercel; nothing in the application knows or cares which one it arrived by.
 *
 * None of these are added to the sitemap and all of them carry noindex.
 *
 * A route appears here only once the module that fills it exists —
 * scripts/check.js asserts that pairing — so the site never publishes a link
 * to a screen that loads and then does nothing.
 */
export const CONSOLE_ROUTES = [
  { path: '/admin/',               page: 'dashboard',    title: 'Dashboard' },
  { path: '/admin/products/',      page: 'products',     title: 'Products' },
  { path: '/admin/products/new/',  page: 'product-form', title: 'Add product' },
  { path: '/admin/products/edit/', page: 'product-form', title: 'Edit product' },
  { path: '/admin/products/view/', page: 'product-view', title: 'Product' },
  { path: '/admin/products/import/', page: 'product-import', title: 'Import products' },
  { path: '/admin/inventory/',            page: 'inventory',  title: 'Inventory' },
  { path: '/admin/inventory/stock-in/',   page: 'stock-in',   title: 'Stock in' },
  { path: '/admin/inventory/stock-out/',  page: 'stock-out',  title: 'Stock out' },
  { path: '/admin/inventory/adjustment/', page: 'adjustment', title: 'Stock adjustment' },
  { path: '/admin/suppliers/',      page: 'suppliers',     title: 'Suppliers' },
  { path: '/admin/suppliers/view/', page: 'supplier-view', title: 'Supplier' },
  { path: '/admin/categories/',     page: 'categories',    title: 'Categories' },
  { path: '/admin/brands/',         page: 'brands',        title: 'Brands' },
  { path: '/admin/reports/',        page: 'reports',       title: 'Reports' },
  { path: '/admin/settings/',       page: 'settings',      title: 'Settings' },
];

export default CONSOLE_ROUTES;
