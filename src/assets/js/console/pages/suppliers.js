/**
 * ============================================================================
 *  SUPPLIERS — /admin/suppliers/
 * ============================================================================
 *  Who the stock comes from. Commercially sensitive — business rule 7 — which
 *  means it is not public, not that it is hidden from the team: a stock-in
 *  screen has to name the supplier the goods arrived from. Anonymous readers
 *  hold no grant on this table at all, which is asserted in db-test.sh.
 * ============================================================================
 */

import {
  el, mount, table, badge, empty, errorState, loading, field, input, textarea,
  checkbox, toast, toastError, confirmDialog, setFieldError, clearFieldErrors,
  submitting, debounce, param, $,
} from '../ui.js';
import { integer, dateTime } from '../format.js';
import { can } from '../session.js';
import { invalidate } from '../data.js';
import { select, insert, update, AppError } from '../client.js';

export default async function suppliers({ me, root }) {
  const editable = can('manageSuppliers', me.role);
  if (!editable) {
    mount(root, errorState({
      message: 'Supplier records are available to managers and admins.',
    }));
    return;
  }

  const results = el('div#results', {}, [loading()]);
  const formSlot = el('div#form-slot');
  const searchBox = input({
    type: 'search', placeholder: 'Search suppliers…', class: 'toolbar__search',
    'aria-label': 'Search suppliers',
  });
  const showInactive = checkbox('Include inactive', {});

  mount(root, el('div.stack', {}, [
    el('div.row', {}, [
      el('p.small.muted#count'),
      el('span.spacer'),
      el('button.btn.btn--primary.btn--sm', {
        type: 'button', onclick: () => openForm(null),
      }, ['Add supplier']),
    ]),
    formSlot,
    el('div.card', {}, [
      el('div.toolbar', {}, [searchBox, showInactive]),
      results,
    ]),
  ]));

  async function load() {
    mount(results, loading());
    try {
      const params = {
        select: 'id,name,contact_person,phone,email,address,notes,is_active,created_at',
        order: 'name.asc',
        limit: 200,
      };
      if (!showInactive.querySelector('input').checked) params.is_active = 'eq.true';
      const term = searchBox.value.trim().replace(/[(),*]/g, ' ').trim();
      if (term) {
        params.or = `(name.ilike.*${term}*,contact_person.ilike.*${term}*,phone.ilike.*${term}*)`;
      }
      const { rows, total } = await select('suppliers', { params, range: { from: 0, to: 199 } });
      $('#count').textContent = `${integer(total ?? rows.length)} supplier${
        (total ?? rows.length) === 1 ? '' : 's'}`;

      mount(results, table(
        [
          { label: 'Supplier', cell: (r) => el('a', { href: `/admin/suppliers/view/?id=${r.id}` }, [
              el('span.table__main', { text: r.name }),
              r.contact_person ? el('span.table__sub', { text: r.contact_person }) : null,
            ]) },
          { label: 'Phone', narrow: true, cell: (r) =>
              (r.phone ? el('a', { href: `tel:${r.phone.replace(/[^\d+]/g, '')}` }, [r.phone]) : '—') },
          { label: 'Email', narrow: true, cell: (r) =>
              (r.email ? el('a', { href: `mailto:${r.email}` }, [r.email]) : '—') },
          { label: 'Status', cell: (r) =>
              (r.is_active ? badge('Active', 'ok') : badge('Inactive', 'info')) },
          { label: 'Actions', cell: (r) => el('div.row.row--end', {}, [
              el('a.btn.btn--ghost.btn--sm', { href: `/admin/suppliers/view/?id=${r.id}` }, ['View']),
              el('button.btn.btn--ghost.btn--sm', {
                type: 'button', onclick: () => openForm(r),
              }, ['Edit']),
              el('button.btn.btn--ghost.btn--sm', {
                type: 'button', onclick: () => toggle(r),
              }, [r.is_active ? 'Deactivate' : 'Reactivate']),
            ]) },
        ],
        rows,
        {
          caption: 'Suppliers',
          empty: empty(
            searchBox.value ? 'No supplier matches that' : 'No suppliers yet',
            searchBox.value
              ? 'Try part of the name, the contact or the phone number.'
              : 'Add the first one so stock-ins can record where goods came from.',
          ),
        },
      ));
    } catch (err) {
      mount(results, errorState(err, load));
    }
  }

  async function toggle(row) {
    // Deactivating hides a supplier from new stock-ins. It cannot remove them
    // from movements already recorded, and should not — that is the history.
    if (row.is_active) {
      const ok = await confirmDialog({
        title: `Deactivate ${row.name}?`,
        message:
          'They stop being offered on the stock-in screen. Deliveries already recorded ' +
          'against them are untouched — that is the purchase history.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await update('suppliers', { id: `eq.${row.id}` }, { is_active: !row.is_active });
      invalidate('suppliers');
      toast(row.is_active ? `${row.name} deactivated.` : `${row.name} is active again.`);
      load();
    } catch (err) {
      toastError(err);
    }
  }

  function openForm(existing) {
    const isNew = !existing;
    const f = {
      name: input({ value: existing?.name || '', placeholder: 'ABC Electronics' }),
      contact_person: input({ value: existing?.contact_person || '', placeholder: 'Bikash Shrestha' }),
      phone: input({ type: 'tel', value: existing?.phone || '', placeholder: '+977 98XXXXXXXX' }),
      email: input({ type: 'email', value: existing?.email || '', spellcheck: 'false' }),
      address: textarea({ rows: 2, value: existing?.address || '' }),
      notes: textarea({ rows: 3, value: existing?.notes || '',
        placeholder: 'Payment terms, lead times, anything worth remembering.' }),
    };
    const activeBox = checkbox('Active', { checked: existing ? existing.is_active : true });

    const form = el('form.card', { novalidate: true }, [
      el('h2.card__title', { text: isNew ? 'Add supplier' : `Edit ${existing.name}` }),
      el('div.form-grid', {}, [
        field('Name', f.name, { required: true }),
        field('Contact person', f.contact_person),
      ]),
      el('div.form-grid', {}, [
        field('Phone', f.phone),
        field('Email', f.email),
      ]),
      field('Address', f.address),
      field('Notes', f.notes, { hint: 'Internal only — never shown on the public site.' }),
      activeBox,
      el('div.form-actions', {}, [
        el('button.btn.btn--primary', { type: 'submit', id: 'save' }, [isNew ? 'Add supplier' : 'Save']),
        el('button.btn.btn--ghost', { type: 'button', onclick: () => mount(formSlot) }, ['Cancel']),
      ]),
    ]);

    mount(formSlot, form);
    f.name.focus();
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      const name = f.name.value.trim();
      if (!name) { setFieldError(f.name, 'A supplier needs a name.'); f.name.focus(); return; }
      const email = f.email.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFieldError(f.email, 'That does not look like an email address.');
        f.email.focus();
        return;
      }

      await submitting($('#save'), async () => {
        const payload = {
          name,
          contact_person: f.contact_person.value.trim() || null,
          phone: f.phone.value.trim() || null,
          email: email || null,
          address: f.address.value.trim() || null,
          notes: f.notes.value.trim() || null,
          is_active: activeBox.querySelector('input').checked,
        };
        try {
          if (isNew) await insert('suppliers', payload);
          else await update('suppliers', { id: `eq.${existing.id}` }, payload);
          invalidate('suppliers');
          toast(isNew ? `${name} added.` : 'Saved.');
          mount(formSlot);
          load();
        } catch (err) {
          if (err instanceof AppError && err.code === 'DUPLICATE') {
            setFieldError(f.name, 'A supplier with that name already exists.');
            f.name.focus();
            return;
          }
          toastError(err);
        }
      });
    });
  }

  searchBox.addEventListener('input', debounce(load, 250));
  showInactive.querySelector('input').addEventListener('change', load);

  // The dashboard's "Add supplier" quick action arrives with ?new=1.
  if (param('new')) openForm(null);

  await load();
}
