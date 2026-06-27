// Eager Base
// ---------------

// The EagerBase provides a scaffold for handling with eager relation
// pairing, by queueing the appropriate related method calls with
// a database specific `eagerFetch` method, which then may utilize
// `pushModels` for pairing the models depending on the database need.

import { extend, isFunction, isString, map } from '../internal/lang';
import { BPromise } from '../internal/promise';

class EagerBase {
  // any: parent/parentResponse/target are ORM model/collection objects not yet typed in src/
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parent: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentResponse: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handled?: Record<string, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(parent: any, parentResponse: any, target: any) {
    this.parent = parent;
    this.parentResponse = parentResponse;
    this.target = target;
  }

  // fetch is defined on the prototype via Object.assign below, using BPromise.method.
  // Declared here for type-checking; no runtime code is emitted for `declare` fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declare fetch: (options: any) => BPromise<any>;

  // eagerFetch is implemented by database-specific subclasses (e.g. Eager in knex plugin).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  declare eagerFetch: (relationName: string, handled: any, options: any) => BPromise<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepWithRelated(withRelated: any): Record<string, () => void> {
    if (!Array.isArray(withRelated)) withRelated = [withRelated];
    const obj: Record<string, () => void> = {};
    for (let i = 0, l = withRelated.length; i < l; i++) {
      const related = withRelated[i];
      if (isString(related)) {
        obj[related] = () => {};
      } else {
        extend(obj, related as Record<string, () => void>);
      }
    }
    return obj;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pushModels(relationName: string, handled: any, response: any[], options: any): any {
    const models = this.parent;
    const relatedData = handled.relatedData;
    // any: relatedData is a dynamic ORM object; row type is unknown at this layer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const related = map(response, (row: any) => relatedData.createModel(row));
    return relatedData.eagerPair(relationName, related, models, options);
  }
}

// Assign `fetch` onto the prototype using BPromise.method, exactly mirroring the original
// `Promise.method(function(options){...})` placement via _.extend(EagerBase.prototype, {...}).
Object.assign(EagerBase.prototype, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch: BPromise.method(function (this: EagerBase, options: any) {
    const target = this.target;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.handled = {} as Record<string, any>;
    const handled = this.handled;
    const withRelated = this.prepWithRelated(options.withRelated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subRelated: Record<string, any[]> = {};

    // Internal flag to determine whether to set the ctor(s) on the `Relation` object.
    target._isEager = true;

    // Eager load each of the `withRelated` relation item, splitting on '.'
    // which indicates a nested eager load.
    for (const key in withRelated) {
      const related = key.split('.');
      const relationName = related[0];

      // Add additional eager items to an array, to load at the next level in the query.
      if (related.length > 1) {
        const relatedObj: Record<string, unknown> = {};
        subRelated[relationName] = subRelated[relationName] || [];
        relatedObj[related.slice(1).join('.')] = withRelated[key];
        subRelated[relationName].push(relatedObj);
      }

      // Only allow one of a certain nested type per-level.
      if (handled[relationName]) continue;

      if (!isFunction(target[relationName])) {
        throw new Error(`${relationName} is not defined on the model.`);
      }

      const relation = target[relationName]();

      handled[relationName] = relation;
    }

    // Delete the internal flag from the model.
    delete target._isEager;

    // Fetch all eager loaded models, loading them onto
    // an array of pending deferred objects, which will handle
    // all necessary pairing with parent objects, etc.
    const pendingDeferred: BPromise<unknown>[] = [];
    for (const relationName in handled) {
      pendingDeferred.push(
        this.eagerFetch(
          relationName,
          handled[relationName],
          extend({} as Record<string, unknown>, options as Record<string, unknown>, {
            isEager: true,
            withRelated: subRelated[relationName],
            _beforeFn: withRelated[relationName] || (() => {}),
          }),
        ),
      );
    }

    // Return a deferred handler for all of the nested object sync
    // returning the original response when these syncs & pairings are complete.
    return BPromise.all(pendingDeferred).return(this.parentResponse);
  }),
});

export default EagerBase;
