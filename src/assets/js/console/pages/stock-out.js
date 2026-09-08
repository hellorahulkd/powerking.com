/**
 * STOCK OUT — /admin/inventory/stock-out/
 * Goods leaving: sold, or sent to a customer against an order.
 */
import { stockForm } from './stock-form.js';
import { errorState, mount } from '../ui.js';
import { can } from '../session.js';

export default async function stockOut(ctx) {
  if (!can('moveStock', ctx.me.role)) {
    mount(ctx.root, errorState({ message: 'Your account cannot record stock movements.' }));
    return;
  }
  return stockForm(ctx, {
    movementType: 'STOCK_OUT',
    lead:
      'Record goods leaving. More than is in stock will be refused — by this form, and ' +
      'again by the database, which is the one that counts when two people are selling ' +
      'the same carton at the same moment.',
    customer: true,
    submitLabel: 'Record stock out',
  });
}
