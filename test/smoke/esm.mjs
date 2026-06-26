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

// 2. Can define a Model
const User = orm.Model.extend({ tableName: 'users' });

// 3. Model.forge works
const user = User.forge({ name: 'Alice' });
if (!(user instanceof User)) {
  throw new Error('forge() did not return a User instance');
}

// 4. Model registry
orm.model('User', User);
if (orm.model('User') !== User) {
  throw new Error('orm.model() registry failed');
}

// 5. plugin() with function works
let pluginCalled = false;
orm.plugin(function pluginFn(bookshelf) { pluginCalled = true; });
if (!pluginCalled) {
  throw new Error('plugin(fn) was not called');
}

console.log('ESM smoke test OK — VERSION', orm.VERSION);
