// Base Collection
// ---------------

import { inherits } from 'node:util';
import {
  extend,
  pick,
  isFunction,
  isString,
  isBuffer,
  isNull,
  negate,
  defaults,
  clone,
  bind,
  mapValues,
  result,
} from '../internal/lang';
import Events from './events';
import { BPromise } from '../internal/promise';
import ModelBase from './model';
import extendFn from '../extend';

// any: collections are inherently dynamic in the ORM layer (model bags, ids, options)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

// List of attributes attached directly from the constructor's options object.
//
// RE: 'relatedData'
// It's okay for two `Collection`s to share a `Relation` instance.
// `relatedData` does not mutate itself after declaration. This is only
// here because `clone` needs to duplicate this property. It should not
// be documented as a valid argument for consumer code.
//
// RE: 'attach', 'detach', 'updatePivot', 'withPivot', '_processPivot', '_processPlainPivot', '_processModelPivot'
// It's okay to whitelist also given method references to be copied when cloning
// a collection. These methods are present only when `relatedData` is present and
// its `type` is 'belongsToMany'. So it is safe to put them in the list and use them
// without any additional verification.
// These should not be documented as a valid arguments for consumer code.
const collectionProps = [
  'model',
  'comparator',
  'relatedData',
  // `belongsToMany` pivotal collection properties
  'attach',
  'detach',
  'updatePivot',
  'withPivot',
  '_processPivot',
  '_processPlainPivot',
  '_processModelPivot',
];

/**
 * Replicates lodash's internal `compareAscending` ordering used by `_.sortBy`.
 * Ordering (ascending): normal comparable values < NaN < null < undefined.
 * Two values that are equal (or both special in the same way) return 0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function compareAscending(value: any, other: any): number {
  if (value !== other) {
    const valDefined = value !== undefined;
    const valNull = value === null;
    const valReflexive = value === value; // false iff NaN
    const othDefined = other !== undefined;
    const othNull = other === null;
    const othReflexive = other === other; // false iff NaN
    if (
      (!othNull && value > other) ||
      (valNull && othDefined && othReflexive) ||
      (!valDefined && othReflexive)
    )
      return 1;
    if (
      (!valNull && value < other) ||
      (othNull && valDefined && valReflexive) ||
      (!othDefined && valReflexive)
    )
      return -1;
  }
  return 0;
}

/**
 * Builds the iterator used by the attribute-based collection methods
 * (`groupBy`/`countBy`/`sortBy`). Mirrors the lib's per-method wrapper:
 * a function value is used directly, otherwise the value is treated as an
 * attribute name and resolved via `model.get(value)`. The resulting iterator
 * is bound to `context` (replacing the lib's `_.bind(iterator, context)`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attributeIteratee(value: any, context: any): (...args: any[]) => any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iterator = isFunction(value) ? value : (model: any) => model.get(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (...args: any[]) => (iterator as (...a: any[]) => any).apply(context, args);
}

/**
 * @class CollectionBase
 * @extends Events
 * @inheritdoc
 *
 * @description
 * NOTE: `CollectionBase` is a constructor FUNCTION (not an ES class) on purpose.
 * It exists to be subclassed via `src/extend.ts`, whose default `Child` invokes
 * `Parent.apply(this, arguments)`. ES classes cannot be invoked without `new`,
 * and ES class fields (under `useDefineForClassFields`) would emit own
 * `undefined` instance properties that shadow the prototype defaults (e.g.
 * `length`) that `extend` copies from `protoProps`. The function + prototype
 * form below mirrors `lib/base/collection.js` exactly and avoids both regressions.
 */
// Declaration-merged interface that gives `CollectionBase` instances a typed
// surface. It `extends Events` so instances inherit `on`/`off`/`trigger`/
// `triggerThen`/`once` — wired at runtime via `inherits(CollectionBase, Events)`.
/* eslint-disable @typescript-eslint/no-explicit-any */
interface CollectionBase extends Events {
  // The associated Model constructor — dynamic Backbone-style constructor.
  model: any;
  // String attribute name OR comparator function.
  comparator?: any;
  // Shared Relation instance (see collectionProps note).
  relatedData?: any;
  /** @member {Number} @default 0 */
  length: number;
  models: any[];
  _byId: Record<string, any>;
  // `belongsToMany` pivotal method references, copied via collectionProps.
  attach?: any;
  detach?: any;
  updatePivot?: any;
  withPivot?: any;
  _processPivot?: any;
  _processPlainPivot?: any;
  _processModelPivot?: any;

  initialize(...args: any[]): void;
  tableName(): any;
  first(): any;
  last(): any;
  idAttribute(): any;
  idKey(id: any): any;
  toString(): string;
  serialize(options?: AnyObj): any[];
  toJSON(options?: AnyObj): any[];
  set(models: any, options?: AnyObj): this;
  _prepareModel(attrs: any, options?: AnyObj): any;
  mapThen(iterator: any, context?: any): BPromise<any[]>;
  invokeThen(...args: any[]): BPromise<any[]>;
  reduceThen(iterator: any, initialValue: any, context?: any): BPromise<any>;
  fetch(): BPromise<any>;
  add(models: any, options?: AnyObj): this;
  remove(models: any, options?: AnyObj): any;
  reset(models: any, options?: AnyObj): any;
  push(model: any, options?: AnyObj): this;
  pop(options?: AnyObj): any;
  unshift(model: any, options?: AnyObj): this;
  shift(options?: AnyObj): any;
  slice(...args: any[]): any[];
  get(obj: any): any;
  at(index: number): any;
  sort(options?: AnyObj): this;
  pluck(attr: any): any[];
  parse(resp: any, options?: AnyObj): any;
  clone(): any;
  _reset(): void;
  [Symbol.iterator](): Iterator<any>;

  // Lodash-style methods proxied to `this.models` (rewritten as explicit fns).
  forEach(iteratee: any): any;
  map(iteratee: any): any[];
  reduce(iteratee: any, ...rest: any[]): any;
  reduceRight(iteratee: any, ...rest: any[]): any;
  find(predicate: any): any;
  filter(predicate: any): any[];
  every(predicate: any): boolean;
  some(predicate: any): boolean;
  includes(value: any, fromIndex?: number): boolean;
  invokeMap(path: any, ...args: any[]): any[];
  toArray(): any[];
  isEmpty(): boolean;
  groupBy(value: any, context?: any): Record<string, any[]>;
  countBy(value: any, context?: any): Record<string, number>;
  sortBy(value: any, context?: any): any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Constructor FUNCTION (invocable via `Parent.apply(this, arguments)` in extend).
// Faithful to the `CollectionBase` constructor in lib/base/collection.js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CollectionBase(this: CollectionBase, models?: any, options?: AnyObj) {
  if (options) extend(this, pick(options, collectionProps as (keyof AnyObj)[]));
  this._reset();
  // Forward the RAW arguments faithfully (lib parity).
  // eslint-disable-next-line prefer-rest-params
  this.initialize.apply(this, arguments as unknown as unknown[]);
  if (!isFunction(this.model)) {
    throw new Error('A valid `model` constructor must be defined for all collections.');
  }
  if (models) this.reset(models, extend({ silent: true }, options as AnyObj));
}

/**
 * Registers an event listener.
 *
 * @method CollectionBase#on    @see Events#on
 * @method CollectionBase#off   @see Events#off
 * @method CollectionBase#trigger @see Events#trigger
 *
 * Establish the prototype chain: CollectionBase.prototype -> Events.prototype ->
 * EventEmitter.prototype, and set `CollectionBase.super_` so bookshelf
 * `extend()` chains that inspect `__super__` keep working. Mirrors
 * lib/base/collection.js.
 */
inherits(CollectionBase, Events);

// Copied over from Backbone.
const setOptions: AnyObj = { add: true, remove: true, merge: true };
const addOptions: AnyObj = { add: true, remove: false };

// Prototype methods. `ThisType<CollectionBase>` types `this` inside each method.
const proto: Partial<CollectionBase> & ThisType<CollectionBase> = {
  /**
   * Called by the {@link Collection Collection constructor} when creating a new
   * instance. Override this function to add custom initialization, such as event
   * listeners.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialize(..._args: any[]): void {},

  /**
   * The `tableName` on the associated Model, used in relation building.
   * @returns {string} The {@link Model#tableName tableName} of the associated model.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tableName(): any {
    return result(this.model.prototype, 'tableName');
  },

  /**
   * Returns the first model in the collection or `undefined` if empty.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  first(): any {
    return this.at(0);
  },

  /**
   * Returns the last model in the collection or `undefined` if empty.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  last(): any {
    return this.slice(-1)[0];
  },

  /**
   * The `idAttribute` on the associated Model, used in relation building.
   * @returns {string} The {@link Model#idAttribute idAttribute} of the associated model.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idAttribute(): any {
    return this.model.prototype.idAttribute;
  },

  /**
   * When keying a collection by ID, ensure that it is safe to use as a key.
   * @param {any} id
   * @return {string|number} The id safe for using as a key in a collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idKey(id: any): any {
    return isBuffer(id) ? id.toString('hex') : id;
  },

  toString(): string {
    return '[Object Collection]';
  },

  /**
   * Return a raw array of the collection's {@link Model#attributes attributes}
   * for JSON stringification.
   * @param {Object=} options
   * @returns {Object[]} Serialized models.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialize(options?: AnyObj): any[] {
    return this.invokeMap('toJSON', options).filter(negate(isNull));
  },

  /**
   * Called automatically by `JSON.stringify`. To customize serialization,
   * override {@link Collection#serialize serialize}.
   * @param {Object=} options Options passed to {@link Collection#serialize}.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toJSON(options?: AnyObj): any[] {
    return this.serialize(options);
  },

  /**
   * Performs a smart update of the collection with the passed model or list of
   * models (add / merge / remove).
   * @param {Object[]|Model[]|Object|Model} models
   * @param {Object=} options
   * @returns {Collection} Self, this method is chainable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(models: any, options?: AnyObj): CollectionBase {
    options = defaults({}, options || {}, setOptions) as AnyObj;
    if (!Array.isArray(models)) models = models ? [models] : [];
    if (options.parse) models = this.parse(models, options);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let i: number, l: number, id: any, model: any, attrs: any;
    const at = options.at;
    const targetModel = this.model;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toAdd: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRemove: any[] = [];
    const modelMap: AnyObj = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let order: any[] | false = options.add && options.remove ? [] : false;

    // Turn bare objects into model references, and prevent invalid models
    // from being added.
    for (i = 0, l = models.length; i < l; i++) {
      attrs = models[i];
      if (attrs instanceof ModelBase) {
        id = model = attrs;
      } else {
        id = attrs[targetModel.prototype.idAttribute];
      }

      // If a duplicate is found, prevent it from being added and
      // optionally merge it into the existing model.
      const existing = this.get(id);
      if (existing && (options.merge || options.remove)) {
        if (options.remove) {
          modelMap[existing.cid] = true;
        }
        if (options.merge) {
          attrs = attrs === model ? model.attributes : attrs;
          if (options.parse) attrs = existing.parse(attrs, options);
          existing.set(attrs, options);
        }

        // This is a new model, push it to the `toAdd` list.
      } else if (options.add) {
        if (!(model = this._prepareModel(attrs, options))) continue;
        toAdd.push(model);
        this._byId[this.idKey(model.cid)] = model;
        if (model.id != null) this._byId[this.idKey(model.id)] = model;
      }

      if (order && !(existing && order.indexOf(existing) > -1)) order.push(existing || model);
    }

    // Remove nonexistent models if appropriate.
    if (options.remove) {
      for (i = 0, l = this.length; i < l; ++i) {
        if (!modelMap[(model = this.models[i]).cid]) toRemove.push(model);
      }
      if (toRemove.length) this.remove(toRemove, options);
    }

    // See if sorting is needed, update `length` and splice in new models.
    if (toAdd.length || (order && order.length)) {
      this.length += toAdd.length;
      if (at != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Array.prototype.splice.apply(this.models, [at, 0].concat(toAdd) as any);
      } else {
        if (order) {
          this.models.length = 0;
        } else {
          order = toAdd;
        }
        for (i = 0, l = order.length; i < l; ++i) {
          this.models.push(order[i]);
        }
      }
    }

    if (options.silent) return this;

    // Trigger `add` events.
    for (i = 0, l = toAdd.length; i < l; i++) {
      (model = toAdd[i]).trigger('add', model, this, options);
    }
    return this;
  },

  /**
   * Prepare a model or hash of attributes to be added to this collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _prepareModel(attrs: any, options?: AnyObj): any {
    if (attrs instanceof ModelBase) return attrs;
    return new this.model(attrs, options);
  },

  /**
   * Run a concurrent map over the models (lib's `Promise.map`).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapThen(iterator: any, context?: any): BPromise<any[]> {
    return BPromise.bind(context)
      .thenReturn(this.models)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((models: any[]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        BPromise.map(models, (model: any, index: number) => iterator.call(context, model, index, models.length)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as BPromise<any[]>;
  },

  /**
   * Shortcut for calling `Promise.all` around a {@link Collection#invokeMap}.
   * @param {string} method The {@link Model model} method to invoke.
   * @param {...mixed} arguments Arguments to `method`.
   * @returns {Promise<mixed[]>}
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invokeThen(...args: any[]): BPromise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return BPromise.all((this.invokeMap as (...a: any[]) => any[]).apply(this, args));
  },

  /**
   * Iterate over all the models and reduce them to a single value using the
   * given iterator function.
   * @param {Function} iterator
   * @param {mixed} initialValue
   * @param {Object} context Bound to `this` in the `iterator` callback.
   * @returns {Promise<mixed>}
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reduceThen(iterator: any, initialValue: any, context?: any): BPromise<any> {
    return BPromise.bind(context)
      .thenReturn(this.models)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((models: any[]) =>
        BPromise.reduce(
          models,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (accumulator: any, model: any, index: number) =>
            iterator.call(context, accumulator, model, index, models.length),
          initialValue,
        ),
      )
      .bind() as BPromise<any>;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch(): BPromise<any> {
    return BPromise.reject('The fetch method has not been implemented');
  },

  /**
   * Add a {@link Model model}, or an array of models, to the collection.
   * @param {Object[]|Model[]|Object|Model} models
   * @param {Object=} options Options for controlling how models are added.
   * @returns {Collection} Self, this method is chainable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  add(models: any, options?: AnyObj): CollectionBase {
    return this.set(models, Object.assign({ merge: false }, options, addOptions));
  },

  /**
   * Remove a {@link Model model}, or an array of models, from the collection.
   * @param {Model|Model[]} models The model, or models, to be removed.
   * @param {Object} [options] Set of options for the operation.
   * @returns {Model|Model[]} The same value passed in the `models` argument.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remove(models: any, options?: AnyObj): any {
    const singular = !Array.isArray(models);
    models = singular ? [models] : clone(models);
    options = options || {};
    for (let i = 0; i < models.length; i++) {
      const model = (models[i] = this.get(models[i]));
      if (!model) continue;
      delete this._byId[this.idKey(model.id)];
      delete this._byId[model.cid];
      const index = this.models.indexOf(model);
      this.models.splice(index, 1);
      this.length = this.length - 1;
      if (!options.silent) {
        options.index = index;
        model.trigger('remove', model, this, options);
      }
    }
    return singular ? models[0] : models;
  },

  /**
   * Replace a collection with a new list of models (or attribute hashes).
   * @param {Object[]|Model[]|Object|Model} models
   * @param {Object} options See {@link Collection#add add}.
   * @returns {Model[]} Array of models.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reset(models: any, options?: AnyObj): any {
    options = options || {};
    options.previousModels = this.models;
    this._reset();
    models = this.set(models, Object.assign({ silent: true }, options));
    if (!options.silent) this.trigger('reset', this, options);
    return models;
  },

  /**
   * Add a model to the end of the collection.
   * @returns {Collection} Self, this method is chainable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  push(model: any, options?: AnyObj): CollectionBase {
    return this.add(model, extend({ at: this.length }, options as AnyObj));
  },

  /**
   * Remove a model from the end of the collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pop(options?: AnyObj): any {
    const model = this.at(this.length - 1);
    this.remove(model, options);
    return model;
  },

  /**
   * Add a model to the beginning of the collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unshift(model: any, options?: AnyObj): CollectionBase {
    return this.add(model, extend({ at: 0 }, options as AnyObj));
  },

  /**
   * Remove a model from the beginning of the collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift(options?: AnyObj): any {
    const model = this.at(0);
    this.remove(model, options);
    return model;
  },

  /**
   * Slice out a sub-array of models from the collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slice(...args: any[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Array.prototype.slice.apply(this.models, args as any);
  },

  /**
   * Get a model from a collection, specified by an {@link Model#id id}, a
   * {@link Model#cid cid}, or by passing in a {@link Model model}.
   * @returns {Model} The model, or `undefined` if it is not in the collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(obj: any): any {
    if (obj == null) return void 0;
    return this._byId[this.idKey(obj.id)] || this._byId[obj.cid] || this._byId[this.idKey(obj)];
  },

  /**
   * Get a model from a collection, specified by index.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  at(index: number): any {
    return this.models[index];
  },

  /**
   * Force the collection to re-sort itself, based on a comparator defined on
   * the model.
   */
  sort(options?: AnyObj): CollectionBase {
    if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
    options = options || {};

    // Run sort based on type of `comparator`.
    if (isString(this.comparator) || this.comparator.length === 1) {
      this.models = this.sortBy(this.comparator, this);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.models.sort(bind(this.comparator, this) as any);
    }

    if (!options.silent) this.trigger('sort', this, options);
    return this;
  },

  /**
   * Pluck an attribute from each model in the collection.
   * @returns {mixed[]} An array of attribute values.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pluck(attr: any): any[] {
    return this.invokeMap('get', attr);
  },

  /**
   * The `parse` method is called whenever a collection's data is returned in a
   * {@link Collection#fetch fetch} call. The default implementation is a no-op.
   * @param {Object[]} resp Raw database response array.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(resp: any): any {
    return resp;
  },

  /**
   * Create a new collection with an identical list of models as this one.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clone(): any {
    // Iterate over the selected list of collection properties and invoke `clone`
    // for each property that has a method for that purpose.
    const picked = pick(this as unknown as AnyObj, collectionProps as (keyof AnyObj)[]);
    const clonedProps = mapValues(picked as Record<string, unknown>, (val) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      val && typeof (val as any).clone === 'function' ? (val as any).clone() : val,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (this.constructor as any)(this.models, clonedProps);
  },

  /**
   * Reset all internal state. Called when the collection is first initialized
   * or reset.
   */
  _reset(): void {
    this.length = 0;
    this.models = [];
    this._byId = Object.create(null);
  },

  // Make collection iterable in for-of loops.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  *[Symbol.iterator](): Iterator<any> {
    yield* this.models;
  },

  // ─── Lodash-style methods proxied to `this.models` ────────────────────────
  // The lib mixes these in via a dynamic `_.each(methods, ...)` loop that
  // delegates to lodash. They are rewritten here as explicit native functions
  // (faithful to the function-iteratee behavior used by the ORM).

  /** @see http://lodash.com/docs/#forEach */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forEach(iteratee: any): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.models.forEach((value: any, index: number) => iteratee(value, index, this.models));
    return this.models;
  },

  /** @see http://lodash.com/docs/#map */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map(iteratee: any): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.map((value: any, index: number) => iteratee(value, index, this.models));
  },

  /** @see http://lodash.com/docs/#reduce */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reduce(iteratee: any, ...rest: any[]): any {
    const models = this.models;
    const hasAccumulator = rest.length > 0;
    let accumulator = hasAccumulator ? rest[0] : models[0];
    let index = hasAccumulator ? 0 : 1;
    for (; index < models.length; index++) {
      accumulator = iteratee(accumulator, models[index], index, models);
    }
    return accumulator;
  },

  /** @see http://lodash.com/docs/#reduceRight */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reduceRight(iteratee: any, ...rest: any[]): any {
    const models = this.models;
    const hasAccumulator = rest.length > 0;
    let index = models.length - 1;
    let accumulator = hasAccumulator ? rest[0] : models[index--];
    for (; index >= 0; index--) {
      accumulator = iteratee(accumulator, models[index], index, models);
    }
    return accumulator;
  },

  /** @see http://lodash.com/docs/#find */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  find(predicate: any): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.find((value: any, index: number) => predicate(value, index, this.models));
  },

  /** @see http://lodash.com/docs/#filter */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter(predicate: any): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.filter((value: any, index: number) => predicate(value, index, this.models));
  },

  /** @see http://lodash.com/docs/#every */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  every(predicate: any): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.every((value: any, index: number) => predicate(value, index, this.models));
  },

  /** @see http://lodash.com/docs/#some */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  some(predicate: any): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.some((value: any, index: number) => predicate(value, index, this.models));
  },

  /** @see http://lodash.com/docs/#includes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  includes(value: any, fromIndex?: number): boolean {
    return this.models.includes(value, fromIndex);
  },

  /** @see http://lodash.com/docs/#invokeMap */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invokeMap(path: any, ...args: any[]): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.models.map((model: any) => {
      const fn = typeof path === 'function' ? path : model[path];
      return fn.apply(model, args);
    });
  },

  /** @see http://lodash.com/docs/#toArray */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toArray(): any[] {
    return Array.prototype.slice.call(this.models);
  },

  /** @see http://lodash.com/docs/#isEmpty */
  isEmpty(): boolean {
    return this.models.length === 0;
  },

  // ─── Attribute-based methods (lib's `attributeMethods` loop) ──────────────

  /** @see http://lodash.com/docs/#groupBy */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  groupBy(value: any, context?: any): Record<string, any[]> {
    const iteratee = attributeIteratee(value, context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any[]> = {};
    this.models.forEach((model, index) => {
      const key = iteratee(model, index, this.models);
      (out[key] = out[key] || []).push(model);
    });
    return out;
  },

  /** @see http://lodash.com/docs/#countBy */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  countBy(value: any, context?: any): Record<string, number> {
    const iteratee = attributeIteratee(value, context);
    const out: Record<string, number> = {};
    this.models.forEach((model, index) => {
      const key = iteratee(model, index, this.models);
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  },

  /** @see http://lodash.com/docs/#sortBy */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sortBy(value: any, context?: any): any[] {
    const iteratee = attributeIteratee(value, context);
    const mapped = this.models.map((model, index) => ({
      model,
      index,
      criteria: iteratee(model, index, this.models),
    }));
    // Stable ascending sort using lodash's `compareAscending` ordering:
    // normal values < NaN < null < undefined (ties broken by original index).
    mapped.sort((a, b) => {
      const ac = a.criteria;
      const bc = b.criteria;
      const order = compareAscending(ac, bc);
      return order !== 0 ? order : a.index - b.index;
    });
    return mapped.map((entry) => entry.model);
  },
};

Object.assign(CollectionBase.prototype, proto);

// Prototype-level default (mirrors lib's `CollectionBase.prototype.length = 0`).
// This MUST stay a prototype property — never an own-instance class field — so
// that `extend()`'s `protoProps` are not shadowed.
CollectionBase.prototype.length = 0;

/**
 * To create a {@link Collection} class of your own, extend `Bookshelf.Collection`.
 *
 * @method Collection.extend
 * @param {Object=} prototypeProperties
 * @param {Object=} classProperties
 * @returns {Function} Constructor for new `Collection` subclass.
 */
// Static, attached via namespace-merge so `CollectionBase.extend` is typed.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace CollectionBase {
  // any: extend is a dynamic Backbone-style static; see src/extend.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const extend: (...args: any[]) => any = extendFn;
}

export default CollectionBase;
