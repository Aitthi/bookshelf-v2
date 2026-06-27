// Base Relation
// ---------------

import { result } from '../internal/lang';
import CollectionBase from './collection';
import extend from '../extend';

// any: relation type is a free-form string tag ('hasOne', 'hasMany', etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

/**
 * @class
 * @classdesc
 *
 * NOTE: `RelationBase` is a constructor FUNCTION (not an ES class) on purpose.
 * It exists to be subclassed via `src/extend.ts`, whose default `Child` invokes
 * `Parent.apply(this, arguments)`. ES classes cannot be invoked without `new`.
 * The function + prototype form mirrors `lib/base/relation.js` exactly.
 */
// Declaration-merged interface giving `RelationBase` instances a typed surface.
interface RelationBase {
  // any: type is a free-form string tag; dynamic at call-time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: any;
  // any: target is a Model or Collection constructor resolved at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any;
  targetTableName?: string;
  targetIdAttribute?: string;
  foreignKey?: string;
  // any: options are spread onto the instance; shape varies by relation type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * @param {string} type
 *   The type of relation to create. Can be one of 'hasOne', 'hasMany', 'belongsTo',
 *   'belongsToMany' or 'morphTo'.
 * @param {Model|Collection|null} Target
 *   The target model or collection for this relation or `null` in case the target
 *   model will be determined at a later time, as is the case of `morphTo` relations.
 * @param {object} options
 *   Additional properties to set on the relation object. These vary according to
 *   the type of relation.
 */
// any: `this` is typed via the merged interface above; dynamic at call-time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RelationBase(this: RelationBase, type: any, Target: any, options: AnyObj) {
  if (Target) {
    // any: result returns unknown; tableName/idAttribute are always strings at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.targetTableName = result(Target.prototype, 'tableName') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.targetIdAttribute = result(Target.prototype, 'idAttribute') as any;
  }

  Object.assign(this, { type, target: Target }, options);
}

/**
 * Creates a new relation instance. Used by the `Eager` relation when dealing with
 * `morphTo` cases, where the same relation is targeting multiple models.
 *
 * @return {RelationBase}
 */
// any: this.constructor is a dynamic constructor reference at runtime
RelationBase.prototype.instance = function instance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Target: any,
  options: AnyObj,
): RelationBase {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (this.constructor as any)(type, Target, options);
};

/**
 * Creates a new, unparsed model. Used internally in the eager fetch helper methods
 * because parsing may mutate information necessary for eager pairing.
 *
 * @param {object} data Model attributes to set on the new model.
 * @return {Model} The new model.
 */
// any: return type is a dynamic Model instance; shape varies by relation target
// eslint-disable-next-line @typescript-eslint/no-explicit-any
RelationBase.prototype.createModel = function createModel(data: AnyObj): any {
  if (this.target.prototype instanceof CollectionBase) {
    return new this.target.prototype.model(data)._reset();
  }
  return new this.target(data)._reset();
};

/**
 * Clones a relation. Required by {@link Model#fetchPage}.
 *
 * @todo Can probably be removed for a simpler approach, or just the `instance` method.
 * @return {RelationBase}
 */
RelationBase.prototype.clone = function clone(): RelationBase {
  // any: this.constructor is a dynamic constructor reference at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (this.constructor as any)(null, null, this);
};

/**
 * Extends the Base Relation.
 *
 * @method
 * @static
 */
// any: extend is a dynamic Backbone-style static; see src/extend.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(RelationBase as any).extend = extend;

// Static, attached via namespace-merge so `RelationBase.extend` is typed.
// Mirrors the pattern used in src/base/model.ts and src/base/collection.ts.
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace RelationBase {
  // any: extend is a dynamic Backbone-style static; see src/extend.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const extend: (...args: any[]) => any = (RelationBase as any).extend;
}

export default RelationBase;
