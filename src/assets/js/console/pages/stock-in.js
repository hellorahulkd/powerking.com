/**
 * STOCK IN — /admin/inventory/stock-in/
 * Goods arriving: a delivery from a supplier, against an invoice.
 */
import { stockForm } from './stock-form.js';
import { errorState, mount } from '../ui.js';
import { can } from '../session.js';

export default async function stockIn(ctx) {
  if (!can('moveStock', ctx.me.role)) {
    mount(ctx.root, errorState({ message: 'Your account cannot record stock movements.' }));
    return;
  }
  return stockForm(ctx, {
    movementType: 'STOCK_IN',
    lead:
      'Record goods arriving. The quantity is added and the movement is written to the ' +
      'history in the same transaction, so the two can never disagree.',
    supplier: true,
    unitCost: true,
    submitLabel: 'Record stock in',
  });
}
