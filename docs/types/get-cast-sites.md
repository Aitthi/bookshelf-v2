# get()-cast sites (unknown attribute bag)

`@assetsart/bookshelf` types attribute reads as `get<V = unknown>(attribute: string): V`
instead of the old `@types/bookshelf` `get(attribute: string): any`. This means an
untyped read produces `unknown` (not `any`), so it cannot silently leak into typed code.

This document records the result of a **real-consumer drop-in smoke** run against
`ketshopweb-services`: the package was `pnpm pack`ed, installed into a throwaway
NodeNext/CommonJS project alongside `knex`, and representative consumer files were
copied in with their import changed from `bookshelf` to `@assetsart/bookshelf` (and
`@types/bookshelf` removed), then type-checked with `tsc --noEmit`.

## Headline finding: contextual inference resolves almost everything

`get<V = unknown>` is a **free type parameter inferred from the contextual type** of
the call site. Wherever the result of `get()` flows into a typed position — a function
parameter, a typed object field, or an annotated variable — TypeScript infers `V` from
that target and **no cast or type argument is required**. The migration cost from
`@types/bookshelf` (`any`) to `@assetsart/bookshelf` (`unknown`) is therefore **far
smaller than a blanket "add `<T>` to every `get()`"** — it is limited to reads that
have *no* contextual type.

### Files exercised in the smoke

| Consumer file | Pattern exercised | Casts needed |
| --- | --- | --- |
| `libs/databases/src/models/ket_cms/category.ts` | simple model, `hasMany().query()`, `toJSON(): CategoryEntity` | none |
| `libs/databases/src/models/ket_cms/sale_pages.ts` | json-columns model (`static jsonColumns`), `dayjs(this.get('created_at'))` | none |
| `libs/databases/src/utils.ts` (`GetCmsModel` block) | `Bookshelf.Model<any>` / `Bookshelf.Collection<infer M>` relation-key inference, `new model().query()` | none |
| `libs/business-services/src/lib/func/ai_agent/vectorize.ts` (slice) | `where().fetch()`, `save()`, `get('images')`, `get('sku')` | none |

`tsc --noEmit` on all four files exited **0 with no added casts**. The `GetCmsModel`
type machinery (`relatedAt`/`related`) depends only on relation **key names** and on the
shape of `Bookshelf.Model`/`Bookshelf.Collection`; it is unaffected by the
attribute-value type and compiled unchanged.

## The five real `get()` sites — all resolve by inference

Each of the `get()` calls in the targeted consumer files compiles **without** a type
argument, because each has a contextual type:

- `libs/databases/src/models/ket_cms/sale_pages.ts:22` — `dayjs(this.get('created_at'))`
  → `V` inferred from `dayjs`'s `ConfigType` parameter.
- `libs/databases/src/models/ket_cms/sale_pages.ts:26` — `dayjs(this.get('updated_at'))`
  → same.
- `libs/business-services/.../vectorize.ts:170` — `JSON.parse(find_vectorize.get('images') || '[]')`
  → `V` inferred as `string` from `JSON.parse`'s parameter (inference flows through `|| '[]'`).
- `libs/business-services/.../vectorize.ts:384` — `sku: product.get('sku')`
  → `V` inferred from the typed `{ sku: string }` field.
- `libs/business-services/.../vectorize.ts:395` — `JSON.parse(vectorize.get('images') || '[]')`
  → same as :170.

**Net: zero cast sites in the exercised files.**

## When a type argument *is* required

A type argument (or cast) is only needed where the `get()` result has **no contextual
type** — TypeScript then leaves it as `unknown` and the next operation fails. The two
shapes are:

```ts
// 1) standalone const with no annotation, then a property/method access
const images = model.get('images');   // images: unknown
images.length;                          // ❌ TS18046: 'images' is of type 'unknown'
// fix: model.get<string>('images')

// 2) a method chained directly on the result, with no surrounding context
model.get('name').toUpperCase();        // ❌ TS2571: Object is of type 'unknown'
// fix: model.get<string>('name').toUpperCase()
```

Each fix is mechanical: add `<string>` / `<number>` / etc. to the `get()` call, or cast
the result. None of the files exercised in this smoke hit either shape.

## Structural compatibility

No structural incompatibilities were found between our hand-written types and the
consumer patterns: the self-type model pattern (`class X extends db.Model<X>`),
`hasMany(...).query(qb => …)`, `where(key, value).fetch()`, `save(attrs)`,
`toJSON(): Entity` overrides, and the `GetCmsModel` generic relation-key inference all
type-check cleanly against `@assetsart/bookshelf`.
