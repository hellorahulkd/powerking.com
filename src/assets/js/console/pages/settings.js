/**
 * ============================================================================
 *  SETTINGS — /admin/settings/
 * ============================================================================
 *  Three things: who has access, where stock is kept, and how much the public
 *  catalogue is told about availability.
 *
 *  ── HOW A USER IS CREATED ────────────────────────────────────────────────
 *  Not here. Creating an auth account needs the service-role key, which this
 *  application deliberately does not have and has nowhere safe to keep — see
 *  src/config/supabase.config.js. An admin invites somebody from the Supabase
 *  dashboard, a trigger gives them a profile, and their role is set on this
 *  screen. That is one manual step a few times a year in exchange for never
 *  shipping a key that bypasses every policy in the database.
 * ============================================================================
 */

import {
  el, mount, table, badge, empty, errorState, loading, field, input, checkbox,
  select as selectEl, toast, toastError, confirmDialog, submitting, $,
} from '../ui.js';
import { dateTime, ROLE_LABELS, integer } from '../format.js';
import { can, currentProfile } from '../session.js';
import { invalidate, locations } from '../data.js';
import { select, insert, update, AppError, SUPABASE_URL } from '../client.js';

/* ---------------------------------------------------------------- people -- */

async function peopleCard(me) {
  const slot = el('div#people', {}, [loading()]);

  async function load() {
    mount(slot, loading());
    try {
      const { rows } = await select('profiles', {
        params: { select: 'id,full_name,email,role,is_active,created_at', order: 'full_name.asc' },
      });
      const activeAdmins = rows.filter((r) => r.role === 'admin' && r.is_active).length;

      mount(slot, table(
        [
          { label: 'Name', cell: (r) => el('span', {}, [
              el('span.table__main', { text: r.full_name || '—' }),
              el('span.table__sub', { text: r.email || '' }),
            ]) },
          {
            label: 'Role',
            cell: (r) => {
              if (!can('manageUsers', me.role)) return ROLE_LABELS[r.role];
              const box = selectEl(
                ['staff', 'manager', 'admin'].map((v) =>
                  ({ value: v, label: ROLE_LABELS[v], selected: v === r.role })),
                { 'aria-label': `Role for ${r.full_name || r.email}` },
              );
              box.addEventListener('change', async () => {
                try {
                  await update('profiles', { id: `eq.${r.id}` }, { role: box.value });
                  toast(`${r.full_name || r.email} is now ${ROLE_LABELS[box.value]}.`);
                  if (r.id === me.id) {
                    // Changed your own role: the sidebar and every permission
                    // check on the page are now stale.
                    await currentProfile({ force: true });
                    location.reload();
                  }
                  load();
                } catch (err) {
                  box.value = r.role;
                  toastError(err);
                }
              });
              return box;
            },
          },
          { label: 'Status', cell: (r) => (r.is_active ? badge('Active', 'ok') : badge('Disabled', 'bad')) },
          { label: 'Added', narrow: true, cell: (r) => dateTime(r.created_at) },
          {
            label: 'Actions',
            cell: (r) => {
              if (!can('manageUsers', me.role)) return '—';
              // The database refuses to disable the last active admin. Not
              // offering the button is friendlier than letting them find out.
              const isLastAdmin = r.role === 'admin' && r.is_active && activeAdmins === 1;
              return el('div.row.row--end', {}, [
                el('button.btn.btn--ghost.btn--sm', {
                  type: 'button',
                  disabled: isLastAdmin,
                  title: isLastAdmin ? 'The last active admin cannot be disabled.' : '',
                  onclick: async () => {
                    if (r.is_active) {
                      const ok = await confirmDialog({
                        title: `Disable ${r.full_name || r.email}?`,
                        message:
                          'They are signed out immediately and can read nothing until they ' +
                          'are switched back on. Their stock movements stay in the history.',
                        confirmLabel: 'Disable',
                        danger: true,
                      });
                      if (!ok) return;
                    }
                    try {
                      await update('profiles', { id: `eq.${r.id}` }, { is_active: !r.is_active });
                      toast(r.is_active ? 'Access removed.' : 'Access restored.');
                      load();
                    } catch (err) {
                      toastError(err);
                    }
                  },
                }, [r.is_active ? 'Disable' : 'Enable']),
              ]);
            },
          },
        ],
        rows,
        { caption: 'People', empty: empty('No profiles', 'That should not be possible.') },
      ));
    } catch (err) {
      mount(slot, errorState(err, load));
    }
  }

  await load();

  const project = SUPABASE_URL.match(/https:\/\/([a-z0-9-]+)\./)?.[1];
  return el('div.card', {}, [
    el('div.card__head', {}, [el('h2.card__title', { text: 'People' })]),
    slot,
    can('manageUsers', me.role)
      ? el('div', {}, [
          el('p.f__hint', {
            text:
              'New accounts are invited from the Supabase dashboard, under Authentication → ' +
              'Users. They appear here as Staff a moment later, and you set the role from ' +
              'this table.',
          }),
          el('p.f__hint', {
            text:
              'Creating an account from inside this application would need the service-role ' +
              'key, which bypasses every rule in the database and has nowhere safe to live in ' +
              'a site with no server. One manual step a few times a year is the better trade.',
          }),
          project
            ? el('a.btn.btn--ghost.btn--sm', {
                href: `https://supabase.com/dashboard/project/${project}/auth/users`,
                target: '_blank', rel: 'noopener',
              }, ['Open Supabase → Users'])
            : null,
        ])
      : null,
  ]);
}

/* ------------------------------------------------------------- locations -- */

async function locationsCard(me) {
  const slot = el('div#locations', {}, [loading()]);
  const editable = can('manageSettings', me.role);

  async function load() {
    mount(slot, loading());
    try {
      const { rows } = await select('inventory_locations', {
        params: { select: 'id,name,address,description,is_default,is_active,created_at',
          order: 'is_default.desc,name.asc' },
      });
      mount(slot, table(
        [
          { label: 'Location', cell: (r) => el('span', {}, [
              el('span.table__main', { text: r.name }),
              r.address ? el('span.table__sub', { text: r.address }) : null,
            ]) },
          { label: 'Default', cell: (r) => (r.is_default ? badge('Default', 'ok') : '—') },
          { label: 'Status', cell: (r) => (r.is_active ? badge('Active', 'ok') : badge('Inactive', 'info')) },
        ],
        rows,
        { caption: 'Storage locations', empty: empty('No locations', 'Add one to record stock against.') },
      ));
    } catch (err) {
      mount(slot, errorState(err, load));
    }
  }

  await load();

  const nameBox = input({ placeholder: 'Second warehouse' });
  const addressBox = input({ placeholder: 'Where it is' });

  return el('div.card', {}, [
    el('h2.card__title', { text: 'Storage locations' }),
    el('p.f__hint', {
      text:
        'Stock is counted per location. One is enough for most shops; a second is a row ' +
        'here rather than a change to the system.',
    }),
    slot,
    editable
      ? el('form.row', {
          onsubmit: async (e) => {
            e.preventDefault();
            const name = nameBox.value.trim();
            if (!name) return;
            try {
              await insert('inventory_locations', {
                name, address: addressBox.value.trim() || null,
              });
              invalidate('locations');
              nameBox.value = '';
              addressBox.value = '';
              toast(`${name} added.`);
              load();
            } catch (err) {
              toastError(err);
            }
          },
        }, [
          nameBox, addressBox,
          el('button.btn.btn--ghost.btn--sm', { type: 'submit' }, ['Add location']),
        ])
      : null,
  ]);
}

/* ---------------------------------------------------------- public stock -- */

const MODES = [
  { value: 'badge',  label: 'In stock / Low stock / Out of stock',
    hint: 'Most informative. Still never shows a number.' },
  { value: 'binary', label: 'In stock / Contact for availability',
    hint: 'Tells a buyer whether to ask, and nothing more.' },
  { value: 'off',    label: 'Always “Contact for availability”',
    hint: 'Says nothing about stock at all.' },
];

async function publicStockCard(me) {
  const editable = can('manageSettings', me.role);
  let current = 'badge';
  try {
    const { rows } = await select('app_settings', {
      params: { select: 'key,value', key: 'eq.public_stock_display' },
    });
    current = rows[0]?.value?.mode || 'badge';
  } catch { /* fall back to the default and let the card explain itself */ }

  const box = selectEl(
    MODES.map((m) => ({ value: m.value, label: m.label, selected: m.value === current })),
    { 'aria-label': 'Public stock display', disabled: !editable },
  );
  const hint = el('p.f__hint', { text: MODES.find((m) => m.value === current)?.hint || '' });

  box.addEventListener('change', async () => {
    hint.textContent = MODES.find((m) => m.value === box.value)?.hint || '';
    try {
      await update('app_settings', { key: 'eq.public_stock_display' },
        { value: { mode: box.value } });
      toast('Saved. It applies the next time the site is built.');
    } catch (err) {
      box.value = current;
      toastError(err);
    }
  });

  return el('div.card', {}, [
    el('h2.card__title', { text: 'What the public catalogue says about stock' }),
    el('p.f__hint', {
      text:
        'Exact quantities are never published, whichever of these is chosen — the public ' +
        'view has no quantity column for them to come out of. This decides how much of a ' +
        'hint a customer gets.',
    }),
    field('Stock wording', box),
    hint,
    el('p.f__hint', {
      text:
        'The public catalogue is pre-rendered so that WhatsApp and Facebook can read it, ' +
        'so a change here takes effect on the next build rather than immediately.',
    }),
  ]);
}

/* --------------------------------------------------------------- render --- */

export default async function settings({ me, root }) {
  mount(root, loading('Loading settings…'));
  try {
    const [people, locs, publicStock] = await Promise.all([
      peopleCard(me),
      locationsCard(me),
      can('manageSettings', me.role) ? publicStockCard(me) : null,
    ]);
    mount(root, el('div.stack', {}, [
      people,
      locs,
      publicStock,
      el('div.card', {}, [
        el('h2.card__title', { text: 'This system' }),
        el('p.f__hint', {
          text:
            'Products, stock and history live in Supabase and are the single source of ' +
            'truth. The public catalogue is built from the same database, so a product ' +
            'switched off here leaves the website on the next build.',
        }),
        el('div.row', {}, [
          el('a.btn.btn--ghost.btn--sm', { href: '/admin/catalogue/' },
            ['Catalogue editor (photos and copy)']),
          el('a.btn.btn--ghost.btn--sm', { href: '/', target: '_blank', rel: 'noopener' },
            ['Public website']),
        ]),
      ]),
    ]));
  } catch (err) {
    mount(root, errorState(err, () => settings({ me, root })));
  }
}
