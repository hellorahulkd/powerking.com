/**
 * Small shared helpers used by the page templates.
 * Deliberately dependency-free.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';

import { siteConfig, whatsappMessages } from '../config/site.config.js';

/** Escape a value for safe interpolation into HTML text or attributes. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape a value for embedding inside a <script> JSON payload. */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/** Absolute URL for a site-root-relative path. */
export function absoluteUrl(path = '/') {
  const base = siteConfig.domain.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** True when a usable WhatsApp number has been configured. */
export function hasWhatsApp() {
  return /^\d{8,15}$/.test(String(siteConfig.whatsappNumber || '').trim());
}

/**
 * Build a WhatsApp click-to-chat URL.
 * If no number is configured yet, fall back to the contact page so the site
 * never ships a broken link.
 *
 * @param {string} messageKey  key from whatsappMessages, or a literal message
 * @param {object} vars        values for {placeholders} in the message
 */
export function whatsappUrl(messageKey = 'general', vars = {}) {
  let message = whatsappMessages[messageKey] ?? messageKey;
  for (const [key, val] of Object.entries(vars)) {
    message = message.replaceAll(`{${key}}`, val);
  }
  if (!hasWhatsApp()) return '/contact/';
  const number = String(siteConfig.whatsappNumber).trim();
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Render a value, or a clearly-marked placeholder when it is missing. */
export function orPlaceholder(value, placeholderLabel) {
  const v = String(value ?? '').trim();
  if (v) return { text: v, isPlaceholder: false };
  return { text: `[ADD ${placeholderLabel}]`, isPlaceholder: true };
}

/** Single-line, length-capped text suitable for a meta description. */
export function metaDescription(text, max = 158) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/[\s,;:.-]+\S*$/, '')}…`;
}

/**
 * Format the configured address as a single line.
 * Returns '' when only the country is filled in — "Nepal" on its own is not an
 * address, and showing it would hide the fact that the address is still
 * missing. Callers then render a visible [ADD BUSINESS ADDRESS] placeholder.
 */
export function addressLine() {
  const a = siteConfig.address || {};
  const specific = [a.line1, a.line2, a.city, a.district]
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (!specific.length) return '';
  const country = String(a.country || '').trim();
  return [...specific, country].filter(Boolean).join(', ');
}

/** Digits-only phone, usable in a tel: link. */
export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

/** Join class names, dropping falsy entries. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Pick the image a link-preview crawler should use for a product.
 *
 * WhatsApp, Facebook and Messenger cannot render SVG. When a product's display
 * image is an SVG we look for a same-named .png beside it (see
 * scripts/rasterize.js) and fall back to the site's default Open Graph card.
 * Real photographs (.jpg/.png/.webp) are used directly, so this becomes a
 * no-op as soon as you upload your own product photos.
 */
export function socialImage(product) {
  const img = String(product?.image || '');
  if (!img) return '/images/hero/og-default.png';
  if (!img.toLowerCase().endsWith('.svg')) return img;
  const png = img.replace(/\.svg$/i, '.png');
  const abs = path.join(process.cwd(), 'public', png);
  return existsSync(abs) ? png : '/images/hero/og-default.png';
}
