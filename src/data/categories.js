/**
 * ============================================================================
 *  PRODUCT CATEGORIES — PowerKing Nepal (consumer electronics wholesale)
 * ============================================================================
 *  The categories themselves live in data/categories.json; this module reads
 *  that file. They drive the homepage category grid, the catalogue filters,
 *  the category pages and the sitemap.
 *
 *  To add or rename one, use the admin panel at /admin/, which also moves any
 *  products that referenced the old name. Editing the JSON by hand works too —
 *  but a category name is referenced by every product using it, so renaming
 *  one there means updating those products as well or the build will fail.
 *
 *  Fields: name, slug, description.
 *
 *  Categories carry no colour of their own. The palette is one accent, used
 *  on primary buttons; category is communicated by the word, not a hue.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const CATEGORIES_JSON = path.join(ROOT, 'data/categories.json');

export const categories = JSON.parse(readFileSync(CATEGORIES_JSON, 'utf8'));

export default categories;
