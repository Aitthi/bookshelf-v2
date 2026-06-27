# Full Type Support (drop-in for `@types/bookshelf`) — Design Spec

**Date:** 2026-06-27
**Package:** `@assetsart/bookshelf` (v2.x)
**Status:** Approved design — ready for implementation plan

## Goal

Ship first-class TypeScript types for `@assetsart/bookshelf` that are a **drop-in
replacement for `@types/bookshelf@1.2.9`**, so the consuming project
(`ketshopweb-services`: 1161 model files + apps) can:

1. Remove the `@types/bookshelf` devDependency, and
2. Change the import string `bookshelf` → `@assetsart/bookshelf`,

and have **all model files and app code compile unchanged** under the consumer's
`moduleResolution: "NodeNext"` / CommonJS setup. This realises the original
project goal: *"a built-in drop-in — change only the import name."*

This is **milestone 1**: parity with `@types/bookshelf` + remove `any` from the
structural surface. Attribute-level generics (`Model<TAttrs>`) are explicitly a
possible later milestone and must not be foreclosed.

## Non-goals

- No change to `src/` runtime logic. This is a **types-only** deliverable
  (plus build/exports wiring). Keeping runtime untouched bounds regression risk
  on the freshly-shipped 2.0.0.
- No attribute-shape generics in this milestone (would diverge from the existing
  1161 models, which all use the self-type pattern).
- No elimination of `any` inside `src/` internal implementation files. "No any"
  in this spec means **the consumer-facing type surface has no `any`** except the
  one sanctioned, opt-in-typeable spot defined below.

## Evidence (why these decisions)

Gathered from the real consumer `/Users/detoro/code/ketshopweb-services`:

- **Import style:** `import Bookshelf = require('bookshelf')` — 235 occurrences;
  `import Bookshelf from 'bookshelf'` — 2. Consumer root `package.json` has **no
  `"type"` field** → all `.ts` files are CommonJS under NodeNext → `import =
  require()` resolves through the package's **`require` export condition**.
- **Model definition pattern (all 1161 models):**
  ```ts
  import Bookshelf = require('bookshelf')
  import { CategoryEntity } from './entities/CategoryEntity'
  export function Category(db_wrapper: Bookshelf, dbname: string) {
    return class Category extends db_wrapper.Model<Category> {   // self-type generic
      override get tableName() { return `${dbname}.category` }
      override get hasTimestamps() { return false }
      override toJSON(): CategoryEntity {
        return db_wrapper.Model.prototype.toJSON.apply(this, arguments as any) as CategoryEntity
      }
      childrens() { return this.hasMany(Category, 'cat_parent', 'id').query(qb => { qb.orderBy('sort') }) }
    }
  }
  ```
  Attribute typing is done via hand-written `Entity` interfaces on the `toJSON()`
  **return type**, NOT via a generic attribute parameter.
- **Model API actually used:** relations (`hasMany` 109, `hasOne` 61,
  `belongsTo` 13, `belongsToMany` 1), `query`, `toJSON`, `clone`, `where`,
  `fetch`, `fetchPage`, `save`, `get`, plus `tableName`/`hasTimestamps` getters.
- **External plugin:** `bookshelf-json-columns` via `.plugin(jsonColumns)` (15×)
  → `.plugin(fn)` must accept a third-party plugin function.
- **`GetCmsModel` / `GetCmsAttr` (`libs/databases/src/utils.ts`) — the hardest
  constraint.** It performs type-level computation directly on our types:
  ```ts
  type RelatedModel1 = RawReturn1 extends Bookshelf.Collection<infer M> ? M : RawReturn1
  type CleanedRelatedModel1 = Omit<RelatedModel1, keyof Bookshelf.Model<any> | 'requireFetch'>
  ```
  and `Omit<InstanceType<Model>, keyof Bookshelf.Model<any> | 'requireFetch'>`.
- **`vectorize.ts` (`libs/business-services/.../ai_agent/vectorize.ts`)** consumes
  `GetCmsModel` output and uses raw attribute values:
  ```ts
  JSON.parse(find_vectorize.get('images') || '[]')   // line ~170
  product.get('sku')                                  // line ~384
  new dbcms.models.ProductPosts().where('id', id).fetch()
  vectorize_model.model.clone().query(qb => { ... })
  ```

## Decisions (locked)

### D1 — Generic semantics: self-type, replicated exactly
`Model<T extends Model<any>>` where `T` is the model subtype itself (F-bounded),
identical to `@types/bookshelf`. The internal declaration uses a default
parameter so the type can later grow an attribute parameter without breaking
existing single-argument usage (e.g. `Model<T extends Model<any>>` stays the
public shape; any future attribute parameter is additive and defaulted).

### D2 — Member-set fidelity is a hard, testable requirement
The **member set** (key names) and **generic positions** of `Model<T>`,
`ModelBase<T>`, `CollectionBase<T>`, `Collection<T>`, and `Events<T>` must match
`@types/bookshelf@1.2.9` member-for-member, because `GetCmsModel` relies on:
- `keyof Bookshelf.Model<any>` to strip base members via `Omit`, leaving only
  user-defined relation methods; and
- `Bookshelf.Collection<infer M>` being inferable (relation methods must return
  `Collection<M>`).

Adding or removing a base member changes `Omit<_, keyof Model<any>>` and breaks
`FunctionKeys` / `relatedAt(...)` in the consumer. This is verified by a fixture
(see Verification).

### D3 — Attribute bag: `unknown` + generic escape hatch (no `any`)
The dynamic attribute accessors are typed with `unknown` defaults and an opt-in
generic:
```ts
get<V = unknown>(attribute: string): V;
set(attribute: string, value?: unknown, options?: SetOptions): this;
set(attributes: Record<string, unknown>, options?: SetOptions): this;
attributes: Record<string, unknown>;
toJSON<E = unknown>(options?: SerializeOptions): E;
serialize<E = unknown>(options?: SerializeOptions): E;
```
- Zero `any` on the surface.
- `override toJSON(): CategoryEntity` still works (consumer supplies `E` via the
  override return type).
- **Accepted cost:** a small, bounded set of app sites that use `get()` values
  directly (e.g. `vectorize.ts` `JSON.parse(get('images') || '[]')`,
  `get('sku')`) need an explicit type argument (`get<string>('images')`) or a
  cast. This does NOT affect `GetCmsModel`'s type machinery (which depends only
  on key names, D2). The implementation plan must produce the concrete list of
  such sites as a deliverable so the consumer migration is mechanical.

### D4 — Delivery: hand-written dual entry declarations
`src/` is constructor-function + `Object.assign(prototype, …)`, so tsc-generated
`.d.ts` cannot express the clean generic `Model<T>` surface. We **hand-write**
the public declarations (exactly as `@types/bookshelf` is hand-written), and ship
**two entry declaration files** so each export condition gets the right module
shape:
- **`require` condition** → `export = Bookshelf` + `declare namespace Bookshelf`
  (CommonJS-style; satisfies the 235 `import = require()` and matches
  `@types/bookshelf` exactly).
- **`import` condition** → `export default` factory + named type exports
  (`Model`, `Collection`, options interfaces) + `export * as errors`
  (ESM; satisfies `import X from` and our ESM build).

### D5 — Zero-dependency adaptation
`@types/bookshelf` imports `bluebird`, `lodash`, `create-error`. We have zero
runtime deps. Adaptation:

| `@types/bookshelf` | `@assetsart/bookshelf` |
|---|---|
| `BlueBird<T>` (return types) | `BPromise<T>` (real type from `src/internal/promise.ts`) |
| `Lodash.*Iterator` (collection lodash methods) | minimal local iterator types (see D6) |
| `createError.Error<Error>` (static error props) | native error classes from `src/errors.ts` |
| `knex` | imported from the `knex` **peerDependency** |

### D6 — Collection lodash-style methods
`@types/bookshelf` types `filter/map/find/reduce/every/some/sortBy/...` using
`Lodash.ListIterator`/`DictionaryIterator`/`MemoIterator`. We define a tiny set
of local iterator aliases (e.g. `ListIterator<T, R> = (value: T, index: number,
collection: T[]) => R`) and type these methods against them. Keep the same method
names and arities as `@types/bookshelf` (member-set fidelity, D2).

## Type Architecture

Mirror the `@types/bookshelf` layering (names and generic positions preserved):

```
Events<T>
  └─ ModelBase<T extends Model<any>>          (idAttribute, id, attributes, clear, clone,
  └─ CollectionBase<T extends Model<any>>      escape, format, get, has, hasChanged, isNew,
                                               parse, previous(Attributes), related, serialize,
                                               set, timestamp, toJSON, unset, omit, pick)
Model<T extends Model<any>>  extends ModelBase<T>
  ├─ static: collection, count, extend, fetchAll, forge, where, NotFoundError,
  │          NoRowsUpdatedError, NoRowsDeletedError
  └─ instance: belongsTo, belongsToMany, count, destroy, fetch, fetchAll, fetchPage,
               hasMany, hasOne, load, morphMany, morphOne, morphTo, orderBy, query(×4
               overloads), refresh, resetQuery, save(×2), through, where(×2)
Collection<T extends Model<any>>  extends CollectionBase<T>
  ├─ static: extend, forge, EmptyError
  └─ instance: attach, count, create, detach(×2), fetchOne, load, orderBy, query(×4),
               resetQuery, through, updatePivot, withPivot
               + lodash methods (D6)
```

Plus the options interfaces verbatim (adapted deps): `ModelOptions`,
`FetchOptions`, `WithRelatedQuery`, `FetchAllOptions`, `FetchPageOptions`,
`Pagination`, `SaveOptions`, `DestroyOptions`, `SerializeOptions`, `SetOptions`,
`TimestampOptions`, `SyncOptions`, `CollectionOptions<T>`, `CollectionAddOptions`,
`CollectionFetchOptions`, `CollectionFetchOneOptions`, `CollectionSetOptions`,
`PivotOptions`, `EventOptions`, `EventFunction<T>`, `CollectionCreateOptions`,
`SortOrder`, `Relations`, `ModelSubclass`, `IModelBase`.

The `Bookshelf` instance interface:
```ts
interface Bookshelf extends Events<any> {
  VERSION: string;
  knex: Knex;
  Model: typeof Model;
  Collection: typeof Collection;
  model(name: string, model?: typeof Model | object, staticProperties?: object): typeof Model;
  plugin(plugin: string | string[] | ((bookshelf: Bookshelf, options?: unknown) => void), options?: unknown): Bookshelf;
  transaction<T>(callback: (transaction: Knex.Transaction) => PromiseLike<T>): BPromise<T>;
}
declare function Bookshelf(knex: Knex): Bookshelf;
```

## File Structure

- `src/types/bookshelf.d.ts` — single source of truth: the `declare namespace
  Bookshelf` body (all classes + interfaces above). Authored once; both entry
  files reference it.
- `src/types/index.cjs.d.ts` (or build-emitted `dist/types/index.d.cts`) —
  `export = Bookshelf` wrapper (require condition).
- `src/types/index.esm.d.ts` (or `dist/types/index.d.ts`) — `export default` +
  named type re-exports + `errors` (import condition).
- `src/types/plugins/virtuals.d.ts`, `src/types/plugins/case-converter.d.ts` —
  each `(bookshelf: Bookshelf) => void` plugin, dual-condition.
- Build step copies these hand-written declarations into `dist/` at the paths the
  `exports` map points to (replacing the tsc-emitted public entry types).

### `package.json` exports (types first in each condition)
```jsonc
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

## Build changes

- Keep `tsc --noEmit` (typecheck of `src/`) for internal correctness.
- `build:types` no longer relies on tsc-generated public entry `.d.ts`; instead a
  small script (or `tsc` for internal modules + copy for the hand-written entry)
  places the hand-written declarations at the `exports`-mapped paths, generating
  both `.d.ts` (ESM) and `.d.cts` (CJS) variants.
- The `BPromise<T>` type must be importable by the declarations (re-export its
  type from a stable path).

## Verification (proves drop-in)

1. **Type fixtures in `test/types/`** compiled with `tsc --noEmit`, run in CI,
   replicating the real consumer patterns exactly:
   - `model-definition.ts` — `class X extends db.Model<X>` with `get tableName()`,
     `override toJSON(): Entity`, relation methods returning `Collection<Y>` / `Y`.
   - `getcmsmodel.ts` — reproduce the `Omit<InstanceType<Model>, keyof
     Bookshelf.Model<any> | 'requireFetch'>` and `Collection<infer M>`
     computations; assert they resolve to the user relation keys (this is the D2
     guard — fails if our member set drifts).
   - `value-usage.ts` — `get<string>('images')`, `toJSON<Entity>()`,
     `new Model().where(...).fetch()`, `.clone().query(qb => ...)`,
     `.plugin(thirdPartyFn)`.
   - Compile the fixtures in **both** a CJS tsconfig (`module: NodeNext`, no
     `"type"`) using `import = require('@assetsart/bookshelf')` and an ESM
     tsconfig using `import X from`.
2. **`@arethetypeswrong/cli`** (`attw --pack`) in CI to validate the dual
   `exports` types resolve correctly under node10 / node16-cjs / node16-esm /
   bundler, catching ESM/CJS types mismatches.
3. **Real-model smoke (manual, documented):** copy a sample of actual
   `ketshopweb-services` models + the `GetCmsModel`/`vectorize` usage into a
   scratch project, point it at the built `@assetsart/bookshelf`, and confirm
   `tsc --noEmit` is green. Record the exact `get()`-cast sites discovered (D3
   deliverable).

Pass criteria: all fixtures + `attw` green in CI; the documented real-model smoke
green except for the enumerated, intentional `get()`-cast sites.

## Risks & mitigations

- **ESM-side `export default` + namespace ergonomics** are fiddlier than the CJS
  `export =` path. Mitigation: the critical 235 usages are CJS `require` and get
  the faithful `export =` path; the ESM path is covered by its own fixture and
  `attw`. The 2 `from 'bookshelf'` sites only construct the instance.
- **Member-set drift** silently breaking `GetCmsModel`. Mitigation: D2 fixture
  asserts the `Omit`/`keyof` result equals the expected relation-key union.
- **`unknown` get() friction** in apps. Mitigation: bounded, enumerated in the
  plan; opt-in `get<V>()` keeps it ergonomic; no `any` introduced.
