import { singularize } from './internal/inflection';
import { BPromise } from './internal/promise';
import Helpers from './helpers';
import ModelBase from './base/model';
import RelationBase from './base/relation';
import { PIVOT_PREFIX } from './constants';
import {
  clone,
  cloneDeep,
  each,
  extend,
  filter,
  find,
  groupBy,
  isBuffer,
  isEmpty,
  isNil,
  isObject,
  map,
  reduce,
  reject,
  result,
  startsWith,
  uniq,
} from './internal/lang';

const push = Array.prototype.push;
const removePivotPrefix = (key: string): string => key.slice(PIVOT_PREFIX.length);
const hasPivotPrefix = (key: string): boolean => startsWith(key, PIVOT_PREFIX);

/**
 * @classdesc
 *   Used internally, the `Relation` class helps in simplifying the relationship building,
 *   centralizing all logic dealing with type and option handling.
 *
 * @extends RelationBase
 * @class
 */
const Relation = RelationBase.extend(
  /** @lends Relation.prototype */ {
    /**
     * Assembles the new model or collection we're creating an instance of, gathering any relevant
     * primitives from the parent object without keeping any hard references.
     *
     * @param {Model} parent The parent to which this relation belongs to.
     * @return {Model|Collection|Object} The new model or collection instance.
     */
    // any: parent is a dynamic Bookshelf Model instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    init(parent: any) {
      this.parentId = parent.id;
      // any: result returns unknown; tableName is always string at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.parentTableName = result(parent as Record<string, unknown>, 'tableName');
      this.parentIdAttribute = this.attribute('parentIdAttribute', parent);

      // Use formatted attributes so that morphKey and foreignKey will match attribute keys.
      this.parentAttributes = parent.format(clone(parent.attributes));

      if (this.type === 'morphTo' && !parent._isEager) {
        // If the parent object is eager loading, and it's a polymorphic `morphTo` relation, we
        // can't know what the target will be until the models are sorted and matched.
        this.target = Helpers.morphCandidate(this.candidates, this.parentAttributes[this.key('morphKey')]);
        this.targetTableName = result(this.target.prototype as Record<string, unknown>, 'tableName');
      }

      this.targetIdAttribute = this.attribute('targetIdAttribute', parent);
      this.parentFk = this.attribute('parentFk');

      // any: relatedInstance returns Model, Collection, or plain object {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target: any = this.target ? this.relatedInstance() : {};
      target.relatedData = this;

      if (this.type === 'belongsToMany') {
        extend(target, PivotHelpers);
      }

      return target;
    },

    /**
     * Initializes a `through` relation, setting the `Target` model and `options`, which includes
     * any additional keys for the relation.
     *
     * @param {Model|Collection} source
     * @param {Model} Target The pivot model the related models or collections run through.
     * @param {object} options Additional properties to set on the relation object.
     */
    // any: source and Target are dynamic ORM types; options is a free-form hash
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    through(source: any, Target: any, options: any) {
      const type = this.type;
      if (type !== 'hasOne' && type !== 'hasMany' && type !== 'belongsToMany' && type !== 'belongsTo') {
        throw new Error('`through` is only chainable from `hasOne`, `belongsTo`, `hasMany`, or `belongsToMany`');
      }

      this.throughTarget = Target;
      this.throughTableName = result(Target.prototype as Record<string, unknown>, 'tableName');

      extend(this, options);
      extend(source, PivotHelpers);

      this.parentIdAttribute = this.attribute('parentIdAttribute');
      this.targetIdAttribute = this.attribute('targetIdAttribute');
      this.throughIdAttribute = this.attribute('throughIdAttribute', Target);
      this.parentFk = this.attribute('parentFk');

      // Set the appropriate foreign key if we're doing a belongsToMany, for convenience.
      if (this.type === 'belongsToMany') {
        this.foreignKey = this.throughForeignKey;
      } else if (this.otherKey) {
        this.foreignKey = this.otherKey;
      }

      return source;
    },

    /**
     * Generates and returns a specified key.
     *
     * @param {string} keyName
     *   Can be one of `foreignKey`, `morphKey`, `morphValue`, `otherKey` or `throughForeignKey`.
     * @return {string|undefined}
     */
    key(keyName: string): string | undefined {
      if (this[keyName]) return this[keyName];
      switch (keyName) {
        case 'otherKey':
          this[keyName] = singularMemo(this.targetTableName) + '_' + this.targetIdAttribute;
          break;
        case 'throughForeignKey':
          this[keyName] = singularMemo(this.joinTable()) + '_' + this.throughIdAttribute;
          break;
        case 'foreignKey':
          switch (this.type) {
            case 'morphTo': {
              const idKeyName = this.columnNames && this.columnNames[1] ? this.columnNames[1] : this.morphName + '_id';
              this[keyName] = idKeyName;
              break;
            }
            case 'belongsTo':
              this[keyName] = singularMemo(this.targetTableName) + '_' + this.targetIdAttribute;
              break;
            default:
              if (this.isMorph()) {
                this[keyName] = this.columnNames && this.columnNames[1] ? this.columnNames[1] : this.morphName + '_id';
                break;
              }
              this[keyName] = singularMemo(this.parentTableName) + '_' + this.parentIdAttribute;
              break;
          }
          break;
        case 'morphKey':
          this[keyName] = this.columnNames && this.columnNames[0] ? this.columnNames[0] : this.morphName + '_type';
          break;
        case 'morphValue':
          this[keyName] = this.morphValue || this.parentTableName || this.targetTableName;
          break;
      }
      return this[keyName];
    },

    /**
     * Get the correct name for the following attributes:
     *  - parentIdAttribute
     *  - targetIdAttribute
     *  - throughIdAttribute
     *  - parentFk
     *
     * @param {string} attribute The attribute name being requested.
     * @param {Model} [parent] The parent model.
     * @return {string}
     */
    // any: parent is a dynamic Bookshelf Model instance or constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attribute(attribute: string, parent?: any): string | undefined {
      switch (attribute) {
        case 'parentIdAttribute':
          if (this.isThrough()) {
            if (this.type === 'belongsTo' && this.throughForeignKey) {
              return this.throughForeignKey;
            }

            if (this.type === 'belongsToMany' && this.isThroughForeignKeyTargeted()) {
              return this.throughForeignKeyTarget;
            }

            if (this.isOtherKeyTargeted()) {
              return this.otherKeyTarget;
            }

            return this.parentIdAttribute; // Return attribute calculated on `init` by default.
          }

          if (this.type === 'belongsTo' && this.foreignKey) {
            return this.foreignKey;
          }

          if (this.type !== 'belongsTo' && this.isForeignKeyTargeted()) {
            return this.foreignKeyTarget;
          }

          // any: result returns unknown; idAttribute is always string at runtime
          return result(parent as Record<string, unknown>, 'idAttribute') as string;

        case 'targetIdAttribute':
          if (this.isThrough()) {
            if ((this.type === 'belongsToMany' || this.type === 'belongsTo') && this.isOtherKeyTargeted()) {
              return this.otherKeyTarget;
            }

            return this.targetIdAttribute; // Return attribute calculated on `init` by default.
          }

          if (this.type === 'morphTo' && !parent._isEager) {
            return result(this.target.prototype as Record<string, unknown>, 'idAttribute') as string;
          }

          if (this.type === 'belongsTo' && this.isForeignKeyTargeted()) {
            return this.foreignKeyTarget;
          }

          if (this.type === 'belongsToMany' && this.isOtherKeyTargeted()) {
            return this.otherKeyTarget;
          }

          return this.targetIdAttribute;

        case 'throughIdAttribute':
          if (this.type !== 'belongsToMany' && this.isThroughForeignKeyTargeted()) {
            return this.throughForeignKeyTarget;
          }

          if (this.type === 'belongsToMany' && this.throughForeignKey) {
            return this.throughForeignKey;
          }

          return result(parent.prototype as Record<string, unknown>, 'idAttribute') as string;

        case 'parentFk':
          if (!this.hasParentAttributes()) {
            return;
          }

          if (this.isThrough()) {
            if (this.type === 'belongsToMany' && this.isThroughForeignKeyTargeted()) {
              return this.parentAttributes[this.throughForeignKeyTarget];
            }

            if (this.type === 'belongsTo') {
              return this.throughForeignKey ? this.parentAttributes[this.parentIdAttribute] : this.parentId;
            }

            if (this.isOtherKeyTargeted()) {
              return this.parentAttributes[this.otherKeyTarget];
            }

            return this.parentFk; // Return attribute calculated on `init` by default.
          }

          return this.parentAttributes[this.isInverse() ? this.key('foreignKey') : this.parentIdAttribute];
      }
    },

    /**
     * Injects the necessary `select` constraints into a `knex` query builder.
     *
     * @param {Knex} knex Knex instance.
     * @param {object} options
     * @return {undefined}
     */
    // any: knex is a Knex query builder; options has a dynamic shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectConstraints(knex: any, options: any) {
      const resp = options.parentResponse;

      // The `belongsToMany` and `through` relations have joins & pivot columns.
      if (this.isJoined()) this.joinClauses(knex);

      // Call the function, if one exists, to constrain the eager loaded query.
      if (options._beforeFn) options._beforeFn.call(knex, knex);

      // The base select column
      if (Array.isArray(options.columns)) {
        knex.columns(options.columns);
      }

      // any: knex._statements is a knex internal not exposed in public types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentColumns = find((knex._statements as any[]), (s: any) => s.grouping === 'columns');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!currentColumns || (currentColumns as any).length === 0) {
        knex.distinct(this.targetTableName + '.*');
      }

      if (this.isJoined()) this.joinColumns(knex);

      // If this is a single relation and we're not eager loading limit the query to a single item.
      if (this.isSingle() && !resp) knex.limit(1);

      // Finally, add (and validate) the WHERE conditions necessary for constraining the relation.
      this.whereClauses(knex, resp);
    },

    /**
     * Injects and validates necessary `through` constraints for the current model.
     *
     * @param {Knex} knex Knex instance.
     * @return {undefined}
     */
    // any: knex is a Knex query builder instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    joinColumns(knex: any) {
      const columns: string[] = [];
      const joinTable = this.joinTable();
      if (this.isThrough()) columns.push(this.throughIdAttribute);
      columns.push(this.key('foreignKey'));
      if (this.type === 'belongsToMany') columns.push(this.key('otherKey'));
      push.apply(columns, this.pivotColumns);
      knex.columns(
        map(columns, (col: string) => {
          return joinTable + '.' + col + ' as _pivot_' + col;
        })
      );
    },

    /**
     * Generates the join clauses necessary for the current relation.
     *
     * @param {Knex} knex Knex instance.
     * @return {undefined}
     */
    // any: knex is a Knex query builder instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    joinClauses(knex: any) {
      const joinTable = this.joinTable();

      if (this.type === 'belongsTo' || this.type === 'belongsToMany') {
        const targetKey = this.type === 'belongsTo' ? this.key('foreignKey') : this.key('otherKey');

        knex.join(joinTable, joinTable + '.' + targetKey, '=', this.targetTableName + '.' + this.targetIdAttribute);

        // A `belongsTo` -> `through` is currently the only relation with two joins.
        if (this.type === 'belongsTo') {
          knex.join(
            this.parentTableName,
            joinTable + '.' + this.throughIdAttribute,
            '=',
            this.parentTableName + '.' + this.key('throughForeignKey')
          );
        }
      } else {
        knex.join(
          joinTable,
          joinTable + '.' + this.throughIdAttribute,
          '=',
          this.targetTableName + '.' + this.key('throughForeignKey')
        );
      }
    },

    /**
     * Check that there isn't an incorrect foreign key set, versus the one passed in when the
     * relation was formed.
     *
     * @param {Knex} knex Knex instance.
     * @param {object} response
     * @return {undefined}
     */
    // any: knex is a Knex query builder; response is a dynamic array of model attribute objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    whereClauses(knex: any, response: any) {
      let key;

      if (this.isJoined()) {
        const isBelongsTo = this.type === 'belongsTo';
        const targetTable = isBelongsTo ? this.parentTableName : this.joinTable();

        const column = isBelongsTo ? this.parentIdAttribute : this.key('foreignKey');

        key = `${targetTable}.${column}`;
      } else {
        const column = this.isInverse() ? this.targetIdAttribute : this.key('foreignKey');

        key = `${this.targetTableName}.${column}`;
      }

      const method = response ? 'whereIn' : 'where';
      const ids = response ? this.eagerKeys(response) : this.parentFk;
      knex[method](key, ids);

      if (this.isMorph()) {
        const table = this.targetTableName;
        const key = this.key('morphKey');
        const value = this.key('morphValue');
        knex.where(`${table}.${key}`, value);
      }
    },

    /**
     * Fetches all eagerly loaded foreign keys from the current relation.
     *
     * @param {object} response
     * @return {array} The requested eager keys.
     */
    // any: response is a dynamic array of model attribute objects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eagerKeys(response: any[]) {
      // key is a string column name (result of this.key('foreignKey') or this.parentIdAttribute)
      const key: string = this.isInverse() && !this.isThrough() ? this.key('foreignKey') : this.parentIdAttribute;
      // Rewrite of lodash chain _(response).map(key).uniq().value():
      // key is a string column name; extract each item's [key] property, dedupe, drop nulls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return reject(uniq(response.map((r: any) => r[key])), isNil);
    },

    /**
     * Generates the appropriate default join table name for a
     * {@link Model#belongsToMany belongsToMany} or {@link Model#through through} relation.
     * The default name is composed of the two table names ordered alphabetically and joined by an
     * underscore.
     *
     * @return {string} The table name.
     */
    joinTable(): string {
      if (this.isThrough()) return this.throughTableName;
      return this.joinTableName || [this.parentTableName, this.targetTableName].sort().join('_');
    },

    /**
     * Creates a new model or collection instance, depending on the `relatedData` settings and the
     * models passed in.
     *
     * @param {Model[]} [models]
     * @param {object} [options]
     * @return {Model|Collection} The new instance.
     */
    // any: models, options, and return type are dynamic ORM shapes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    relatedInstance(models?: any[], options?: any): any {
      models = models || [];
      options = options || {};
      const Target = this.target;

      // If it's a single model, check whether there's already a model we can pick from, otherwise
      // create a new instance.
      if (this.isSingle()) {
        if (!(Target.prototype instanceof ModelBase)) {
          throw new Error(`The ${this.type} related object must be a Bookshelf.Model`);
        }
        return models[0] || new Target();
      }

      // Allows us to just use a model, but create a temporary collection for a "*-many" relation.
      if (Target.prototype instanceof ModelBase) {
        return Target.collection(models, {
          parse: true,
          merge: options.merge,
          remove: options.remove
        });
      }
      return new Target(models, {parse: true});
    },

    /**
     * Groups the eagerly loaded relations according to the type of relationship we're handling for
     * easy attachment to the parent models.
     *
     * @param {string} relationName The relation name being paired to its parent models.
     * @param {Model[]} related The related models obtained from the eager load fetch call.
     * @param {Model[]} parentModels The parent models of the eager fetched relation.
     * @param {options} options Eager fetch query options.
     * @return {Model[]} The eager fetch models.
     */
    // any: related and parentModels are dynamic arrays of Bookshelf Model instances
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eagerPair(relationName: string, related: any[], parentModels: any[], options: any) {
      // If this is a morphTo, we only want to pair on the morphValue for the current relation.
      if (this.type === 'morphTo') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parentModels = filter(parentModels, (m: any) => {
          return m.get(this.key('morphKey')) === this.key('morphValue');
        });
      }

      // If this is a `through` or `belongsToMany` relation, we need to cleanup and setup the
      // `interim` model.
      if (this.isJoined()) related = this.parsePivot(related);

      // Group all of the related models for easier association with their parent models.
      // any: key may be Buffer, number, string, or null/undefined at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idKey = (key: any): any => (isBuffer(key) ? (key as Buffer).toString('hex') : key);
      const grouped = groupBy(related, (m: any): string => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let key: any;
        if (m.pivot) {
          if (this.isInverse() && this.isThrough()) {
            key = this.isThroughForeignKeyTargeted() ? m.pivot.get(this.throughForeignKeyTarget) : m.pivot.id;
          } else {
            key = m.pivot.get(this.key('foreignKey'));
          }
        } else if (this.isInverse()) {
          key = this.isForeignKeyTargeted() ? m.get(this.foreignKeyTarget) : m.id;
        } else {
          key = m.get(this.key('foreignKey'));
        }
        // any: idKey may return non-string at runtime; null/undefined cases guarded in each loop below
        return idKey(key) as string;
      });

      // Loop over the `parentModels` and attach the grouped sub-models, keeping the `relatedData`
      // on the new related instance.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      each(parentModels, (model: any) => {
        // any: groupedKey may be null/undefined (guarded below) or a string/number key
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let groupedKey: any;
        if (!this.isInverse()) {
          const parsedKey = Object.keys(model.parse({[this.parentIdAttribute]: null}))[0];
          groupedKey = idKey(model.get(parsedKey));
        } else {
          const keyColumn = this.key(this.isThrough() ? 'throughForeignKey' : 'foreignKey');
          const formatted = model.format(clone(model.attributes));
          groupedKey = idKey(formatted[keyColumn]);
        }
        if (groupedKey != null) {
          const relation = (model.relations[relationName] = this.relatedInstance(grouped[groupedKey], options));
          if (this.type === 'belongsToMany') {
            // If type is `belongsToMany` then the relatedData needs to be recreated through the
            // parent model
            relation.relatedData = model[relationName]().relatedData;
          } else {
            relation.relatedData = this;
          }
          if (this.isJoined()) extend(relation, PivotHelpers);
        }
      });

      // Now that related models have been successfully paired, update each with its parsed
      // attributes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      related.map((model: any) => {
        model.attributes = model.parse(model.attributes);
        model.formatTimestamps()._previousAttributes = cloneDeep(model.attributes);
        model._reset();
      });

      return related;
    },

    /**
     * Creates new pivot models in case any of the models being processed have pivot attributes.
     * This is only true for models belonging to {@link Model#belongsToMany belongsToMany} and
     * {@link Model#through through} relations. All other models will discard any existing pivot
     * attributes if present.
     *
     * @param {Model[]} models List of models being processed.
     * @return {Model[]} Parsed model list possibly containing additional pivot models.
     */
    // any: models is a dynamic array of Bookshelf Model instances with dynamic attribute bags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parsePivot(models: any[]): any[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return map(models, (model: any) => {
        // Separate pivot attributes.
        // any: model.attributes is a dynamic key→value bag; reduce over its entries
        const grouped = reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          model.attributes as Record<string, any>,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc: {model: any; pivot: any}, value: any, key: string | number) => {
            const k = key as string; // object iteration always yields string keys at runtime
            if (hasPivotPrefix(k)) {
              acc.pivot[removePivotPrefix(k)] = value;
            } else {
              acc.model[k] = value;
            }
            return acc;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {model: {} as any, pivot: {} as any}
        );

        // Assign non-pivot attributes to model.
        model.attributes = grouped.model;

        // If there are any pivot attributes create a new pivot model with these attributes.
        if (!isEmpty(grouped.pivot)) {
          const Through = this.throughTarget;
          const tableName = this.joinTable();
          model.pivot = Through != null ? new Through(grouped.pivot) : new this.Model(grouped.pivot, {tableName});
        }

        return model;
      });
    },

    /**
     * Sets the pivot column names to be retrieved along with the current model. This allows for
     * additional fields to be pulled from the joining table.
     *
     * @param {string|string[]} columns Extra column names to fetch.
     * @return {undefined}
     */
    withPivot(columns: string | string[]) {
      if (!Array.isArray(columns)) columns = [columns];
      this.pivotColumns = this.pivotColumns || [];
      push.apply(this.pivotColumns, columns);
    },

    /**
     * Checks whether or not a relation is of the {@link Relation#through through} type.
     *
     * @return {boolean}
     */
    isThrough(): boolean {
      return this.throughTarget != null;
    },

    /**
     * Checks whether or not a relation has joins. Only {@link Model#belongsToMany belongsToMany}
     * and {@link Model#through through} relations make use of joins currently.
     *
     * @return {boolean}
     */
    isJoined(): boolean {
      return this.type === 'belongsToMany' || this.isThrough();
    },

    /**
     * Checks whether or not a relation is of the {@link Model#morphOne morphOne} or
     * {@link Model#morphMany morphMany} type.
     *
     * @return {boolean}
     */
    isMorph(): boolean {
      return this.type === 'morphOne' || this.type === 'morphMany';
    },

    /**
     * Checks whether or not a relation is of the single type (one to one).
     *
     * @return {boolean}
     */
    isSingle(): boolean {
      const type = this.type;
      return type === 'hasOne' || type === 'belongsTo' || type === 'morphOne' || type === 'morphTo';
    },

    /**
     * Checks whether or not the relation is the inverse of a {@link Model#morphOne morphOne},
     * {@link Model#morphMany morphMany}, {@link Model#hasOne hasOne} or
     * {@link Model#hasMany hasMany} relation.
     *
     * @return {boolean}
     */
    isInverse(): boolean {
      return this.type === 'belongsTo' || this.type === 'morphTo';
    },

    /**
     * Checks whether or not the relation has a foreign key target set.
     *
     * @return {boolean}
     */
    isForeignKeyTargeted(): boolean {
      return this.foreignKeyTarget != null;
    },

    /**
     * Checks whether or not the {@link Model#through through} relation has a foreign key target
     * set.
     *
     * @return {boolean}
     */
    isThroughForeignKeyTargeted(): boolean {
      return this.throughForeignKeyTarget != null;
    },

    /**
     * Checks whether or not the relation has a the `other` foreign key target set.
     *
     * @return {boolean}
     */
    isOtherKeyTargeted(): boolean {
      return this.otherKeyTarget != null;
    },

    /**
     * Checks whether or not the relation has the parent attributes set.
     *
     * @return {boolean}
     */
    hasParentAttributes(): boolean {
      return this.parentAttributes != null;
    }
  }
);

// Simple memoization of the singularize call.
// singularMemo is referenced inside method bodies (not at module top level), so defining it here
// after Relation is safe — by the time any method calls singularMemo, the module is fully loaded.
const singularMemo = (function () {
  const cache: Record<string, string> = Object.create(null);
  return function (arg: string): string {
    if (!(arg in cache)) {
      cache[arg] = singularize(arg);
    }
    return cache[arg];
  };
})();

/**
 * Specific to many-to-many relationships, these methods are mixed into the
 * {@link Model#belongsToMany belongsToMany} relationships when they are created, providing helpers
 * for attaching and detaching related models.
 *
 * @mixin
 */
const PivotHelpers = {
  /**
   * Attaches one or more `ids` or models from a foreign table to the current
   * table, on a {@linkplain many-to-many} relation. Creates and saves a new
   * model and attaches the model with the related model.
   *
   *     var admin1 = new Admin({username: 'user1', password: 'test'});
   *     var admin2 = new Admin({username: 'user2', password: 'test'});
   *
   *     Promise.all([admin1.save(), admin2.save()])
   *       .then(function() {
   *         return Promise.all([
   *         new Site({id: 1}).admins().attach([admin1, admin2]),
   *         new Site({id: 2}).admins().attach(admin2)
   *       ]);
   *     })
   *
   * This method (along with {@link Collection#detach} and {@link
   * Collection#updatePivot}) are mixed in to a {@link Collection} when
   * returned by a {@link Model#belongsToMany belongsToMany} relation.
   *
   * @method Collection#attach
   * @param {mixed|mixed[]} ids
   *   One or more ID values or models to be attached to the relation.
   * @param {Object} options
   *   A hash of options.
   * @param {Transaction} options.transacting
   *   Optionally run the query in a transaction.
   * @returns {Promise<Collection>}
   *   A promise resolving to the updated Collection where this method was called.
   */
  // any: ids and options have dynamic shapes; `this` is a Collection instance at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attach(this: any, ids: any, options: any) {
    return BPromise.try(() => this.triggerThen('attaching', this, ids, options))
      .then(() => this._handler('insert', ids, options))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response: any) => this.triggerThen('attached', this, response, options))
      .return(this);
  },

  /**
   * Detach one or more related objects from their pivot tables. If a model or
   * id is passed, it attempts to remove from the pivot table based on that
   * foreign key. If no parameters are specified, we assume we will detach all
   * related associations.
   *
   * This method (along with {@link Collection#attach} and {@link
   * Collection#updatePivot}) are mixed in to a {@link Collection} when returned
   * by a {@link Model#belongsToMany belongsToMany} relation.
   *
   * @method Collection#detach
   * @param {mixed|mixed[]} [ids]
   *   One or more ID values or models to be detached from the relation.
   * @param {Object} options
   *   A hash of options.
   * @param {Transaction} options.transacting
   *   Optionally run the query in a transaction.
   * @returns {Promise<undefined>}
   *   A promise resolving to the updated Collection where this method was called.
   */
  // any: ids and options have dynamic shapes; `this` is a Collection instance at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detach(this: any, ids: any, options: any) {
    return BPromise.try(() => this.triggerThen('detaching', this, ids, options))
      .then(() => this._handler('delete', ids, options))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((response: any) => this.triggerThen('detached', this, response, options))
      .return(this);
  },

  /**
   * The `updatePivot` method is used exclusively on {@link Model#belongsToMany
   * belongsToMany} relations, and allows for updating pivot rows on the joining
   * table.
   *
   * This method (along with {@link Collection#attach} and {@link
   * Collection#detach}) are mixed in to a {@link Collection} when returned
   * by a {@link Model#belongsToMany belongsToMany} relation.
   *
   * @method Collection#updatePivot
   * @param {Object} attributes
   *   Values to be set in the `update` query.
   * @param {Object} [options]
   *   A hash of options.
   * @param {function|Object} [options.query]
   *   Constrain the update query. Similar to the `method` argument to {@link
   *   Model#query}.
   * @param {Boolean} [options.require=false]
   *   Causes promise to be rejected with an Error if no rows were updated.
   * @param {Transaction} [options.transacting]
   *   Optionally run the query in a transaction.
   * @returns {Promise<Number>}
   *   A promise resolving to number of rows updated.
   */
  // any: attributes and options have dynamic shapes; `this` is a Collection instance at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatePivot: function (this: any, attributes: any, options: any) {
    return this._handler('update', attributes, options);
  },

  /**
   * The `withPivot` method is used exclusively on {@link Model#belongsToMany
   * belongsToMany} relations, and allows for additional fields to be pulled
   * from the joining table.
   *
   *     var Tag = bookshelf.model('Tag', {
   *       comments: function() {
   *         return this.belongsToMany(Comment).withPivot(['created_at', 'order']);
   *       }
   *     });
   *
   * @method Collection#withPivot
   * @param {string[]} columns
   *   Names of columns to be included when retrieving pivot table rows.
   * @returns {Collection}
   *   Self, this method is chainable.
   */
  // any: `this` is a Collection instance at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withPivot: function (this: any, columns: string | string[]) {
    this.relatedData.withPivot(columns);
    return this;
  },

  /**
   * Helper for handling either the {@link Collection#attach attach} or
   * {@link Collection#detach detach} call on the {@link Model#belongsToMany belongsToMany} or
   * ({@link Model#hasOne hasOne}/{@link Model#hasMany hasMany}).{@link Model#through through}
   * relationship.
   *
   * @private
   * @param {string} method
   *   Type of query being handled. This will be `insert` for {@link Collection#attach attach}
   *   calls, `delete` for {@link Collection#detach detach} calls and `update` for
   *   {@link Collection#updatePivot updatePivot} calls.
   * @param {mixed|null} The ids of the models to attach, detach or update.
   * @param {object} [options] Query options.
   * @return {Promise}
   */
  // any: method/ids/options have dynamic shapes; `this` is a Collection instance at runtime
  _handler: BPromise.method(function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ids: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending: any[] = [];
    if (ids == null) {
      if (method === 'insert') return BPromise.resolve(this);
      if (method === 'delete') pending.push(this._processPivot(method, null, options));
    }
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    each(ids, (id: any) => pending.push(this._processPivot(method, id, options)));
    return BPromise.all(pending).return(this);
  }),

  /**
   * Handles preparing the appropriate constraints and then delegates the database interaction to
   * `_processPlainPivot` for non-{@link Model#through through} pivot definitions, or
   * `_processModelPivot` for {@link Model#through through} models.
   *
   * @private
   * @param {string} method
   *   Type of query being handled. This will be `insert` for {@link Collection#attach attach}
   *   calls, `delete` for {@link Collection#detach detach} calls and `update` for
   *   {@link Collection#updatePivot updatePivot} calls.
   * @param {Model|object|mixed} item
   *   The item can be an object, in which case it's either a model that we're looking to attach to
   *   this model, or a hash of attributes to set in the relation. Otherwise it's a foreign key.
   * @return {Promise}
   */
  // any: method/item have dynamic shapes; `this` is a Collection instance at runtime
  _processPivot: BPromise.method(function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any
  ) {
    const relatedData = this.relatedData,
      args = Array.prototype.slice.call(arguments),
      // any: fks and data are dynamic pivot key→value bags
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fks: any = {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any = {};

    fks[relatedData.key('foreignKey')] = relatedData.parentFk;

    if (isObject(item)) {
      if (item instanceof ModelBase) {
        // any: ModelBase is a function constructor; cast for id access after instanceof guard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fks[relatedData.key('otherKey')] = (item as any).id;
      } else if (method !== 'update') {
        extend(data, item);
      }
    } else if (item) {
      fks[relatedData.key('otherKey')] = item;
    }

    args.push(extend(data, fks), fks);

    if (this.relatedData.throughTarget) {
      return this._processModelPivot.apply(this, args);
    }

    return this._processPlainPivot.apply(this, args);
  }),

  /**
   * Applies constraints to the knex builder and handles shelling out to either the `insert` or
   * `delete` call for the current model.
   *
   * @private
   * @param {string} method
   *   Type of query being handled. This will be `insert` for {@link Collection#attach attach}
   *   calls, `delete` for {@link Collection#detach detach} calls and `update` for
   *   {@link Collection#updatePivot updatePivot} calls.
   * @param {Model|object|mixed} item
   *   The item can be an object, in which case it's either a model that we're looking to attach to
   *   this model, or a hash of attributes to set in the relation. Otherwise it's a foreign key.
   * @param {object} [options] Query options.
   * @param {object} [data] The model data to constrain the query or attach to the relation.
   * @return {Promise}
   */
  // any: method/item/options/data have dynamic shapes; `this` is a Collection instance at runtime
  _processPlainPivot: BPromise.method(function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
  ) {
    const relatedData = this.relatedData;

    // Grab the `knex` query builder for the current model, and
    // check if we have any additional constraints for the query.
    const builder = this._builder(relatedData.joinTable());
    if (options && options.query) {
      Helpers.query.call(null, {_knex: builder}, [options.query]);
    }

    if (options) {
      if (options.transacting) builder.transacting(options.transacting);
      if (options.debug) builder.debug();
    }

    const collection = this;
    if (method === 'delete') {
      return builder
        .where(data)
        .del()
        .then(function () {
          if (!item) return collection.reset();
          const model = collection.get(data[relatedData.key('otherKey')]);
          if (model) {
            collection.remove(model);
          }
        });
    }
    if (method === 'update') {
      return builder
        .where(data)
        .update(item)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(function (numUpdated: any) {
          if (options && options.require === true && numUpdated === 0) {
            throw new Error('No rows were updated');
          }
          return numUpdated;
        });
    }

    return this.triggerThen('creating', this, data, options).then(function () {
      return builder.insert(data).then(function () {
        collection.add(item);
      });
    });
  }),

  /**
   * Loads or prepares a pivot model based on the constraints and deals with pivot model changes by
   * calling the appropriate Bookshelf Model API methods.
   *
   * @private
   * @param {string} method
   *   Type of query being handled. This will be `insert` for {@link Collection#attach attach}
   *   calls, `delete` for {@link Collection#detach detach} calls and `update` for
   *   {@link Collection#updatePivot updatePivot} calls.
   * @param {Model|object|mixed} item
   *   The item can be an object, in which case it's either a model that we're looking to attach to
   *   this model, or a hash of attributes to set in the relation. Otherwise it's a foreign key.
   * @param {object} options Query options.
   * @param {object} data The model data to constrain the query or attach to the relation.
   * @param {object} fks
   * @return {Promise}
   */
  // any: method/item/options/data/fks have dynamic shapes; `this` is a Collection instance at runtime
  _processModelPivot: BPromise.method(function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fks: any
  ) {
    const relatedData = this.relatedData,
      JoinModel = relatedData.throughTarget,
      joinModel = new JoinModel();

    fks = joinModel.parse(fks);
    data = joinModel.parse(data);

    if (method === 'insert') {
      return joinModel.set(data).save(null, options);
    }

    return joinModel
      .set(fks)
      .fetch()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(function (instance: any) {
        if (method === 'delete') {
          return instance.destroy(options);
        }
        return instance.save(item, options);
      });
  })
};

export default Relation;
