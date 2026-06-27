// `export =` modules may not mix ESM VALUE imports. Both imports below are
// TYPE-ONLY, which IS permitted alongside `export =` in declaration files.
// knex v3 exposes the `Knex` namespace+interface as a named type export, giving
// both the instance type (`Knex`) and namespace members (`Knex.QueryBuilder`,
// `Knex.Transaction`).
import type { Knex } from 'knex';
import type { BPromise } from './internal/promise.js';

export = Bookshelf;

declare function Bookshelf(knex: Knex): Bookshelf;

interface Bookshelf {
  VERSION: string;
  knex: Knex;
  Model: typeof Bookshelf.Model;
  Collection: typeof Bookshelf.Collection;
}

declare namespace Bookshelf {
  class Model<T extends Model<any>> {
    constructor(attributes?: Record<string, unknown>, options?: ModelOptions);
    get tableName(): string;
  }
  class Collection<T extends Model<any>> {
    constructor(models?: T[]);
    models: T[];
  }
  interface ModelOptions {
    tableName?: string | undefined;
    hasTimestamps?: boolean | undefined;
    parse?: boolean | undefined;
  }
}
