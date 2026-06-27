// Sync
// ---------------

import { BPromise } from './internal/promise';
import { omitBy, isPlainObject, isEmpty, extend, result } from './internal/lang';

const validLocks = ['forShare', 'forUpdate'];

function supportsReturning(client: any = {}): boolean { // any: knex client internals
  if (!client.config?.client) return false;
  return ['postgresql', 'postgres', 'pg', 'oracle', 'mssql'].includes(client.config.client);
}

// Sync is the dispatcher for any database queries,
// taking the "syncing" `model` or `collection` being queried, along with
// a hash of options that are used in the various query methods.
// If the `transacting` option is set, the query is assumed to be
// part of a transaction, and this information is passed along to `Knex`.
const Sync = function (this: any, syncing: any, options: any) { // any: model/collection dynamic shape
  options = options || {};
  this.query = syncing.query();
  this.syncing = syncing.resetQuery();
  this.options = options;
  if (options.debug) this.query.debug();
  if (options.transacting) {
    this.query.transacting(options.transacting);
    if (validLocks.indexOf(options.lock) > -1) this.query[options.lock]();
  }
  if (options.withSchema) this.query.withSchema(options.withSchema);
};

extend(Sync.prototype, {
  // Prefix all keys of the passed in object with the
  // current table name
  prefixFields: function (this: any, fields: Record<string, unknown>) { // any: Sync instance
    const tableName = this.syncing.tableName;
    const prefixed: Record<string, unknown> = {};
    for (const key in fields) {
      prefixed[`${tableName}.${key}`] = fields[key];
    }
    return prefixed;
  },

  // Select the first item from the database - only used by models.
  first: BPromise.method(function (this: any, attributes: Record<string, unknown>) { // any: Sync instance (BPromise.method forwards this)
    const model = this.syncing;
    const query = this.query;

    // We'll never use an JSON object for a search, because even
    // PostgreSQL, which has JSON type columns, does not support the `=`
    // operator.
    //
    // NOTE: `omitBy` returns an empty object, even if attributes are null.
    const whereAttributes = omitBy(attributes, (attribute, name) => {
      return isPlainObject(attribute) || name === model.idAttribute;
    });
    const formattedAttributes = model.format(whereAttributes);

    if (model.idAttribute in attributes) {
      formattedAttributes[model.idAttribute] = attributes[model.idAttribute];
    }

    if (!isEmpty(formattedAttributes)) query.where(this.prefixFields(formattedAttributes));
    query.limit(1);

    return this.select();
  }),

  // Runs a `count` query on the database, adding any necessary relational
  // constraints. Returns a promise that resolves to an integer count.
  count: BPromise.method(function (this: any, column: string) { // any: Sync instance (BPromise.method forwards this)
    const knex = this.query,
      options = this.options,
      relatedData = this.syncing.relatedData,
      fks: Record<string, unknown> = {};

    return BPromise.bind(this)
      .then(function (this: any) { // any: bound context is Sync instance; non-arrow preserves BPromise.bind(this)
        // Inject all appropriate select costraints dealing with the relation
        // into the `knex` query builder for the current instance.
        if (relatedData)
          return BPromise.try(() => {
            if (relatedData.isThrough()) {
              fks[relatedData.key('foreignKey')] = relatedData.parentFk;
              const through = new relatedData.throughTarget(fks);
              relatedData.pivotColumns = through.parse(relatedData.pivotColumns);
            } else if (relatedData.type === 'hasMany') {
              const fk = relatedData.key('foreignKey');
              knex.where(fk, relatedData.parentFk);
            }
          });
      })
      .then(function (this: any) { // any: bound context is Sync instance; non-arrow preserves BPromise.bind(this)
        options.query = knex;

        /**
         * Counting event.
         *
         * Fired before a `count` query. A promise may be
         * returned from the event handler for async behaviour.
         *
         * @event Model#counting
         * @tutorial events
         * @param {Model}  model    The model firing the event.
         * @param {Object} options  Options object passed to {@link Model#count count}.
         * @returns {Promise}
         */
        return this.syncing.triggerThen('counting', this.syncing, options);
      })
      .then(function (this: any) { // any: bound context; non-arrow preserves BPromise.bind(this)
        return knex.count(`${column || '*'} as count`);
      })
      .then((rows: any) => rows[0].count);
  }),

  // Runs a `select` query on the database, adding any necessary relational
  // constraints, resetting the query when complete. If there are results and
  // eager loaded relations, those are fetched and returned on the model before
  // the promise is resolved. Any `success` handler passed in the
  // options will be called - used by both models & collections.
  select: BPromise.method(function (this: any) { // any: Sync instance (BPromise.method forwards this)
    const knex = this.query;
    const options = this.options;
    const relatedData = this.syncing.relatedData;
    const fks: Record<string, unknown> = {};
    let columns: string[] | null = null;

    // Check if any `select` style statements have been called with column
    // specifications. This could include `distinct()` with no arguments, which
    // does not affect inform the columns returned.
    // Rewrite: native array methods replace lodash chain _(knex._statements).filter({grouping:'columns'}).some('value.length')
    const queryContainsColumns = (knex as any)._statements // any: knex query builder internals
      .filter((s: any) => s.grouping === 'columns') // any: knex statement object shape is internal
      .some((s: any) => s.value?.length); // any: knex statement object shape is internal

    return BPromise.bind(this)
      .then(function (this: any) { // any: bound context is Sync instance; non-arrow preserves BPromise.bind(this)
        // Set the query builder on the options, in-case we need to
        // access in the `fetching` event handlers.
        options.query = knex;

        // Inject all appropriate select costraints dealing with the relation
        // into the `knex` query builder for the current instance.
        if (relatedData)
          return BPromise.try(() => {
            if (relatedData.isThrough()) {
              fks[relatedData.key('foreignKey')] = relatedData.parentFk;
              const through = new relatedData.throughTarget(fks);

              return through.triggerThen('fetching', through, relatedData.pivotColumns, options).then(() => {
                relatedData.pivotColumns = through.parse(relatedData.pivotColumns);
              });
            }
          });
      })
      .tap(() => { // arrow: lexical this = Sync instance from outer BPromise.method function
        // If this is a relation, apply the appropriate constraints.
        if (relatedData) {
          relatedData.selectConstraints(knex, options);
        } else {
          // Call the function, if one exists, to constrain the eager loaded query.
          if (options._beforeFn) options._beforeFn.call(knex, knex);

          if (options.columns) {
            // Normalize single column name into array.
            columns = Array.isArray(options.columns) ? options.columns : [options.columns];
          } else if (!queryContainsColumns) {
            // If columns have already been selected via the `query` method
            // we will use them. Otherwise, select all columns in this table.
            // result() replaces _.result(this.syncing, 'tableName') — handles plain-value or function
            columns = [`${result(this.syncing as Record<string, unknown>, 'tableName') as string}.*`];
          }
        }

        // Set the query builder on the options, for access in the `fetching`
        // event handlers.
        options.query = knex;

        /**
         * Fired before a `fetch` operation. A promise may be returned from the event handler for
         * async behaviour.
         *
         * @example
         * const MyModel = bookshelf.model('MyModel', {
         *   initialize() {
         *     this.on('fetching', function(model, columns, options) {
         *       options.query.where('status', 'active')
         *     })
         *   }
         * })
         *
         * @event Model#fetching
         * @tutorial events
         * @param {Model} model The model which is about to be fetched.
         * @param {string[]} columns The columns to be retrieved by the query.
         * @param {Object} options Options object passed to {@link Model#fetch fetch}.
         * @param {QueryBuilder} options.query
         *   Query builder to be used for fetching. This can be used to modify or add to the query
         *   before it is executed. See example above.
         * @return {Promise}
         */
        return this.syncing.triggerThen('fetching', this.syncing, columns, options);
      })
      .then(() => knex.select(columns)); // arrow: lexical this = Sync instance (not needed here)
  }),

  // Issues an `insert` command on the query - only used by models.
  insert: BPromise.method(function (this: any) { // any: Sync instance (BPromise.method forwards this)
    const syncing = this.syncing;
    return this.query.insert(
      syncing.format(extend(Object.create(null), syncing.attributes)),
      supportsReturning(this.query.client) && this.options.autoRefresh !== false ? '*' : null
    );
  }),

  // Issues an `update` command on the query - only used by models.
  update: BPromise.method(function (this: any, attrs: Record<string, unknown>) { // any: Sync instance (BPromise.method forwards this)
    const syncing = this.syncing,
      query = this.query;
    if (syncing.id != null) query.where(syncing.format({[syncing.idAttribute]: syncing.id}));
    // Rewrite: native array .filter replaces _.filter(query._statements, {grouping: 'where'})
    if ((query as any)._statements.filter((s: any) => s.grouping === 'where').length === 0) { // any: knex query builder internals
      throw new Error('A model cannot be updated without a "where" clause or an idAttribute.');
    }
    var updating = syncing.format(extend(Object.create(null), attrs));
    if (syncing.id === updating[syncing.idAttribute]) {
      delete updating[syncing.idAttribute];
    }
    if (supportsReturning(query.client) && this.options.autoRefresh !== false) query.returning('*');
    return query.update(updating);
  }),

  // Issues a `delete` command on the query.
  del: BPromise.method(function (this: any) { // any: Sync instance (BPromise.method forwards this)
    const query = this.query,
      syncing = this.syncing;
    if (syncing.id != null) query.where(syncing.format({[syncing.idAttribute]: syncing.id}));
    // Rewrite: native array .filter replaces _.filter(query._statements, {grouping: 'where'})
    if ((query as any)._statements.filter((s: any) => s.grouping === 'where').length === 0) { // any: knex query builder internals
      throw new Error('A model cannot be destroyed without a "where" clause or an idAttribute.');
    }
    return this.query.del();
  })
});

export default Sync;
