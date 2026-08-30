/**
 * The brand carries no decorative iconography — categories, features and
 * contact details are set in type instead. The only mark kept is WhatsApp's,
 * because it identifies a third-party platform on the site's primary call to
 * action; a WhatsApp button without it is measurably less recognisable.
 *
 * Arrows are typed as the "→" character rather than drawn.
 */

export const icons = {
  whatsapp:
    '<path fill="currentColor" d="M12.04 2C6.6 2 2.2 6.4 2.2 11.84a9.75 9.75 0 0 0 1.34 4.94L2 22l5.35-1.4a9.85 9.85 0 0 0 4.69 1.19h.01c5.43 0 9.84-4.4 9.84-9.84 0-2.63-1.02-5.1-2.88-6.96A9.78 9.78 0 0 0 12.04 2Zm0 17.94h-.01a8.2 8.2 0 0 1-4.16-1.14l-.3-.18-3.1.81.83-3.02-.2-.31a8.14 8.14 0 0 1-1.25-4.36c0-4.51 3.68-8.18 8.2-8.18a8.13 8.13 0 0 1 5.78 2.4 8.1 8.1 0 0 1 2.4 5.79c0 4.52-3.68 8.19-8.19 8.19Zm4.49-6.13c-.24-.12-1.45-.72-1.68-.8-.23-.08-.39-.12-.55.12-.17.25-.64.8-.78.97-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.23-1.46-1.37-1.7-.14-.25-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.15.16-.25.24-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.6.19 1.14.16 1.56.1.48-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.15-1.18-.06-.1-.22-.16-.46-.28Z"/>',
};

/**
 * @param {string} name  key from `icons`
 * @param {object} opts  { size, className, label }
 */
export function icon(name, { size = 24, className = '', label = '' } = {}) {
  const body = icons[name];
  if (!body) return '';
  const a11y = label
    ? `role="img" aria-label="${label}"`
    : 'aria-hidden="true" focusable="false"';
  const cls = ['icon', className].filter(Boolean).join(' ');
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${a11y}>${body}</svg>`;
}

export default icons;
