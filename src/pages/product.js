import { siteConfig } from '../config/site.config.js';
import {
  esc, absoluteUrl, whatsappUrl, jsonForScript, metaDescription, socialImage,
} from '../lib/html.js';
import { layout } from '../templates/layout.js';
import {
  whatsappButton, breadcrumbSchema, slugifyCategory,
} from '../templates/components.js';

function specRow(label, value) {
  if (!value) return '';
  return `<div class="spec">
    <dt>${esc(label)}</dt>
    <dd>${esc(value)}</dd>
  </div>`;
}

function gallery(product) {
  const images = [product.image, ...(product.gallery || [])].filter(Boolean);
  const main = `<div class="pd-gallery__main">
    <img id="pd-main-image" src="${esc(images[0])}" alt="${esc(product.name)} — ${esc(
      product.brand,
    )}" width="800" height="800" fetchpriority="high" decoding="async"
    onerror="this.closest('.pd-gallery__main').classList.add('is-fallback');this.remove()">
    ${product.sample ? '<span class="badge badge--sample badge--float">Sample product</span>' : ''}
  </div>`;

  if (images.length < 2) return `<div class="pd-gallery">${main}</div>`;

  const thumbs = images
    .map(
      (src, i) => `<button type="button" class="pd-thumb${i === 0 ? ' is-active' : ''}"
      data-full="${esc(src)}" aria-label="View image ${i + 1} of ${images.length}">
      <img src="${esc(src)}" alt="" width="120" height="120" loading="lazy" decoding="async">
    </button>`,
    )
    .join('');

  return `<div class="pd-gallery">
    ${main}
    <div class="pd-gallery__thumbs" role="group" aria-label="Product images">${thumbs}</div>
  </div>`;
}

/**
 * Side-by-side comparison against the other products in the same category.
 *
 * Rendered as a real table so the relationships survive a screen reader: row
 * headers name the attribute, column headers name the product. The whole
 * thing scrolls horizontally on a phone with the attribute column pinned, and
 * the chips above let a visitor drop columns they do not care about.
 */
function compareSection(product, siblings) {
  if (!siblings.length) return '';

  const all = [product, ...siblings];
  const rows = [
    ['Brand', (p) => p.brand],
    ['Pack size', (p) => p.packSize],
    ['Sold as', (p) => p.unit],
    ['SKU', (p) => p.sku],
    ['Availability', (p) => (p.available === false ? 'Currently unavailable' : 'Available')],
  ];

  const head = all
    .map(
      (p, i) => `<th scope="col" data-compare-col="${i}"${
        i === 0 ? ' class="is-current"' : ''
      }>
      <a class="compare__product" href="/products/${esc(p.slug)}/">
        <span class="compare__media">
          <img src="${esc(p.image)}" alt="" width="200" height="200" loading="lazy" decoding="async">
        </span>
        <span class="compare__name">${esc(p.name)}</span>
      </a>
      <span class="compare__flag${i === 0 ? '' : ' is-blank'}"${
        i === 0 ? '' : ' aria-hidden="true"'
      }>${i === 0 ? 'This product' : ''}</span>
    </th>`,
    )
    .join('');

  const body = rows
    .map(([label, get]) => {
      const cells = all
        .map((p, i) => {
          const v = get(p);
          return `<td data-compare-col="${i}"${i === 0 ? ' class="is-current"' : ''}>${
            v ? esc(v) : '<span class="compare__none">—</span>'
          }</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
    })
    .join('');

  const actions = all
    .map(
      (p, i) => `<td data-compare-col="${i}"${i === 0 ? ' class="is-current"' : ''}>
      ${whatsappButton({
        location: 'compare_table',
        product: p,
        label: 'Enquire',
        size: 'sm',
      })}
    </td>`,
    )
    .join('');

  const chips = siblings
    .map(
      (p, i) =>
        `<label class="compare__chip">
      <input type="checkbox" data-compare-toggle="${i + 1}" checked>
      <span>${esc(p.name)}</span>
    </label>`,
    )
    .join('');

  return `<section class="section section--alt" id="compare">
  <div class="container">
    <div class="section__head">
      <div>
        <p class="eyebrow">Compare</p>
        <h2 class="section__title">Others in ${esc(product.category)}</h2>
      </div>
      <a class="link-arrow" href="/products/${esc(slugifyCategory(product.category))}/">
        View category <span aria-hidden="true">→</span></a>
    </div>

    <fieldset class="compare__filters">
      <legend class="sr-only">Choose which products to compare</legend>
      ${chips}
    </fieldset>

    <div class="compare__scroll" tabindex="0" role="region"
         aria-label="Comparison table, scrollable">
      <table class="compare">
        <caption class="sr-only">
          ${esc(product.name)} compared with other ${esc(product.category)} products
        </caption>
        <thead><tr><td class="compare__corner"></td>${head}</tr></thead>
        <tbody>
          ${body}
          <tr class="compare__actions"><th scope="row">Enquire</th>${actions}</tr>
        </tbody>
      </table>
    </div>
    <p class="compare__note">
      Prices are quoted on enquiry. Message us with the products you are
      comparing and we will send trade pricing for each.
    </p>
  </div>
</section>`;
}

export function productPage({ product, related }) {
  const categorySlug = slugifyCategory(product.category);
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products/' },
    { label: product.category, href: `/products/${categorySlug}/` },
    { label: product.name, href: `/products/${product.slug}/` },
  ];

  const body = `
<section class="pd">
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs
      .map((c, i) =>
        i < crumbs.length - 1
          ? `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`
          : `<li><span aria-current="page">${esc(c.label)}</span></li>`,
      )
      .join('')}</ol></nav>

    <div class="pd__grid">
      ${gallery(product)}

      <div class="pd__info">
        <p class="pd__eyebrow">
          <a href="/brands/#${esc(slugifyCategory(product.brand))}">${esc(product.brand)}</a>
          <span aria-hidden="true">·</span>
          <a href="/products/${esc(categorySlug)}/">${esc(product.category)}</a>
        </p>
        <h1 class="pd__title">${esc(product.name)}</h1>

        ${
          product.available === false
            ? `<p class="pd__stock pd__stock--out">Currently unavailable — message us and we will let you know when it is back in stock.</p>`
            : `<p class="pd__stock">Available for wholesale supply</p>`
        }

        <dl class="pd__specs">
          ${specRow('Brand', product.brand)}
          ${specRow('Category', product.category)}
          ${specRow('Pack Size', product.packSize)}
          ${specRow('Sold As', product.unit)}
          ${specRow('SKU', product.sku)}
        </dl>

        <div class="pd__desc">
          <h2>Description</h2>
          <p>${esc(product.description)}</p>
        </div>

        <div class="enquiry" id="enquire">
          <h2 class="enquiry__title">Wholesale Enquiries</h2>
          <p class="enquiry__price">Contact us for wholesale pricing</p>
          <p class="enquiry__body">
            Message us for wholesale pricing, current availability and the
            minimum order quantity for this product. We will reply with a trade
            rate for your business.
          </p>
          ${whatsappButton({
            location: 'product_page',
            product,
            label: 'Enquire on WhatsApp',
            size: 'lg',
            block: true,
          })}
          <p class="enquiry__note">
            Opens WhatsApp with your enquiry about
            <strong>${esc(product.name)}</strong> already written for you.
          </p>
        </div>
      </div>
    </div>
  </div>
</section>

${compareSection(product, related)}`;

  const description = metaDescription(
    `${product.name} — ${product.brand}${
      product.packSize ? `, ${product.packSize}` : ''
    }. ${product.description} Contact PowerKing Nepal on WhatsApp for wholesale pricing and MOQ.`,
  );

  // Offer uses PriceSpecification without a price: we quote on enquiry, so
  // publishing a price here would be inaccurate.
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku || undefined,
    description: product.description,
    image: [absoluteUrl(socialImage(product))],
    brand: { '@type': 'Brand', name: product.brand },
    category: product.category,
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/products/${product.slug}/`),
      availability:
        product.available === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      priceCurrency: 'NPR',
      seller: { '@type': 'Organization', name: siteConfig.businessName },
    },
  };

  return layout({
    title: `${product.name} — ${product.brand}`,
    description,
    path: `/products/${product.slug}/`,
    image: socialImage(product),
    ogType: 'product',
    activeNav: 'products',
    bodyClass: 'page-product',
    body,
    schema: [productSchema, breadcrumbSchema(crumbs, absoluteUrl)],
    scripts: `<script>window.PK_PRODUCT=${jsonForScript({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      sku: product.sku || '',
    })};</script>`,
  });
}

export default productPage;
