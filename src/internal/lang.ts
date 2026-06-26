/**
 * Native replacements for the lodash subset used by the bookshelf ORM.
 * Zero external dependencies — hand-written TypeScript.
 */

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isFunction(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === 'function';
}

export function isObject(v: unknown): v is object {
  return v !== null && (typeof v === 'object' || typeof v === 'function');
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

export function isNull(v: unknown): v is null {
  return v === null;
}

export function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

export function isBuffer(v: unknown): v is Buffer {
  return Buffer.isBuffer(v);
}

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' || Array.isArray(v)) return (v as string | unknown[]).length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
}

export function has(obj: object, path: string): boolean {
  return  Object.hasOwn(obj, path);
}

// ---------------------------------------------------------------------------
// Equality
// ---------------------------------------------------------------------------

export function isEqual(a: unknown, b: unknown): boolean {
  // SameValueZero semantics: NaN equals NaN (lodash parity)
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => isEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => isEqual(a[k], b[k]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Clone
// ---------------------------------------------------------------------------

export function clone<T>(v: T): T {
  if (Array.isArray(v)) return [...v] as unknown as T;
  if (isPlainObject(v)) return Object.assign({}, v);
  return v;
}

export function cloneDeep<T>(v: T): T {
  if (Array.isArray(v)) return (v as unknown[]).map(cloneDeep) as unknown as T;
  if (isPlainObject(v)) {
    const result: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>)) {
      result[k] = cloneDeep((v as Record<string, unknown>)[k]);
    }
    return result as unknown as T;
  }
  // Buffer / Date / primitives — preserve by reference-copy as lodash does for ORM use cases
  return v;
}

// ---------------------------------------------------------------------------
// Object utilities
// ---------------------------------------------------------------------------

export function assign<T extends object, S extends object>(target: T, ...sources: S[]): T & S {
  return Object.assign(target, ...sources) as T & S;
}

// extend and assignIn are Object.assign-style (same as assign for plain objects)
export const extend = assign;
export const assignIn = assign;

export function defaults<T extends object>(target: T, ...sources: Partial<T>[]): T {
  for (const src of sources) {
    if (src == null) continue;
    for (const k of Object.keys(src) as (keyof T)[]) {
      if (target[k] === undefined) {
        target[k] = (src as T)[k];
      }
    }
  }
  return target;
}

export function defaultsDeep<T extends Record<string, unknown>>(
  target: T,
  ...sources: Record<string, unknown>[]
): T {
  for (const src of sources) {
    if (src == null) continue;
    for (const k of Object.keys(src)) {
      const srcVal = (src as Record<string, unknown>)[k];
      const tgtVal = (target as Record<string, unknown>)[k];
      if (isPlainObject(tgtVal) && isPlainObject(srcVal)) {
        defaultsDeep(tgtVal, srcVal as Record<string, unknown>);
      } else if (tgtVal === undefined) {
        (target as Record<string, unknown>)[k] = srcVal;
      }
    }
  }
  return target;
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const k of keys) {
    if (k in obj) result[k] = obj[k];
  }
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const omitSet = new Set(keys as string[]);
  const result = {} as Omit<T, K>;
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (!omitSet.has(k as string)) {
      (result as Record<string, unknown>)[k as string] = obj[k];
    }
  }
  return result;
}

export function omitBy<T extends Record<string, unknown>>(
  obj: T,
  pred: (v: unknown, k: string) => boolean,
): Partial<T> {
  const result: Partial<T> = {};
  for (const k of Object.keys(obj)) {
    if (!pred(obj[k], k)) {
      (result as Record<string, unknown>)[k] = obj[k];
    }
  }
  return result;
}

export function mapValues<T extends Record<string, unknown>, R>(
  obj: T,
  fn: (v: T[keyof T], k: string) => R,
): Record<string, R> {
  const result: Record<string, R> = {};
  for (const k of Object.keys(obj)) {
    result[k] = fn(obj[k] as T[keyof T], k);
  }
  return result;
}

export function mapKeys<T extends Record<string, unknown>>(
  obj: T,
  fn: (v: T[keyof T], k: string) => string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    result[fn(obj[k] as T[keyof T], k)] = obj[k];
  }
  return result;
}

export function result<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T,
): unknown {
  const val = obj[path];
  if (val === undefined) return defaultValue;
  if (typeof val === 'function') return (val as (this: unknown) => unknown).call(obj);
  return val;
}

// ---------------------------------------------------------------------------
// Collection utilities
// ---------------------------------------------------------------------------

export function each<T>(
  collection: T[] | Record<string, T>,
  fn: (v: T, k: string | number) => void,
): void {
  if (Array.isArray(collection)) {
    collection.forEach((v, i) => {
      fn(v, i);
    });
  } else {
    for (const k of Object.keys(collection)) {
      fn(collection[k], k);
    }
  }
}

export const forEach = each;

export function map<T, R>(
  collection: T[] | Record<string, T>,
  fn: (v: T, k: string | number) => R,
): R[] {
  if (Array.isArray(collection)) {
    return collection.map((v, i) => fn(v, i));
  }
  return Object.keys(collection).map((k) => fn(collection[k], k));
}

export function flatMap<T, R>(
  collection: T[] | Record<string, T>,
  fn: (v: T, k: string | number) => R | R[],
): R[] {
  return (map(collection, fn) as (R | R[])[]).flat() as R[];
}

export function reduce<T, R>(
  collection: T[] | Record<string, T>,
  fn: (acc: R, v: T, k: string | number) => R,
  initial: R,
): R {
  if (Array.isArray(collection)) {
    return collection.reduce((acc, v, i) => fn(acc, v, i), initial);
  }
  let acc = initial;
  for (const k of Object.keys(collection)) {
    acc = fn(acc, collection[k], k);
  }
  return acc;
}

export function filter<T>(
  collection: T[] | Record<string, T>,
  pred: (v: T, k: string | number) => boolean,
): T[] {
  if (Array.isArray(collection)) {
    return collection.filter((v, i) => pred(v, i));
  }
  return Object.entries(collection)
    .filter(([k, v]) => pred(v, k))
    .map(([, v]) => v);
}

export function reject<T>(
  collection: T[] | Record<string, T>,
  pred: (v: T, k: string | number) => boolean,
): T[] {
  return filter(collection, (v, k) => !pred(v, k));
}

export function find<T>(
  collection: T[] | Record<string, T>,
  pred: (v: T, k: string | number) => boolean,
): T | undefined {
  if (Array.isArray(collection)) {
    return collection.find((v, i) => pred(v, i));
  }
  for (const k of Object.keys(collection)) {
    if (pred(collection[k], k)) return collection[k];
  }
  return undefined;
}

/** Mutates arr, removing items where pred returns true. Returns removed items (lodash semantics). */
export function remove<T>(arr: T[], pred: (v: T, i: number) => boolean): T[] {
  const removed: T[] = [];
  let i = arr.length;
  while (i--) {
    if (pred(arr[i], i)) {
      removed.unshift(...arr.splice(i, 1));
    }
  }
  return removed;
}

export function groupBy<T>(
  collection: T[],
  fn: (v: T) => string,
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const v of collection) {
    const k = fn(v);
    result[k] ??= [];
    result[k].push(v);
  }
  return result;
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function flatten<T>(arr: (T | T[])[]): T[] {
  return arr.flat() as T[];
}

export function drop<T>(arr: T[], n = 1): T[] {
  return arr.slice(n);
}

// ---------------------------------------------------------------------------
// Function utilities
// ---------------------------------------------------------------------------

export function bind<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ctx: unknown,
): (...args: Parameters<T>) => ReturnType<T> {
  return fn.bind(ctx) as (...args: Parameters<T>) => ReturnType<T>;
}

export function once<T extends (...args: unknown[]) => unknown>(fn: T): T {
  let called = false;
  let value: ReturnType<T>;
  return function (this: unknown, ...args: unknown[]) {
    if (!called) {
      called = true;
      value = fn.apply(this, args) as ReturnType<T>;
    }
    return value;
  } as unknown as T;
}

export function negate<T extends unknown[]>(
  pred: (...args: T) => boolean,
): (...args: T) => boolean {
  return (...args: T) => !pred(...args);
}

export function identity<T>(v: T): T {
  return v;
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

export function startsWith(str: string, target: string, position = 0): boolean {
  return str.startsWith(target, position);
}

export function camelCase(str: string): string {
  return str
    .replace(/[_\-\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toLowerCase());
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: legacy name matching lodash
export function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Module-level counter for uniqueId
let _uidCounter = 0;

export function uniqueId(prefix = ''): string {
  return `${prefix}${++_uidCounter}`;
}
