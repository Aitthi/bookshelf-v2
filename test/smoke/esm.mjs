// ESM smoke test — run after `pnpm build` via: node test/smoke/esm.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '../../');

// Import built ESM entry
const { default: Bookshelf } = await import(join(pkgRoot, 'dist/esm/index.js'));

// Minimal knex stub — no DB required; smoke test is JS-API only.
const db = { name: 'knex', queryBuilder: () => ({ on: () => ({}) }), transaction: () => {} };

const orm = Bookshelf(db);

// 1. VERSION check
if (orm.VERSION !== '2.0.0') {
  throw new Error(`Expected VERSION 2.0.0, got ${orm.VERSION}`);
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

// 6. Bundled virtuals plugin — import and load
const { default: virtuals } = await import(join(pkgRoot, 'dist/esm/plugins/virtuals.js'));
if (typeof virtuals !== 'function') {
  throw new Error('virtuals plugin is not a function');
}
orm.plugin(virtuals);

console.log('ESM smoke OK');
