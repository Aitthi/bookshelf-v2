/**
 * BPromise — a native Promise subclass replacing bluebird.
 *
 * The `_ctx` bind mechanism:
 *   bluebird's `Promise.bind(ctx)` stores a context object so that all
 *   subsequent `.then`/`.tap`/`.map`/`.spread` callbacks are invoked with
 *   `this === ctx`. We replicate this by storing `_ctx` on each BPromise
 *   instance and carrying it forward every time we produce a new derived
 *   BPromise (via our overridden `then`). Callbacks that need the context
 *   call `fn.call(this._ctx, ...)` rather than plain `fn(...)`.
 *
 * Zero external dependencies — pure native ES2022 Promise subclass.
 */
export class BPromise<T> extends Promise<T> {
  /** Bound context forwarded to callbacks — replaces bluebird's Promise.bind. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _ctx: any = undefined;

  /**
   * Symbol.species ensures that built-in Promise methods such as `.catch`
   * and `.finally` (which call `this.constructor[Symbol.species]`) return a
   * BPromise rather than a plain Promise.
   */
  static override get [Symbol.species](): PromiseConstructor {
    // We need to return BPromise here; the cast is intentional.
    return BPromise as unknown as PromiseConstructor;
  }

  // ─── Override then to preserve BPromise type and carry _ctx ───────────────

  // biome-ignore lint/suspicious/noThenProperty: BPromise is a Promise subclass, overriding then is required
  override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined,
  ): BPromise<TResult1 | TResult2> {
    const ctx = this._ctx;

    // Wrap onfulfilled so it is called with the bound context.
    const wrappedFulfilled =
      onfulfilled != null
        ? function (this: unknown, value: T) {
            // any: ctx is intentionally opaque; using it as `this` is correct.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (onfulfilled as any).call(ctx, value) as TResult1 | PromiseLike<TResult1>;
          }
        : onfulfilled;

    // Wrap onrejected so it is also called with the bound context (bluebird
    // .bind parity — `.catch(function(){ this })` must see the bound ctx).
    const wrappedRejected =
      onrejected != null
        ? function (reason: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (onrejected as any).call(ctx, reason) as TResult2 | PromiseLike<TResult2>;
          }
        : onrejected;

    const next = super.then(
      wrappedFulfilled as Parameters<Promise<T>['then']>[0],
      wrappedRejected as Parameters<Promise<T>['then']>[1],
    ) as BPromise<TResult1 | TResult2>;
    // Carry context forward into the derived promise.
    next._ctx = ctx;
    return next;
  }

  // ─── Instance methods ─────────────────────────────────────────────────────

  /**
   * Runs a side-effect callback with the resolved value, waits for it if async,
   * then resolves with the ORIGINAL value (ignoring the callback's return).
   */
  tap(fn: (value: T) => unknown): BPromise<T> {
    const ctx = this._ctx;
    return this.then((v) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      BPromise.resolve((fn as any).call(ctx, v)).then(() => v),
    );
  }

  /**
   * Returns a new BPromise that stores `ctx` as `_ctx`, so all subsequent
   * `.then`/`.tap`/etc. callbacks are invoked with `this === ctx`.
   * Passing `undefined` (or no argument) resets the context.
   */
  bind(ctx?: unknown): BPromise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = this.then((v) => v) as BPromise<T>;
    next._ctx = ctx;
    return next;
  }

  /**
   * Replaces the resolution value with `value`.
   */
  return<U>(value: U): BPromise<U> {
    return this.then(() => value);
  }

  /** Alias for `.return`. */
  thenReturn<U>(value: U): BPromise<U> {
    return this.return(value);
  }

  /**
   * When the promise resolves to an array, spreads it as positional arguments
   * to `fn`, invoking with the bound context.
   */
  spread<U>(fn: (...args: unknown[]) => U): BPromise<U> {
    const ctx = this._ctx;
    return this.then((arr) => {
      const args = Array.isArray(arr) ? arr : [arr];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as any).apply(ctx, args) as U;
    });
  }

  /**
   * Node-style callback adapter. Calls `cb(null, value)` on success or
   * `cb(err)` on rejection, then returns the original BPromise so the chain
   * can continue.
   */
  asCallback(cb?: ((err: unknown, value?: T) => void) | null): BPromise<T> {
    if (cb) {
      // Run the callback as a side-effect; intentionally swallow its return.
      void super.then(
        (v) => { cb(null, v); },
        (e) => { cb(e); },
      );
    }
    return this;
  }

  /** Alias for `.asCallback`. */
  nodeify(cb?: ((err: unknown, value?: T) => void) | null): BPromise<T> {
    return this.asCallback(cb);
  }

  // ─── Static helpers ───────────────────────────────────────────────────────

  /**
   * Creates a BPromise already resolved to `undefined` with `ctx` set as the
   * bound context — entry point for bluebird-style `BPromise.bind(ctx).then(...)`.
   */
  static bind(ctx: unknown): BPromise<undefined> {
    const p = BPromise.resolve(undefined);
    p._ctx = ctx;
    return p;
  }

  /**
   * Wraps a (potentially sync-throwing) function so that:
   * - Sync throws become rejections.
   * - The original `this` and `arguments` are forwarded (non-arrow semantics).
   * - The return value is always a BPromise.
   */
  static method<A extends unknown[], R>(
    fn: (...args: A) => R,
  ): (...args: A) => BPromise<Awaited<R>> {
    return function (this: unknown, ...args: A): BPromise<Awaited<R>> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return BPromise.try(() => (fn as any).apply(this, args)) as BPromise<Awaited<R>>;
    };
  }

  /**
   * Executes `fn` synchronously; if it throws, returns a rejected BPromise.
   * The executor trick (`res(fn())`) ensures sync exceptions flow into the
   * rejection path automatically.
   */
  static try<R>(fn: () => R): BPromise<Awaited<R>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BPromise<Awaited<R>>((res) => res((fn as any)()));
  }

  /**
   * Concurrent map — all callbacks start immediately; order is preserved by
   * index, not by completion time.
   */
  static map<T, U>(
    items: Iterable<T>,
    fn: (item: T, index: number) => U | PromiseLike<U>,
  ): BPromise<U[]> {
    return BPromise.all([...items].map((item, i) => fn(item, i))) as BPromise<U[]>;
  }

  /**
   * Sequential map — each item is awaited before the next begins; order of
   * execution matches input order regardless of async durations.
   */
  static mapSeries<T, U>(
    items: Iterable<T>,
    fn: (item: T, index: number) => U | PromiseLike<U>,
  ): BPromise<U[]> {
    return BPromise.try(async () => {
      const results: U[] = [];
      let i = 0;
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await fn(item, i));
        i++;
      }
      return results;
    }) as BPromise<U[]>;
  }

  /**
   * Sequential fold — accumulates a single value by awaiting each step in order.
   */
  static reduce<T, A>(
    items: Iterable<T>,
    fn: (acc: A, item: T, index: number) => A | PromiseLike<A>,
    initial: A,
  ): BPromise<A> {
    return BPromise.try(async () => {
      let acc = initial;
      let i = 0;
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        acc = await fn(acc, item, i);
        i++;
      }
      return acc;
    }) as BPromise<A>;
  }

  /**
   * Resolves all promises in `...args` (all but the last), then calls the
   * final argument as a handler with the resolved values spread as positional
   * arguments.
   */
  static join(...args: unknown[]): BPromise<unknown> {
    const handler = args[args.length - 1] as (...vals: unknown[]) => unknown;
    const promises = args.slice(0, -1);
    return BPromise.all(promises).then((vals) => handler(...vals)) as BPromise<unknown>;
  }

  // ─── Override resolve/reject/all to return BPromise ──────────────────────

  static override resolve(): BPromise<void>;
  static override resolve<T>(value: T | PromiseLike<T>): BPromise<T>;
  static override resolve<T>(value?: T | PromiseLike<T>): BPromise<T> {
    return super.resolve(value as T) as BPromise<T>;
  }

  static override reject<T = never>(reason?: unknown): BPromise<T> {
    return super.reject<T>(reason) as BPromise<T>;
  }

  static override all<T>(values: Iterable<T | PromiseLike<T>>): BPromise<Awaited<T>[]> {
    return super.all<T>(values) as BPromise<Awaited<T>[]>;
  }
}
