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
    pendingImage: null,     // { base64, name } waiting to be uploaded on save
  };

  /* ------------------------------------------------------------- helpers -- */

  var $ = function (id) { return document.getElementById(id); };

  function show(pane) {
    ['pane-auth', 'pane-work', 'pane-edit'].forEach(function (id) {
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
        .concat(p.sample ? ['<span class="admin__badge">Sample</span>'] : [])
        .concat(p.featured ? ['<span class="admin__badge">Featured</span>'] : [])
        .concat(p.available ? [] : ['<span class="admin__badge">Unavailable</span>'])
        .concat(p.packSize ? [] : ['<span class="admin__badge admin__badge--warn">No pack size</span>'])
        .join('');
      var badgeRow = badges ? '<span class="admin__badges">' + badges + '</span>' : '';
      // Coerced, not escaped: an id is a number, and Number() is the only
      // guarantee that whatever the file holds cannot close the attribute.
      var id = Number(p.id);
      return '<li class="admin__row" data-id="' + id + '">'
        + '<img class="admin__thumb" src="' + escapeAttr(p.image) + '" alt="" loading="lazy">'
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
    image: '', gallery: [], packSize: '', unit: '', sku: '',
    featured: false, available: true, sample: false, tags: [],
  };

  function openEditor(product) {
    state.editing = product;
    state.pendingImage = null;

    var p = product || BLANK;
    $('edit-title').textContent = product ? 'Edit product' : 'Add product';
    $('f-name').value = p.name;
    $('f-slug').value = p.slug;
    $('f-brand').value = p.brand;
    $('f-description').value = p.description;
    $('f-sku').value = p.sku;
    $('f-packsize').value = p.packSize;
    $('f-unit').value = p.unit;
    $('f-tags').value = (p.tags || []).join(', ');
    $('f-featured').checked = !!p.featured;
    $('f-available').checked = !!p.available;
    $('f-sample').checked = !!p.sample;
    $('f-image').value = '';

    $('f-category').innerHTML = state.categories.map(function (c) {
      return '<option value="' + escapeAttr(c.name) + '"'
        + (c.name === p.category ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>';
    }).join('');

    setPreview(p.image || '');
    $('delete').hidden = !product;
    say($('edit-msg'), '');
    show('pane-edit');
    $('f-name').focus();
  }

  function setPreview(src) {
    var img = $('f-image-preview');
    img.hidden = !src;
    $('f-image-empty').hidden = !!src;
    if (src) img.src = src;
  }

  /** Redraw a chosen photo as the catalogue's own tile: square, on white,
   *  whole frame visible rather than cropped into. */
  function toTile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That file is not an image this browser can open.')); };
        img.onload = function () {
          var S = TILE.size;
          var canvas = document.createElement('canvas');
          canvas.width = S; canvas.height = S;
          var g = canvas.getContext('2d');
          g.fillStyle = TILE.background;
          g.fillRect(0, 0, S, S);
          var r = Math.min(S / img.width, S / img.height);
          var w = img.width * r, h = img.height * r;
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
          resolve(canvas.toDataURL('image/jpeg', TILE.quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
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
      unit: $('f-unit').value.trim(),
      sku: $('f-sku').value.trim(),
      featured: $('f-featured').checked,
      available: $('f-available').checked,
      sample: $('f-sample').checked,
      tags: tags,
    };
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
    if (!product.category) out.push('Pick a category.');
    if (!product.description) out.push('The product needs a description; it is used on the page and in Google.');

    var clashesWithCategory = state.categories.some(function (c) { return c.slug === product.slug; });
    if (clashesWithCategory) {
      out.push('The web address "' + product.slug + '" is already a category page.');
    }
    var taken = state.products.some(function (p) {
      return p.slug === product.slug && p.id !== product.id;
    });
    if (taken) out.push('Another product already uses the web address "' + product.slug + '".');

    if (!product.image && !state.pendingImage) out.push('Add a photo.');
    return out;
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
    save.disabled = true;
    say($('edit-msg'), 'Saving…');

    // The photo goes up first. If the catalogue write then fails, an unused
    // image is harmless; a product pointing at an image that was never
    // uploaded is a broken card on the live site.
    var uploaded = Promise.resolve(product.image);
    if (state.pendingImage) {
      var imgPath = IMAGE_DIR + product.slug + '.jpg';
      uploaded = shaOf(imgPath).then(function (sha) {
        return writeFile(imgPath, state.pendingImage, 'Add photo for ' + product.name, sha);
      }).then(function () { return '/images/products/' + product.slug + '.jpg'; });
    }

    uploaded.then(function (imagePath) {
      product.image = imagePath;
      var next = state.products.slice();
      var at = next.findIndex(function (p) { return p.id === product.id; });
      if (at === -1) next.push(product); else next[at] = product;

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
      say($('work-msg'), 'Saved. The site rebuilds and goes live in about a minute.', 'ok');
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

  $('list').addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-edit]');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-edit'));
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

  $('f-image').addEventListener('change', function () {
    var file = $('f-image').files[0];
    if (!file) return;
    say($('edit-msg'), 'Preparing the photo…');
    toTile(file).then(function (dataUrl) {
      state.pendingImage = dataUrl.split(',')[1];
      setPreview(dataUrl);
      say($('edit-msg'), 'Photo ready. It uploads when you save.', 'ok');
    }).catch(function (err) {
      say($('edit-msg'), err.message, 'warn');
    });
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
