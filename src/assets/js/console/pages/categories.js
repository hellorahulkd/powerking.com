/** CATEGORIES — /admin/categories/ */
import { taxonomyPage } from './taxonomy.js';

export default async function categories(ctx) {
  return taxonomyPage(ctx, {
    tableName: 'categories',
    singular: 'category',
    plural: 'Categories',
    imageLabel: 'Image',
    imageColumn: 'image',
    hasDescription: true,
  });
}
