// EagerRelation
// ---------------

import { omit, groupBy, mapValues, flatten, assign, extend, result, isFunction, uniq, map, reduce } from './internal/lang';
import Helpers from './helpers';
import { BPromise } from './internal/promise';
import EagerBase from './base/eager';

// any: models is array of ORM model instances with dynamic .get() method
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getAttributeUnique = (models: any[], attribute: string): unknown[] =>
  uniq(map(models, (m: any) => m.get(attribute)));

// An `EagerRelation` object temporarily stores the models from an eager load,
// and handles matching eager loaded objects with their parent(s). The
// `tempModel` is only used to retrieve the value of the relation method, to
// know the constraints for the eager query.
class EagerRelation extends EagerBase {
  // Handles an eager loaded fetch, passing the name of the item we're fetching
  // for, and any options needed for the current fetch.
  // Arrow function required: EagerBase declares eagerFetch as an instance property (TS2425)
  // any: handled is a dynamic ORM relation object; options is a dynamic fetch-options bag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eagerFetch = (relationName: string, handled: any, options: any): any => {
    const relatedData = handled.relatedData;

    // skip eager loading for rows where the foreign key isn't set
    if (relatedData.parentFk === null) return;

    if (relatedData.type === 'morphTo') {
      return this.morphToFetch(relationName, relatedData, options);
    }

    return handled
      .sync(Object.assign({}, options, {parentResponse: this.parentResponse}))
      .select()
      // any: response is a raw DB response array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .tap((response: any) =>
        this._eagerLoadHelper(response, relationName, handled, omit(options, ['parentResponse'] as (keyof typeof options)[]))
      );
  }

  // Special handler for the eager loaded morph-to relations, this handles the
  // fact that there are several potential models that we need to be fetching
  // against.  pairing them up onto a single response for the eager loading.
  // any: relatedData is a dynamic ORM relatedData object; options is a dynamic fetch-options bag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  morphToFetch(relationName: string, relatedData: any, options: any): any {
    const columnNames: string[] = relatedData.columnNames || [];
    const morphName: string = relatedData.morphName;
    const typeColumn = columnNames[0] === undefined ? `${morphName}_type` : columnNames[0];
    const idColumn = columnNames[1] === undefined ? `${morphName}_id` : columnNames[1];

    // any: parentsByType values are arrays of ORM model instances grouped by morph type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parentsByType: Record<string, any[]> = groupBy(this.parent, (model: any) => {
      const type = model.get(typeColumn);

      if (!type)
        throw new Error("The target polymorphic model could not be determined because it's missing the type attribute");

      return type;
    });

    // mapValues iterates object values with key; lang.mapValues supports plain objects
    // any: TargetByType values are ORM Model constructors resolved from morph candidates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const TargetByType: Record<string, any> = mapValues(
      parentsByType as Record<string, unknown>,
      (_parents: unknown, type: string) => Helpers.morphCandidate(relatedData.candidates, type)
    );

    // Object.entries used to iterate parentsByType (a plain object): lang.map(object) would
    // type the key as string|number, but we need a plain string to index TargetByType.
    return BPromise.all(
      Object.entries(parentsByType).map(([type, parents]) => {
        // any: Target is a dynamic ORM Model constructor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Target: any = TargetByType[type];
        const idAttribute = result(Target.prototype as Record<string, unknown>, 'idAttribute');
        const ids = getAttributeUnique(parents, idColumn);

        // Remove `query` from options to not send the same query to all candidates
        return Target.query('whereIn', idAttribute, ids)
          .sync(assign({} as Record<string, unknown>, options, {query: undefined}))
          .select()
          // any: response is a raw DB response array
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .tap((response: any) => {
            const clone = relatedData.instance('morphTo', Target, {
              morphName,
              columnNames,
              morphValue: type
            });
            return this._eagerLoadHelper(response, relationName, {relatedData: clone}, options);
          });
      })
    // Rewrite of .then(_.flatten): flatten is passed as callback but lang.flatten must be called explicitly
    ).then((arr: any[]) => flatten(arr));
  }

  // Handles the eager load for both the `morphTo` and regular cases.
  // any: response is raw DB response; handled is a dynamic ORM relation; options is a dynamic fetch-options bag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _eagerLoadHelper(response: any[], relationName: string, handled: any, options: any): any {
    const relatedData = handled.relatedData;
    const isEmptyHasOne = response.length === 0 && relatedData.type === 'hasOne';
    const relatedModels = isEmptyHasOne ? [] : this.pushModels(relationName, handled, response, options);

    return BPromise.try(() => {
      // If there is a response, fetch additional nested eager relations, if any.
      if (response.length > 0 && options.withRelated) {
        const relatedModel = relatedData.createModel();

        // If this is a `morphTo` relation, we need to do additional processing
        // to ensure we don't try to load any relations that don't look to exist.
        if (relatedData.type === 'morphTo') {
          const withRelated = this._filterRelated(relatedModel, options);
          if (withRelated.length === 0) return;
          options = extend({} as Record<string, unknown>, options, {withRelated: withRelated});
        }

        return new EagerRelation(relatedModels, response, relatedModel).fetch(options).return(response);
      }
    }).tap(() => {
      // any: model is a dynamic ORM model instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return BPromise.map(relatedModels, (model: any) => model.triggerThen('fetched', model, model.attributes, options));
    });
  }

  // Filters the `withRelated` on a `morphTo` relation, to ensure that only valid
  // relations are attempted for loading.
  // any: relatedModel is a dynamic ORM model instance; options is a dynamic fetch-options bag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _filterRelated(relatedModel: any, options: any): any[] {
    // By this point, all withRelated should be turned into a hash, so it should
    // be fairly simple to process by splitting on the dots.
    // any: memo is accumulator array; val is a withRelated hash entry keyed by relation path
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return reduce(
      options.withRelated as any[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (memo: any[], val: any) {
        for (const key in val) {
          const seg = key.split('.')[0];
          if (isFunction(relatedModel[seg])) memo.push(val);
        }
        return memo;
      },
      [] as any[]
    );
  }
}

export default EagerRelation;
