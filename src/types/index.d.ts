// ESM entry declaration for the `import` condition. NodeNext maps the JS
// specifier `./index.cjs` -> the declaration `./index.d.cts` (never reference
// `.d.cts` directly — not a valid JS extension). The option interfaces live
// INSIDE `declare namespace Bookshelf`, so they are NOT top-level exports of the
// cts — expose them as namespace-qualified aliases here.
import Bookshelf = require('./index.cjs');

export default Bookshelf;

export type Model<T extends Bookshelf.Model<any>> = Bookshelf.Model<T>;
export type Collection<T extends Bookshelf.Model<any>> = Bookshelf.Collection<T>;
export type ModelBase<T extends Bookshelf.Model<any>> = Bookshelf.ModelBase<T>;
export type CollectionBase<T extends Bookshelf.Model<any>> = Bookshelf.CollectionBase<T>;
export type Events<T> = Bookshelf.Events<T>;
export type BPromise<T> = Bookshelf.BPromise<T>;
export type ModelOptions = Bookshelf.ModelOptions;
export type FetchOptions = Bookshelf.FetchOptions;
export type FetchAllOptions = Bookshelf.FetchAllOptions;
export type FetchPageOptions = Bookshelf.FetchPageOptions;
export type Pagination = Bookshelf.Pagination;
export type WithRelatedQuery = Bookshelf.WithRelatedQuery;
export type SaveOptions = Bookshelf.SaveOptions;
export type DestroyOptions = Bookshelf.DestroyOptions;
export type SerializeOptions = Bookshelf.SerializeOptions;
export type SetOptions = Bookshelf.SetOptions;
export type TimestampOptions = Bookshelf.TimestampOptions;
export type SyncOptions = Bookshelf.SyncOptions;
export type CollectionOptions<T> = Bookshelf.CollectionOptions<T>;
export type CollectionAddOptions = Bookshelf.CollectionAddOptions;
export type CollectionFetchOptions = Bookshelf.CollectionFetchOptions;
export type CollectionFetchOneOptions = Bookshelf.CollectionFetchOneOptions;
export type CollectionSetOptions = Bookshelf.CollectionSetOptions;
export type CollectionCreateOptions = Bookshelf.CollectionCreateOptions;
export type PivotOptions = Bookshelf.PivotOptions;
export type EventOptions = Bookshelf.EventOptions;
export type EventFunction<T> = Bookshelf.EventFunction<T>;
export type SortOrder = Bookshelf.SortOrder;
export type Relations = Bookshelf.Relations;
export type ModelSubclass = Bookshelf.ModelSubclass;
export * as errors from './errors.js';
