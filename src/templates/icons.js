/**
 * The brand carries no decorative iconography — categories, features and
 * contact details are set in type instead. The only mark kept is WhatsApp's,
 * because it identifies a third-party platform on the site's primary call to
 * action; a WhatsApp button without it is measurably less recognisable.
 *
 * Arrows elsewhere are typed as the "→" character; `arrow` here is the drawn
 * version, used where it has to optically match the WhatsApp mark beside it
 * on the icon-only card actions.
 */

const SPRITE_PREFIX = 'pk-i-';

export const icons = {
  arrow:
    '<path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  // The enquiry list's add / added states. Two marks rather than a label,
  // because the control sits in the card's icon-only action row.
  plus:
    '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  check:
    '<path d="m4.5 12.5 5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  search:
    '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m16.5 16.5 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  close:
    '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  // The persistent bottom bar on a phone. Line drawings at the same weight as
  // the rest, so the bar reads as one row rather than a mixed set.
  home:
    '<path d="M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  grid:
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  // Decorative marks for the wide-screen call to action. Line drawings at the
  // same weight as the rest so they read as one family.
  carton:
    '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7.5 12 12l9-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  truck:
    '<path d="M2 6.5h11v9H2zM13 9.5h4l3 3v3h-7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  speaker:
    '<rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="15" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="7" r="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  whatsapp:
    '<path fill="currentColor" d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84a9.75 9.75 0 0 0 1.34 4.94L2 22l5.35-1.4a9.85 9.85 0 0 0 4.69 1.19h.01c5.43 0 9.84-4.4 9.84-9.84 0-2.63-1.02-5.1-2.88-6.96A9.78 9.78 0 0 0 12.04 2Zm0 17.94h-.01a8.2 8.2 0 0 1-4.16-1.14l-.3-.18-3.1.81.83-3.02-.2-.31a8.14 8.14 0 0 1-1.25-4.36c0-4.51 3.68-8.18 8.2-8.18a8.13 8.13 0 0 1 5.78 2.4 8.1 8.1 0 0 1 2.4 5.79c0 4.52-3.68 8.19-8.19 8.19Zm4.49-6.13c-.24-.12-1.45-.72-1.68-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.6.19 1.14.16 1.56.1.48-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.15-1.18-.06-.1-.22-.16-.46-.28Z"/>',
};

/**
 * Every icon is emitted once per page as a <symbol> and referenced from each
 * card with <use>. Inlining the paths instead cost 1.2 KB per card, which at
 * catalogue scale was 44% of the page — the sprite makes that constant.
 */
export function iconSprite() {
  const symbols = Object.keys(icons)
    .map((name) => `<symbol id="${SPRITE_PREFIX}${name}" viewBox="0 0 24 24">${icons[name]}</symbol>`)
    .join('');
  return `<svg class="icon-sprite" aria-hidden="true" focusable="false" width="0" height="0">${symbols}</svg>`;
}

/**
 * @param {string} name  key from `icons`
 * @param {object} opts  { size, className, label }
 */
export function icon(name, { size = 24, className = '', label = '' } = {}) {
  if (!icons[name]) return '';
  const a11y = label
    ? `role="img" aria-label="${label}"`
    : 'aria-hidden="true" focusable="false"';
  const cls = ['icon', className].filter(Boolean).join(' ');
  return `<svg class="${cls}" width="${size}" height="${size}" ${a11y}><use href="#${SPRITE_PREFIX}${name}"/></svg>`;
}

export default icons;
