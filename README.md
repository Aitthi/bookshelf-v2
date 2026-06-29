# bookshelfv2

bookshelfv2 is a TypeScript ORM for Node.js, built on the [Knex](http://knexjs.org) SQL query builder. It features Promise-based async methods, transaction support, eager/nested-eager relation loading, polymorphic associations, and support for one-to-one, one-to-many, and many-to-many relations.

It is designed to work with PostgreSQL, MySQL, and SQLite3.

bookshelfv2 is a full TypeScript rewrite of the original [Bookshelf.js](https://github.com/bookshelf/bookshelf) ORM, published as a drop-in behaviour replacement with zero runtime dependencies.

## Installation

> The npm package is published as `@assetsart/bookshelf` (the project name is bookshelfv2).

```sh
pnpm add @assetsart/bookshelf knex
# or
npm install @assetsart/bookshelf knex

# Then add one of the following database drivers:
npm install pg
npm install mysql2
npm install sqlite3
```

**Node.js >= 16 is required.**

## Quick Start

### ESM (recommended)

```js
import bookshelfv2 from '@assetsart/bookshelf'
import knex from 'knex'

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
})

const orm = bookshelfv2(db)

const User = orm.model('User', {
  tableName: 'users',
})
```

### CommonJS

```js
const bookshelfv2 = require('@assetsart/bookshelf').default
const knex = require('knex')

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
})

const orm = bookshelfv2(db)

const User = orm.model('User', {
  tableName: 'users',
})
```

### Shared instance pattern

A common pattern is to initialise once and re-use the instance:

```js
// bookshelf.js (or bookshelf.ts)
import bookshelfv2 from '@assetsart/bookshelf'
import knex from 'knex'

const db = knex(dbConfig)
export default bookshelfv2(db)

// elsewhere
import orm from './bookshelf.js'

const Post = orm.model('Post', {
  // ...
})
```

## Plugins

Plugins are tree-shakeable and imported by subpath, then passed to `.plugin()`. There is no string-based plugin registration.

```js
import bookshelfv2 from '@assetsart/bookshelf'
import virtuals from '@assetsart/bookshelf/plugins/virtuals'
import caseConverter from '@assetsart/bookshelf/plugins/case-converter'
import jsonColumns from '@assetsart/bookshelf/plugins/json-columns'
import knex from 'knex'

const orm = bookshelfv2(knex(/* ... */))

orm.plugin(virtuals)
orm.plugin(caseConverter)
orm.plugin(jsonColumns)
```

### Bundled plugins

| Plugin | Import path | Description |
|---|---|---|
| Virtuals | `@assetsart/bookshelf/plugins/virtuals` | Define virtual (computed) properties on your model. |
| Case Converter | `@assetsart/bookshelf/plugins/case-converter` | Automatically convert between the database's `snake_case` columns and the model's `camelCase` attributes. |
| JSON Columns | `@assetsart/bookshelf/plugins/json-columns` | Transparently serialize/deserialize columns holding JSON. Declare them via a static `jsonColumns` array on the model. |

> **TypeScript note:** Plugin subpath types require `"moduleResolution": "node16"`, `"nodenext"`, or `"bundler"` in your `tsconfig.json`. They will not resolve under classic `"node"` resolution.

## Examples

### Model definitions and relations

```js
import orm from './bookshelf.js'

const User = orm.model('User', {
  tableName: 'users',
  posts() {
    return this.hasMany(Post)
  },
})

const Post = orm.model('Post', {
  tableName: 'posts',
  tags() {
    return this.belongsToMany(Tag)
  },
})

const Tag = orm.model('Tag', {
  tableName: 'tags',
})
```

### Fetching with eager-loaded relations

```js
const user = await new User({ id: 1 }).fetch({ withRelated: ['posts.tags'] })
console.log(user.related('posts').toJSON())
```

### Pagination

`fetchPage()` is built in — there is no separate pagination plugin to install. It is available on both models and collections, and accepts **either** `page` + `pageSize` **or** `limit` + `offset`. Any other `fetchAll` options (`withRelated`, `columns`, etc.) are passed through.

```js
// page / pageSize form (defaults: page 1, pageSize 10)
const result = await Post.forge().fetchPage({
  page: 2,
  pageSize: 15,
  withRelated: ['tags'],
})

console.log(result.toJSON())        // the page of models
console.log(result.pagination)
// {
//   rowCount: 53,  // total rows matching the query, before pagination
//   pageCount: 4,  // total number of pages
//   page: 2,       // the requested page
//   pageSize: 15,  // the requested page size
// }

// limit / offset form — pagination metadata is { offset, limit, rowCount, pageCount }
const slice = await Post.forge().fetchPage({ limit: 20, offset: 40 })

// Skip the extra COUNT query when you don't need totals (no rowCount / pageCount):
const fast = await Post.forge().fetchPage({ page: 1, pageSize: 25, disableCount: true })
```

In TypeScript the return type is `Collection<T> & Pagination`, so `result.pagination` is fully typed (`FetchPageOptions` / `Pagination` are exported from the package).

### Promise chaining

Async methods return a native-Promise subclass (`BPromise`) that supports bluebird-style chainable helpers — `.tap()`, `.bind()`, `.map()`, `.return()`, etc. — without requiring bluebird as a dependency.

```js
const user = await new User({ id: 1 })
  .fetch({ withRelated: ['posts'] })
  .tap((u) => console.log('fetched:', u.id))
```

## TypeScript

`@assetsart/bookshelf` ships first-class type declarations and is a drop-in replacement for `@types/bookshelf` (remove that package — it is no longer needed).

Use the self-type pattern (`Model<Self>`) so relations and `this` are typed against your own model:

```ts
import Bookshelf = require('@assetsart/bookshelf');
const orm = Bookshelf(knex);

class User extends orm.Model<User> {
  get tableName() { return 'users'; }
  posts() { return this.hasMany(Post); }
}

// `get<V>()` defaults to `unknown`; the type argument is inferred from context:
const user = await new User().fetch();
const name: string = user.get('name');          // V inferred as string from the target
const upper = user.get<string>('name').toUpperCase(); // explicit arg when there is no context
```

### The `unknown` attribute bag

Attribute accessors (`get()`) intentionally default to `unknown` rather than `any`, so untyped reads cannot silently leak into your code. There are three ways to type a read:

- **Let it infer from context** (most common) — when the result flows into a typed position (a function parameter, a typed field, an annotated variable), the type argument is inferred automatically and **no change is needed**:

  ```ts
  JSON.parse(model.get('images') || '[]');     // get<string> inferred from JSON.parse
  const payload: { sku: string } = { sku: model.get('sku') }; // inferred from the field
  ```

- **Pass a type argument** at sites with no contextual type (a standalone `const`, or a method chained directly on the result):

  ```ts
  const images = model.get<string>('images');  // would be `unknown` without <string>
  model.get<string>('name').toUpperCase();
  ```

- **Override `toJSON(): MyEntity`** to type the serialized object returned by `toJSON()`.

See [`docs/types/get-cast-sites.md`](docs/types/get-cast-sites.md) for a real-consumer migration study and the exact sites that need a type argument.

### The `BPromise` return type

Every async ORM method returns a `BPromise<T>` (the bluebird-style native `Promise` subclass). The type is exported so you can name it in your own signatures:

```ts
// ESM — named import
import type { BPromise } from '@assetsart/bookshelf';

function loadUser(id: number): BPromise<User> {
  return new User({ id }).fetch();
}
```

```ts
// CJS — namespace-qualified
import Bookshelf = require('@assetsart/bookshelf');
type UserResult = Bookshelf.BPromise<User>;
```

> This exposes the **type** only. You rarely need to name it — method returns are already inferred as `BPromise<T>` — but it is available for explicit annotations and helper signatures.

## What's new in 2.0 / Migrating from Bookshelf

### Full TypeScript rewrite

The entire codebase has been rewritten in TypeScript and ships `.d.ts` declaration files. No `@types/bookshelf` package is needed.

### Zero runtime dependencies

bluebird, lodash, inflection, and create-error have all been removed and replaced by zero-dependency internal modules. The only peer dependency is `knex >= 3.1.0`.

### Dual ESM + CJS output

bookshelfv2 ships both an ESM build and a CommonJS build, selected automatically by Node.js via the `exports` field in `package.json`. Use `import` or `require` — both work.

### Public API preserved

The public ORM API is a drop-in behaviour replacement for Bookshelf 1.x. Relation methods (`hasOne`, `hasMany`, `belongsTo`, `belongsToMany`, `morphOne`, `morphMany`, `morphTo`), lifecycle events, and all standard model/collection methods behave as before.

`.tap()`, `.bind()`, `.map()`, `.return()` and other bluebird-style helpers are still available on every promise returned by async ORM methods. They are provided by an internal native `Promise` subclass (`BPromise`) — bluebird itself is not installed.

### Plugin imports instead of string names

In Bookshelf 1.x plugins could be registered by string name (e.g. `orm.plugin('virtuals')`). In bookshelfv2 you import the plugin directly and pass the function to `.plugin()`:

```js
// Before (bookshelf 1.x)
bookshelf.plugin('virtuals')
bookshelf.plugin('case-converter')

// After (bookshelfv2 2.0)
import virtuals from '@assetsart/bookshelf/plugins/virtuals'
import caseConverter from '@assetsart/bookshelf/plugins/case-converter'
orm.plugin(virtuals)
orm.plugin(caseConverter)
```

### Pagination is built in

The `pagination` plugin (and the `bookshelf-page` plugin it originated from) has been moved into core. Remove any `orm.plugin('pagination')` / `orm.plugin(require('bookshelf-page'))` calls and use [`fetchPage()`](#pagination) directly — the options and the returned `pagination` metadata are unchanged.

### TypeScript moduleResolution for plugins

If you use TypeScript and import plugins, your `tsconfig.json` must use `"moduleResolution": "node16"`, `"nodenext"`, or `"bundler"`. The `./plugins/*` subpath exports do not resolve under `"node"` (classic) resolution.

### Node.js version requirement

Node.js >= 16 is required.

## F.A.Q.

### My relations don't seem to be loading, what's up?

Make sure to check that the type is correct for the initial parameters passed to the initial model being fetched. For example `new Model({id: '1'}).load([relations...])` will not return the same as `new Model({id: 1}).load([relations...])` — notice that the id is a string in one case and a number in the other. This can be a common mistake if retrieving the id from a URL parameter.

This is only an issue if you're eager loading data with `load` without first fetching the original model. `new Model({id: '1'}).fetch({withRelated: [relations...]})` should work just fine.

### My process won't exit after my script is finished, why?

The issue here is that Knex, the database abstraction layer used by bookshelfv2, uses connection pooling and thus keeps the database connection open. If you want your process to exit after your script has finished, you will need to call `.destroy()` on the `knex` instance. More information about connection pooling can be found in the [Knex docs](http://knexjs.org/#Installation-pooling).

### How do I debug?

If you pass `debug: true` in the options object to your `knex` initialise call, you can see all of the query calls being made. You can also pass that same option to methods that access the database, like `model.fetch()` or `model.destroy()`:

```js
import knex from 'knex'
import bookshelfv2 from '@assetsart/bookshelf'

// Turning on debug mode for all queries
const db = knex({
  debug: true,
  client: 'pg',
  connection: process.env.DATABASE_URL,
})
const orm = bookshelfv2(db)

// Debugging a single query
const user = await new User({ id: 1 }).fetch({ debug: true, withRelated: ['posts.tags'] })
```

### Can I use standard Node.js style callbacks?

You can call `.asCallback(function(err, resp) {` on any database operation method and use the standard `(err, result)` style callback interface if you prefer.

## Contributing

The project is hosted on [GitHub](https://github.com/Aitthi/bookshelf-v2). If you want to contribute, please open an issue or submit a pull request there.
