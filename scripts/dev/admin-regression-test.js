#!/usr/bin/env node
// Runs the real admin code with controlled decoders and GitHub responses.
// No credentials, browser dependencies, or remote writes are involved.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { adminPage } from '../../src/pages/admin.js';

const source = fs.readFileSync(new URL('../../src/assets/js/admin.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const rendered = name => ({ tile: 'data:image/jpeg;base64,' + name, readable: name });
const product = {
  id: 1, name: 'Test Speaker', slug: 'test-speaker', brand: 'Test', category: 'Speakers',
  description: 'Details supplied by the shop for this particular test speaker.',
  image: '/images/products/test.jpg', gallery: [], tags: [], sku: '', packSize: '',
  priceCarton: '', pricePiece: '', available: true,
};

function harness() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', children: [],
      attrs: {}, listeners: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      getAttribute(name) { return this.attrs[name] || ''; },
      setAttribute(name, value) { this.attrs[name] = value; },
      removeAttribute(name) { delete this.attrs[name]; },
      focus() {}, querySelectorAll() { return []; },
    });
    return elements.get(id);
  };
  el('admin').attrs = { 'data-owner': 'owner', 'data-repo': 'repo', 'data-branch': 'publishing/branch' };
  const context = vm.createContext({
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    window: { scrollTo() {}, addEventListener() {}, confirm: () => true },
    localStorage: { getItem: () => null, removeItem() {} },
    TextEncoder, TextDecoder, Uint8Array, URL, setTimeout, clearTimeout,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    fetch: () => { throw new Error('Unexpected network request'); },
  });
  const hooks = `
    globalThis.test = {
      state: state, openEditor: openEditor, usePhoto: usePhoto, prepare: prepare,
      bulkAddFiles: bulkAddFiles, saveProduct: saveProduct, bulkSave: bulkSave,
      addCategory: addCategory, renameCategory: renameCategory, commitCategories: commitCategories,
      show: show, problems: problems,
      overridePrepare: function (fn) { prepare = fn; },
      overrideGh: function (fn) { gh = fn; },
      overrideLoad: function (fn) { load = fn; },
      overrideRenderBulk: function (fn) { renderBulk = fn; },
      overrideHarvest: function (fn) { harvestBulk = fn; },
      writeCategoryChange: writeCategoryChange,
      reloadAfterConflict: reloadAfterConflict,
    };
  `;
  vm.runInContext(source.replace(/\}\(\)\);\s*$/, hooks + '}());'), context);
  const api = context.test;
  api.state.products = [{ ...product }]; api.state.productsSha = 'products-old';
  api.state.categories = [{ name: 'Speakers', slug: 'speakers', description: 'Speaker models supplied by the shop for wholesale enquiries.' }];
  api.state.categoriesSha = 'categories-old';
  return { api, context, el };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('pickers request formats Safari can transcode to, without requesting raw HEIC', () => {
  const html = adminPage();
  for (const id of ['f-image', 'bulk-files']) {
    const input = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))[0];
    assert.match(input, /accept="image\/jpeg,image\/png,image\/webp"/);
  }
});

test('a slow first photo cannot replace the latest selected photo', async () => {
  const { api } = harness();
  api.openEditor(product);
  const a = deferred(), b = deferred();
  api.overridePrepare(file => file.name === 'a' ? a.promise : b.promise);
  api.usePhoto({ name: 'a' }); api.usePhoto({ name: 'b' });
  b.resolve(rendered('latest')); await tick();
  a.resolve(rendered('stale')); await tick();
  assert.equal(api.state.pendingImage, 'latest');
});

test('a photo finishing after switching products cannot enter the new form', async () => {
  const { api } = harness();
  const pending = deferred();
  api.overridePrepare(() => pending.promise);
  api.openEditor(product); api.usePhoto({ name: 'old.jpg' });
  api.openEditor(null);
  pending.resolve(rendered('old')); await tick();
  assert.equal(api.state.pendingImage, null);
});

test('saving while a replacement photo is processing sends no GitHub writes', async () => {
  const { api, el } = harness();
  api.openEditor(product); el('f-category').value = product.category;
  api.overridePrepare(() => new Promise(() => {}));
  const calls = [];
  api.overrideGh((...args) => { calls.push(args); return Promise.reject(new Error('unexpected write')); });
  api.usePhoto({ name: 'slow.jpg' });
  api.saveProduct({ preventDefault() {} }); await tick();
  assert.equal(calls.length, 0);
  assert.match(el('edit-msg').textContent, /prepar|wait|photo/i);
});

test('a failed replacement keeps the previous preview and blocks accidental saving', async () => {
  const { api, el } = harness();
  api.openEditor(product); el('f-category').value = product.category;
  api.overridePrepare(() => Promise.reject(new Error('Unreadable photo')));
  api.usePhoto({ name: 'bad.heic' }); await tick();
  assert.equal(el('f-image-preview').src, product.image);
  const calls = [];
  api.overrideGh((...args) => { calls.push(args); return Promise.reject(new Error('unexpected')); });
  api.saveProduct({ preventDefault() {} }); await tick();
  assert.equal(calls.length, 0);
  assert.match(el('edit-msg').textContent, /photo/i);
});

test('bulk photos decode one at a time and retain selection order after a failure', async () => {
  const { api } = harness();
  const a = deferred(), b = deferred(), c = deferred(), starts = [];
  api.overridePrepare(file => { starts.push(file.name); return ({ a, b, c })[file.name].promise; });
  api.bulkAddFiles([{ name: 'a' }, { name: 'b' }, { name: 'c' }]); await tick();
  assert.deepEqual(starts, ['a']);
  a.resolve(rendered('a')); await tick();
  assert.deepEqual(starts, ['a', 'b']);
  b.reject(new Error('bad image')); await tick();
  c.resolve(rendered('c')); await tick();
  assert.deepEqual(Array.from(api.state.bulk, row => row.name), ['a', 'c']);
});

test('bulk rendering preserves edits typed while photos were loading', async () => {
  const { api } = harness();
  let harvested = false, renderedAfterHarvest = false;
  api.overridePrepare(() => Promise.resolve(rendered('photo')));
  api.overrideHarvest(() => { harvested = true; });
  api.overrideRenderBulk(() => { renderedAfterHarvest = harvested; });
  await api.bulkAddFiles([{ name: 'photo.jpg' }]); await tick();
  assert.equal(renderedAfterHarvest, true);
});

test('category names that collide after normalisation never commit', async () => {
  const { api, context, el } = harness();
  const answers = ['speakers', 'A different description with enough detail for this category.'];
  context.window.prompt = () => answers.shift();
  const calls = [];
  api.overrideGh((...args) => { calls.push(args); return Promise.reject(new Error('unexpected')); });
  api.addCategory(); await tick();
  assert.equal(calls.length, 0);
  assert.match(el('work-msg').textContent, /already/i);
});

test('a category cannot overwrite an existing product URL', async () => {
  const { api, context, el } = harness();
  const answers = ['Test Speaker', 'A category name that collides with a currently published product.'];
  context.window.prompt = () => answers.shift();
  const calls = [];
  api.overrideGh((...args) => { calls.push(args); return Promise.reject(new Error('unexpected')); });
  api.addCategory(); await tick();
  assert.equal(calls.length, 0);
  assert.match(el('work-msg').textContent, /product/i);
});

function stubGit(api, { failAt = '', stale = false, concurrent = false } = {}) {
  const calls = [], blobs = {}, trees = {}, commits = {};
  let head = 'head-old', count = 0;
  api.overrideGh(async (path, options = {}) => {
    const method = options.method || 'GET', body = options.body;
    calls.push({ path, method, body });
    if (path.endsWith(failAt) && failAt) throw new Error('Connection interrupted');
    if (path.includes('/git/ref/')) return { object: { sha: head } };
    if (path.includes('/contents/')) {
      assert.ok(path.endsWith('?ref=head-old'), 'preflight reads must share a commit');
      return { content: Buffer.from('[]').toString('base64'), sha: path.includes('categories.json')
        ? (stale ? 'categories-newer' : 'categories-old') : 'products-old' };
    }
    if (method === 'GET' && path.includes('/git/commits/')) return { tree: { sha: 'tree-old' } };
    if (path.endsWith('/git/blobs')) {
      const sha = 'blob-' + (++count);
      blobs[sha] = JSON.parse(Buffer.from(body.content, 'base64').toString());
      return { sha };
    }
    if (path.endsWith('/git/trees')) {
      assert.equal(body.base_tree, 'tree-old');
      trees['tree-new'] = body.tree;
      return { sha: 'tree-new' };
    }
    if (path.endsWith('/git/commits')) {
      assert.deepEqual(Array.from(body.parents), ['head-old']);
      commits['head-new'] = body;
      return { sha: 'head-new' };
    }
    if (path.includes('/git/refs/')) {
      assert.equal(body.force, false);
      assert.ok(path.endsWith('/heads/publishing/branch'));
      if (concurrent) {
        head = 'someone-elses-commit';
        throw Object.assign(new Error('Update is not a fast forward'), { status: 422 });
      }
      head = body.sha;
      return { object: { sha: head } };
    }
    throw new Error('Unexpected ' + method + ' ' + path);
  });
  return { calls, blobs, trees, commits, head: () => head };
}

test('category rename publishes both files in a single non-forced branch update', async () => {
  const { api } = harness();
  const git = stubGit(api);
  const cats = [{ name: 'Loudspeakers', slug: 'loudspeakers', description: 'Details.' }];
  const prods = [{ ...product, category: 'Loudspeakers' }];
  await api.commitCategories(cats, prods, 'Rename Speakers');
  assert.equal(git.head(), 'head-new');
  assert.equal(git.calls.filter(c => c.method === 'PATCH').length, 1);
  assert.equal(git.calls.filter(c => c.method === 'PUT').length, 0);
  const entries = git.trees['tree-new'];
  assert.deepEqual(Array.from(entries, e => e.path), ['data/categories.json', 'data/products.json']);
  assert.deepEqual(git.blobs[entries[1].sha], prods);
  assert.equal(api.state.productsSha, entries[1].sha);
  assert.equal(api.state.saving, false);
});

for (const failAt of ['/git/blobs', '/git/trees', '/git/commits', '/git/refs/heads/publishing/branch']) {
  test('interrupted category save leaves the branch and local data unchanged at ' + failAt, async () => {
    const { api, el } = harness();
    const git = stubGit(api, { failAt });
    await api.commitCategories([], [], 'Rename');
    assert.equal(git.head(), 'head-old');
    assert.equal(api.state.categories[0].name, 'Speakers');
    assert.equal(api.state.products[0].category, 'Speakers');
    assert.equal(api.state.saving, false);
    assert.match(el('work-msg').textContent, /Connection interrupted/);
  });
}

test('stale data is rejected before creating any Git objects', async () => {
  const { api } = harness();
  const git = stubGit(api, { stale: true });
  await assert.rejects(api.writeCategoryChange([], [], 'Rename'), e => e.status === 409);
  assert.ok(git.calls.every(c => c.method === 'GET'));
});

test('a concurrent branch change is a conflict, never a forced overwrite', async () => {
  const { api } = harness();
  const git = stubGit(api, { concurrent: true });
  await assert.rejects(api.writeCategoryChange([], [], 'Rename'), e => e.status === 409);
  assert.equal(git.head(), 'someone-elses-commit');
  assert.equal(git.calls.filter(c => c.method === 'PATCH').length, 1);
});

test('image fallback rejects drawing errors and releases its blob URL', async () => {
  const { api, context } = harness();
  const revoked = [];
  context.createImageBitmap = () => Promise.reject(new Error('unsupported decoder'));
  context.URL = { createObjectURL: () => 'blob:photo', revokeObjectURL: url => revoked.push(url) };
  context.Image = class {
    width = 100; height = 200;
    set src(value) { if (value) setImmediate(() => this.onload && this.onload()); }
    removeAttribute() {}
  };
  context.document.createElement = () => ({
    getContext: () => ({ fillRect() {}, drawImage() { throw new Error('Drawing failed'); } }),
  });
  await assert.rejects(api.prepare({ name: 'phone.jpg', size: 123 }), /Drawing failed/);
  assert.deepEqual(revoked, ['blob:photo']);
});

test('an empty photo fails without allocating a decoder', async () => {
  const { api } = harness();
  await assert.rejects(api.prepare({ name: 'empty.jpg', size: 0 }), /empty/);
});

test('a conflicting product edit cannot be resubmitted over newer data', async () => {
  const { api, el } = harness();
  api.openEditor(product); el('f-category').value = product.category;
  api.overrideLoad(() => Promise.resolve());
  await api.reloadAfterConflict(el('edit-msg'));
  const calls = [];
  api.overrideGh((...args) => { calls.push(args); return Promise.reject(new Error('unexpected')); });
  api.saveProduct({ preventDefault() {} }); await tick();
  assert.equal(calls.length, 0);
  assert.match(el('edit-msg').textContent, /Reopen/);
  api.openEditor(product);
  assert.equal(api.state.editConflict, false);
});

test('failure to reload after a conflict still unlocks the admin controls', async () => {
  const { api, el } = harness();
  stubGit(api, { stale: true });
  api.overrideLoad(() => Promise.reject(new Error('offline')));
  await api.commitCategories([], [], 'Rename');
  assert.equal(api.state.saving, false);
  assert.match(el('work-msg').textContent, /could not be reloaded/);
});

let failed = 0;
for (const { name, run } of tests) {
  try { await run(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n  ' + error.message.split('\n')[0]); }
}
console.log(`${tests.length - failed}/${tests.length} admin regression checks passed`);
process.exitCode = failed ? 1 : 0;
