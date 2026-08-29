import { absoluteUrl } from '../lib/html.js';
import { esc } from '../lib/html.js';
import { icon } from '../templates/icons.js';
import { layout } from '../templates/layout.js';
import { pageHead, whatsappButton, breadcrumbSchema } from '../templates/components.js';

/**
 * NOTE FOR THE SITE OWNER
 * ------------------------
 * Nothing on this page invents company history, dates, sizes or distribution
 * claims. Sections you have not supplied yet are rendered as clearly marked
 * "[ADD ...]" placeholders. Fill them in (or delete the block) and re-deploy.
 */

function placeholderBlock(title, hint) {
  return `<div class="fill-me">
  <h3>${esc(title)}</h3>
  <p>${esc(hint)}</p>
</div>`;
}

export function aboutPage() {
  const crumbs = [
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about/' },
  ];

  const focus = [
    {
      icon: 'truck',
      title: 'Reliable supply',
      body: 'Keeping the lines our customers depend on consistently available, order after order.',
    },
    {
      icon: 'tag',
      title: 'Competitive wholesale pricing',
      body: 'Trade rates quoted per case or carton, so retailers can price with confidence.',
    },
    {
      icon: 'shield',
      title: 'Quality products',
      body: 'Sealed, in-date stock, stored and handled properly before it reaches your shop.',
    },
    {
      icon: 'handshake',
      title: 'Long-term relationships',
      body: 'We would rather be a supplier a business keeps than one it uses once.',
    },
  ];

  const body = `
${pageHead({
  eyebrow: 'About Us',
  title: 'About PowerKing Nepal',
  lead: 'PowerKing Nepal is a wholesale distribution and supply business serving retailers and businesses in Nepal.',
  crumbs,
})}

<section class="section">
  <div class="container prose-grid">
    <div class="prose">
      <h2>What we do</h2>
      <p>
        We supply products in wholesale quantities to shops, retailers and
        businesses. Rather than selling online, we work the way wholesale
        actually works: you tell us what you need, we quote a trade price for
        the quantity you want, and we arrange supply.
      </p>
      <p>
        This website is our online catalogue. It exists so you can see what we
        carry before you get in touch — every product page has a WhatsApp
        button that opens a message with that product already filled in.
      </p>

      <h2>How ordering works</h2>
      <ol class="steps">
        <li><strong>Browse the catalogue.</strong> Search by product, brand or category.</li>
        <li><strong>Send an enquiry.</strong> Tap “Enquire on WhatsApp” on any product.</li>
        <li><strong>Get your trade price.</strong> We reply with pricing, availability and MOQ.</li>
        <li><strong>Confirm your order.</strong> We arrange supply directly with you.</li>
      </ol>
    </div>

    <aside class="side-card">
      <h2 class="side-card__title">Talk to us</h2>
      <p>Wholesale enquiries are answered fastest on WhatsApp.</p>
      ${whatsappButton({ location: 'about_sidebar', label: 'Enquire on WhatsApp', block: true })}
      <a class="btn btn--outline btn--block" href="/contact/">Contact details</a>
    </aside>
  </div>
</section>

<section class="section section--alt">
  <div class="container">
    <p class="eyebrow">Our Focus</p>
    <h2 class="section__title">What we work towards</h2>
    <ul class="props props--4">
      ${focus
        .map(
          (f) => `<li class="prop">
        <span class="prop__icon" aria-hidden="true">${icon(f.icon, { size: 22 })}</span>
        <h3 class="prop__title">${esc(f.title)}</h3>
        <p class="prop__body">${esc(f.body)}</p>
      </li>`,
        )
        .join('')}
    </ul>
  </div>
</section>

<section class="section">
  <div class="container">
    <p class="eyebrow">To be completed</p>
    <h2 class="section__title">More about the business</h2>
    <p class="section__lead">
      These sections are ready and waiting for your details. Edit
      <code>src/pages/about.js</code> to replace each block with real
      information — nothing here has been invented.
    </p>
    <div class="fill-grid">
      ${placeholderBlock('Company history', '[ADD WHEN THE BUSINESS WAS ESTABLISHED AND A SHORT HISTORY]')}
      ${placeholderBlock('Location', '[ADD WAREHOUSE / OFFICE LOCATION]')}
      ${placeholderBlock('Years in business', '[ADD YEARS IN BUSINESS]')}
      ${placeholderBlock('Brands we carry', '[ADD THE BRANDS YOU DISTRIBUTE]')}
      ${placeholderBlock('Distribution areas', '[ADD THE AREAS/DISTRICTS YOU SUPPLY — do not claim nationwide coverage unless it is accurate]')}
      ${placeholderBlock('Mission &amp; vision', '[ADD MISSION AND VISION STATEMENT]')}
    </div>
  </div>
</section>

<section class="cta">
  <div class="container cta__inner">
    <div>
      <h2 class="cta__title">Looking for a wholesale supplier?</h2>
      <p class="cta__body">Send us your product list and we will come back with pricing.</p>
    </div>
    <div class="cta__actions">
      ${whatsappButton({ location: 'about_cta', label: 'Enquire on WhatsApp', size: 'lg' })}
      <a class="btn btn--outline btn--lg" href="/products/">Browse products</a>
    </div>
  </div>
</section>`;

  return layout({
    title: 'About Us',
    description:
      'PowerKing Nepal is a wholesale distribution and supply business in Nepal, supplying retailers and businesses. Learn how we work and how to enquire about wholesale pricing.',
    path: '/about/',
    activeNav: 'about',
    bodyClass: 'page-about',
    body,
    schema: [breadcrumbSchema(crumbs, absoluteUrl)],
  });
}

export default aboutPage;
