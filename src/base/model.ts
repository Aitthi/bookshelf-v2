// Base Model
// ---------------

import { inherits } from 'node:util';
import {
  uniqueId,
  clone,
  isEqual,
  isEmpty,
  has,
  mapValues,
  omitBy,
  mapKeys,
  pick,
  omit,
  escape,
  isNull,
} from '../internal/lang';
import Events from './events';
import { PIVOT_PREFIX, DEFAULT_TIMESTAMP_KEYS } from '../constants';
import extendFn from '../extend';

// any: attribute bags are inherently dynamic in the ORM layer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/**
 * @class
 * @classdesc
 * @extends Events
 * @inheritdoc
 * @description
 *
 * The "ModelBase" is similar to the 'Active Model' in Rails, it defines a
 * standard interface from which other objects may inherit.
 */
class ModelBase extends Events {
  /**
   * This static method allows you to create your own Model classes by extending {@link Model bookshelf.Model}.
   *
   * @method Model.extend
   * @param {Object} [prototypeProperties]
   * @param {Object} [classProperties]
   * @returns {Function} Constructor for new Model subclass.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static extend: (...args: any[]) => any = extendFn;

  // any: per-instance attribute bags; not statically typed at this layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes!: AnyObj;
  _previousAttributes!: AnyObj;
  relations!: AnyObj;
  cid!: string;
  // any: id can be string | number | null | undefined depending on schema
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any;
  changed!: AnyObj;

  /**
   * @member {(number|string)}
   */
  // Declared here for TypeScript; value is set on the prototype below (prototype property, not own)
  declare idAttribute: string;

  /**
   * @member {Object|Null}
   * @default null
   */
  declare defaults: AnyObj | null;

  /**
   * @type {boolean}
   * @default true
   */
  declare requireFetch: boolean;

  /**
   * @member {Boolean|Array}
   * @default false
   */
  declare hasTimestamps: boolean | string[];

  /**
   * @member {null|Array}
   * @default null
   */
  declare hidden: string[] | null;

  /**
   * @member {null|Array}
   * @default null
   */
  declare visible: string[] | null;

  tableName?: string;

  // any: pivot is a related model object, not typed at this layer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pivot?: any;

  constructor(attributes?: AnyObj, options?: AnyObj) {
    super();
    let attrs = attributes || {};
    options = options || {};
    this.attributes = Object.create(null);
    this._previousAttributes = {};
    this._reset();
    this.relations = {};
    this.cid = uniqueId('c');

    if (options.parse) attrs = this.parse(attrs, options) || {};
    if (options.visible) this.visible = clone(options.visible);
    if (options.hidden) this.hidden = clone(options.hidden);
    if (typeof options.requireFetch === 'boolean') this.requireFetch = options.requireFetch;
    if (options.tableName) this.tableName = options.tableName;
    if (typeof options.hasTimestamps === 'boolean' || Array.isArray(options.hasTimestamps)) {
      this.hasTimestamps = options.hasTimestamps;
    }

    this.set(attrs, options);
    this.initialize(attributes, options);
  }

  /**
   * @method ModelBase#initialize
   * @description
   *
   * Called by the {@link Model Model constructor} when creating a new instance.
   * Override this function to add custom initialization, such as event listeners.
   *
   * @param {Object} attributes
   * @param {Object=} options
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialize(..._args: any[]): void {}

  /**
   * @method
   * @private
   * @description
   *
   * Converts the timestamp keys to actual Date objects.
   *
   * @returns {Model} The model that called this.
   */
  formatTimestamps(): this {
    if (!this.hasTimestamps) return this;

    this.getTimestampKeys().forEach((key) => {
      if (this.get(key)) this.set(key, new Date(this.get(key) as string | number | Date));
    });

    return this;
  }

  /**
   * @method
   * @description  Get the current value of an attribute from the model.
   * @example      note.get("title");
   *
   * @param {string} attribute - The name of the attribute to retrieve.
   * @returns {mixed} Attribute value.
   */
  get(attr: string): unknown {
    return this.attributes[attr];
  }

  /**
   * @method
   * @private
   * @description
   *
   * Returns the model's {@link Model#idAttribute idAttribute} after applying the
   * model's {@link Model#parse parse} method to it.
   *
   * @returns {mixed} Whatever value the parse method returns.
   */
  parsedIdAttribute(): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsedAttributes = this.parse({ [this.idAttribute]: null } as any);
    return parsedAttributes && (Object.keys(parsedAttributes)[0] as string | undefined);
  }

  /**
   * @method
   * @description  Set a hash of attributes (one or many) on the model.
   *
   * @param {string|Object} attribute
   * @param {mixed=} value
   * @param {Object=} options
   * @returns {Model} This model.
   */
  set(key: string | AnyObj | null, val?: unknown, options?: AnyObj): this {
    if (key == null) return this;
    let attrs: AnyObj;

    // Handle both `"key", value` and `{key: value}` -style arguments.
    if (typeof key === 'object') {
      attrs = key;
      options = val as AnyObj | undefined;
    } else {
      attrs = {};
      attrs[key] = val;
    }
    options = clone(options) || {};

    // Extract attributes and options.
    const unset = options.unset;
    const current = this.attributes;
    const prev = this.previousAttributes();

    // Check for changes of `id`.
    if (this.idAttribute in attrs) {
      this.id = attrs[this.idAttribute];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if ((this.parsedIdAttribute() as any) in attrs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.id = attrs[this.parsedIdAttribute() as any];
    }

    // For each `set` attribute, update or delete the current value.
    for (const attr in attrs) {
      val = attrs[attr];
      if (!isEqual(prev[attr], val)) {
        this.changed[attr] = val;
      } else {
        delete this.changed[attr];
      }
      if (unset) {
        delete current[attr];
      } else {
        current[attr] = val;
      }
    }
    return this;
  }

  /**
   * @method
   * @description
   *
   * Checks for the existence of an id to determine whether the model is
   * considered "new".
   */
  isNew(): boolean {
    return this.id == null;
  }

  /**
   * @method
   * @description
   *
   * Return a copy of the model's {@link Model#attributes attributes} for JSON
   * stringification.
   *
   * @param {Object} [options]
   * @returns {Object} Serialized model as a plain object.
   */
  serialize(options?: AnyObj): AnyObj | null {
    if (typeof options !== 'object' || options === null) options = {};
    if (options.visibility === null || options.visibility === undefined) options.visibility = true;

    if (options.omitNew && this.isNew()) return null;

    let attributes: AnyObj = Object.assign({}, this.attributes);

    if (options.shallow !== true) {
      // any: relation objects are untyped ORM entities at this layer
      let relations: AnyObj = mapValues(
        this.relations as Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (relation: any) => (relation.toJSON ? relation.toJSON(options) : relation),
      ) as AnyObj;
      relations = omitBy(relations as Record<string, unknown>, isNull) as AnyObj;

      const pivot = this.pivot && !options.omitPivot && this.pivot.attributes;
      // any: pivot attributes are dynamic ORM data; key transform via PIVOT_PREFIX
      const pivotAttributes: AnyObj = pivot
        ? (mapKeys(pivot as Record<string, unknown>, (_value, key) => `${PIVOT_PREFIX}${key}`) as AnyObj)
        : {};

      attributes = Object.assign(attributes, relations, pivotAttributes);
    }

    if (options.visibility) {
      const visible = options.visible || this.visible;
      const hidden = options.hidden || this.hidden;

      if (visible) attributes = pick(attributes as Record<string, unknown>, visible) as AnyObj;
      if (hidden) attributes = omit(attributes as Record<string, unknown>, hidden) as AnyObj;
    }

    return attributes;
  }

  /**
   * @method
   * @description
   *
   * Called automatically by {@link
   * https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#toJSON()_behavior
   * `JSON.stringify`}. To customize serialization, override {@link
   * Model#serialize serialize}.
   *
   * @param {Object=} options Options passed to {@link Model#serialize}.
   */
  toJSON(options?: AnyObj): AnyObj | null {
    return this.serialize(options);
  }

  /**
   * @method
   * @private
   * @returns String representation of the object.
   */
  toString(): string {
    return '[Object Model]';
  }

  /**
   * @method
   * @description Get the HTML-escaped value of an attribute.
   * @param {string} attribute The attribute to escape.
   * @returns {string} HTML-escaped value of an attribute.
   */
  escape(key: string): string {
    const val = this.get(key);
    // lodash _.escape coerces null/undefined to ''; replicate that here
    return escape(val == null ? '' : String(val));
  }

  /**
   * @method
   * @description
   * Returns `true` if the attribute contains a value that is not null or undefined.
   * @param {string} attribute The attribute to check.
   * @returns {Boolean}
   */
  has(attr: string): boolean {
    return this.get(attr) != null;
  }

  /**
   * @method
   * @description
   *
   * The `parse` method is called whenever a {@link Model model}'s data is
   * returned in a {@link Model#fetch fetch} call.
   *
   * @param {Object} attributes Hash of attributes to parse.
   * @returns {Object} Parsed attributes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(attrs: any, _options?: any): any {
    return attrs;
  }

  /**
   * @method
   * @description
   *
   * Remove an attribute from the model.
   *
   * @param attribute Attribute to unset.
   * @returns {Model} This model.
   */
  unset(attr: string, options?: AnyObj): this {
    return this.set(attr, void 0, Object.assign({}, options, { unset: true }));
  }

  /**
   * @method
   * @description Clear all attributes on the model.
   * @returns {Model} This model.
   */
  clear(options?: AnyObj): this {
    const undefinedKeys = mapValues(this.attributes as Record<string, unknown>, () => undefined);
    return this.set(undefinedKeys as AnyObj, Object.assign({}, options, { unset: true }));
  }

  /**
   * @method
   * @description
   *
   * The `format` method is used to modify the current state of the model before
   * it is persisted to the database.
   *
   * @param {Object} attributes The attributes to be converted.
   * @returns {Object} Formatted attributes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format(attrs: any): any {
    return attrs;
  }

  /**
   * @method
   * @description
   *
   * This method returns a specified relation loaded on the relations hash on
   * the model, or calls the associated relation method and adds it to the
   * relations hash if one exists and has not yet been loaded.
   *
   * @param {string} name The name of the relation to retrieve.
   * @returns {Model|Collection|undefined}
   */
  related(name: string): unknown {
    return (
      this.relations[name] ||
      // any: dynamic method lookup on model instance for relation methods (Backbone-style)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((this as any)[name] ? (this.relations[name] = (this as any)[name]()) : void 0)
    );
  }

  /**
   * @method
   * @description
   * Returns a new instance of the model with identical {@link
   * Model#attributes attributes}, including any relations from the cloned
   * model.
   *
   * @returns {Model} Cloned instance of this model.
   */
  clone(): this {
    // any: this.constructor is typed as Function; cast needed to new() it dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = new (this.constructor as any)(this.attributes) as this;
    Object.assign(
      model.relations,
      mapValues(this.relations as Record<string, unknown>, (r) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r as any).clone(),
      ),
    );
    model._previousAttributes = clone(this._previousAttributes);
    model.changed = clone(this.changed);
    return model;
  }

  /**
   * @method
   * @private
   * @description
   *
   * Returns the method that will be used on save, either 'update' or 'insert'.
   *
   * @returns {string} Either `'insert'` or `'update'`.
   */
  saveMethod(options?: AnyObj): string {
    if (!options) options = {};

    if (options.patch) {
      if (options.method === 'insert')
        throw new TypeError(`Cannot accept incompatible options: method=insert, patch=${options.patch}`);

      options.method = 'update';
    }
    return ((options.patch && 'update') || options.method) == null
      ? this.isNew()
        ? 'insert'
        : 'update'
      : (options.method as string).toLowerCase();
  }

  /**
   * @method
   * @private
   * @description
   *
   * Returns the automatic timestamp key names set on this model.
   *
   * @returns {Array<string>} The two timestamp key names.
   */
  getTimestampKeys(): string[] {
    return Array.isArray(this.hasTimestamps) ? this.hasTimestamps : DEFAULT_TIMESTAMP_KEYS;
  }

  /**
   * @method
   * @description
   * Automatically sets the timestamp attributes on the model.
   *
   * @param {Object=} options
   * @returns {Object} A hash of timestamp attributes that were set.
   */
  timestamp(options?: AnyObj): AnyObj {
    if (!this.hasTimestamps) return {};

    const now =
      (options || {}).date ? new Date((options as AnyObj).date as string | number | Date) : new Date();
    const attributes: AnyObj = {};
    const method = this.saveMethod(options);
    const timestampKeys = this.getTimestampKeys();
    const createdAtKey = timestampKeys[0];
    const updatedAtKey = timestampKeys[1];
    const isNewModel = method === 'insert';

    if (updatedAtKey && (isNewModel || this.hasChanged()) && !this.hasChanged(updatedAtKey)) {
      attributes[updatedAtKey] = now;
    }

    if (createdAtKey && isNewModel && !this.hasChanged(createdAtKey)) {
      attributes[createdAtKey] = now;
    }

    // Mutate options in place (_.extend semantics) to add silent:true, then pass to set
    this.set(attributes, Object.assign(options || {}, { silent: true }));

    return attributes;
  }

  /**
   * @method
   * @description
   *
   * Returns `true` if any {@link Model#attributes attribute} has changed since
   * the last {@link Model#fetch fetch} or {@link Model#save save}.
   *
   * @param {string=} attribute A specific attribute to check for changes.
   * @returns {Boolean}
   */
  hasChanged(attr?: string | null): boolean {
    if (attr == null) return !isEmpty(this.changed);
    return has(this.changed, attr);
  }

  /**
   * @method
   * @description
   *
   * Returns the value of an attribute like it was before the last change.
   *
   * @param {string} attribute The attribute to check.
   * @returns {mixed} The previous value.
   */
  previous(attribute: string): unknown {
    return this._previousAttributes[attribute];
  }

  /**
   * @method
   * @description
   *
   * Returns a copy of the {@link Model model}'s attributes like they were before
   * the last change.
   *
   * @returns {Object}
   */
  previousAttributes(): AnyObj {
    return clone(this._previousAttributes) || {};
  }

  /**
   * @method
   * @private
   * @description
   *
   * Resets the `changed` hash for the model.
   *
   * @returns {Model} This model.
   */
  _reset(): this {
    this.changed = Object.create(null);
    return this;
  }

  /**
   * @method ModelBase#pick
   * @see http://lodash.com/docs/#pick
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pick(...args: any[]): AnyObj {
    // Flatten varargs/array to match lodash's _.pick(obj, ...keys | [keys]) calling conventions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys = ([] as any[]).concat(...args) as string[];
    return pick(this.attributes as Record<string, unknown>, keys) as AnyObj;
  }

  /**
   * @method ModelBase#omit
   * @see http://lodash.com/docs/#omit
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  omit(...args: any[]): AnyObj {
    // Flatten varargs/array to match lodash's _.omit(obj, ...keys | [keys]) calling conventions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys = ([] as any[]).concat(...args) as string[];
    return omit(this.attributes as Record<string, unknown>, keys) as AnyObj;
  }
}

// Set prototype defaults (mirrors the original ModelBase.prototype.xxx = value pattern,
// keeping these as prototype properties rather than own-instance properties).
ModelBase.prototype.idAttribute = 'id';
ModelBase.prototype.defaults = null;
ModelBase.prototype.requireFetch = true;
ModelBase.prototype.hasTimestamps = false;
ModelBase.prototype.hidden = null;
ModelBase.prototype.visible = null;

// Call inherits to set ModelBase.super_ = Events and maintain compatibility with
// Backbone/bookshelf extend() chains that inspect __super__. The prototype chain
// is already established by `class extends Events`; this call is additive only.
inherits(ModelBase, Events);

export default ModelBase;
