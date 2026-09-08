/**
 * PowerKing Nepal — catalogue admin.
 *
 * Reads and writes data/products.json and data/categories.json in the GitHub
 * repository, straight from the browser. There is no backend: GitHub is the
 * backend, and the editor's own access token is what authorises every write.
 *
 * The token lives in this browser and nowhere else. It is sent only to
 * api.github.com, over the Authorization header, and is never written into a
 * URL, a commit or this repository. Signing out deletes it.
 *
 * Saving is deliberately whole-file: read the current file with its blob sha,
 * apply the change, write it back with that sha. If someone else saved in the
 * meantime GitHub rejects the write instead of silently overwriting them, and
 * we say so rather than pretending it worked.
 */
(function () {
  'use strict';

  var root = document.getElementById('admin');
  if (!root) return;

  var OWNER = root.getAttribute('data-owner');
  var REPO = root.getAttribute('data-repo');
  var BRANCH = root.getAttribute('data-branch');
  var API = 'https://api.github.com';
  var PRODUCTS = 'data/products.json';
  var CATEGORIES = 'data/categories.json';
  var IMAGE_DIR = 'public/images/products/';
  var STORE = 'pk-admin-token';

  /** The catalogue tile format, matched exactly so uploads sit alongside the
   *  photographs already in the catalogue rather than beside them. */
  var TILE = { size: 600, quality: 0.82, background: '#FFFFFF' };

  var token = '';
  var state = {
    products: null, productsSha: '',
    categories: null, categoriesSha: '',
    editing: null,          // the product being edited, or null for a new one
    pendingImage: null,     // base64 tile waiting to be uploaded on save
    pendingReadable: null,  // a larger rendering of the same photo, for reading
    pendingCategories: [],  // categories invented in the form, saved with it
    bulk: [],               // rows waiting in the "Add many" pane
  };

  /* ------------------------------------------------------------- helpers -- */

  var $ = function (id) { return document.getElementById(id); };

  function show(pane) {
    ['pane-auth', 'pane-work', 'pane-edit', 'pane-bulk'].forEach(function (id) {
      $(id).hidden = id !== pane;
    });
    window.scrollTo(0, 0);
  }

  function say(el, message, kind) {
    el.textContent = message || '';
    el.className = 'admin__msg' + (kind ? ' admin__msg--' + kind : '')
      + (el.id === 'work-msg' ? ' admin__msg--sticky' : '');
  }

  function slugify(s) {
    return String(s).toLowerCase().trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /** Category slugs drop "&" rather than spelling it out — see components.js. */
  function slugifyCategory(s) {
    return String(s).toLowerCase()
      .replace(/&/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function bytesToBase64(bytes) {
    // btoa takes a binary string, and apply() has an argument-count ceiling,
    // so feed it in chunks rather than one 60k-element spread.
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  function textToBase64(text) { return bytesToBase64(new TextEncoder().encode(text)); }

  function base64ToText(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ----------------------------------------------------------- github api -- */

  function gh(path, options) {
    var opts = options || {};
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (res.ok) return data;
        var err = new Error(data && data.message ? data.message : 'GitHub returned ' + res.status);
        err.status = res.status;
        throw err;
      });
    });
  }

  function contentsUrl(path) {
    return '/repos/' + OWNER + '/' + REPO + '/contents/' + path
      + '?ref=' + encodeURIComponent(BRANCH);
  }

  function readJson(path) {
    return gh(contentsUrl(path)).then(function (file) {
      return { json: JSON.parse(base64ToText(file.content)), sha: file.sha };
    });
  }

  function writeFile(path, base64, message, sha) {
    var body = { message: message, content: base64, branch: BRANCH };
    if (sha) body.sha = sha;
    return gh('/repos/' + OWNER + '/' + REPO + '/contents/' + path, { method: 'PUT', body: body });
  }

  /** A file's sha, or '' when it does not exist yet. */
  function shaOf(path) {
    return gh(contentsUrl(path))
      .then(function (f) { return f.sha; })
      .catch(function (e) { if (e.status === 404) return ''; throw e; });
  }

  /* -------------------------------------------------------------- sign in -- */

  function signIn(candidate) {
    token = candidate;
    // Ask GitHub who this is and whether the token may write here. This is the
    // real check: the answer comes from GitHub, not from anything on this page.
    return Promise.all([
      gh('/user'),
      gh('/repos/' + OWNER + '/' + REPO),
    ]).then(function (r) {
      var user = r[0];
      var repo = r[1];
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error('That token can read ' + OWNER + '/' + REPO
          + ' but not write to it. Set Contents to "Read and write".');
      }
      $('who-name').textContent = 'Signed in as ' + user.login;
      $('who').hidden = false;
      return user;
    });
  }

  function signOut() {
    token = '';
    try { localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
    state.products = null;
    state.categories = null;
    $('who').hidden = true;
    $('token').value = '';
    say($('auth-msg'), '');
    show('pane-auth');
  }

  /* ----------------------------------------------------------- load & list -- */

  function load() {
    say($('work-msg'), 'Loading the catalogue…');
    return Promise.all([readJson(PRODUCTS), readJson(CATEGORIES)]).then(function (r) {
      state.products = r[0].json; state.productsSha = r[0].sha;
      state.categories = r[1].json; state.categoriesSha = r[1].sha;
      say($('work-msg'), '');
      renderList();
      renderCategories();
    });
  }

  function matches(product, term) {
    if (!term) return true;
    var hay = [product.name, product.brand, product.category, product.sku]
      .join(' ').toLowerCase();
    return hay.indexOf(term.toLowerCase()) !== -1;
  }

  function renderList() {
    var term = $('filter').value.trim();
    var shown = state.products.filter(function (p) { return matches(p, term); });
    $('count').textContent = term
      ? shown.length + ' of ' + state.products.length + ' products'
      : state.products.length + ' products';

    $('list').innerHTML = shown.map(function (p) {
      var badges = []
        .concat(p.featured ? ['<span class="admin__badge">Featured</span>'] : [])
        .concat(p.available ? [] : ['<span class="admin__badge">Unavailable</span>'])
        .concat(p.packSize ? [] : ['<span class="admin__badge admin__badge--warn">No pack size</span>'])
        .join('');
      var badgeRow = badges ? '<span class="admin__badges">' + badges + '</span>' : '';
      // Coerced, not escaped: an id is a number, and Number() is the only
      // guarantee that whatever the file holds cannot close the attribute.
      var id = Number(p.id);
      return '<li class="admin__row" data-id="' + id + '">'
        // A photo saved a minute ago is in the repository but not yet on the
        // site serving this page, so its URL 404s. A broken-image icon reads
        // as "your upload failed"; this says what is actually happening.
        + '<img class="admin__thumb" src="' + escapeAttr(p.image) + '" alt="" loading="lazy"'
        + ' onerror="this.classList.add(\'is-missing\');this.removeAttribute(\'src\')"'
        + ' title="Photo appears here once the site finishes publishing">'
        + '<span class="admin__row-main">'
        + '<span class="admin__row-name">' + escapeHtml(p.name) + '</span>'
        + '<span class="admin__row-meta">' + escapeHtml(p.brand) + ' · ' + escapeHtml(p.category) + '</span>'
        + badgeRow + '</span>'
        + '<button type="button" class="btn btn--ghost btn--sm" data-edit="' + id + '">Edit</button>'
        + '</li>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  /* ------------------------------------------------------------ edit form -- */

  var BLANK = {
    id: 0, name: '', slug: '', brand: '', category: '', description: '',
    image: '', gallery: [], packSize: '', priceCarton: '', pricePiece: '', sku: '',
    featured: false, available: true, tags: [],
  };

  function openEditor(product) {
    state.editing = product;
    state.pendingImage = null;
    state.pendingReadable = null;
    state.pendingCategories = [];

    var p = product || BLANK;
    $('edit-title').textContent = product ? 'Edit product' : 'Add product';
    $('f-name').value = p.name;
    $('f-slug').value = p.slug;
    $('f-brand').value = p.brand;
    $('f-description').value = p.description;
    $('f-sku').value = p.sku;
    $('f-packsize').value = p.packSize;
    $('f-price-carton').value = p.priceCarton;
    $('f-price-piece').value = p.pricePiece;
    $('f-tags').value = (p.tags || []).join(', ');
    $('f-featured').checked = !!p.featured;
    $('f-available').checked = !!p.available;
    $('f-image').value = '';

    renderCategoryOptions(p.category);

    setPreview(p.image || '');
    $('delete').hidden = !product;
    say($('edit-msg'), '');
    show('pane-edit');
    $('f-name').focus();
  }

  /** Every category, the ones waiting to be committed with this product
   *  included, with `selected` on the one given. */
  function renderCategoryOptions(selected) {
    $('f-category').innerHTML = allCategories().map(function (c) {
      return '<option value="' + escapeAttr(c.name) + '"'
        + (c.name === selected ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
    }).join('');
  }

  function allCategories() {
    return state.categories.concat(state.pendingCategories || []);
  }

  /**
   * A category invented while filling in a product. It is held here and
   * written with the save, not before it: a category committed on its own and
   * then abandoned leaves an empty section on the site, and a product
   * committed before its category exists fails the build outright. The save
   * writes categories first for the same reason.
   */
  function newCategoryHere() { newCategoryHereFor($('edit-msg')); }

  function newCategoryHereFor(msgEl) {
    var name = (window.prompt('New category name\n\ne.g. Trolley Speakers') || '').trim();
    if (!name) return;

    var clash = allCategories().filter(function (c) {
      return squash(c.name) === squash(name) || c.slug === slugifyCategory(name);
    })[0];
    if (clash) {
      say(msgEl, 'There is already a category called "' + clash.name + '".', 'warn');
      renderCategoryOptions(clash.name);
      return;
    }
    if (!slugifyCategory(name)) {
      say(msgEl, 'That name has no letters or numbers in it to make a web address from.', 'warn');
      return;
    }

    var description = (window.prompt('One line describing what is in "' + name + '".\n\n'
      + 'It is the heading text on the category page and what Google shows '
      + 'underneath it, so write it for a buyer.') || '').trim();
    if (description.length <= 40) {
      say(msgEl, 'A category description needs to be more than 40 characters — '
        + 'the build rejects a page with less. Nothing was added.', 'warn');
      return;
    }

    state.pendingCategories.push({
      name: name, slug: slugifyCategory(name), description: description,
    });
    renderCategoryOptions(name);
    say(msgEl, '"' + name + '" will be created when you save.', 'ok');
  }

  function setPreview(src) {
    var img = $('f-image-preview');
    var empty = $('f-image-empty');
    img.hidden = !src;
    empty.hidden = !!src;
    empty.textContent = 'Click, or drop a photo here';
    if (!src) { img.removeAttribute('src'); return; }
    // A just-saved photo is not on the site yet, so its URL 404s for a minute.
    img.onerror = function () {
      img.hidden = true;
      empty.hidden = false;
      empty.textContent = 'Photo is still publishing';
    };
    img.src = src;
  }

  /** Draw a decoded image onto the catalogue's own tile: square, on white,
   *  whole frame visible rather than cropped into. */
  function paintTile(source, width, height) {
    var S = TILE.size;
    var canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    var g = canvas.getContext('2d');
    g.fillStyle = TILE.background;
    g.fillRect(0, 0, S, S);
    var r = Math.min(S / width, S / height);
    var w = width * r, h = height * r;
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, (S - w) / 2, (S - h) / 2, w, h);
    return canvas.toDataURL('image/jpeg', TILE.quality);
  }

  /**
   * A second, larger rendering, used only for reading the box.
   *
   * The catalogue tile is 600x600 on white, which is right for a product card
   * and wrong for reading: model numbers and spec tables printed on a carton
   * do not survive that downscale. This keeps the original proportions and
   * allows 1400px on the long edge, which is what actually gets sent to the
   * vision model. It is never stored or published.
   */
  function paintReadable(source, width, height) {
    var MAX = 1400;
    var r = Math.min(1, MAX / Math.max(width, height));
    var w = Math.max(1, Math.round(width * r));
    var h = Math.max(1, Math.round(height * r));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  /** Is this one of the formats an iPhone shoots by default? */
  function isAppleFormat(file) {
    return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  }

  /**
   * Decode once, hand back both renderings.
   *
   * Two decoders, because they do not cover the same formats.
   * createImageBitmap hands the file to the browser's own image pipeline,
   * which on Safari reads the HEIC an iPhone shoots by default; <img> does not
   * always. Chrome reads HEIC in neither, so a HEIC opened there fails
   * whatever we do — hence the message saying so in words a shopkeeper can act
   * on rather than "not an image this browser can open".
   */
  function prepare(file) {
    function both(source, width, height) {
      return { tile: paintTile(source, width, height),
               readable: paintReadable(source, width, height) };
    }

    var viaBitmap = typeof createImageBitmap === 'function'
      ? createImageBitmap(file).then(function (bmp) {
          var out = both(bmp, bmp.width, bmp.height);
          if (bmp.close) bmp.close();
          return out;
        })
      : Promise.reject(new Error('no createImageBitmap'));

    return viaBitmap.catch(function () {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('That file could not be read.')); };
        reader.onload = function () {
          var img = new Image();
          img.onerror = function () { reject(cannotRead(file)); };
          img.onload = function () { resolve(both(img, img.width, img.height)); };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    });
  }

  /** Just the catalogue tile, for callers that do not need to read anything. */
  function toTile(file) {
    return prepare(file).then(function (r) { return r.tile; });
  }

  function cannotRead(file) {
    if (isAppleFormat(file)) {
      return new Error('This is an iPhone HEIC photo and this browser cannot open '
        + 'that format. Two ways round it: on a Mac, right-click the photo in '
        + 'Finder → Quick Actions → Convert Image → JPEG, then choose the JPEG. '
        + 'Or set the iPhone to shoot JPEG from now on: Settings → Camera → '
        + 'Formats → Most Compatible. Safari can open HEIC directly if you would '
        + 'rather open this page there.');
    }
    return new Error('That file is not an image this browser can open. '
      + 'JPEG, PNG and WebP all work.');
  }

  function collect() {
    var name = $('f-name').value.trim();
    var slug = slugify($('f-slug').value.trim() || name);
    var tags = $('f-tags').value.split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);

    return {
      id: state.editing ? state.editing.id : nextId(),
      name: name,
      slug: slug,
      brand: $('f-brand').value.trim(),
      category: $('f-category').value,
      description: $('f-description').value.trim(),
      image: state.editing ? state.editing.image : '',
      gallery: state.editing ? (state.editing.gallery || []) : [],
      packSize: $('f-packsize').value.trim(),
      priceCarton: price($('f-price-carton').value),
      pricePiece: price($('f-price-piece').value),
      sku: $('f-sku').value.trim(),
      featured: $('f-featured').checked,
      available: $('f-available').checked,
      tags: tags,
    };
  }

  /** A price is a positive number or nothing at all — never a string, and
   *  never zero, which would publish as "Rs. 0". */
  function price(value) {
    var raw = String(value).trim();
    var n = Number(raw);
    if (!raw || !isFinite(n) || n <= 0) return '';
    // Rounding can turn a positive number into zero, and "Rs. 0" on the site
    // would read as a quote nobody gave.
    var whole = Math.round(n);
    return whole > 0 ? whole : '';
  }

  /** For comparing two names as a person would: case and spacing do not count,
   *  so "LP V81", "lp  v81" and "LP-V81" are all the same product. */
  function squash(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function nextId() {
    return state.products.reduce(function (max, p) {
      return p.id > max ? p.id : max;
    }, 0) + 1;
  }

  /** Everything the build would reject, checked before a commit rather than
   *  after, so a bad edit never reaches the deploy. */
  function problems(product) {
    var out = [];
    if (!product.name) out.push('The product needs a name.');
    if (!product.slug) out.push('That name produces an empty web address — type one in yourself.');
    // The build refuses a product with no brand outright, and that refusal
    // lands after the commit — the save says "Saved" and the site quietly
    // stops updating. One product reached the catalogue that way.
    if (!product.brand) {
      out.push('The product needs a brand. Type the brand from the box, or '
        + '[CONFIRM BRAND] if the carton does not show one — the build rejects '
        + 'a product with the brand left empty.');
    }
    if (!product.category) out.push('Pick a category.');
    // The build refuses a page whose meta description is 40 characters or
    // shorter, and refuses two pages that share one. Caught here, where it
    // costs a sentence; caught there, the commit lands and the site silently
    // stops updating.
    if (!product.description) {
      out.push('The product needs a description; it is used on the page and in Google.');
    } else if (product.description.length <= 40) {
      out.push('The description is too short — it needs more than 40 characters '
        + '(this one has ' + product.description.length + '). It is what Google shows '
        + 'under the product, and the build rejects anything shorter.');
    } else {
      var sameText = state.products.filter(function (p) {
        return p.id !== product.id && p.description === product.description;
      })[0];
      if (sameText) {
        out.push('"' + sameText.name + '" already has exactly this description. '
          + 'Two pages cannot share one, so write a different sentence for this product.');
      }
    }

    var clashesWithCategory = allCategories().some(function (c) { return c.slug === product.slug; });
    if (clashesWithCategory) {
      out.push('The web address "' + product.slug + '" is already a category page.');
    }
    // Same name, different product. Checked on the name and not only on the
    // web address because that is what someone actually retypes by mistake,
    // and because the message can then name the product they already have.
    var sameName = state.products.filter(function (p) {
      return p.id !== product.id && squash(p.name) === squash(product.name);
    })[0];
    if (sameName) {
      out.push('A product called "' + sameName.name + '" already exists. '
        + 'Open that one and edit it, or give this a name that tells them apart.');
    }

    var taken = state.products.filter(function (p) {
      return p.slug === product.slug && p.id !== product.id;
    })[0];
    if (taken && taken !== sameName) {
      out.push('The web address "' + product.slug + '" is already used by "'
        + taken.name + '".');
    }

    if (!product.image && !state.pendingImage) out.push('Add a photo.');
    return out;
  }

  /* ------------------------------------------------------ reading the box -- */

  /**
   * Filling the form in from what is printed on the packaging.
   *
   * This is the one part of the panel that could break the rule the whole
   * catalogue is built on: never publish information nobody supplied. A model
   * asked to "describe this speaker" will happily produce plausible wattage,
   * battery life and brand names that are nowhere on the box. So the prompt
   * below is written to forbid exactly that, every field it returns is marked
   * as unverified in the form, and nothing it produces is ever saved without a
   * person looking at it.
   *
   * The key is the editor's own, held in their browser beside the GitHub token
   * and never in this repository — the same arrangement, for the same reason:
   * a static site has nowhere else to put a credential, and this way each
   * person's can be revoked on its own.
   *
   * Raw fetch rather than a provider SDK because this site has no build step
   * and no dependencies; there is nothing here to npm install into.
   */

  var VISION = {
    provider: 'pk-vision-provider',
    model: 'pk-vision-model',
    key: 'pk-vision-key',
  };

  var VISION_DEFAULT_MODEL = {
    anthropic: 'claude-opus-5',
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
  };

  // Written at the model rather than at a person: every clause is here because
  // its absence produces invented catalogue data.
  var READ_PROMPT = [
    'You are transcribing text that is physically printed on product packaging',
    'in a photograph, for a wholesale electronics catalogue in Nepal.',
    '',
    'Return ONLY a JSON object with the keys: name, brand, sku, packSize, description.',
    '',
    'These rules matter more than being helpful:',
    '- Transcribe ONLY what is legibly printed in this image.',
    '- If a value is not legibly printed, return null for it. Never guess,',
    '  complete, expand, translate or infer, and never use anything you know',
    '  about this product from elsewhere. If the packaging does not say it, it',
    '  is null.',
    '- name: the product name as printed. Add no words that are not on the box.',
    '- brand: the manufacturer brand mark only. No brand mark visible means null.',
    '- sku: the model or article number as printed, e.g. "K21" or "V-091".',
    '  Not a barcode number.',
    '- packSize: only if the carton states a quantity per carton, e.g.',
    '  "50 pcs per carton". Otherwise null.',
    '- description: the specification text printed on the box — power, battery,',
    '  connectivity, dimensions, what the package includes — written as plain',
    '  sentences. Facts printed on the packaging only. If little is legible,',
    '  return null rather than padding it out.',
    '',
    'Output the JSON object and nothing else.',
  ].join('\n');

  function visionSettings() {
    var provider = '';
    var model = '';
    var key = '';
    try {
      provider = localStorage.getItem(VISION.provider) || '';
      model = localStorage.getItem(VISION.model) || '';
      key = localStorage.getItem(VISION.key) || '';
    } catch (e) { /* private browsing */ }
    return { provider: provider, model: model, key: key };
  }

  function visionReady() {
    var s = visionSettings();
    return Boolean(s.provider && s.key);
  }

  /** The request each provider wants. Same picture, same instruction. */
  function visionRequest(settings, base64) {
    var model = settings.model || VISION_DEFAULT_MODEL[settings.provider];

    if (settings.provider === 'anthropic') {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.key,
          'anthropic-version': '2023-06-01',
          // Without this the browser's preflight is refused outright.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: {
          model: model,
          max_tokens: 1024,
          // Transcription, not reasoning: the cheap end of the range is the
          // right one, and it keeps a batch of twenty photos affordable.
          output_config: { effort: 'low' },
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: READ_PROMPT },
            ],
          }],
        },
        read: function (json) {
          var blocks = json.content || [];
          for (var i = 0; i < blocks.length; i++) {
            if (blocks[i].type === 'text') return blocks[i].text;
          }
          return '';
        },
      };
    }

    if (settings.provider === 'gemini') {
      return {
        // The key goes in a header, not the query string, so it stays out of
        // anything that logs URLs.
        url: 'https://generativelanguage.googleapis.com/v1beta/models/'
          + encodeURIComponent(model) + ':generateContent',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': settings.key },
        body: {
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: base64 } },
              { text: READ_PROMPT },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json' },
        },
        read: function (json) {
          var c = (json.candidates || [])[0];
          var parts = c && c.content && c.content.parts;
          return parts && parts.length ? (parts[0].text || '') : '';
        },
      };
    }

    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + settings.key,
      },
      body: {
        model: model,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: READ_PROMPT },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          ],
        }],
      },
      read: function (json) {
        var c = (json.choices || [])[0];
        return (c && c.message && c.message.content) || '';
      },
    };
  }

  /** Models wrap JSON in prose and code fences often enough to plan for it. */
  function parseReply(text) {
    var t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
    var start = t.indexOf('{');
    var end = t.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('The reply was not JSON.');
    return JSON.parse(t.slice(start, end + 1));
  }

  /** A field is usable only if it is a non-empty string. null, "null",
   *  "n/a" and "not visible" are all the model saying it could not read it. */
  function usable(value) {
    if (typeof value !== 'string') return '';
    var v = value.trim();
    if (!v) return '';
    if (/^(null|n\/?a|none|unknown|not (visible|legible|printed|stated))\.?$/i.test(v)) return '';
    return v;
  }

  /**
   * Read one photo. Resolves to the fields that were legible, which may be
   * none of them — that is a normal outcome, not a failure.
   */
  function readTheBox(readableDataUrl) {
    var settings = visionSettings();
    if (!settings.provider || !settings.key) {
      return Promise.reject(new Error('No photo-reading key is set up yet.'));
    }
    var req = visionRequest(settings, readableDataUrl.split(',')[1]);

    return fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var detail = (json.error && (json.error.message || json.error.status))
            || json.message || ('HTTP ' + res.status);
          if (res.status === 401 || res.status === 403) {
            throw new Error('That key was refused: ' + detail);
          }
          if (res.status === 429) {
            throw new Error('Rate limited — wait a moment and read again. ' + detail);
          }
          throw new Error('The photo reader failed: ' + detail);
        }
        var fields = parseReply(req.read(json));
        return {
          name: usable(fields.name),
          brand: usable(fields.brand),
          sku: usable(fields.sku),
          packSize: usable(fields.packSize),
          description: usable(fields.description),
        };
      });
    });
  }

  /** Which of those actually came back with something. */
  function filled(fields) {
    return Object.keys(fields).filter(function (k) { return fields[k]; });
  }

  /* -------------------------------------------------------------- bulk add -- */

  /**
   * One product per photo.
   *
   * The slow part of adding a product is not the form, it is doing the form
   * twenty times. Here the twenty photos are chosen once, each becomes a row,
   * and the fields that differ per product are the only ones typed. Category
   * is set once for the batch and overridable per row.
   *
   * Nothing is committed until every row passes the same checks a single save
   * passes — including the description rules the build enforces, which is
   * where a bulk entry would otherwise fail twenty times over.
   */

  /** A name worth starting from, out of a supplier's file name. */
  function nameFromFile(filename) {
    return String(filename)
      .replace(/\.[a-z0-9]+$/i, '')          // extension
      .replace(/[_+]+/g, ' ')
      .replace(/\s*[-–]\s*/g, ' ')
      .replace(/\b(img|image|photo|dsc|whatsapp|jpeg|jpg|png)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var bulkKey = 0;

  function bulkAddFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    say($('bulk-msg'), 'Preparing ' + list.length
      + (list.length === 1 ? ' photo…' : ' photos…'));

    var done = 0, failed = [];
    var staged = [];
    var work = list.map(function (file) {
      return prepare(file).then(function (rendered) {
        var row = {
          // A plain counter. Date.now() + Math.random() looked unique and is
          // not: the sum is past the precision where the fraction survives, so
          // two rows staged in the same millisecond can share a key, and then
          // one row's fields are read into the other's.
          key: 'b' + (++bulkKey),
          name: nameFromFile(file.name),
          category: '', description: '', brand: '', sku: '',
          packSize: '', priceCarton: '', pricePiece: '',
          image: rendered.tile,
          readable: rendered.readable,   // larger, for reading only; never saved
          suggested: [],                 // fields the photo reader filled in
        };
        state.bulk.push(row);
        staged.push(row);
        done++;
      }).catch(function (err) {
        failed.push(file.name + ' — ' + err.message);
      });
    });

    Promise.all(work).then(function () {
      renderBulk();
      say($('bulk-msg'), failed.length
        ? done + ' added. ' + failed.length + ' could not be read: ' + failed.join(' | ')
        : done + (done === 1 ? ' photo ready.' : ' photos ready.'),
        failed.length ? 'warn' : 'ok');
      if (done && visionReady()) readRows(staged);
    });
  }

  /**
   * Read each staged photo in turn rather than all at once: twenty parallel
   * requests is the shape that trips a rate limit, and a batch that half
   * fails is worse than one that takes a few seconds longer.
   */
  function readRows(rows) {
    var i = 0, read = 0, failures = [];

    function next() {
      if (i >= rows.length) {
        renderBulk();
        say($('bulk-msg'), failures.length
          ? 'Read ' + read + ' of ' + rows.length + '. ' + failures.join(' | ')
              + ' Check every filled-in field before saving.'
          : 'Read ' + read + ' of ' + rows.length + ' from the photos. '
              + 'Everything filled in is marked — check it before saving.',
          failures.length ? 'warn' : 'ok');
        return;
      }
      var row = rows[i++];
      say($('bulk-msg'), 'Reading photo ' + i + ' of ' + rows.length + '…');
      readTheBox(row.readable).then(function (fields) {
        applyRead(row, fields);
        read++;
      }).catch(function (err) {
        failures.push(err.message);
      }).then(next);
    }
    next();
  }

  /** Fill only what is still empty: anything a person typed wins over
   *  anything read off a photograph. */
  function applyRead(row, fields) {
    row.suggested = row.suggested || [];
    ['name', 'brand', 'sku', 'packSize', 'description'].forEach(function (k) {
      if (!fields[k]) return;
      // The name is pre-filled from the file name, so it is the one field
      // where the photo is the better source and may replace what is there.
      var replaceable = k === 'name' || !String(row[k] || '').trim();
      if (!replaceable) return;
      row[k] = fields[k];
      if (row.suggested.indexOf(k) === -1) row.suggested.push(k);
    });
  }

  function bulkCategoryOptions(selected, blankLabel) {
    return '<option value="">' + escapeHtml(blankLabel) + '</option>'
      + allCategories().map(function (c) {
          return '<option value="' + escapeAttr(c.name) + '"'
            + (c.name === selected ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
        }).join('');
  }

  function renderBulk() {
    var any = state.bulk.length > 0;
    $('bulk-shared').hidden = !any;
    $('bulk-actions').hidden = !any;
    $('bulk-category').innerHTML = bulkCategoryOptions($('bulk-category').value, 'Choose a category');

    $('bulk-rows').innerHTML = state.bulk.map(function (row, i) {
      var k = escapeAttr(row.key);
      var sug = row.suggested || [];
      // A field the photo reader filled is marked in the markup, not just
      // coloured, so it survives a re-render and can be asserted in a test.
      var mark = function (field) {
        return sug.indexOf(field) === -1 ? '' : ' is-suggested" data-suggested="' + field + '';
      };
      var note = sug.length
        ? '<p class="bulk__note">Read off the photo: ' + escapeHtml(sug.join(', '))
          + '. Check it against the box before saving.</p>'
        : '';
      return '<div class="bulk__row" data-key="' + k + '">'
        + '<div class="bulk__shot">'
        + '<img class="bulk__thumb" src="' + escapeAttr(row.image) + '" alt="">'
        + (visionReady()
            ? '<button type="button" class="btn btn--ghost btn--sm bulk__read"'
              + ' data-bk-read="' + k + '">Read the box</button>'
            : '')
        + '</div>'
        + '<div class="bulk__fields">'
        + note
        + '<label class="sr-only" for="bk-name-' + i + '">Product name</label>'
        + '<input class="af__input' + mark('name') + '" id="bk-name-' + i + '" data-bk="name" placeholder="Product name as printed on the box" value="' + escapeAttr(row.name) + '">'
        + '<label class="sr-only" for="bk-cat-' + i + '">Category</label>'
        + '<select class="af__input" id="bk-cat-' + i + '" data-bk="category">'
        + bulkCategoryOptions(row.category, 'Category…') + '</select>'
        + '<label class="sr-only" for="bk-desc-' + i + '">Description</label>'
        + '<textarea class="af__input bulk__desc' + mark('description') + '" id="bk-desc-' + i + '" data-bk="description" rows="2" '
        + 'placeholder="What the box states. More than 40 characters, and different from every other product.">'
        + escapeHtml(row.description) + '</textarea>'
        + '<div class="bulk__small">'
        + '<input class="af__input' + mark('brand') + '" data-bk="brand" placeholder="Brand" value="' + escapeAttr(row.brand) + '">'
        + '<input class="af__input' + mark('sku') + '" data-bk="sku" placeholder="Model / SKU" value="' + escapeAttr(row.sku) + '">'
        + '<input class="af__input' + mark('packSize') + '" data-bk="packSize" placeholder="20 pcs per carton" value="' + escapeAttr(row.packSize) + '">'
        + '<input class="af__input" data-bk="priceCarton" type="number" placeholder="Carton Rs." value="' + escapeAttr(row.priceCarton) + '">'
        + '<input class="af__input" data-bk="pricePiece" type="number" placeholder="Piece Rs." value="' + escapeAttr(row.pricePiece) + '">'
        + '</div>'
        + '</div>'
        + '<button type="button" class="btn btn--ghost btn--sm" data-bk-remove="' + k + '">Remove</button>'
        + '</div>';
    }).join('');
  }

  /** Read the rows back out of the DOM into state, so nothing typed is lost
   *  when the list re-renders. */
  function harvestBulk() {
    Array.prototype.forEach.call($('bulk-rows').children, function (el) {
      var row = state.bulk.filter(function (r) { return r.key === el.getAttribute('data-key'); })[0];
      if (!row) return;
      Array.prototype.forEach.call(el.querySelectorAll('[data-bk]'), function (input) {
        var field = input.getAttribute('data-bk');
        // Editing a field the reader filled is a person taking responsibility
        // for it, so it stops being flagged as unchecked.
        if (row.suggested && row.suggested.indexOf(field) !== -1
            && input.value !== row[field]) {
          row.suggested = row.suggested.filter(function (f) { return f !== field; });
        }
        row[field] = input.value;
      });
    });
  }

  /** Turn a row into the product it would become, so the ordinary checks
   *  apply to it unchanged. */
  function bulkProduct(row, id) {
    return {
      id: id,
      name: row.name.trim(),
      slug: slugify(row.name),
      brand: row.brand.trim() || '[CONFIRM BRAND]',
      category: row.category,
      description: row.description.trim(),
      image: '/images/products/' + slugify(row.name) + '.jpg',
      gallery: [],
      packSize: row.packSize.trim(),
      priceCarton: price(row.priceCarton),
      pricePiece: price(row.pricePiece),
      sku: row.sku.trim(),
      featured: false,
      available: true,
      tags: [],
    };
  }

  function bulkSave() {
    harvestBulk();
    if (!state.bulk.length) return;

    // Every row is checked against the catalogue AND against the other rows,
    // which is where bulk entry goes wrong: two photos of the same speaker,
    // or the same sentence pasted into both descriptions.
    var id = nextId();
    var drafts = state.bulk.map(function (row) { return bulkProduct(row, id++); });
    var problemsFound = [];

    drafts.forEach(function (draft, i) {
      var against = state.products.concat(drafts.filter(function (_, j) { return j !== i; }));
      var saved = state.products;
      state.products = against;
      var bad = problems(draft);
      state.products = saved;
      // The photo is in hand, it just has not been uploaded yet.
      bad = bad.filter(function (m) { return m !== 'Add a photo.'; });
      if (bad.length) problemsFound.push((draft.name || 'Row ' + (i + 1)) + ': ' + bad.join(' '));
    });

    if (problemsFound.length) {
      say($('bulk-msg'), problemsFound.length
        + (problemsFound.length === 1 ? ' row is not ready. ' : ' rows are not ready. ')
        + problemsFound.join('  •  '), 'warn');
      return;
    }

    $('bulk-save').disabled = true;
    var total = drafts.length;

    // Categories first, then every photo, then the catalogue once. The
    // catalogue is what makes the products real, so it is written last: if a
    // photo upload fails, no product on the site points at a missing image.
    var step = Promise.resolve();
    if (state.pendingCategories.length) {
      var nextCats = state.categories.concat(state.pendingCategories);
      var names = state.pendingCategories.map(function (c) { return c.name; }).join(', ');
      step = writeFile(
        CATEGORIES,
        textToBase64(JSON.stringify(nextCats, null, 2) + '\n'),
        'Add the ' + names + ' category',
        state.categoriesSha,
      ).then(function (res) {
        state.categories = nextCats;
        state.categoriesSha = res.content.sha;
        state.pendingCategories = [];
        renderCategories();
      });
    }

    drafts.forEach(function (draft, i) {
      step = step.then(function () {
        say($('bulk-msg'), 'Uploading photo ' + (i + 1) + ' of ' + total + '…');
        var path = IMAGE_DIR + draft.slug + '.jpg';
        return shaOf(path).then(function (sha) {
          return writeFile(path, state.bulk[i].image.split(',')[1],
            'Add photo for ' + draft.name, sha);
        });
      });
    });

    step.then(function () {
      say($('bulk-msg'), 'Saving the catalogue…');
      var next = state.products.concat(drafts);
      return writeFile(
        PRODUCTS,
        textToBase64(JSON.stringify(next, null, 2) + '\n'),
        'Add ' + total + (total === 1 ? ' product' : ' products'),
        state.productsSha,
      ).then(function (res) {
        state.products = next;
        state.productsSha = res.content.sha;
      });
    }).then(function () {
      state.bulk = [];
      renderBulk();
      renderList();
      show('pane-work');
      say($('work-msg'), total + (total === 1 ? ' product' : ' products')
        + ' saved. The site rebuilds and goes live in about a minute.', 'ok');
    }).catch(function (err) {
      if (err.status === 409) return reloadAfterConflict($('bulk-msg'));
      say($('bulk-msg'), err.message, 'warn');
    }).then(function () {
      $('bulk-save').disabled = false;
    });
  }

  /* ---------------------------------------------------------------- saving -- */

  function reloadAfterConflict(el) {
    say(el, 'Someone else saved a change while this was open. Reloading the '
      + 'catalogue so nothing is overwritten — reopen the product and redo this edit.', 'warn');
    return load();
  }

  function saveProduct(ev) {
    ev.preventDefault();
    var product = collect();
    var bad = problems(product);
    if (bad.length) { say($('edit-msg'), bad.join(' '), 'warn'); return; }

    var save = $('save');
    var unchanged = false;
    save.disabled = true;
    say($('edit-msg'), 'Saving…');

    // Order matters, and it is not arbitrary. A category invented in this
    // form is written first: the build rejects a product naming a category
    // that does not exist, so the catalogue must never be committed ahead of
    // it. The photo goes next — an unused image is harmless, while a product
    // pointing at an image that was never uploaded is a broken card on the
    // live site. The catalogue goes last.
    var ready = Promise.resolve();
    if (state.pendingCategories.length) {
      var nextCats = state.categories.concat(state.pendingCategories);
      var catNames = state.pendingCategories.map(function (c) { return c.name; }).join(', ');
      ready = writeFile(
        CATEGORIES,
        textToBase64(JSON.stringify(nextCats, null, 2) + '\n'),
        'Add the ' + catNames + ' category',
        state.categoriesSha,
      ).then(function (res) {
        state.categories = nextCats;
        state.categoriesSha = res.content.sha;
        state.pendingCategories = [];
        renderCategories();
      });
    }

    var uploaded = ready.then(function () {
      if (!state.pendingImage) return product.image;
      var imgPath = IMAGE_DIR + product.slug + '.jpg';
      return shaOf(imgPath).then(function (sha) {
        return writeFile(imgPath, state.pendingImage, 'Add photo for ' + product.name, sha);
      }).then(function () { return '/images/products/' + product.slug + '.jpg'; });
    });

    uploaded.then(function (imagePath) {
      product.image = imagePath;
      var next = state.products.slice();
      var at = next.findIndex(function (p) { return p.id === product.id; });
      if (at === -1) next.push(product); else next[at] = product;

      // Opening a product and saving it unchanged used to commit anyway, which
      // put entries in the history that record nothing.
      if (at !== -1 && JSON.stringify(state.products[at]) === JSON.stringify(product)
          && !state.pendingImage) {
        unchanged = true;
        return null;
      }

      return writeFile(
        PRODUCTS,
        textToBase64(JSON.stringify(next, null, 2) + '\n'),
        (at === -1 ? 'Add ' : 'Update ') + product.name,
        state.productsSha,
      ).then(function (res) {
        state.products = next;
        state.productsSha = res.content.sha;
      });
    }).then(function () {
      state.pendingImage = null;
      renderList();
      show('pane-work');
      say($('work-msg'), unchanged
        ? 'Nothing changed, so nothing was saved.'
        : 'Saved to GitHub. The site rebuilds and goes live in about a minute — '
          + 'if it has not appeared after a few minutes, check the Actions tab '
          + 'for a failed deploy rather than saving again.', 'ok');
    }).catch(function (err) {
      if (err.status === 409) return reloadAfterConflict($('edit-msg'));
      say($('edit-msg'), err.message, 'warn');
    }).then(function () {
      save.disabled = false;
    });
  }

  function deleteProduct() {
    var product = state.editing;
    if (!product) return;
    if (!window.confirm('Delete "' + product.name + '"?\n\nThe page and its link '
      + 'disappear from the site. The photo file stays in the repository.')) return;

    var next = state.products.filter(function (p) { return p.id !== product.id; });
    say($('edit-msg'), 'Deleting…');
    writeFile(
      PRODUCTS,
      textToBase64(JSON.stringify(next, null, 2) + '\n'),
      'Remove ' + product.name,
      state.productsSha,
    ).then(function (res) {
      state.products = next;
      state.productsSha = res.content.sha;
      renderList();
      show('pane-work');
      say($('work-msg'), 'Deleted. The site rebuilds in about a minute.', 'ok');
    }).catch(function (err) {
      if (err.status === 409) return reloadAfterConflict($('edit-msg'));
      say($('edit-msg'), err.message, 'warn');
    });
  }

  /* ------------------------------------------------------------ categories -- */

  function renderCategories() {
    $('cat-list').innerHTML = state.categories.map(function (c) {
      var count = state.products.filter(function (p) { return p.category === c.name; }).length;
      return '<li class="admin__row" data-cat="' + escapeAttr(c.name) + '">'
        + '<span class="admin__row-main">'
        + '<span class="admin__row-name">' + escapeHtml(c.name) + '</span>'
        + '<span class="admin__row-meta">/products/' + escapeHtml(c.slug) + '/ · '
        + count + (count === 1 ? ' product' : ' products') + '</span>'
        + '<span class="admin__row-meta">' + escapeHtml(c.description) + '</span>'
        + '</span>'
        + '<button type="button" class="btn btn--ghost btn--sm" data-cat-edit="' + escapeAttr(c.name) + '">Rename</button>'
        + '<button type="button" class="btn btn--ghost btn--sm" data-cat-del="' + escapeAttr(c.name) + '">Delete</button>'
        + '</li>';
    }).join('');
  }

  /** Writes both files when a rename moves products, so the catalogue is never
   *  committed in a state where a product names a category that is gone. */
  function commitCategories(nextCategories, nextProducts, message) {
    say($('work-msg'), 'Saving…');
    return writeFile(
      CATEGORIES,
      textToBase64(JSON.stringify(nextCategories, null, 2) + '\n'),
      message,
      state.categoriesSha,
    ).then(function (res) {
      state.categories = nextCategories;
      state.categoriesSha = res.content.sha;
      if (!nextProducts) return null;
      return writeFile(
        PRODUCTS,
        textToBase64(JSON.stringify(nextProducts, null, 2) + '\n'),
        message + ' (move products)',
        state.productsSha,
      ).then(function (r2) {
        state.products = nextProducts;
        state.productsSha = r2.content.sha;
      });
    }).then(function () {
      renderCategories();
      renderList();
      say($('work-msg'), 'Saved. The site rebuilds in about a minute.', 'ok');
    }).catch(function (err) {
      if (err.status === 409) return reloadAfterConflict($('work-msg'));
      say($('work-msg'), err.message, 'warn');
    });
  }

  function addCategory() {
    var name = (window.prompt('New category name') || '').trim();
    if (!name) return;
    if (state.categories.some(function (c) { return c.name === name; })) {
      say($('work-msg'), 'There is already a category called "' + name + '".', 'warn');
      return;
    }
    var description = (window.prompt('One line describing what is in it — '
      + 'this shows on the category page and in search results.') || '').trim();
    if (!description) { say($('work-msg'), 'A category needs a description.', 'warn'); return; }

    var next = state.categories.concat([{
      name: name, slug: slugifyCategory(name), description: description,
    }]);
    commitCategories(next, null, 'Add the ' + name + ' category');
  }

  function renameCategory(oldName) {
    var current = state.categories.find(function (c) { return c.name === oldName; });
    var name = (window.prompt('Category name', oldName) || '').trim();
    if (!name) return;
    var description = (window.prompt('Description', current.description) || '').trim();
    if (!description) { say($('work-msg'), 'A category needs a description.', 'warn'); return; }
    if (name === oldName && description === current.description) return;

    var nextCategories = state.categories.map(function (c) {
      return c.name === oldName
        ? { name: name, slug: slugifyCategory(name), description: description }
        : c;
    });
    // Carry the products across in the same save, or the build fails on every
    // product still naming the old category.
    var moved = name !== oldName;
    var nextProducts = moved ? state.products.map(function (p) {
      return p.category === oldName ? Object.assign({}, p, { category: name }) : p;
    }) : null;
    commitCategories(nextCategories, nextProducts, 'Rename ' + oldName + ' to ' + name);
  }

  function deleteCategory(name) {
    var count = state.products.filter(function (p) { return p.category === name; }).length;
    if (count) {
      say($('work-msg'), '"' + name + '" still holds ' + count
        + (count === 1 ? ' product' : ' products')
        + '. Move them to another category first.', 'warn');
      return;
    }
    if (!window.confirm('Delete the "' + name + '" category?')) return;
    commitCategories(
      state.categories.filter(function (c) { return c.name !== name; }),
      null,
      'Remove the ' + name + ' category',
    );
  }

  /* ----------------------------------------------------------------- wiring -- */

  $('auth-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var candidate = $('token').value.trim();
    if (!candidate) { say($('auth-msg'), 'Paste your access token first.', 'warn'); return; }
    $('auth-go').disabled = true;
    say($('auth-msg'), 'Checking with GitHub…');
    signIn(candidate).then(function () {
      if ($('token-remember').checked) {
        try { localStorage.setItem(STORE, candidate); } catch (e) { /* private mode */ }
      }
      $('token').value = '';
      show('pane-work');
      return load();
    }).catch(function (err) {
      token = '';
      say($('auth-msg'), err.status === 401
        ? 'GitHub did not accept that token. Check it was copied whole, and that it has not expired.'
        : err.message, 'warn');
    }).then(function () { $('auth-go').disabled = false; });
  });

  $('sign-out').addEventListener('click', signOut);

  $('filter').addEventListener('input', renderList);
  $('new-product').addEventListener('click', function () { openEditor(null); });
  $('f-category-new').addEventListener('click', newCategoryHere);

  /* --- reading the box --------------------------------------------------- */

  function renderVision() {
    var s = visionSettings();
    var names = { gemini: 'Google Gemini', anthropic: 'Claude', openai: 'OpenAI' };
    $('vision-provider').value = s.provider;
    $('vision-model').value = s.model || VISION_DEFAULT_MODEL[s.provider] || '';
    $('vision-key').value = '';
    $('vision-summary').textContent = visionReady()
      ? 'Fill in from the photos — on, using ' + (names[s.provider] || s.provider)
      : 'Fill in from the photos — not set up';
    $('f-read').hidden = !visionReady();
  }

  $('vision-provider').addEventListener('change', function () {
    var picked = $('vision-provider').value;
    $('vision-model').value = VISION_DEFAULT_MODEL[picked] || '';
  });

  $('vision-save').addEventListener('click', function () {
    var provider = $('vision-provider').value;
    var key = $('vision-key').value.trim();
    if (!provider) { say($('vision-msg'), 'Pick a provider first.', 'warn'); return; }
    if (!key) { say($('vision-msg'), 'Paste the API key.', 'warn'); return; }
    try {
      localStorage.setItem(VISION.provider, provider);
      localStorage.setItem(VISION.model, $('vision-model').value.trim());
      localStorage.setItem(VISION.key, key);
    } catch (e) {
      say($('vision-msg'), 'This browser will not store the key — private '
        + 'browsing blocks it. Photo reading cannot be switched on here.', 'warn');
      return;
    }
    renderVision();
    renderBulk();
    say($('vision-msg'), 'Saved in this browser. Photos dropped in from now on '
      + 'get read.', 'ok');
  });

  $('vision-forget').addEventListener('click', function () {
    try {
      localStorage.removeItem(VISION.provider);
      localStorage.removeItem(VISION.model);
      localStorage.removeItem(VISION.key);
    } catch (e) { /* nothing stored anyway */ }
    renderVision();
    renderBulk();
    say($('vision-msg'), 'Key deleted from this browser.', 'ok');
  });

  // The same reader, for one product at a time.
  $('f-read').addEventListener('click', function () {
    if (!state.pendingReadable) {
      say($('edit-msg'), 'Choose the photo first — it is the photo that gets read.', 'warn');
      return;
    }
    $('f-read').disabled = true;
    say($('edit-msg'), 'Reading the box…');
    readTheBox(state.pendingReadable).then(function (fields) {
      var got = [];
      [['name', 'f-name'], ['brand', 'f-brand'], ['sku', 'f-sku'],
       ['packSize', 'f-packsize'], ['description', 'f-description']].forEach(function (pair) {
        var value = fields[pair[0]];
        if (!value) return;
        var el = $(pair[1]);
        // Never overwrite something already typed.
        if (String(el.value).trim() && pair[0] !== 'name') return;
        el.value = value;
        el.classList.add('is-suggested');
        got.push(pair[0]);
      });
      say($('edit-msg'), got.length
        ? 'Read off the photo: ' + got.join(', ') + '. Check each against the box '
          + 'before saving — it reads the packaging, it does not know the product.'
        : 'Nothing on that box was legible. Type it in yourself.',
        got.length ? 'ok' : 'warn');
    }).catch(function (err) {
      say($('edit-msg'), err.message, 'warn');
    }).then(function () {
      $('f-read').disabled = false;
    });
  });

  /* --- bulk add ---------------------------------------------------------- */
  $('bulk-open').addEventListener('click', function () {
    state.pendingCategories = [];
    renderBulk();
    say($('bulk-msg'), '');
    show('pane-bulk');
  });
  $('bulk-back').addEventListener('click', function () {
    harvestBulk();
    show('pane-work');
  });
  $('bulk-files').addEventListener('change', function () {
    harvestBulk();
    bulkAddFiles($('bulk-files').files);
    $('bulk-files').value = '';
  });
  var bulkDrop = $('bulk-drop');
  ['dragenter', 'dragover'].forEach(function (type) {
    bulkDrop.addEventListener(type, function (ev) {
      ev.preventDefault();
      bulkDrop.classList.add('is-dropping');
    });
  });
  ['dragleave', 'dragend'].forEach(function (type) {
    bulkDrop.addEventListener(type, function () { bulkDrop.classList.remove('is-dropping'); });
  });
  bulkDrop.addEventListener('drop', function (ev) {
    ev.preventDefault();
    bulkDrop.classList.remove('is-dropping');
    harvestBulk();
    bulkAddFiles(ev.dataTransfer && ev.dataTransfer.files);
  });

  // One category for the batch, applied to every row that has none of its own.
  $('bulk-category').addEventListener('change', function () {
    var pick = $('bulk-category').value;
    harvestBulk();
    state.bulk.forEach(function (row) { if (pick) row.category = pick; });
    renderBulk();
  });
  $('bulk-category-new').addEventListener('click', function () {
    harvestBulk();
    var before = state.pendingCategories.length;
    newCategoryHereFor($('bulk-msg'));
    if (state.pendingCategories.length > before) {
      var added = state.pendingCategories[state.pendingCategories.length - 1].name;
      state.bulk.forEach(function (row) { row.category = added; });
      renderBulk();
      $('bulk-category').value = added;
    }
  });
  $('bulk-rows').addEventListener('click', function (ev) {
    var kill = ev.target.closest('[data-bk-remove]');
    if (!kill) return;
    harvestBulk();
    var key = kill.getAttribute('data-bk-remove');
    state.bulk = state.bulk.filter(function (r) { return r.key !== key; });
    renderBulk();
  });
  $('bulk-rows').addEventListener('click', function (ev) {
    var again = ev.target.closest('[data-bk-read]');
    if (!again) return;
    harvestBulk();
    var row = state.bulk.filter(function (r) {
      return r.key === again.getAttribute('data-bk-read');
    })[0];
    if (!row) return;
    again.disabled = true;
    say($('bulk-msg'), 'Reading that photo…');
    readTheBox(row.readable).then(function (fields) {
      applyRead(row, fields);
      renderBulk();
      var got = filled(fields);
      say($('bulk-msg'), got.length
        ? 'Read from the photo: ' + got.join(', ') + '. Check it before saving.'
        : 'Nothing on that box was legible. Type it in yourself.',
        got.length ? 'ok' : 'warn');
    }).catch(function (err) {
      say($('bulk-msg'), err.message, 'warn');
      again.disabled = false;
    });
  });

  $('bulk-save').addEventListener('click', bulkSave);
  $('bulk-clear').addEventListener('click', function () {
    if (!state.bulk.length) return;
    if (!window.confirm('Discard these ' + state.bulk.length + ' rows?')) return;
    state.bulk = [];
    renderBulk();
    say($('bulk-msg'), '');
  });

  $('list').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-edit]') || ev.target.closest('.admin__row');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-edit') || btn.getAttribute('data-id'));
    openEditor(state.products.find(function (p) { return p.id === id; }));
  });

  $('cat-list').addEventListener('click', function (ev) {
    var rename = ev.target.closest('[data-cat-edit]');
    if (rename) { renameCategory(rename.getAttribute('data-cat-edit')); return; }
    var remove = ev.target.closest('[data-cat-del]');
    if (remove) deleteCategory(remove.getAttribute('data-cat-del'));
  });

  $('new-category').addEventListener('click', addCategory);

  $('edit-back').addEventListener('click', function () { show('pane-work'); });
  $('edit-form').addEventListener('submit', saveProduct);
  $('delete').addEventListener('click', deleteProduct);

  // Keep the address in step with the name until someone types their own.
  var slugTouched = false;
  $('f-slug').addEventListener('input', function () { slugTouched = true; });
  $('f-name').addEventListener('input', function () {
    if (!slugTouched && !state.editing) $('f-slug').value = slugify($('f-name').value);
  });

  function usePhoto(file) {
    if (!file) return;
    say($('edit-msg'), 'Preparing the photo…');
    prepare(file).then(function (rendered) {
      state.pendingImage = rendered.tile.split(',')[1];
      state.pendingReadable = rendered.readable;
      setPreview(rendered.tile);
      say($('edit-msg'), visionReady()
        ? 'Photo ready. It uploads when you save — or press "Read the box" to '
          + 'fill in what is printed on it.'
        : 'Photo ready. It uploads when you save.', 'ok');
    }).catch(function (err) {
      say($('edit-msg'), err.message, 'warn');
    });
  }

  $('f-image').addEventListener('change', function () {
    usePhoto($('f-image').files[0]);
  });

  // Dropping a photo straight onto the box. The default drop behaviour is to
  // navigate to the file, which would throw away everything typed into the
  // form, so every one of these has to be cancelled — including the drops
  // that miss the box.
  var drop = $('f-image-drop');
  ['dragenter', 'dragover'].forEach(function (type) {
    drop.addEventListener(type, function (ev) {
      ev.preventDefault();
      drop.classList.add('is-dropping');
    });
  });
  ['dragleave', 'dragend'].forEach(function (type) {
    drop.addEventListener(type, function () { drop.classList.remove('is-dropping'); });
  });
  drop.addEventListener('drop', function (ev) {
    ev.preventDefault();
    drop.classList.remove('is-dropping');
    usePhoto(ev.dataTransfer && ev.dataTransfer.files[0]);
  });
  ['dragover', 'drop'].forEach(function (type) {
    document.addEventListener(type, function (ev) { ev.preventDefault(); });
  });

  var tabs = [
    { tab: 'tab-products', view: 'view-products' },
    { tab: 'tab-categories', view: 'view-categories' },
  ];
  tabs.forEach(function (t) {
    $(t.tab).addEventListener('click', function () {
      tabs.forEach(function (other) {
        var active = other === t;
        $(other.tab).classList.toggle('is-active', active);
        $(other.tab).setAttribute('aria-selected', active ? 'true' : 'false');
        $(other.view).hidden = !active;
      });
    });
  });

  /* ------------------------------------------------------------------ start -- */

  renderVision();

  var saved = '';
  try { saved = localStorage.getItem(STORE) || ''; } catch (e) { /* private mode */ }
  if (saved) {
    signIn(saved).then(function () {
      show('pane-work');
      return load();
    }).catch(function () {
      // Expired or revoked: drop it and ask again rather than looping on 401s.
      signOut();
      say($('auth-msg'), 'That saved token is no longer valid — it may have expired. '
        + 'Make a new one and sign in again.', 'warn');
    });
  }
}());
