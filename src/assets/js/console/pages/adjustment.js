/**
 * ============================================================================
 *  STOCK ADJUSTMENT — /admin/inventory/adjustment/
 * ============================================================================
 *  For when the shelf and the system disagree, and the shelf is right.
 *
 *  An adjustment is the only movement with no counterparty — no supplier, no
 *  customer, no invoice to check it against. That is exactly why the reason is
 *  required here and why staff cannot make one: a system where stock can be
 *  written off with a blank reason has an audit trail that proves nothing.
 * ============================================================================
 */
import { stockForm } from './stock-form.js';
import { errorState, mount } from '../ui.js';
import { can } from '../session.js';

/** The reasons a count is actually wrong, rather than a free-text box. */
const REASONS = [
  'Physical count correction',
  'Damaged',
  'Lost or missing',
  'Expired',
  'Data entry error',
  'Sample or demonstration unit',
  'Written off',
];

export default async function adjustment(ctx) {
  if (!can('adjustStock', ctx.me.role)) {
    mount(ctx.root, errorState({
      message:
        'Adjustments can only be made by a manager or an admin. An adjustment has no ' +
        'invoice or customer to check it against, so it needs a second pair of eyes.',
    }));
    return;
  }
  return stockForm(ctx, {
    movementType: 'ADJUSTMENT_OUT',
    direction: true,
    reasons: REASONS,
    lead:
      'Correct a discrepancy between the shelf and the system. Every adjustment is ' +
      'recorded with its reason and who made it, and cannot afterwards be edited or removed.',
    submitLabel: 'Record adjustment',
  });
}
