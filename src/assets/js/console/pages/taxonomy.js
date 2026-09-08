/**
 * ============================================================================
 *  CATEGORIES AND BRANDS — the shared screen behind both
 * ============================================================================
 *  Two lists that differ by a word and a column. Written once, because the
 *  interesting behaviour is identical and worth getting right in one place:
 *
 *    • the slug follows the name until somebody edits it, and never follows
 *      it on an existing record — that slug is in the public URL and in links
 *      already shared
 *    • deleting is offered only when it would succeed. A category holding
 *      products is refused by a foreign key, so the screen counts first and
 *      explains, rather than presenting a button that fails
 *    • deactivating is always available, and is what people actually want
 * ============================================================================
 */

import {
  el, mount, table, badge, empty, errorState, loading, thumb,
  field, input, textarea, checkbox, toast, toastError, confirmDialog,
  setFieldError, clearFieldErrors, submitting, $,
} from '../ui.js';
import { integer, slugify } from '../format.js';
import { can } from '../session.js';
import { invalidate } from '../data.js';
import { select, insert, update, remove, uploadImage, AppError } from '../client.js';

/**
 * @param {object} o
 * @param {'categories'|'brands'} o.tableName
 * @param {string} o.singular       'category'
 * @param {string} o.plural         'Categories'
 * @param {string} o.imageLabel     'Image' | 'Logo'
 * @param {boolean} o.hasDescription
 * @param {string} o.imageColumn    'image' | 'logo'
 * @param {string} o.countColumn    the products FK to count on
 */
export async function taxonomyPage({ me, root }, o) {
  const editable = can('manageCatalogue', me.role);
  const results = el('div#results', {}, [loading()]);
  const formSlot = el('div#form-slot');

  mount(root, el('div.stack', {}, [
    el('div.row', {}, [
      el('p.small.muted#count'),
      el('span.spacer'),
      editable
        ? el('button.btn.btn--primary.btn--sm', {
            type: 'button', id: 'add', onclick: () => openForm(null),
          }, [`Add ${o.singular}`])
        : null,
    ]),
    formSlot,
    el('div.card', {}, [results]),
  ]));

  /**
   * Both lists and their product counts in one request.
   *
   * PostgREST resolves the embedded aggregate as a join, so this is one round
   * trip rather than one per row — which at forty brands is the difference
   * between a page and a wait.
   */
  async function load() {
    mount(results, loading());
    try {
      const { rows } = await select(o.tableName, {
        params: {
          select: `id,name,slug,${o.imageColumn},is_active,created_at` +
            (o.hasDescription ? ',description' : '') +
            ',products(count)',
          order: 'name.asc',
        },
      });
      const withCounts = rows.map((r) => ({ ...r, product_count: r.products?.[0]?.count ?? 0 }));
      $('#count').textContent =
        `${integer(withCounts.length)} ${withCounts.length === 1 ? o.singular : o.plural.toLowerCase()}`;

      mount(results, table(
        [
          {
            label: o.plural.replace(/ies$/, 'y').replace(/s$/, ''),
            cell: (r) => el('div.row', {}, [
              thumb(r[o.imageColumn], ''),
              el('span', {}, [
                el('span.table__main', { text: r.name }),
                el('span.table__sub', { text: `/${r.slug}` }),
              ]),
            ]),
          },
          o.hasDescription
            ? { label: 'Description', narrow: true, cell: (r) => r.description || '—' }
            : null,
          {
            label: 'Products', numeric: true,
            cell: (r) => el('a', { href: `/admin/products/?${o.tableName === 'brands' ? 'brand' : 'category'}=${r.id}&status=all` },
              [integer(r.product_count)]),
          },
          {
            label: 'Status',
            cell: (r) => (r.is_active ? badge('Active', 'ok') : badge('Inactive', 'info')),
          },
          {
            label: 'Actions',
            cell: (r) => (editable
              ? el('div.row.row--end', {}, [
                  el('button.btn.btn--ghost.btn--sm', {
                    type: 'button', onclick: () => openForm(r),
                  }, ['Edit']),
                  el('button.btn.btn--ghost.btn--sm', {
                    type: 'button', onclick: () => toggle(r),
                  }, [r.is_active ? 'Deactivate' : 'Reactivate']),
                  can('manageUsers', me.role)
                    ? el('button.btn.btn--ghost.btn--sm', {
                        type: 'button', onclick: () => destroy(r),
                      }, ['Delete'])
                    : null,
                ])
              : el('span.faint', { text: '—' })),
          },
        ].filter(Boolean),
        withCounts,
        {
          caption: o.plural,
          empty: empty(`No ${o.plural.toLowerCase()} yet`,
            `Add the first ${o.singular} so products have somewhere to go.`),
        },
      ));
    } catch (err) {
      mount(results, errorState(err, load));
    }
  }

  async function toggle(row) {
    // Deactivating a category takes its products off the public site with it,
    // which is a bigger consequence than the button implies. Say so.
    if (row.is_active && row.product_count > 0) {
      const ok = await confirmDialog({
        title: `Deactivate ${row.name}?`,
        message:
          `${row.product_count} product${row.product_count === 1 ? '' : 's'} ` +
          `${row.product_count === 1 ? 'is' : 'are'} in this ${o.singular}. ` +
          (o.tableName === 'categories'
            ? 'They will disappear from the public catalogue too, and come back if you switch it on again.'
            : 'They stay in the catalogue; only the brand stops being offered as a filter.'),
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await update(o.tableName, { id: `eq.${row.id}` }, { is_active: !row.is_active });
      invalidate(o.tableName);
      toast(row.is_active ? `${row.name} deactivated.` : `${row.name} is active again.`);
      load();
    } catch (err) {
      toastError(err);
    }
  }

  async function destroy(row) {
    if (row.product_count > 0) {
      toast(
        `${row.name} still has ${row.product_count} product` +
        `${row.product_count === 1 ? '' : 's'}, so it cannot be deleted. ` +
        'Move them elsewhere first, or deactivate it instead.',
        { type: 'error' },
      );
      return;
    }
    const ok = await confirmDialog({
      title: `Delete ${row.name}?`,
      message: `It holds no products, so nothing is lost. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove(o.tableName, { id: `eq.${row.id}` });
      invalidate(o.tableName);
      toast(`${row.name} deleted.`);
      load();
    } catch (err) {
      toastError(err);
    }
  }

  /* ------------------------------------------------------------- form --- */

  function openForm(existing) {
    const isNew = !existing;
    const f = {
      name: input({ value: existing?.name || '' }),
      slug: input({ value: existing?.slug || '', spellcheck: 'false' }),
      description: textarea({ rows: 3, value: existing?.description || '' }),
      image: input({ type: 'file', accept: 'image/jpeg,image/png,image/webp,image/avif' }),
    };
    const activeBox = checkbox('Active', { checked: existing ? existing.is_active : true });

    let slugTouched = !isNew;
    f.slug.addEventListener('input', () => { slugTouched = true; });
    f.name.addEventListener('input', () => {
      if (!slugTouched) f.slug.value = slugify(f.name.value);
    });

    const form = el('form.card', { novalidate: true }, [
      el('h2.card__title', { text: isNew ? `Add ${o.singular}` : `Edit ${existing.name}` }),
      el('div.form-grid', {}, [
        field('Name', f.name, { required: true }),
        field('Web address', f.slug, {
          required: true,
          hint: isNew ? 'Filled in from the name.' : 'Changing this breaks links already shared.',
        }),
      ]),
      o.hasDescription ? field('Description', f.description) : null,
      field(o.imageLabel, f.image, { hint: 'JPEG, PNG or WebP, up to 5 MB. Optional.' }),
      activeBox,
      el('div.form-actions', {}, [
        el('button.btn.btn--primary', { type: 'submit', id: 'save' }, [isNew ? 'Add' : 'Save']),
        el('button.btn.btn--ghost', {
          type: 'button', onclick: () => mount(formSlot),
        }, ['Cancel']),
      ]),
    ]);

    mount(formSlot, form);
    f.name.focus();
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);

      const name = f.name.value.trim();
      const slug = f.slug.value.trim();
      if (!name) { setFieldError(f.name, 'A name is required.'); f.name.focus(); return; }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        setFieldError(f.slug, 'Lowercase letters, numbers and hyphens only.');
        f.slug.focus();
        return;
      }

      await submitting($('#save'), async () => {
        try {
          const payload = { name, slug, is_active: activeBox.querySelector('input').checked };
          if (o.hasDescription) payload.description = f.description.value.trim();

          const file = f.image.files?.[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              setFieldError(f.image, 'That image is larger than 5 MB.');
              return;
            }
            const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.jpg').toLowerCase();
            payload[o.imageColumn] = await uploadImage(
              file, `${o.tableName}/${slug}-${Date.now()}${ext}`);
          }

          if (isNew) await insert(o.tableName, payload);
          else await update(o.tableName, { id: `eq.${existing.id}` }, payload);

          invalidate(o.tableName);
          toast(isNew ? `${name} added.` : 'Saved.');
          mount(formSlot);
          load();
        } catch (err) {
          const appErr = err instanceof AppError ? err : null;
          if (appErr?.code === 'DUPLICATE') {
            setFieldError(f.name, `A ${o.singular} with that name or web address already exists.`);
            f.name.focus();
            return;
          }
          toastError(err);
        }
      });
    });
  }

  await load();
}

export default taxonomyPage;
