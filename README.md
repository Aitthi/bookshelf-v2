# bookshelfv2

bookshelfv2 is a TypeScript ORM for Node.js, built on the [Knex](http://knexjs.org) SQL query builder. It features Promise-based async methods, transaction support, eager/nested-eager relation loading, polymorphic associations, and support for one-to-one, one-to-many, and many-to-many relations.

It is designed to work with PostgreSQL, MySQL, and SQLite3.

bookshelfv2 is a full TypeScript rewrite of the original [Bookshelf.js](https://github.com/bookshelf/bookshelf) ORM, published as a drop-in behaviour replacement with zero runtime dependencies.

## Installation

```sh
pnpm add bookshelfv2 knex
# or
npm install bookshelfv2 knex

# Then add one of the following database drivers:
npm install pg
npm install mysql2
npm install sqlite3
```

**Node.js >= 16 is required.**

## Quick Start

### ESM (recommended)

```js
import bookshelfv2 from 'bookshelfv2'
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
const bookshelfv2 = require('bookshelfv2').default
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
import bookshelfv2 from 'bookshelfv2'
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
import bookshelfv2 from 'bookshelfv2'
import virtuals from 'bookshelfv2/plugins/virtuals'
import caseConverter from 'bookshelfv2/plugins/case-converter'
import knex from 'knex'

const orm = bookshelfv2(knex(/* ... */))

orm.plugin(virtuals)
orm.plugin(caseConverter)
```

### Bundled plugins

| Plugin | Import path | Description |
|---|---|---|
| Virtuals | `bookshelfv2/plugins/virtuals` | Define virtual (computed) properties on your model. |
| Case Converter | `bookshelfv2/plugins/case-converter` | Automatically convert between the database's `snake_case` columns and the model's `camelCase` attributes. |

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

### Promise chaining

Async methods return a native-Promise subclass (`BPromise`) that supports bluebird-style chainable helpers — `.tap()`, `.bind()`, `.map()`, `.return()`, etc. — without requiring bluebird as a dependency.

```js
const user = await new User({ id: 1 })
  .fetch({ withRelated: ['posts'] })
  .tap((u) => console.log('fetched:', u.id))
```

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
import virtuals from 'bookshelfv2/plugins/virtuals'
import caseConverter from 'bookshelfv2/plugins/case-converter'
orm.plugin(virtuals)
orm.plugin(caseConverter)
```

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
import bookshelfv2 from 'bookshelfv2'

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

The project is hosted on [GitHub](https://github.com/bookshelf/bookshelf/). If you want to contribute, please open an issue or submit a pull request there.
