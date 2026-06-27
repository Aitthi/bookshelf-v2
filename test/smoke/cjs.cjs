'use strict';
// CJS smoke test — run after `pnpm build` via: node test/smoke/cjs.cjs
const path = require('path');
const pkgRoot = path.join(__dirname, '../../');

// Source of truth for the expected version — never hardcode the literal, or the
// smoke gate blocks every release after this one (release.yml runs smoke before publish).
const pkg = require(path.join(pkgRoot, 'package.json'));

const Bookshelf = require(path.join(pkgRoot, 'dist/cjs/index.js'));
// Unwrap default export (SWC CJS interop)
const BookshelfFn = Bookshelf.default || Bookshelf;

// Minimal knex stub — no DB required; smoke test is JS-API only.
const db = { name: 'knex', queryBuilder: () => ({ on: () => ({}) }), transaction: () => {} };

const orm = BookshelfFn(db);

// 1. VERSION check
if (orm.VERSION !== pkg.version) {
  throw new Error('Expected VERSION ' + pkg.version + ', got ' + orm.VERSION);
}

// 2. Model.extend + instanceof orm.Model
const M = orm.Model.extend({ tableName: 't' });
const m = new M({ a: 1 });
if (!(m instanceof orm.Model)) {
  throw new Error('m instanceof orm.Model failed');
}

// 3. save() returns a BPromise with .tap
const savePromise = m.save();
if (typeof savePromise.tap !== 'function') {
  throw new Error('.tap is not a function on save() return — expected BPromise');
}
savePromise.catch(() => {}); // suppress unhandled rejection (no real DB)

// 4. Model registry
orm.model('M', M);
if (orm.model('M') !== M) {
  throw new Error('orm.model() registry failed');
}

// 5. plugin(fn) works
let pluginCalled = false;
orm.plugin(function pluginFn(bookshelf) { pluginCalled = true; });
if (!pluginCalled) {
  throw new Error('plugin(fn) was not called');
}

// 6. Bundled virtuals plugin — require and load
const virtuals = require(path.join(pkgRoot, 'dist/cjs/plugins/virtuals.js'));
const virtualsFn = virtuals.default || virtuals;
if (typeof virtualsFn !== 'function') {
  throw new Error('virtuals plugin is not a function');
}
orm.plugin(virtualsFn);

console.log('CJS smoke OK');
