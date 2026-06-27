# Full Type Support (drop-in for `@types/bookshelf`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship hand-written TypeScript declarations for `@assetsart/bookshelf` that are a drop-in replacement for `@types/bookshelf@1.2.9`, so `ketshopweb-services` removes the `@types` dep and changes only the import string.

**Architecture:** A single canonical `export = Bookshelf` declaration file (CJS, triple-merge function+interface+namespace, verbatim-adapted from `@types/bookshelf`) serves the `require` export condition — which every consumer file resolves through (all consumer `.ts` files are CommonJS under NodeNext). A separate ESM `.d.ts` serves the `import` condition for future ESM consumers. Types are hand-written because `src/` is constructor-function + `Object.assign(prototype)` and tsc cannot emit the clean generic `Model<T>` surface. Runtime `src/` is NOT touched.

**Tech Stack:** TypeScript 6, knex (peer) types, the existing `BPromise` and native error classes, Vitest (for non-type tests), `tsc --noEmit` type-test fixtures, `@arethetypeswrong/cli`.

## Global Constraints

- Types-only change. Do NOT modify runtime logic in `src/*.ts` except `src/version.ts` (untouched here) — only add `src/types/**` declaration files and wire build/exports.
- Generic shape is self-type `Model<T extends Model<any>>`, identical member set and generic positions to `@types/bookshelf@1.2.9` (a hard, fixture-verified requirement — `GetCmsModel` does `Omit<_, keyof Bookshelf.Model<any>>` and `Bookshelf.Collection<infer M>`).
- Attribute bag is `unknown` + generic escape hatch, never `any`: `get<V = unknown>`, `set(..., value?: unknown)`, `attributes: Record<string, unknown>`, `toJSON<E = unknown>`, `serialize<E = unknown>`.
- Zero runtime deps preserved: `BlueBird<T>` → `BPromise<T>`, `Lodash.*Iterator` → local iterator aliases, `createError.Error<Error>` → native error classes from `src/errors.ts`, `knex` from the `knex` peerDependency.
- `any` is permitted ONLY in generic bounds/self-type positions that `@types/bookshelf` itself requires (e.g. `Model<any>`, `Events<any>`), never on the attribute-value surface. `biome.json` keeps `noExplicitAny: "off"` (these bounds need it).
- Package stays `"type": "module"`; `dist/types/index.d.ts` is ESM-shaped, `dist/types/index.d.cts` is CJS-shaped (`export =`).
- Consumer reference for verification: `/Users/detoro/code/ketshopweb-services` (`libs/databases/src/models/ket_cms/*.ts`, `libs/databases/src/utils.ts` `GetCmsModel`/`GetCmsAttr`, `libs/business-services/src/lib/func/ai_agent/vectorize.ts`).

---

## File Structure

- `src/types/index.d.cts` — **canonical** declarations: `export = Bookshelf` + `declare function Bookshelf` + `declare namespace Bookshelf { … }` (all classes + interfaces). Hand-written. Copied verbatim to `dist/types/index.d.cts` by the build.
- `src/types/index.d.ts` — ESM entry: `export default` factory + named type re-exports + `errors`. Copied to `dist/types/index.d.ts`.
- `src/types/plugins/virtuals.d.cts` / `.d.ts` and `src/types/plugins/case-converter.d.cts` / `.d.ts` — plugin function types, dual condition.
- `scripts/copy-types.mjs` — build step that copies `src/types/**` declaration files into `dist/types/**` at the `exports`-mapped paths.
- `test/types/tsconfig.cjs.json`, `test/types/tsconfig.esm.json` — fixture compile configs (CJS=NodeNext no `"type"`, ESM).
- `test/types/*.ts` (CJS) / `*.mts` (ESM) — type fixtures replicating real consumer patterns.
- `package.json` — `exports` map (per-condition `types`), `build` script wiring, `test:types` + `attw` scripts, `@arethetypeswrong/cli` devDep.
- `docs/types/get-cast-sites.md` — enumerated app sites needing `get<V>()`/cast under the `unknown` attribute bag (D3 deliverable).

The canonical `index.d.cts` is grown across Tasks 1→3 (skeleton → model half → collection half), each gated by its own fixture. Tasks 4–6 add the ESM entry, the fidelity fixture, and build/CI wiring.

---

## Task 1: Type-test harness + exports wiring + canonical skeleton

Establish the full resolution pipeline (exports map → hand-written `.d.cts` → fixture compiles via package self-reference) with a minimal `export =` declaration, proving RED→GREEN before growing the surface.

**Files:**
- Create: `src/types/index.d.cts`
- Create: `scripts/copy-types.mjs`
- Create: `test/types/tsconfig.cjs.json`
- Create: `test/types/extend.cts`
- Modify: `package.json` (exports map, `build` script, `test:types` script)

**Interfaces:**
- Consumes: existing `dist/` build output layout (`dist/esm`, `dist/cjs`, `dist/types`), `package.json` `name` = `@assetsart/bookshelf`.
- Produces: canonical declaration symbol `Bookshelf` (function + `namespace Bookshelf` + `interface Bookshelf`) exporting at minimum `Bookshelf.Model<T>`, `Bookshelf.Collection<T>`; npm script `test:types`; build copies `src/types/**` → `dist/types/**`.

- [ ] **Step 0: Self-link the package so fixtures resolve it via the exports map** (REQUIRED — without this, `tsc` can never resolve `@assetsart/bookshelf` from `test/types/` and every task compiles against nothing)

In `package.json` `devDependencies`, add:

```json
"@assetsart/bookshelf": "link:."
```

Run: `pnpm install`
Expected: pnpm creates `node_modules/@assetsart/bookshelf` → `.` (self symlink). Verify: `ls -la node_modules/@assetsart/bookshelf` shows a symlink to the repo root. This makes `import = require('@assetsart/bookshelf')` resolve through the package's own `exports` map (the real condition-resolution path we want to test), not a `paths` shim.

- [ ] **Step 1: Write the failing fixture**

Create `test/types/extend.cts` (CJS, mirrors the real model pattern minimally):

```ts
import Bookshelf = require('@assetsart/bookshelf');

// Factory returns an instance usable as a type and a value.
declare const db: Bookshelf;

// Self-type generic extend — the core pattern of all 1161 consumer models.
class User extends db.Model<User> {
  override get tableName() {
    return 'users';
  }
}

// Namespace access (GetCmsModel relies on this).
type C = Bookshelf.Collection<User>;
type M = Bookshelf.Model<User>;

const u = new User();
const _t: string = u.tableName;
```

Create `test/types/tsconfig.cjs.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["./**/*.cts"]
}
```

- [ ] **Step 2: Add `test:types` script and run it to verify failure**

In `package.json` `scripts`, add:

```json
"test:types": "pnpm build && tsc -p test/types/tsconfig.cjs.json"
```

Run: `pnpm test:types`
Expected: FAIL — `Cannot find module '@assetsart/bookshelf' or its corresponding type declarations` (canonical `.d.cts` not created/copied yet), or resolution falls back to the any-heavy tsc-generated types and `db.Model<User>` / `Bookshelf.Collection` errors.

- [ ] **Step 3: Create the canonical skeleton declaration**

Create `src/types/index.d.cts`:

```ts
// `export =` modules may not mix ESM VALUE imports. Both imports below are
// TYPE-ONLY, which IS permitted alongside `export =` in declaration files.
// knex v3 exposes the `Knex` namespace+interface as a named type export, giving
// both the instance type (`Knex`) and namespace members (`Knex.QueryBuilder`,
// `Knex.Transaction`).
import type { Knex } from 'knex';
import type { BPromise } from './internal/promise.js';

export = Bookshelf;

declare function Bookshelf(knex: Knex): Bookshelf;

interface Bookshelf {
  VERSION: string;
  knex: Knex;
  Model: typeof Bookshelf.Model;
  Collection: typeof Bookshelf.Collection;
}

declare namespace Bookshelf {
  class Model<T extends Model<any>> {
    constructor(attributes?: Record<string, unknown>, options?: ModelOptions);
    get tableName(): string;
  }
  class Collection<T extends Model<any>> {
    constructor(models?: T[]);
    models: T[];
  }
  interface ModelOptions {
    tableName?: string | undefined;
    hasTimestamps?: boolean | undefined;
    parse?: boolean | undefined;
  }
}
```

Note: the import path `./internal/promise.js` resolves within `dist/types/` (tsc-emitted internal types live there). `BPromise` is imported now so later tasks can use it without re-touching the import block.

- [ ] **Step 4: Create the copy-types build step**

Create `scripts/copy-types.mjs`:

```js
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcTypes = join(root, 'src/types');
const distTypes = join(root, 'dist/types');

if (!existsSync(srcTypes)) {
  console.error('copy-types: src/types not found');
  process.exit(1);
}
mkdirSync(distTypes, { recursive: true });
// Overlay hand-written declarations on top of tsc-emitted internal types.
cpSync(srcTypes, distTypes, { recursive: true });
console.log('copy-types: overlaid src/types -> dist/types');
```

In `package.json`, append the copy step to the `build` script (after `build:types`):

```
"build": "node scripts/gen-version.mjs && node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\" && pnpm build:esm && pnpm build:cjs && pnpm build:types && node scripts/copy-types.mjs && node scripts/fix-dist-pkg.mjs",
```

- [ ] **Step 5: Point the `require` condition at the canonical `.d.cts`**

In `package.json`, replace the `exports` map with per-condition types (types key MUST be first in each condition):

```json
"exports": {
  ".": {
    "import":  { "types": "./dist/types/index.d.ts",  "default": "./dist/esm/index.js" },
    "require": { "types": "./dist/types/index.d.cts", "default": "./dist/cjs/index.js" }
  },
  "./plugins/*": {
    "import":  { "types": "./dist/types/plugins/*.d.ts",  "default": "./dist/esm/plugins/*.js" },
    "require": { "types": "./dist/types/plugins/*.d.cts", "default": "./dist/cjs/plugins/*.js" }
  }
}
```

The ESM `import` condition still points at the tsc-generated `dist/types/index.d.ts` for now (replaced in Task 4); the CJS fixture does not exercise it.

- [ ] **Step 6: Run the fixture to verify it passes**

Run: `pnpm test:types`
Expected: PASS (0 errors). `import = require('@assetsart/bookshelf')` resolves via the `require` condition to `dist/types/index.d.cts`; `db.Model<User>`, `Bookshelf.Collection<User>`, and `class User extends db.Model<User>` type-check.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.d.cts scripts/copy-types.mjs test/types/tsconfig.cjs.json test/types/extend.cts package.json
git commit -m "feat(types): canonical export= skeleton + type-test harness + exports wiring"
```

---

## Task 2: Model surface — ModelBase, Events, relations, statics, options

Grow the canonical declaration to the full `Model<T>` surface so the real model-definition pattern (relations returning `Collection<R>`/`R`, `toJSON<E>()`, `query()`, getters) type-checks.

**Files:**
- Modify: `src/types/index.d.cts`
- Create: `test/types/model-definition.cts`

**Interfaces:**
- Consumes: `Bookshelf.Model<T>`, `Bookshelf.Collection<T>`, `BPromise<T>`, `Knex` (from Task 1).
- Produces: full `Events<T>`, `IModelBase`, `ModelBase<T>`, `ModelSubclass`, `Model<T>` members (statics + instance) listed below; option interfaces `FetchOptions`, `FetchAllOptions`, `FetchPageOptions`, `Pagination`, `WithRelatedQuery`, `SaveOptions`, `DestroyOptions`, `SerializeOptions`, `SetOptions`, `TimestampOptions`, `SyncOptions`, `SortOrder`, `Relations`.

- [ ] **Step 1: Write the failing fixture**

Create `test/types/model-definition.cts` (mirrors `category.ts` + relation usage):

```ts
import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;

interface CategoryEntity {
  id: number;
  name: string;
}

class Category extends db.Model<Category> {
  override get tableName() {
    return 'category';
  }
  override get hasTimestamps() {
    return false;
  }
  override toJSON(): CategoryEntity {
    return db.Model.prototype.toJSON.apply(this, arguments as never) as CategoryEntity;
  }
  childrens() {
    return this.hasMany(Category, 'cat_parent', 'id').query((qb) => {
      qb.orderBy('sort');
    });
  }
  parent() {
    return this.belongsTo(Category, 'cat_parent');
  }
}

async function use() {
  const c = new Category();
  const fetched: Category = await c.where('id', 1).fetch();
  const all: Bookshelf.Collection<Category> = await c.fetchAll();
  const entity: CategoryEntity = fetched.toJSON();
  const name: string = fetched.get<string>('name');
  const kids: Bookshelf.Collection<Category> = c.childrens();
  const dad: Category = c.parent();
  void all;
  void entity;
  void name;
  void kids;
  void dad;
}
void use;
```

- [ ] **Step 2: Run the fixture to verify it fails**

Run: `pnpm test:types`
Expected: FAIL — `Property 'hasMany' does not exist`, `Property 'fetch' does not exist`, `Property 'get' does not exist`, etc.

- [ ] **Step 3: Replace the namespace body with the full model surface**

In `src/types/index.d.cts`, replace the `declare namespace Bookshelf { … }` body with (keep the `import` lines, `export = Bookshelf`, and `interface Bookshelf` from Task 1; `interface Bookshelf` is finalized in Task 3):

```ts
declare namespace Bookshelf {
  type SortOrder = 'ASC' | 'asc' | 'DESC' | 'desc';
  type Relations = string | WithRelatedQuery | (string | WithRelatedQuery)[];

  abstract class Events<T> {
    on(event?: string, callback?: EventFunction<T>, context?: unknown): void;
    off(event?: string): void;
    trigger(event?: string, ...args: unknown[]): void;
    triggerThen(name: string, ...args: unknown[]): BPromise<unknown>;
    once(event: string, callback: EventFunction<T>, context?: unknown): void;
  }

  interface IModelBase {
    hasTimestamps?: boolean | string[] | undefined;
    tableName?: string | undefined;
  }

  interface ModelBase<T extends Model<any>> extends IModelBase {}
  abstract class ModelBase<T extends Model<any>> extends Events<T | Collection<T>> {
    idAttribute: string;
    id: unknown;
    attributes: Record<string, unknown>;

    constructor(attributes?: Record<string, unknown>, options?: ModelOptions);

    clear(): T;
    clone(): T;
    escape(attribute: string): string;
    format(attributes: Record<string, unknown>): Record<string, unknown>;
    get<V = unknown>(attribute: string): V;
    has(attribute: string): boolean;
    hasChanged(attribute?: string): boolean;
    isNew(): boolean;
    parse(response: object): object;
    previousAttributes<E = unknown>(): E;
    previous<V = unknown>(attribute: string): V;
    related<R extends Model<any>>(relation: string): R | Collection<R>;
    serialize<E = unknown>(options?: SerializeOptions): E;
    set(attribute?: Record<string, unknown>, options?: SetOptions): T;
    set(attribute: string, value?: unknown, options?: SetOptions): T;
    timestamp(options?: TimestampOptions): Record<string, unknown>;
    // Non-generic `unknown`: a generic `toJSON<E>()` cannot be overridden by the
    // consumer's concrete `override toJSON(): Entity`, but a concrete return IS
    // assignable to `unknown` — zero any, override-compatible.
    toJSON(options?: SerializeOptions): unknown;
    unset(attribute: string): T;
    omit<R extends object>(predicate: (value: unknown, key: string) => boolean): R;
    omit<R extends object>(...attributes: string[]): R;
    pick<R extends object>(predicate: (value: unknown, key: string) => boolean): R;
    pick<R extends object>(...attributes: string[]): R;
  }

  interface ModelSubclass {
    new (): Model<any>;
  }

  class Model<T extends Model<any>> extends ModelBase<T> {
    static collection<T extends Model<any>>(models?: T[], options?: CollectionOptions<T>): Collection<T>;
    static count(column?: string, options?: SyncOptions): BPromise<number | string>;
    /** @deprecated use TypeScript classes */
    static extend(prototypeProperties?: object, classProperties?: object): typeof Model;
    static fetchAll<T extends Model<any>>(): BPromise<Collection<T>>;
    /** @deprecated use `new` instead. */
    static forge<T>(attributes?: Record<string, unknown>, options?: ModelOptions): T;
    static where<T>(properties: Record<string, unknown>): T;
    static where<T>(
      key: string,
      operatorOrValue: string | number | boolean,
      valueIfOperator?: string | string[] | number | number[] | boolean,
    ): T;

    belongsTo<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): R;
    belongsToMany<R extends Model<any>>(
      target: { new (...args: any[]): R },
      table?: string,
      foreignKey?: string,
      otherKey?: string,
      foreignKeyTarget?: string,
      otherKeyTarget?: string,
    ): Collection<R>;
    count(column?: string, options?: SyncOptions): BPromise<number | string>;
    destroy(options?: DestroyOptions): BPromise<T>;
    fetch(options?: FetchOptions): BPromise<T>;
    fetchAll(options?: FetchAllOptions): BPromise<Collection<T>>;
    fetchPage(options?: FetchPageOptions): BPromise<Collection<T> & Pagination>;
    hasMany<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): Collection<R>;
    hasOne<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): R;
    load(relations: Relations, options?: SyncOptions): BPromise<T>;
    morphMany<R extends Model<any>>(target: { new (...args: any[]): R }, name?: string, columnNames?: string[], morphValue?: string): Collection<R>;
    morphOne<R extends Model<any>>(target: { new (...args: any[]): R }, name?: string, columnNames?: string[], morphValue?: string): R;
    morphTo(name: string, columnNames?: string[], ...target: ModelSubclass[]): T;
    morphTo(name: string, ...target: ModelSubclass[]): T;
    orderBy(column: string, order?: SortOrder): T;

    query(): Knex.QueryBuilder;
    query(callback: (qb: Knex.QueryBuilder) => void): T;
    query(...query: string[]): T;
    query(query: Record<string, unknown>): T;

    refresh(options?: FetchOptions): BPromise<T>;
    resetQuery(): T;
    save(key?: string, val?: unknown, options?: SaveOptions): BPromise<T>;
    save(attrs?: Record<string, unknown>, options?: SaveOptions): BPromise<T>;
    through<R extends Model<any>>(
      interim: ModelSubclass,
      throughForeignKey?: string,
      otherKey?: string,
      throughForeignKeyTarget?: string,
      otherKeyTarget?: string,
    ): R;
    where(properties: Record<string, unknown>): T;
    where(
      key: string,
      operatorOrValue: string | number | boolean,
      valueIfOperator?: string | string[] | number | number[] | boolean,
    ): T;

    static NotFoundError: typeof import('./errors.js').NotFoundError;
    static NoRowsUpdatedError: typeof import('./errors.js').NoRowsUpdatedError;
    static NoRowsDeletedError: typeof import('./errors.js').NoRowsDeletedError;
  }

  interface ModelOptions {
    tableName?: string | undefined;
    hasTimestamps?: boolean | undefined;
    parse?: boolean | undefined;
  }
  interface FetchOptions extends SyncOptions {
    require?: boolean | undefined;
    columns?: string | string[] | undefined;
    withRelated?: (string | WithRelatedQuery)[] | undefined;
  }
  interface WithRelatedQuery {
    [index: string]: (query: Knex.QueryBuilder) => Knex.QueryBuilder | void;
  }
  interface FetchAllOptions extends FetchOptions {}
  interface FetchPageOptions extends FetchOptions {
    pageSize?: number;
    page?: number;
    limit?: number;
    offset?: number;
    disableCount?: boolean;
  }
  interface Pagination {
    pagination: { rowCount: number; pageCount: number; page: number; pageSize: number };
  }
  interface SaveOptions extends SyncOptions {
    method?: string | undefined;
    defaults?: string | undefined;
    patch?: boolean | undefined;
    require?: boolean | undefined;
    autoRefresh?: boolean | undefined;
  }
  interface DestroyOptions extends SyncOptions {
    require?: boolean | undefined;
  }
  interface SerializeOptions {
    shallow?: boolean | undefined;
    omitPivot?: boolean | undefined;
    visibility?: boolean | undefined;
  }
  interface SetOptions {
    unset?: boolean | undefined;
  }
  interface TimestampOptions {
    method?: string | undefined;
  }
  interface SyncOptions {
    transacting?: Knex.Transaction | undefined;
    debug?: boolean | undefined;
    withSchema?: string | undefined;
  }
  interface EventOptions {
    silent?: boolean | undefined;
  }
  interface EventFunction<T> {
    (model: T, attrs: Record<string, unknown>, options: Record<string, unknown>): BPromise<unknown> | void;
  }
  interface CollectionOptions<T> {
    comparator?: boolean | string | ((a: T, b: T) => number) | undefined;
  }
}
```

Note: `Collection<T>` is still the Task 1 stub; `CollectionOptions` is referenced here and defined here, `Collection` full body comes in Task 3. The static error references use `typeof import('./errors.js').<Class>` so the native error classes (from `src/errors.ts`, emitted to `dist/types/errors.d.ts`) are the static types.

- [ ] **Step 4: Run the fixture to verify it passes**

Run: `pnpm test:types`
Expected: PASS. `hasMany(...).query(cb)` returns `Collection<Category>`, `belongsTo` returns `Category`, `fetch()`/`fetchAll()` return `BPromise<…>` awaited to `Category`/`Collection<Category>`, `get<string>('name')` is `string`, `toJSON(): CategoryEntity` override compiles.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.d.cts test/types/model-definition.cts
git commit -m "feat(types): full Model surface (relations, statics, options) — model fixture green"
```

---

## Task 3: Collection surface + lodash methods + finalized Bookshelf interface

Add the full `CollectionBase<T>`/`Collection<T>` surface (including the lodash-style methods with local iterator types) and finalize the `Bookshelf` instance interface (`model`, `plugin`, `transaction`, `EmptyError`).

**Files:**
- Modify: `src/types/index.d.cts`
- Create: `test/types/collection.cts`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `ListIterator`, `DictionaryIterator`, `MemoIterator`, `Dictionary` local aliases; full `CollectionBase<T>` + `Collection<T>` members; finalized `interface Bookshelf` with `model()`, `plugin()`, `transaction()`; `Collection.EmptyError`; `CollectionAddOptions`, `CollectionFetchOptions`, `CollectionFetchOneOptions`, `CollectionSetOptions`, `CollectionCreateOptions`, `PivotOptions`.

- [ ] **Step 1: Write the failing fixture**

Create `test/types/collection.cts`:

```ts
import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;
declare function jsonColumns(bookshelf: Bookshelf): void;

class Tag extends db.Model<Tag> {
  override get tableName() {
    return 'tags';
  }
}

// .plugin(fn) must accept a third-party plugin (bookshelf-json-columns pattern).
db.plugin(jsonColumns);
db.plugin('virtuals');
db.plugin(['case-converter']);

// model registry + transaction.
db.model('Tag', Tag);

async function use() {
  const c = new Tag().fetchAll();
  const col: Bookshelf.Collection<Tag> = await c;
  const first: Tag = col.first();
  const arr: Tag[] = col.toArray();
  const filtered: Tag[] = col.filter((t) => t.tableName === 'tags');
  const names: string[] = col.map<string>((t) => t.tableName);
  const cloned: Bookshelf.Collection<Tag> = col.clone();
  const q = cloned.query((qb) => {
    qb.where('x', 1);
  });
  void first;
  void arr;
  void filtered;
  void names;
  void q;
}
void use;
```

- [ ] **Step 2: Run the fixture to verify it fails**

Run: `pnpm test:types`
Expected: FAIL — `Property 'plugin' does not exist on type 'Bookshelf'`, `Property 'first'/'filter'/'map'/'toArray' does not exist on Collection`, `Property 'model' does not exist`.

- [ ] **Step 3: Finalize the `Bookshelf` interface**

In `src/types/index.d.cts`, replace the `interface Bookshelf { … }` block (outside the namespace) with:

```ts
interface Bookshelf extends Bookshelf.Events<any> {
  VERSION: string;
  knex: Knex;
  Model: typeof Bookshelf.Model;
  Collection: typeof Bookshelf.Collection;
  model(name: string, model?: typeof Bookshelf.Model | object, staticProperties?: object): typeof Bookshelf.Model;
  plugin(plugin: string | string[] | ((bookshelf: Bookshelf, options?: unknown) => void), options?: unknown): Bookshelf;
  transaction<T>(callback: (transaction: Knex.Transaction) => PromiseLike<T>): BPromise<T>;
}
```

- [ ] **Step 4: Add the Collection surface + iterator aliases inside the namespace**

Append to the `declare namespace Bookshelf { … }` body (before its closing brace):

```ts
  type ListIterator<T, R> = (value: T, index: number, collection: T[]) => R;
  type DictionaryIterator<T, R> = (value: T, key: string, collection: Record<string, T>) => R;
  type MemoIterator<T, R> = (prev: R, curr: T, index: number, list: T[]) => R;
  interface Dictionary<T> {
    [index: string]: T;
  }

  abstract class CollectionBase<T extends Model<any>> extends Events<T> {
    length: number;
    models: T[];
    constructor(models?: T[], options?: CollectionOptions<T>);

    add(models: T[] | Record<string, unknown>[], options?: CollectionAddOptions): Collection<T>;
    at(index: number): T;
    clone(): Collection<T>;
    fetch(options?: CollectionFetchOptions): BPromise<Collection<T>>;
    findWhere(match: Record<string, unknown>): T;
    get(id: unknown): T;
    invokeThen(name: string, ...args: unknown[]): BPromise<unknown>;
    parse<E = unknown>(response: E): E;
    pluck<V = unknown>(attribute: string): V[];
    pop(): void;
    push(model: unknown): Collection<T>;
    reduceThen<R>(iterator: (prev: R, cur: T, idx: number, array: T[]) => R, initialValue: R, context: unknown): BPromise<R>;
    remove(model: T, options?: EventOptions): T;
    remove(model: T[], options?: EventOptions): T[];
    reset(model: unknown[], options?: CollectionAddOptions): T[];
    serialize<E = unknown>(options?: SerializeOptions): E[];
    set(models: T[] | Record<string, unknown>[], options?: CollectionSetOptions): Collection<T>;
    shift(options?: EventOptions): void;
    slice(begin?: number, end?: number): void;
    toJSON<E = unknown>(options?: SerializeOptions): E[];
    unshift(model: unknown, options?: CollectionAddOptions): void;
    where(match: Record<string, unknown>): Collection<T>;
    where(
      key: string,
      operatorOrValue: string | number | boolean,
      valueIfOperator?: string | string[] | number | number[] | boolean,
    ): Collection<T>;

    includes(value: unknown, fromIndex?: number): boolean;
    countBy(predicate?: ListIterator<T, boolean> | string): Dictionary<number>;
    every(predicate?: ListIterator<T, boolean> | string): boolean;
    filter(predicate?: ListIterator<T, boolean> | string): T[];
    find(predicate?: ListIterator<T, boolean> | string): T;
    first(): T;
    forEach(callback?: ListIterator<T, void>): T[];
    groupBy(predicate?: ListIterator<T, unknown> | string): Dictionary<T[]>;
    invokeMap(methodName: string | Function, ...args: unknown[]): unknown;
    isEmpty(): boolean;
    keys(): string[];
    last(): T;
    map<U>(predicate?: ListIterator<T, U> | string): U[];
    reduce<R>(callback?: MemoIterator<T, R>, accumulator?: R): R;
    reduceRight<R>(callback?: MemoIterator<T, R>, accumulator?: R): R;
    reject(predicate?: ListIterator<T, boolean> | string): T[];
    tail(): T[];
    some(predicate?: ListIterator<T, boolean> | string): boolean;
    sortBy(predicate?: ListIterator<T, unknown> | string): T[];
    toArray(): T[];
  }

  class Collection<T extends Model<any>> extends CollectionBase<T> {
    /** @deprecated use TypeScript classes */
    static extend(prototypeProperties?: object, classProperties?: object): typeof Collection;
    /** @deprecated use `new` instead. */
    static forge<T>(attributes?: Record<string, unknown>, options?: ModelOptions): T;

    attach(ids: unknown | unknown[], options?: SyncOptions): BPromise<Collection<T>>;
    count(column?: string, options?: SyncOptions): BPromise<number | string>;
    create(model: Record<string, unknown>, options?: CollectionCreateOptions): BPromise<T>;
    detach(ids: unknown[], options?: SyncOptions): BPromise<unknown>;
    detach(options?: SyncOptions): BPromise<unknown>;
    fetchOne(options?: CollectionFetchOneOptions): BPromise<T>;
    load(relations: Relations, options?: SyncOptions): BPromise<Collection<T>>;
    orderBy(column: string, order?: SortOrder): Collection<T>;

    query(): Knex.QueryBuilder;
    query(callback: (qb: Knex.QueryBuilder) => void): Collection<T>;
    query(...query: string[]): Collection<T>;
    query(query: Record<string, unknown>): Collection<T>;

    resetQuery(): Collection<T>;
    through<R extends Model<any>>(interim: ModelSubclass, throughForeignKey?: string, otherKey?: string): Collection<R>;
    updatePivot(attributes: Record<string, unknown>, options?: PivotOptions): BPromise<number>;
    withPivot(columns: string[]): Collection<T>;

    static EmptyError: typeof import('./errors.js').EmptyError;
  }

  interface CollectionAddOptions extends EventOptions {
    at?: number | undefined;
    merge?: boolean | undefined;
  }
  interface CollectionFetchOptions {
    require?: boolean | undefined;
    withRelated?: string | string[] | undefined;
  }
  interface CollectionFetchOneOptions {
    require?: boolean | undefined;
    columns?: string | string[] | undefined;
  }
  interface CollectionSetOptions extends EventOptions {
    add?: boolean | undefined;
    remove?: boolean | undefined;
    merge?: boolean | undefined;
  }
  interface PivotOptions {
    query?: Function | Record<string, unknown> | undefined;
    require?: boolean | undefined;
  }
  interface CollectionCreateOptions extends ModelOptions, SyncOptions, CollectionAddOptions, SaveOptions {}
```

Then delete the Task 1 stub `class Collection<T extends Model<any>> { … }` (now superseded).

- [ ] **Step 5: Run the fixture to verify it passes**

Run: `pnpm test:types`
Expected: PASS. `db.plugin(jsonColumns)`, `db.plugin('virtuals')`, `db.model('Tag', Tag)` compile; `col.first()`/`filter`/`map<string>`/`toArray`/`clone().query(cb)` resolve with correct element types. Re-run the earlier fixtures (`extend.cts`, `model-definition.cts`) — still green (same `tsc -p` run).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.d.cts test/types/collection.cts
git commit -m "feat(types): Collection surface + lodash methods + Bookshelf interface — collection fixture green"
```

---

## Task 4: ESM entry declaration + `attw` dual-resolution check

Provide an ESM-shaped `dist/types/index.d.ts` for the `import` condition and validate the whole `exports` map with `@arethetypeswrong/cli`.

**Files:**
- Create: `src/types/index.d.ts`
- Create: `test/types/tsconfig.esm.json`
- Create: `test/types/extend.mts`
- Modify: `package.json` (`attw` script, devDependency)

**Interfaces:**
- Consumes: the canonical `index.d.cts` (Tasks 1–3).
- Produces: `dist/types/index.d.ts` exporting `default` (the factory) + named types + `errors`; npm scripts `attw`.

- [ ] **Step 1: Write the failing ESM fixture + config**

Create `test/types/extend.mts`:

```ts
import Bookshelf from '@assetsart/bookshelf';
import type { Model, Collection } from '@assetsart/bookshelf';
import { errors } from '@assetsart/bookshelf';

declare const db: ReturnType<typeof Bookshelf>;

class User extends db.Model<User> {
  override get tableName() {
    return 'users';
  }
}

const _isErr: typeof errors.NotFoundError = errors.NotFoundError;
type _M = Model<User>;
type _C = Collection<User>;
void _isErr;
```

Create `test/types/tsconfig.esm.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["./**/*.mts"]
}
```

Extend `test:types` to compile both configs:

```json
"test:types": "pnpm build && tsc -p test/types/tsconfig.cjs.json && tsc -p test/types/tsconfig.esm.json"
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:types`
Expected: FAIL on the ESM config — the `import` condition still points at the any-heavy tsc-generated `dist/types/index.d.ts`, so `import type { Model, Collection }` and `import { errors }` fail or `db.Model<User>` is `any`.

- [ ] **Step 3: Write the ESM entry declaration**

Create `src/types/index.d.ts`. NodeNext maps the JS specifier `./index.cjs` → the
declaration `./index.d.cts` (never reference `.d.cts` directly — not a valid JS
extension). The option interfaces live INSIDE `declare namespace Bookshelf`, so
they are NOT top-level exports of the cts — they cannot be re-exported with
`export type { … } from`. Expose them as namespace-qualified aliases instead:

```ts
import Bookshelf = require('./index.cjs');

export default Bookshelf;

export type Model<T extends Bookshelf.Model<any>> = Bookshelf.Model<T>;
export type Collection<T extends Bookshelf.Model<any>> = Bookshelf.Collection<T>;
export type ModelBase<T extends Bookshelf.Model<any>> = Bookshelf.ModelBase<T>;
export type CollectionBase<T extends Bookshelf.Model<any>> = Bookshelf.CollectionBase<T>;
export type Events<T> = Bookshelf.Events<T>;
export type ModelOptions = Bookshelf.ModelOptions;
export type FetchOptions = Bookshelf.FetchOptions;
export type FetchAllOptions = Bookshelf.FetchAllOptions;
export type FetchPageOptions = Bookshelf.FetchPageOptions;
export type Pagination = Bookshelf.Pagination;
export type WithRelatedQuery = Bookshelf.WithRelatedQuery;
export type SaveOptions = Bookshelf.SaveOptions;
export type DestroyOptions = Bookshelf.DestroyOptions;
export type SerializeOptions = Bookshelf.SerializeOptions;
export type SetOptions = Bookshelf.SetOptions;
export type TimestampOptions = Bookshelf.TimestampOptions;
export type SyncOptions = Bookshelf.SyncOptions;
export type CollectionOptions<T> = Bookshelf.CollectionOptions<T>;
export type CollectionAddOptions = Bookshelf.CollectionAddOptions;
export type CollectionFetchOptions = Bookshelf.CollectionFetchOptions;
export type CollectionFetchOneOptions = Bookshelf.CollectionFetchOneOptions;
export type CollectionSetOptions = Bookshelf.CollectionSetOptions;
export type CollectionCreateOptions = Bookshelf.CollectionCreateOptions;
export type PivotOptions = Bookshelf.PivotOptions;
export type EventOptions = Bookshelf.EventOptions;
export type EventFunction<T> = Bookshelf.EventFunction<T>;
export type SortOrder = Bookshelf.SortOrder;
export type Relations = Bookshelf.Relations;
export type ModelSubclass = Bookshelf.ModelSubclass;
export * as errors from './errors.js';
```

If `tsc` rejects `import Bookshelf = require('./index.cjs')` inside this ESM
declaration file (NodeNext can disallow `import =` in an ES module), the fallback
is a default import: `import Bookshelf from './index.cjs';` (the CJS `export =`
resolves to a synthetic default under `esModuleInterop`), keeping every
`Bookshelf.<X>` alias unchanged. The ESM fixture + `attw` are the oracle.

- [ ] **Step 4: Point the `import` condition at the hand-written ESM entry**

Already done in Task 1 (`import.types` = `./dist/types/index.d.ts`). Confirm `scripts/copy-types.mjs` copies `src/types/index.d.ts` over the tsc-generated one (it does — `cpSync` overlay). No change needed; re-run build.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test:types`
Expected: PASS on both CJS and ESM configs.

- [ ] **Step 6: Add and run `attw`**

Add devDependency and script:

```bash
pnpm add -D @arethetypeswrong/cli
```

In `package.json` `scripts`:

```json
"attw": "pnpm build && attw --pack ."
```

Run: `pnpm attw`
Expected: No blocking problems for the `.` and `./plugins/*` entrypoints across node10 / node16-cjs / node16-esm / bundler. If `attw` reports a non-blocking masquerade note on the ESM resolution, record it in the commit message; resolve only hard errors. (The entire reference consumer resolves via the `require` condition, so a residual ESM-side note is acceptable but should be minimized.)

- [ ] **Step 7: Commit**

```bash
git add src/types/index.d.ts test/types/tsconfig.esm.json test/types/extend.mts package.json pnpm-lock.yaml
git commit -m "feat(types): ESM entry declaration + attw dual-resolution check"
```

---

## Task 5: Plugin type declarations

Type the bundled plugins (`./plugins/virtuals`, `./plugins/case-converter`) for both conditions, so `import virtuals from '@assetsart/bookshelf/plugins/virtuals'` and the `require` form are typed as Bookshelf plugin functions.

**Files:**
- Create: `src/types/plugins/virtuals.d.cts`, `src/types/plugins/virtuals.d.ts`
- Create: `src/types/plugins/case-converter.d.cts`, `src/types/plugins/case-converter.d.ts`
- Create: `test/types/plugins.cts`

**Interfaces:**
- Consumes: the canonical `Bookshelf` type (Tasks 1–4) via relative path from `dist/types/plugins/`.
- Produces: default-exported plugin function types `(bookshelf: Bookshelf, options?: unknown) => void`.

- [ ] **Step 1: Write the failing fixture**

Create `test/types/plugins.cts`:

```ts
import Bookshelf = require('@assetsart/bookshelf');
import virtuals = require('@assetsart/bookshelf/plugins/virtuals');
import caseConverter = require('@assetsart/bookshelf/plugins/case-converter');

declare const db: Bookshelf;
db.plugin(virtuals);
db.plugin(caseConverter);
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:types`
Expected: FAIL — plugin subpaths resolve to tsc-generated any types or fail; `db.plugin(virtuals)` not typed as a plugin function.

- [ ] **Step 3: Write plugin declarations**

Create `src/types/plugins/virtuals.d.cts`:

```ts
import Bookshelf = require('../index.cjs');

declare function virtuals(bookshelf: Bookshelf, options?: unknown): void;
export = virtuals;
```

Create `src/types/plugins/virtuals.d.ts`:

```ts
import type Bookshelf from '../index.js';

declare function virtuals(bookshelf: ReturnType<typeof Bookshelf>, options?: unknown): void;
export default virtuals;
```

Create `src/types/plugins/case-converter.d.cts`:

```ts
import Bookshelf = require('../index.cjs');

declare function caseConverter(bookshelf: Bookshelf, options?: unknown): void;
export = caseConverter;
```

Create `src/types/plugins/case-converter.d.ts`:

```ts
import type Bookshelf from '../index.js';

declare function caseConverter(bookshelf: ReturnType<typeof Bookshelf>, options?: unknown): void;
export default caseConverter;
```

The `.d.ts` (ESM) plugin files use `import type Bookshelf from '../index.js'`
(maps to `../index.d.ts`); the `.d.cts` (CJS) files use `require('../index.cjs')`
(maps to `../index.d.cts`). The plugin fixtures + `attw` are the oracle.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:types`
Expected: PASS. `db.plugin(virtuals)` and `db.plugin(caseConverter)` accept the imported plugin functions.

- [ ] **Step 5: Run `attw` to confirm plugin subpaths resolve**

Run: `pnpm attw`
Expected: `./plugins/*` entrypoints report no blocking problems.

- [ ] **Step 6: Commit**

```bash
git add src/types/plugins test/types/plugins.cts
git commit -m "feat(types): plugin type declarations (virtuals, case-converter)"
```

---

## Task 6: GetCmsModel + vectorize fidelity fixture (the D2 guard)

Replicate the exact type-level machinery from the consumer's `GetCmsModel`/`vectorize.ts` to prove member-set fidelity and `Collection<infer M>` inferability — the strongest drop-in proof.

**Files:**
- Create: `test/types/getcmsmodel.cts`

**Interfaces:**
- Consumes: the full canonical types (Tasks 1–5).
- Produces: a compile-time assertion that `Omit<RelatedModel, keyof Bookshelf.Model<any> | 'requireFetch'>` yields exactly the user relation keys, and that value-level `get<V>()` usage from `vectorize.ts` compiles.

- [ ] **Step 1: Write the failing fixture**

Create `test/types/getcmsmodel.cts`:

```ts
import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;

class Product extends db.Model<Product> {
  override get tableName() {
    return 'products';
  }
  requireFetch = false;
  category() {
    return this.belongsTo(Category, 'cate_id');
  }
  tags() {
    return this.hasMany(Tag, 'product_id');
  }
}
class Category extends db.Model<Category> {
  override get tableName() {
    return 'category';
  }
  requireFetch = false;
}
class Tag extends db.Model<Tag> {
  override get tableName() {
    return 'tags';
  }
  requireFetch = false;
}

// Replicates GetCmsModel's relation-key extraction (utils.ts lines ~289-305).
type FunctionKeys<B> = { [K in keyof B]: B[K] extends (...args: any[]) => any ? K : never }[keyof B];
type Cleaned<I> = Omit<I, keyof Bookshelf.Model<any> | 'requireFetch'>;

// The user-defined relation methods must survive the Omit; base members must not.
type ProductRelations = FunctionKeys<Cleaned<Product>>;

// Compile-time assertion: relation keys are exactly 'category' | 'tags'.
type Expect<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _assert: Expect<ProductRelations, 'category' | 'tags'> = true;
void _assert;

// Collection<infer M> inferability (utils.ts line ~292).
type RawReturn = ReturnType<Product['tags']>;
type RelatedModel = RawReturn extends Bookshelf.Collection<infer M> ? M : RawReturn;
const _inferAssert: Expect<RelatedModel, Tag> = true;
void _inferAssert;

// vectorize.ts value-usage under the unknown attribute bag (explicit type args).
async function vectorizeUsage() {
  const found = await new Product().where('id', 1).fetch();
  const images = JSON.parse(found.get<string>('images') || '[]');
  const sku: string = found.get<string>('sku');
  const cloned = found.clone().query((qb) => {
    qb.select(['a', 'b']);
  });
  // Lock omit/pick presence (Blocker 3 — keyof Model<any> must include them).
  const picked = found.pick<{ id: number }>('id');
  void images;
  void sku;
  void cloned;
  void picked;
}
void vectorizeUsage;
```

- [ ] **Step 2: Run to verify it fails (or surfaces drift)**

Run: `pnpm test:types`
Expected: FAIL if any base-member or generic-position drift exists — e.g. `_assert`/`_inferAssert` typed `never` (not assignable from `true`), or `Collection<infer M>` not inferring `Tag`. If Tasks 1–5 are faithful, this may already pass; the fixture's purpose is to LOCK it so future edits cannot regress it.

- [ ] **Step 3: Fix any drift in `src/types/index.d.cts`**

If `_assert` is `never`, compare the `Model<T>`/`ModelBase<T>` member set against `@types/bookshelf@1.2.9` (reference saved earlier) and reconcile names exactly — a base member missing causes a stray user key to survive `Omit`; an extra base member strips a real one. If `_inferAssert` fails, ensure `hasMany(...)` returns `Collection<R>` with `R` in the inferable position (Task 2). Make the minimal change, re-run.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:types`
Expected: PASS on all fixtures (cjs + esm configs).

- [ ] **Step 5: Commit**

```bash
git add test/types/getcmsmodel.cts src/types/index.d.cts
git commit -m "test(types): GetCmsModel/vectorize fidelity fixture — member-set + infer locked"
```

---

## Task 7: Build/CI integration, real-model smoke, cast-site doc

Wire `test:types` + `attw` into CI, run the real-consumer smoke, and document the enumerated `get()`-cast sites (D3 deliverable).

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/types/get-cast-sites.md`
- Modify: `README.md` (TypeScript usage section)

**Interfaces:**
- Consumes: `test:types`, `attw` scripts (Tasks 1–6).
- Produces: CI gates `test:types` + `attw`; a documented migration note for the consumer.

- [ ] **Step 1: Add CI steps**

In `.github/workflows/ci.yml`, after the `pnpm test` step, add:

```yaml
      - run: pnpm test:types
      - run: pnpm attw
```

- [ ] **Step 2: Run the full local gate**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:types && pnpm attw && pnpm smoke`
Expected: all green.

- [ ] **Step 3: Real-model smoke (manual, documented)**

Create a scratch dir, `pnpm pack` this package, install the tarball plus `knex` into the scratch dir, copy 5–10 representative `ketshopweb-services` models (e.g. `category.ts`, a `*json-columns* ` model, and the `GetCmsModel` block from `utils.ts`) and the relevant slice of `vectorize.ts`, change their import string to `@assetsart/bookshelf`, remove `@types/bookshelf`, and run `tsc --noEmit` with a NodeNext/CJS tsconfig.

Record in `docs/types/get-cast-sites.md` every site where compilation required an added type argument or cast under the `unknown` attribute bag (the expected, intentional D3 cost), e.g.:

```markdown
# get()-cast sites (unknown attribute bag)

Migrating from `@types/bookshelf` (any) to `@assetsart/bookshelf` (unknown) requires
an explicit type argument at these value-usage sites:

- `libs/business-services/.../vectorize.ts:170` — `get<string>('images')` (was `get('images')`)
- `libs/business-services/.../vectorize.ts:384` — `get<string>('sku')`
- … (complete list from the smoke run)

Each is mechanical: add `<string>` / `<number>` to the `get()` call, or cast the result.
GetCmsModel's type machinery is unaffected (depends on key names only).
```

- [ ] **Step 4: Document TypeScript usage in README**

Add a short section to `README.md` showing the self-type pattern and the `unknown` attribute bag with the generic escape hatch:

```markdown
## TypeScript

`@assetsart/bookshelf` ships first-class types (drop-in for `@types/bookshelf`):

\```ts
import Bookshelf = require('@assetsart/bookshelf');
const orm = Bookshelf(knex);

class User extends orm.Model<User> {
  get tableName() { return 'users'; }
  posts() { return this.hasMany(Post); }
}

const name = (await new User().fetch()).get<string>('name'); // typed via get<V>()
\```

Attribute accessors default to `unknown`; pass a type argument (`get<string>('name')`)
or supply a `toJSON(): MyEntity` override to type results.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml docs/types/get-cast-sites.md README.md
git commit -m "ci(types): gate test:types + attw; document get()-cast sites and TS usage"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- D1 self-type generic → Task 1 (skeleton) + Task 2 (`Model<T extends Model<any>>`). ✓
- D2 member-set fidelity → Task 6 fidelity fixture + Task 2/3 surfaces. ✓
- D3 unknown attribute bag + escape hatch → Task 2 (`get<V = unknown>`, `toJSON<E>`, etc.), Task 7 cast-site doc. ✓
- D4 dual entry declarations → Task 1 (`.d.cts`), Task 4 (`.d.ts`). ✓
- D5 zero-dep adaptation → Task 2/3 (BPromise, local iterators, native errors, knex peer). ✓
- D6 collection lodash methods → Task 3. ✓
- Verification (fixtures + attw + real-model smoke) → Tasks 1–7. ✓
- Plugins (`bookshelf-json-columns` via `.plugin(fn)`, bundled virtuals/case-converter) → Task 3 (`plugin()` signature) + Task 5. ✓

**Placeholder scan:** No "TBD"/"handle X"/"similar to Task N". Each code step contains complete declarations. The two "if resolution fails, adjust specifier" notes are explicit, fixture-verified fallbacks, not placeholders.

**Type consistency:** `Model<T extends Model<any>>`, `Collection<T extends Model<any>>`, `BPromise<T>`, `get<V = unknown>`, `toJSON<E = unknown>`, `EventFunction<T>` used identically across Tasks 1–6. Static error types reference `typeof import('./errors.js').<Class>` consistently (matches `src/errors.ts` exports: `NotFoundError`, `EmptyError`, `NoRowsUpdatedError`, `NoRowsDeletedError`). The Task 1 stub `Collection`/`ModelOptions` are explicitly superseded in Tasks 2–3 (noted inline).
