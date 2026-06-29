## Change Log

**2.2.5** <small>_Jun 29, 2026_</small>

#### Fixes

- `where()` accepts a knex `Raw` as its key — `model.where(db.knex.raw('MONTH(sent_at)'), month)` now type-checks (Model, static `Model.where`, and Collection `where`)

---

**2.2.4** <small>_Jun 29, 2026_</small>

#### Fixes

- The fetch `columns` option accepts `Knex.Raw`, not just `string` — e.g. `fetchAll({ columns: [db.knex.raw('count(*) as "count"')] })`

---

**2.2.3** <small>_Jun 29, 2026_</small>

#### Fixes

- Write-side methods (`save`, `set`, `where`, `query`, `create`, `add`, `findWhere`, the constructor, and `forge`) accept `Record<string, any>`, so a named entity `interface` (which lacks an index signature and is therefore not assignable to `Record<string, unknown>`) can be passed directly — restores `@types/bookshelf` drop-in behaviour
- `where(key, value)` value arguments accept `any` (e.g. `Date`/`null`), not just `string | number | boolean`

---

**2.2.2** <small>_Jun 29, 2026_</small>

#### Fixes

- Attribute-bag **read** accessors (`get()`, `attributes`, `id`, `toJSON()`, `serialize()`, `previous()`, `previousAttributes()`) default to `any` instead of `unknown`, matching `@types/bookshelf` so existing CommonJS consumers are a drop-in. The generic escape hatch is kept on every accessor (`get<V>()`, `toJSON<E>()`, …) for opt-in strict typing

---

**2.2.1** <small>_Jun 29, 2026_</small>

#### Fixes

- Plugin subpaths (`@assetsart/bookshelf/plugins/*`) now resolve under classic `node`/`node10` `moduleResolution` via a `typesVersions` fallback, so CommonJS projects need no `tsconfig.json` change (the `exports` map continues to serve `node16`/`nodenext`/`bundler`)

---

**2.2.0** <small>_Jun 29, 2026_</small>

#### Features

- New bundled plugin: `@assetsart/bookshelf/plugins/json-columns` — transparently serializes/deserializes columns listed in a static `jsonColumns` array (ported from `bookshelf-json-columns`)
- `BPromise<T>` (the return type of every async ORM method) is now a public type — `import type { BPromise } from '@assetsart/bookshelf'` (ESM) or `Bookshelf.BPromise` (CJS)

#### Documentation

- Documented the built-in `fetchPage()` pagination (the former `pagination` / `bookshelf-page` plugin, already in core)

---

**2.1.0** <small>_Jun 27, 2026_</small>

#### Features

- First-class type declarations that are a drop-in replacement for `@types/bookshelf` — remove `@types/bookshelf`, no other change needed. Ships per-condition declarations (`export =` for CommonJS, an ESM entry, and plugin subpath types), validated across `node10`/`node16`-cjs/`node16`-esm/`bundler` resolution with `@arethetypeswrong/cli`

#### Tooling

- CI gates added: `test:types` (compiles real CJS + ESM type fixtures) and `attw` (validates published-type resolution)

---

**2.0.0** <small>_Jun 27, 2026_</small>

#### Breaking changes

- Package renamed to **bookshelfv2** (published on npm as `@assetsart/bookshelf`); install with `npm install @assetsart/bookshelf`
- Plugins must now be imported by subpath and passed as functions to `.plugin()` — string-based plugin names (e.g. `orm.plugin('virtuals')`) are no longer supported
- Node.js >= 16 required
- TypeScript consumers using plugin subpath imports must set `moduleResolution` to `node16`, `nodenext`, or `bundler`

#### Features

- Full TypeScript rewrite — the entire codebase is TypeScript; `.d.ts` declaration files are bundled; no external `@types` package needed
- Dual ESM + CJS output via `exports` map; both `import` and `require` work without configuration
- Zero runtime dependencies — bluebird, lodash, inflection, and create-error have all been removed and replaced with internal zero-dependency modules
- Bundled opt-in tree-shakeable plugins: `@assetsart/bookshelf/plugins/virtuals` and `@assetsart/bookshelf/plugins/case-converter`
- Public ORM API fully preserved — relation methods, lifecycle events, model/collection API, and bluebird-style promise helpers (`.tap()`, `.bind()`, `.map()`, `.return()`, etc.) all behave as before; helpers are provided by the internal `BPromise` native-Promise subclass, not bluebird

#### Tooling

- Test suite migrated from Mocha/Chai to Vitest
- Linting and formatting switched to Biome
- Build pipeline uses SWC (transpile) + tsc (type declarations)

#### Dependencies

- Removed runtime dependencies: bluebird, lodash, inflection, create-error
- Peer dependency: `knex >= 3.1.0` (only dependency consumers need to install)

---

Older releases — Bookshelf.js 1.x and earlier, from before the bookshelfv2 rewrite — are archived in [`CHANGELOG/pre-2.0.0.md`](CHANGELOG/pre-2.0.0.md).
