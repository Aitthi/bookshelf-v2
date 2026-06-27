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
  type SortOrder = 'ASC' | 'asc' | 'DESC' | 'desc';
  type Relations = string | WithRelatedQuery | (string | WithRelatedQuery)[];

  // Minimal Collection stub (Task 3 replaces it with the full surface).
  // `query()` overloads are required by the model-definition fixture
  // (`this.hasMany(...).query(cb)`), matching @types/bookshelf CollectionBase.
  class Collection<T extends Model<any>> {
    models: T[];
    query(): Knex.QueryBuilder;
    query(callback: (qb: Knex.QueryBuilder) => void): Collection<T>;
    query(...query: string[]): Collection<T>;
    query(query: Record<string, unknown>): Collection<T>;
  }

  abstract class Events<T> {
    on(event?: string, callback?: EventFunction<T>, context?: unknown): void;
    off(event?: string): void;
    trigger(event?: string, ...args: unknown[]): void;
    triggerThen(name: string, ...args: unknown[]): BPromise<unknown>;
    once(event: string, callback: EventFunction<T>, context?: unknown): void;
  }

  interface IModelBase {
    hasTimestamps?: boolean | string[] | undefined;
    tableName?: string | undefined;
  }

  interface ModelBase<T extends Model<any>> extends IModelBase {}
  abstract class ModelBase<T extends Model<any>> extends Events<T | Collection<T>> {
    idAttribute: string;
    id: unknown;
    attributes: Record<string, unknown>;

    constructor(attributes?: Record<string, unknown>, options?: ModelOptions);

    clear(): T;
    clone(): T;
    escape(attribute: string): string;
    format(attributes: Record<string, unknown>): Record<string, unknown>;
    get<V = unknown>(attribute: string): V;
    has(attribute: string): boolean;
    hasChanged(attribute?: string): boolean;
    isNew(): boolean;
    parse(response: object): object;
    previousAttributes<E = unknown>(): E;
    previous<V = unknown>(attribute: string): V;
    related<R extends Model<any>>(relation: string): R | Collection<R>;
    serialize<E = unknown>(options?: SerializeOptions): E;
    set(attribute?: Record<string, unknown>, options?: SetOptions): T;
    set(attribute: string, value?: unknown, options?: SetOptions): T;
    timestamp(options?: TimestampOptions): Record<string, unknown>;
    toJSON(options?: SerializeOptions): any;
    unset(attribute: string): T;
    omit<R extends object>(predicate: (value: unknown, key: string) => boolean): R;
    omit<R extends object>(...attributes: string[]): R;
    pick<R extends object>(predicate: (value: unknown, key: string) => boolean): R;
    pick<R extends object>(...attributes: string[]): R;
  }

  interface ModelSubclass {
    new (): Model<any>;
  }

  class Model<T extends Model<any>> extends ModelBase<T> {
    static collection<T extends Model<any>>(models?: T[], options?: CollectionOptions<T>): Collection<T>;
    static count(column?: string, options?: SyncOptions): BPromise<number | string>;
    /** @deprecated use TypeScript classes */
    static extend(prototypeProperties?: object, classProperties?: object): typeof Model;
    static fetchAll<T extends Model<any>>(): BPromise<Collection<T>>;
    /** @deprecated use `new` instead. */
    static forge<T>(attributes?: Record<string, unknown>, options?: ModelOptions): T;
    static where<T>(properties: Record<string, unknown>): T;
    static where<T>(
      key: string,
      operatorOrValue: string | number | boolean,
      valueIfOperator?: string | string[] | number | number[] | boolean,
    ): T;

    belongsTo<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): R;
    belongsToMany<R extends Model<any>>(
      target: { new (...args: any[]): R },
      table?: string,
      foreignKey?: string,
      otherKey?: string,
      foreignKeyTarget?: string,
      otherKeyTarget?: string,
    ): Collection<R>;
    count(column?: string, options?: SyncOptions): BPromise<number | string>;
    destroy(options?: DestroyOptions): BPromise<T>;
    fetch(options?: FetchOptions): BPromise<T>;
    fetchAll(options?: FetchAllOptions): BPromise<Collection<T>>;
    fetchPage(options?: FetchPageOptions): BPromise<Collection<T> & Pagination>;
    hasMany<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): Collection<R>;
    hasOne<R extends Model<any>>(target: { new (...args: any[]): R }, foreignKey?: string, foreignKeyTarget?: string): R;
    load(relations: Relations, options?: SyncOptions): BPromise<T>;
    morphMany<R extends Model<any>>(target: { new (...args: any[]): R }, name?: string, columnNames?: string[], morphValue?: string): Collection<R>;
    morphOne<R extends Model<any>>(target: { new (...args: any[]): R }, name?: string, columnNames?: string[], morphValue?: string): R;
    morphTo(name: string, columnNames?: string[], ...target: ModelSubclass[]): T;
    morphTo(name: string, ...target: ModelSubclass[]): T;
    orderBy(column: string, order?: SortOrder): T;

    query(): Knex.QueryBuilder;
    query(callback: (qb: Knex.QueryBuilder) => void): T;
    query(...query: string[]): T;
    query(query: Record<string, unknown>): T;

    refresh(options?: FetchOptions): BPromise<T>;
    resetQuery(): T;
    save(key?: string, val?: unknown, options?: SaveOptions): BPromise<T>;
    save(attrs?: Record<string, unknown>, options?: SaveOptions): BPromise<T>;
    through<R extends Model<any>>(
      interim: ModelSubclass,
      throughForeignKey?: string,
      otherKey?: string,
      throughForeignKeyTarget?: string,
      otherKeyTarget?: string,
    ): R;
    where(properties: Record<string, unknown>): T;
    where(
      key: string,
      operatorOrValue: string | number | boolean,
      valueIfOperator?: string | string[] | number | number[] | boolean,
    ): T;

    static NotFoundError: typeof import('./errors.js').NotFoundError;
    static NoRowsUpdatedError: typeof import('./errors.js').NoRowsUpdatedError;
    static NoRowsDeletedError: typeof import('./errors.js').NoRowsDeletedError;
  }

  interface ModelOptions {
    tableName?: string | undefined;
    hasTimestamps?: boolean | undefined;
    parse?: boolean | undefined;
  }
  interface FetchOptions extends SyncOptions {
    require?: boolean | undefined;
    columns?: string | string[] | undefined;
    withRelated?: (string | WithRelatedQuery)[] | undefined;
  }
  interface WithRelatedQuery {
    [index: string]: (query: Knex.QueryBuilder) => Knex.QueryBuilder | void;
  }
  interface FetchAllOptions extends FetchOptions {}
  interface FetchPageOptions extends FetchOptions {
    pageSize?: number;
    page?: number;
    limit?: number;
    offset?: number;
    disableCount?: boolean;
  }
  interface Pagination {
    pagination: { rowCount: number; pageCount: number; page: number; pageSize: number };
  }
  interface SaveOptions extends SyncOptions {
    method?: string | undefined;
    defaults?: string | undefined;
    patch?: boolean | undefined;
    require?: boolean | undefined;
    autoRefresh?: boolean | undefined;
  }
  interface DestroyOptions extends SyncOptions {
    require?: boolean | undefined;
  }
  interface SerializeOptions {
    shallow?: boolean | undefined;
    omitPivot?: boolean | undefined;
    visibility?: boolean | undefined;
  }
  interface SetOptions {
    unset?: boolean | undefined;
  }
  interface TimestampOptions {
    method?: string | undefined;
  }
  interface SyncOptions {
    transacting?: Knex.Transaction | undefined;
    debug?: boolean | undefined;
    withSchema?: string | undefined;
  }
  interface EventOptions {
    silent?: boolean | undefined;
  }
  interface EventFunction<T> {
    (model: T, attrs: Record<string, unknown>, options: Record<string, unknown>): BPromise<unknown> | void;
  }
  interface CollectionOptions<T> {
    comparator?: boolean | string | ((a: T, b: T) => number) | undefined;
  }
}
