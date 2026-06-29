// JSON-columns plugin for Bookshelf v2
// -------------------------------------
// Opt-in plugin that transparently (de)serializes columns holding JSON data.
// Ported from the `bookshelf-json-columns` plugin.
//
// Declare the JSON columns as a static `jsonColumns` array on the model:
//
//   import jsonColumns from '@assetsart/bookshelf/plugins/json-columns';
//   orm.plugin(jsonColumns);
//
//   const Settings = orm.Model.extend(
//     {tableName: 'settings'},
//     {jsonColumns: ['preferences', 'metadata']}  // static (class) property
//   );
//
//   // model.set('preferences', {theme: 'dark'}) → stored as the string
//   // '{"theme":"dark"}' in the DB, and parsed back to an object on fetch.
//
// Behaviour notes:
// - On `saving`, listed columns are `JSON.stringify`d before they hit the DB.
// - On `saved` (and on `fetched` for clients that return JSON as text), listed
//   columns are parsed back into JS values.
// - `parseOnFetch` is only enabled for sqlite/mysql, which return JSON columns
//   as strings. PostgreSQL returns `json`/`jsonb` already decoded, so re-parsing
//   on fetch is unnecessary (and the driver handles it).
// - Number quirk (preserved verbatim from the source plugin): a stored string
//   that looks like a number (e.g. '123') is kept AS a string rather than
//   `JSON.parse`d into a number — this avoids coercing/precision-losing numeric
//   string columns. Genuine JSON (objects, arrays, booleans) is still parsed.

// any: bookshelf is a runtime-provided dynamic bag (Model/Collection + knex + registry)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVal = any;

/**
 * `saving` handler — stringify the model's JSON columns in place.
 *
 * Bound to the model, so `this` is the model instance. Also flags
 * `options.parseJsonColumns` so the paired `saved` handler knows to parse the
 * columns back regardless of the query method.
 */
function stringify(this: AnyVal, _model: AnyVal, _attributes: AnyVal, options: AnyVal): void {
  // Mark JSON columns as stringified for the subsequent `saved` parse.
  options.parseJsonColumns = true;

  this.constructor.jsonColumns.forEach((column: string) => {
    if (this.attributes[column]) {
      this.attributes[column] = JSON.stringify(this.attributes[column]);
    }
  });
}

/**
 * `saved` / `fetched` handler — parse the model's JSON columns in place.
 *
 * Bound to the model, so `this` is the model instance.
 */
function parse(this: AnyVal, _model?: AnyVal, _response?: AnyVal, options: AnyVal = {}): void {
  // Do not parse on the `fetched` event fired right after a non-select save.
  if (!options.parseJsonColumns && options.query && options.query._method !== 'select') {
    return;
  }

  this.constructor.jsonColumns.forEach((column: string) => {
    const value = this.attributes[column];

    if (value && typeof value === 'string') {
      try {
        if (Number(value) || Number(value) === 0) {
          // Numeric-looking string: keep as-is (do not coerce to a number).
          this.attributes[column] = `${value}`;
        } else {
          this.attributes[column] = JSON.parse(value);
        }
      } catch {
        this.attributes[column] = value;
      }
    }
  });
}

/**
 * JSON-columns plugin factory.
 *
 * Wraps `Model.prototype.initialize`/`save` (and, for parse-on-fetch clients,
 * `Collection.prototype.initialize`) so that models declaring a static
 * `jsonColumns` array transparently serialize/deserialize those columns.
 *
 * @param bookshelf - The Bookshelf instance to augment.
 */
// any: bookshelf is a runtime-provided dynamic bag; options are plugin-level (unused here)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function jsonColumnsPlugin(bookshelf: AnyVal, _options?: AnyVal): void {
  const modelProto = bookshelf.Model.prototype;
  const client = bookshelf.knex.client.config?.client;
  const parseOnFetch = client === 'sqlite' || client === 'sqlite3' || client === 'mysql' || client === 'mysql2';

  // Capture originals before overwriting so the overrides can delegate.
  // any: prototype method references on a dynamic ORM class
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalInitialize: (this: AnyVal, ...args: any[]) => any = modelProto.initialize;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalSave: (this: AnyVal, ...args: any[]) => any = modelProto.save;

  Object.assign(bookshelf.Model.prototype, {
    initialize(this: AnyVal, ...args: AnyVal[]): AnyVal {
      if (!this.constructor.jsonColumns) {
        return originalInitialize.apply(this, args);
      }

      // Stringify JSON columns before the model is saved.
      this.on('saving', stringify.bind(this));

      // Parse JSON columns after the model is saved.
      this.on('saved', parse.bind(this));

      if (parseOnFetch) {
        // Parse JSON columns after the model is fetched.
        this.on('fetched', parse.bind(this));
      }

      return originalInitialize.apply(this, args);
    },

    save(this: AnyVal, ...args: AnyVal[]): AnyVal {
      if (!this.constructor.jsonColumns) {
        return originalSave.apply(this, args);
      }

      // Normalize arguments the same way Bookshelf's own `save` does.
      const [key, value, rawOptions] = args;
      let attributes: AnyVal;
      let options: AnyVal;

      if (key === null || typeof key === 'object') {
        attributes = key || {};
        options = value ? {...value} : {};
      } else {
        attributes = {};
        attributes[key] = value;
        options = rawOptions ? {...rawOptions} : {};
      }

      // Only intercept patch saves; full saves go through `saving` (stringify).
      if (!options.patch) {
        return originalSave.apply(this, args);
      }

      // Stringify any JSON columns present in the patch attributes.
      Object.keys(attributes).forEach((attribute) => {
        if (this.constructor.jsonColumns.includes(attribute) && attributes[attribute]) {
          attributes[attribute] = JSON.stringify(attributes[attribute]);
        }
      });

      return originalSave.call(this, attributes, options);
    }
  });

  if (!parseOnFetch) {
    return;
  }

  // Capture original before overwriting so the override can delegate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalCollectionInitialize: (this: AnyVal, ...args: any[]) => any = bookshelf.Collection.prototype.initialize;

  Object.assign(bookshelf.Collection.prototype, {
    initialize(this: AnyVal, ...args: AnyVal[]): AnyVal {
      if (!this.model?.jsonColumns) {
        return originalCollectionInitialize.apply(this, args);
      }

      // Parse JSON columns on every model after the collection is fetched.
      this.on('fetched', (collection: AnyVal) => {
        collection.models.forEach((model: AnyVal) => {
          parse.call(model);
        });
      });

      return originalCollectionInitialize.apply(this, args);
    }
  });
}
