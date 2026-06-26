# bookshelfv2 TypeScript Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `re-bookshelf` ORM (~6,366 lines of JS in `lib/`) to strict TypeScript with zero runtime dependencies, dual ESM/CJS output, bundled opt-in plugins, while preserving the existing public API.

**Architecture:** Keep the original two-layer structure (`base/` framework-agnostic classes + knex-aware top layer). Replace all four runtime deps (`bluebird`, `lodash`, `inflection`, `create-error`) with hand-written `src/internal/*` modules. Public async methods return a hand-written `BPromise` (a native `Promise` subclass that re-adds `.tap/.bind/.map/.return/.spread/.asCallback`) so consumer code keeps working. Port bottom-up, module by module, keeping the existing test suite green as an oracle.

**Tech Stack:** TypeScript (strict), SWC (`@swc/cli` + `@swc/core`) for transpile, `tsc` for `.d.ts` + typecheck, Vitest for tests, **Biome** (lint + format, replaces ESLint + Prettier), GitHub Actions. Package manager: **pnpm 9**. Node **>=22** dev / **>=16** consumer floor.

## Global Constraints

- Package name: **`bookshelfv2`** — only renamed in Phase 6 (interim entry stays as `bookshelf.js` until dual build exists).
- **Zero runtime dependencies** — final `package.json` `dependencies: {}`. Only peer dep: `knex >=3.1.0`.
- **No `bluebird`, `lodash`, `inflection`, `create-error`** — replaced by `src/internal/*`. `BPromise` is our own native-`Promise` subclass, NOT bluebird.
- **TypeScript `strict: true`** — `any` only at dynamic `extend`/mixin plumbing, each occurrence commented.
- **Public API preserved** — method names, behaviour, and bluebird-compatible return-value methods (`.tap`, `.bind`, `.map`, `.return`/`.thenReturn`, `.spread`, `.asCallback`/`.nodeify`) all keep working.
- **`map` vs `mapSeries` semantics**: `BPromise.map` is concurrent (default Infinity, no concurrency limit needed); `BPromise.mapSeries` runs sequentially in order. Never substitute one for the other.
- **Build does NOT bundle** — SWC emits a 1:1 file mirror of `src/` so `plugins/*` stay tree-shakeable.
- Spec reference: `docs/superpowers/specs/2026-06-26-bookshelfv2-typescript-port-design.md`.
- TDD throughout: failing test → run-fail → minimal impl → run-pass → commit. Commit frequently.

---

## File Structure

```
src/
  index.ts             # entry: default export factory + named re-exports
  constants.ts         # CshHas / CshCount sentinels etc.
  errors.ts            # native Error subclasses (was create-error)
  extend.ts            # prototype extend helper (was lib/extend.js)
  helpers.ts           # fetchPage, formatting helpers
  sync.ts
  eager.ts
  relation.ts
  collection.ts
  model.ts
  bookshelf.ts         # factory wiring everything
  base/
    events.ts model.ts collection.ts relation.ts eager.ts
  internal/
    promise.ts         # BPromise subclass + static helpers (was bluebird)
    lang.ts            # ~35 utilities (was lodash)
    inflection.ts      # pluralize/singularize/camelize/underscore/capitalize (was inflection)
  plugins/
    virtuals.ts case-converter.ts   # bundled opt-in, tree-shakeable

test/                  # ported to Vitest/TS (mirrors current test/ layout)
.swcrc  tsconfig.json  vitest.config.ts  eslint.config.js
.github/workflows/ci.yml
```

**Runtime-dep inventory (verified against `lib/` via grep — the authoritative list for Phase 2):**

- **bluebird statics used:** `Promise.method` (21×), `Promise.all` (8×), `Promise.bind` (6×), `Promise.try` (5×), `Promise.map` (4×), `Promise.resolve` (1×), `Promise.rejected` (1×), `Promise.reduce` (1×), `Promise.mapSeries` (1×), `Promise.join` (1×). **Instance methods used:** `.tap` (17×), `.return`/`.thenReturn` (13×), `.bind`, `.map`, `.spread`, `.asCallback`/`.nodeify`. `Promise.props` is **NOT used** — do not implement.
- **lodash functions used:** `extend`(21) `clone`(19) `result`(15) `omit`(8) `isString`(7) `isFunction`(7) `map`(6) `each`(5) `mapValues`(4) `cloneDeep`(4) `mapKeys`(3) `isPlainObject`(3) `isEmpty`(3) `filter`(3) `assignIn`(3) `reduce`(2) `pick`(2) `omitBy`(2) `isObject`(2) `isNull`(2) `isBuffer`(2) `identity`(2) `groupBy`(2) `find`(2) `drop`(2) `bind`(2) `uniqueId` `uniq` `startsWith` `remove` `reject` `once` `negate` `isNil` `isEqual` `has` `flatten` `flatMap` `escape` `defaultsDeep` `defaults` `camelCase` `assign`. Plus **chain form `_(...)`** at `sync.js:133`, `relation.js:370`, `base/collection.js:648` (rewrite these to native imperative — do NOT build a chain engine).

---

## Phase 0 — Baseline oracle

### Task 0: Establish a green baseline with the existing suite

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Produces: a recorded known-good test run that every later phase compares against.

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`
Expected: dependencies install; `node_modules/.bin/mocha` exists.

- [ ] **Step 2: Run the existing test suite**

Run: `pnpm test` (i.e. `mocha --check-leaks -t 10000 -b`)
Expected: suite runs against sqlite `:memory:`. Record pass/fail counts and the list of describe blocks.

- [ ] **Step 3: Save the baseline record**

Create `docs/superpowers/plans/baseline-results.md` containing the full mocha output (test names + pass counts). This is the behaviour oracle for Phases 3–6.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/baseline-results.md
git commit -m "test: record baseline mocha results before TS port"
```

---

## Phase 1 — Tooling

### Task 1.1: Add TypeScript + tsconfig (strict, allowJs interim)

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json` (add devDeps + `typecheck` script)

**Interfaces:**
- Produces: `pnpm typecheck` → `tsc --noEmit`; strict compilation usable by every later task.

- [ ] **Step 1: Add dev dependencies**

Run:
```bash
pnpm add -D typescript @types/node
```

- [ ] **Step 2: Create `tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist/types",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false,
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add scripts to `package.json`**

Add to `"scripts"`:
```jsonc
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Verify typecheck runs (no src yet → trivially passes)**

Run: `pnpm typecheck`
Expected: exits 0 (no `.ts` files to check yet, `src/` empty/absent is fine — create `src/` with an empty `index.ts` if tsc complains about no inputs).

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json pnpm-lock.yaml
git commit -m "build: add TypeScript with strict tsconfig"
```

### Task 1.2: Add SWC transpile config + build scripts

**Files:**
- Create: `.swcrc`, `scripts/fix-dist-pkg.mjs`
- Modify: `package.json` (build scripts + devDeps)

**Interfaces:**
- Produces: `pnpm build` → `dist/esm/`, `dist/cjs/` (JS), `dist/types/` (d.ts), plus per-dir `package.json` type markers.

- [ ] **Step 1: Add dev dependencies**

Run: `pnpm add -D @swc/core @swc/cli`

- [ ] **Step 2: Create `.swcrc`**

```jsonc
{
  "$schema": "https://swc.rs/schema.json",
  "jsc": {
    "parser": { "syntax": "typescript", "tsx": false },
    "target": "es2022",
    "loose": false
  }
}
```

- [ ] **Step 3: Create `scripts/fix-dist-pkg.mjs`** (writes the type-marker package.json files)

```js
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist/esm', { recursive: true });
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
console.log('wrote dist/{esm,cjs}/package.json type markers');
```

- [ ] **Step 4: Add build scripts to `package.json`**

```jsonc
"build:esm": "swc src -d dist/esm --config-json '{\"module\":{\"type\":\"es6\"}}'",
"build:cjs": "swc src -d dist/cjs --config-json '{\"module\":{\"type\":\"commonjs\"}}'",
"build:types": "tsc --emitDeclarationOnly --outDir dist/types",
"build": "rm -rf dist && pnpm build:esm && pnpm build:cjs && pnpm build:types && node scripts/fix-dist-pkg.mjs"
```

- [ ] **Step 5: Smoke-test the build with a throwaway file**

Create `src/index.ts` containing `export const __smoke = 1`.
Run: `pnpm build`
Expected: `dist/esm/index.js`, `dist/cjs/index.js`, `dist/types/index.d.ts` exist; `dist/esm/package.json` says `{"type":"module"}`.

- [ ] **Step 6: Commit**

```bash
git add .swcrc scripts/fix-dist-pkg.mjs package.json pnpm-lock.yaml src/index.ts
git commit -m "build: add SWC dual ESM/CJS transpile pipeline"
```

### Task 1.3: Add Vitest with unhandled-rejection fidelity

**Files:**
- Create: `vitest.config.ts`, `test/setup.ts`
- Modify: `package.json` (test scripts + devDeps)

**Interfaces:**
- Produces: `pnpm test` (Vitest) and `pnpm test:cov`. Setup rethrows unhandled rejections (matches old bluebird `onPossiblyUnhandledRejection`).

- [ ] **Step 1: Add dev dependencies**

Run: `pnpm add -D vitest @vitest/coverage-v8`

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] }
  }
});
```

- [ ] **Step 3: Create `test/setup.ts`** (rethrow unhandled rejections — review B4)

```ts
process.on('unhandledRejection', (reason) => {
  // Match the old bluebird onPossiblyUnhandledRejection(err => throw err) contract
  throw reason;
});
```

- [ ] **Step 4: Replace test script in `package.json`**

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
```

- [ ] **Step 5: Verify Vitest runs with a trivial test**

Create `test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('runs', () => { expect(1).toBe(1); }); });
```
Run: `pnpm test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts test/setup.ts test/smoke.test.ts package.json pnpm-lock.yaml
git commit -m "test: add Vitest with unhandled-rejection rethrow setup"
```

### Task 1.4: ESLint flat config + GitHub Actions CI

**Files:**
- Create: `eslint.config.js`, `.github/workflows/ci.yml`
- Delete: `.eslintrc.json`
- Modify: `package.json` (lint script + devDeps)

**Interfaces:**
- Produces: `pnpm lint`; CI runs typecheck + lint + test on Node 18/20/22.

- [ ] **Step 1: Add dev dependencies**

Run: `pnpm add -D eslint typescript-eslint @eslint/js eslint-config-prettier`

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  { ignores: ['dist/', 'docs/', 'node_modules/'] }
);
```

- [ ] **Step 3: Replace lint script in `package.json`**

```jsonc
"lint": "eslint src test"
```
Delete `.eslintrc.json`.

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '${{ matrix.node }}', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 5: Verify lint runs**

Run: `pnpm lint`
Expected: exits 0 (only smoke files present).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js .github/workflows/ci.yml package.json pnpm-lock.yaml
git rm .eslintrc.json
git commit -m "build: ESLint flat config + GitHub Actions CI"
```

---

## Phase 2 — Internal utilities (the zero-dep core)

> These are NEW code (not mechanical ports) so each gets full TDD with real test code. Build them before any module port. **Gate before Phase 3:** every bluebird method and `_.` call in the inventory above is covered here.

### Task 2.1: `internal/promise.ts` — BPromise subclass + static helpers

**Files:**
- Create: `src/internal/promise.ts`, `test/unit/internal/promise.test.ts`

**Interfaces:**
- Produces:
  - `class BPromise<T> extends Promise<T>` with instance methods:
    - `tap(fn: (value: T) => unknown): BPromise<T>` — runs side effect, resolves with original value
    - `bind(ctx: unknown): BPromise<T>` — sets `this` for subsequent `.then/.tap/.map` callbacks
    - `map<U>(fn: (item, index) => U | PromiseLike<U>): BPromise<U[]>` (only valid when T is an array; concurrent)
    - `return<U>(value: U): BPromise<U>` and `thenReturn<U>(value: U): BPromise<U>`
    - `spread<U>(fn: (...args: unknown[]) => U): BPromise<U>`
    - `asCallback(cb?: (err, value) => void): BPromise<T>` and alias `nodeify`
  - Static helpers (all return `BPromise`):
    - `BPromise.bind(ctx): BPromise<undefined>`
    - `BPromise.method<A extends any[], R>(fn: (...a: A) => R): (...a: A) => BPromise<Awaited<R>>`
    - `BPromise.try<R>(fn: () => R): BPromise<Awaited<R>>`
    - `BPromise.map<T, U>(items: Iterable<T>, fn: (item: T, i: number) => U | PromiseLike<U>): BPromise<U[]>` (concurrent)
    - `BPromise.mapSeries<T, U>(items: Iterable<T>, fn: (item: T, i: number) => U | PromiseLike<U>): BPromise<U[]>` (sequential, order-preserving)
    - `BPromise.reduce<T, A>(items: Iterable<T>, fn: (acc: A, item: T, i: number) => A | PromiseLike<A>, initial: A): BPromise<A>`
    - `BPromise.join(...args: [...promises: unknown[], handler: (...vals) => unknown]): BPromise<unknown>`
    - `BPromise.resolve`, `BPromise.reject`, `BPromise.all` (inherited, but typed to return `BPromise`)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { BPromise } from '../../../src/internal/promise';

describe('BPromise', () => {
  it('tap returns original value and runs side effect', async () => {
    const seen: number[] = [];
    const out = await BPromise.resolve(5).tap((v) => { seen.push(v); });
    expect(out).toBe(5);
    expect(seen).toEqual([5]);
  });

  it('tap waits for an async side effect', async () => {
    const order: string[] = [];
    await BPromise.resolve(1).tap(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('side');
    }).then(() => order.push('after'));
    expect(order).toEqual(['side', 'after']);
  });

  it('bind sets this for subsequent non-arrow callbacks', async () => {
    const ctx = { name: 'ctx' };
    const result = await BPromise.bind(ctx).then(function (this: typeof ctx) {
      return this.name;
    });
    expect(result).toBe('ctx');
  });

  it('return/thenReturn replaces the resolution value', async () => {
    expect(await BPromise.resolve(1).return(2)).toBe(2);
    expect(await BPromise.resolve(1).thenReturn(3)).toBe(3);
  });

  it('static map is concurrent and preserves order', async () => {
    const out = await BPromise.map([3, 1, 2], async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('static mapSeries runs sequentially in order', async () => {
    const order: number[] = [];
    await BPromise.mapSeries([3, 1, 2], async (n) => {
      await new Promise((r) => setTimeout(r, n));
      order.push(n);
    });
    expect(order).toEqual([3, 1, 2]); // sequential: not reordered by delay
  });

  it('reduce accumulates with an initial value', async () => {
    const sum = await BPromise.reduce([1, 2, 3], (acc, n) => acc + n, 0);
    expect(sum).toBe(6);
  });

  it('join resolves all then calls handler', async () => {
    const r = await BPromise.join(BPromise.resolve(1), BPromise.resolve(2), (a, b) => a + b);
    expect(r).toBe(3);
  });

  it('method wraps a sync throw into a rejection and preserves this', async () => {
    const obj = {
      mult: BPromise.method(function (this: { factor: number }, n: number) {
        if (n < 0) throw new Error('neg');
        return n * this.factor;
      })
    };
    expect(await obj.mult.call({ factor: 2 }, 3)).toBe(6);
    await expect(obj.mult.call({ factor: 2 }, -1)).rejects.toThrow('neg');
  });

  it('try catches synchronous throws', async () => {
    await expect(BPromise.try(() => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('asCallback delivers node-style (err, value)', async () => {
    const cb = vi.fn();
    await BPromise.resolve(7).asCallback(cb);
    expect(cb).toHaveBeenCalledWith(null, 7);
  });

  it('then returns a BPromise (subclass preserved)', () => {
    expect(BPromise.resolve(1).then((x) => x)).toBeInstanceOf(BPromise);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/unit/internal/promise.test.ts`
Expected: FAIL (module not found / `BPromise` undefined).

- [ ] **Step 3: Implement `src/internal/promise.ts`**

Implement `BPromise extends Promise` with:
- A `bind` strategy: store the bound context and re-apply it in `then`/`tap`/`map` by wrapping callbacks with `fn.call(boundCtx, ...)`. Keep a private `_ctx` carried across derived promises (copy in overridden `then`).
- Override `then` so it returns a `BPromise` carrying `_ctx`. Set `static get [Symbol.species]() { return BPromise; }` so `.catch/.finally` stay `BPromise`.
- `tap(fn)`: `return this.then((v) => BPromise.resolve(fn.call(this._ctx, v)).then(() => v))`.
- `return(v)`/`thenReturn(v)`: `this.then(() => v)`.
- `spread(fn)`: `this.then((arr) => fn.apply(this._ctx, arr))`.
- `asCallback(cb)`: `this.then((v) => { cb?.(null, v); }, (e) => { cb?.(e); }); return this;` (alias `nodeify`).
- Static `map`: `BPromise.all([...items].map((it, i) => fn(it, i)))`.
- Static `mapSeries`: sequential `for...of` awaiting each, pushing results.
- Static `reduce`: sequential fold awaiting acc each step.
- Static `join`: split handler off the args, `Promise.all(rest).then((vals) => handler(...vals))`.
- Static `method(fn)`: `return function (this, ...args) { return BPromise.try(() => fn.apply(this, args)); }`.
- Static `try(fn)`: `return new BPromise((res) => res(fn()))` (constructor executor turns sync throw into rejection).

Document the `_ctx` mechanism with a comment explaining it replaces bluebird's `Promise.bind`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/unit/internal/promise.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/internal/promise.ts test/unit/internal/promise.test.ts
git commit -m "feat(internal): BPromise native subclass replacing bluebird"
```

### Task 2.2: `internal/lang.ts` — lodash replacements

**Files:**
- Create: `src/internal/lang.ts`, `test/unit/internal/lang.test.ts`

**Interfaces:**
- Produces named exports for every function in the lodash inventory. Signatures match the subset of lodash behaviour the code relies on:
  - Type guards: `isString`, `isFunction`, `isObject`, `isPlainObject`, `isEmpty`, `isNull`, `isNil`, `isBuffer`, `isEqual` (deep), `has(obj, path)`
  - Clone: `clone<T>(v: T): T` (shallow), `cloneDeep<T>(v: T): T`
  - Object: `extend`/`assignIn` (alias, includes inherited — same as `Object.assign` for plain objs), `assign`, `defaults`, `defaultsDeep`, `pick(obj, keys)`, `omit(obj, keys)`, `omitBy(obj, pred)`, `mapValues(obj, fn)`, `mapKeys(obj, fn)`, `result(obj, path, default?)`
  - Collection: `each`/`forEach`, `map`, `flatMap`, `reduce`, `filter`, `reject`, `find`, `remove(arr, pred)`, `groupBy`, `uniq`, `flatten`, `drop(arr, n)`
  - Function: `bind(fn, ctx)`, `once`, `negate`, `identity`
  - String: `startsWith`, `camelCase`, `escape` (HTML), `uniqueId(prefix?)`

- [ ] **Step 1: Write failing tests** (cover the behaviours actually relied on)

```ts
import { describe, it, expect } from 'vitest';
import * as _ from '../../../src/internal/lang';

describe('lang', () => {
  it('isString / isFunction / isPlainObject / isNil', () => {
    expect(_.isString('a')).toBe(true);
    expect(_.isString(1)).toBe(false);
    expect(_.isFunction(() => {})).toBe(true);
    expect(_.isPlainObject({})).toBe(true);
    expect(_.isPlainObject([])).toBe(false);
    expect(_.isNil(null)).toBe(true);
    expect(_.isNil(undefined)).toBe(true);
    expect(_.isNil(0)).toBe(false);
  });

  it('isEmpty for objects, arrays, strings, null', () => {
    expect(_.isEmpty({})).toBe(true);
    expect(_.isEmpty([])).toBe(true);
    expect(_.isEmpty('')).toBe(true);
    expect(_.isEmpty(null)).toBe(true);
    expect(_.isEmpty({ a: 1 })).toBe(false);
    expect(_.isEmpty([1])).toBe(false);
  });

  it('clone is shallow, cloneDeep is deep', () => {
    const src = { a: { b: 1 } };
    const shallow = _.clone(src);
    expect(shallow.a).toBe(src.a);
    const deep = _.cloneDeep(src);
    expect(deep.a).not.toBe(src.a);
    expect(deep).toEqual(src);
  });

  it('pick / omit / omitBy', () => {
    expect(_.pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    expect(_.omit({ a: 1, b: 2 }, ['b'])).toEqual({ a: 1 });
    expect(_.omitBy({ a: 1, b: null }, _.isNull)).toEqual({ a: 1 });
  });

  it('result resolves a value or invokes a function, with default', () => {
    expect(_.result({ a: 5 }, 'a')).toBe(5);
    expect(_.result({ a: () => 6 }, 'a')).toBe(6);
    expect(_.result({}, 'missing', 'def')).toBe('def');
  });

  it('mapValues / mapKeys', () => {
    expect(_.mapValues({ a: 1, b: 2 }, (v) => v * 2)).toEqual({ a: 2, b: 4 });
    expect(_.mapKeys({ a: 1 }, (_v, k) => k.toUpperCase())).toEqual({ A: 1 });
  });

  it('groupBy / uniq / flatten / drop', () => {
    expect(_.groupBy([1, 2, 3], (n) => (n % 2 ? 'odd' : 'even')))
      .toEqual({ odd: [1, 3], even: [2] });
    expect(_.uniq([1, 1, 2])).toEqual([1, 2]);
    expect(_.flatten([[1], [2, 3]])).toEqual([1, 2, 3]);
    expect(_.drop([1, 2, 3], 1)).toEqual([2, 3]);
  });

  it('camelCase / startsWith / escape / uniqueId', () => {
    expect(_.camelCase('foo_bar')).toBe('fooBar');
    expect(_.startsWith('hello', 'he')).toBe(true);
    expect(_.escape('<a>')).toBe('&lt;a&gt;');
    expect(_.uniqueId('m')).toMatch(/^m\d+$/);
  });

  it('defaultsDeep merges nested defaults without overwriting', () => {
    expect(_.defaultsDeep({ a: { x: 1 } }, { a: { x: 9, y: 2 } }))
      .toEqual({ a: { x: 1, y: 2 } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/unit/internal/lang.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/internal/lang.ts`**

Implement each function with native JS. Notes:
- `extend`/`assignIn`/`assign` → `Object.assign` wrappers.
- `result(obj, path, def)` → read `obj[path]`; if function, call it bound to `obj`; if `undefined`, return `def`.
- `escape` → replace `& < > " '` with HTML entities.
- `uniqueId` → module-level counter.
- `isEqual` → deep structural equality (recursive over plain objects/arrays; primitives via `===`). Keep it minimal — only what `model.js`/`collection.js` compares.
- `defaultsDeep`/`defaults` → recursive/shallow fill of missing keys.
- `cloneDeep` → structured recursion over plain objects/arrays; preserve `Buffer`/`Date` by reference-copy as lodash does for the cases used.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/unit/internal/lang.test.ts`
Expected: all PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → 0.
```bash
git add src/internal/lang.ts test/unit/internal/lang.test.ts
git commit -m "feat(internal): native lang utilities replacing lodash"
```

### Task 2.3: `internal/inflection.ts` — inflection replacement

**Files:**
- Create: `src/internal/inflection.ts`, `test/unit/internal/inflection.test.ts`

**Interfaces:**
- Produces: `pluralize(s)`, `singularize(s)`, `camelize(s, lowFirst?)`, `underscore(s)`, `capitalize(s)`. (Confirm exact set via `grep -n inflection lib/relation.js` before implementing; implement only what is called.)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import * as inflection from '../../../src/internal/inflection';

describe('inflection', () => {
  it('pluralize regular + common irregulars', () => {
    expect(inflection.pluralize('book')).toBe('books');
    expect(inflection.pluralize('category')).toBe('categories');
    expect(inflection.pluralize('person')).toBe('people');
  });
  it('singularize regular + common irregulars', () => {
    expect(inflection.singularize('books')).toBe('book');
    expect(inflection.singularize('categories')).toBe('category');
    expect(inflection.singularize('people')).toBe('person');
  });
  it('underscore / camelize / capitalize', () => {
    expect(inflection.underscore('FooBar')).toBe('foo_bar');
    expect(inflection.camelize('foo_bar')).toBe('FooBar');
    expect(inflection.camelize('foo_bar', true)).toBe('fooBar');
    expect(inflection.capitalize('foo')).toBe('Foo');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/unit/internal/inflection.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/internal/inflection.ts`**

Port a compact pluralization ruleset (regex rules + a small irregulars/uncountables table) sufficient for the test cases and the relation-name usage. Keep the rule list minimal — extend only if a baseline relation test fails later.

- [ ] **Step 4: Run tests → PASS; typecheck → 0**

Run: `pnpm test test/unit/internal/inflection.test.ts` then `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/internal/inflection.ts test/unit/internal/inflection.test.ts
git commit -m "feat(internal): inflection helpers replacing inflection dep"
```

### Task 2.4: `errors.ts` — native Error subclasses

**Files:**
- Create: `src/errors.ts`, `test/unit/errors.test.ts`

**Interfaces:**
- Produces named exports: `NotFoundError`, `EmptyError`, `NoRowsUpdatedError`, `NoRowsDeletedError`, `ModelNotResolvedError` — each `extends Error`, with `.name` set and `instanceof` working.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import * as errors from '../../src/errors';

describe('errors', () => {
  it('each error is an Error subclass with the right name', () => {
    for (const name of ['NotFoundError', 'EmptyError', 'NoRowsUpdatedError', 'NoRowsDeletedError', 'ModelNotResolvedError'] as const) {
      const Err = (errors as Record<string, new (m?: string) => Error>)[name];
      const e = new Err('msg');
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(Err);
      expect(e.name).toBe(name);
      expect(e.message).toBe('msg');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/unit/errors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
class BookshelfError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }
}
export class NotFoundError extends BookshelfError {}
export class EmptyError extends BookshelfError {}
export class NoRowsUpdatedError extends BookshelfError {}
export class NoRowsDeletedError extends BookshelfError {}
export class ModelNotResolvedError extends BookshelfError {}
```

- [ ] **Step 4: Run tests → PASS; typecheck → 0**

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts test/unit/errors.test.ts
git commit -m "feat: native Error subclasses replacing create-error"
```

---

## Phase 3 — Port modules bottom-up

> Each module is a **mechanical, behaviour-preserving transformation** of the matching `lib/*.js` file: copy it to `src/*.ts`, swap `require('bluebird')`→`BPromise`, `require('lodash')`→`internal/lang`, `require('inflection')`→`internal/inflection`, `require('create-error')`/`errors`→`src/errors`, convert `module.exports`/`require` to ESM `import`/`export`, then add types until `strict` passes. The baseline suite (Phase 0) and the ported tests (Phase 4) are the behaviour oracle — **no logic changes**. Where a `_(...)` lodash chain appears, rewrite it to native imperative (see call sites below).
>
> **Per-module recipe (identical for every task in this phase):**
> 1. **COPY** `lib/<mod>.js` → `src/<mod>.ts` (do NOT `git mv`). **`lib/` stays intact and runnable** so the existing mocha baseline keeps passing through all of Phase 3. `lib/` is deleted only in Phase 4 (Task 4.4) once the Vitest suite points at `src/`.
> 2. Rewrite imports to ESM + internal modules; remove all four dep imports.
> 3. Add types; run `pnpm typecheck` until clean (`any` only where commented).
> 4. Behaviour gate during Phase 3 = `pnpm typecheck` + `pnpm test` (old mocha against untouched `lib/` must stay 732-green — proves we did not disturb the baseline). Per-`src`-module behaviour parity is closed in Phase 4 when Vitest imports from `src/`.
> 5. Commit per module.

**Port order (dependencies first):**

> **CORRECTED ORDER (discovered during execution):** the dependency graph is a DAG (no cycles — `model`/`collection` are imported only by `bookshelf`). The original task numbering below was NOT a valid topological sort (e.g. `helpers` imports `base/model` but was listed before it; `base/relation` imports `base/collection` but was listed before it). A module can only be ported after every `src` file it imports exists, so the actual execution order is:
> `constants → extend → errors(done in 2.4) → sync → base/events → base/eager → base/model → base/collection → base/relation → helpers → eager → relation → collection → model → bookshelf → index`
> The task headings below keep their original numbers for reference, but are executed in the corrected order above.

### Task 3.1: `constants.ts`
- [ ] Port `lib/constants.js` → `src/constants.ts`. Run `pnpm typecheck`. Commit `refactor: port constants to TS`.

### Task 3.2: `extend.ts`
- [ ] Port `lib/extend.js` → `src/extend.ts`. This is the dynamic Backbone-style extend — type the public surface as a generic helper; `any` permitted on the internal `Object.assign(Child, Parent, staticProps)` plumbing **with an explanatory comment**. Run `pnpm typecheck`. Commit.

### Task 3.3: `base/events.ts`
- [ ] Port `lib/base/events.js`. Replace `Promise.mapSeries` at line ~101 with `BPromise.mapSeries` (⚠️ keep sequential). Run `pnpm typecheck`. Commit.

### Task 3.4: `helpers.ts`
- [ ] Port `lib/helpers.js`. Replace `Promise.join` (~line 110) with `BPromise.join`. Keep `this instanceof Model` (`helpers.js:25`) — see Phase 6 dual-package note. Run `pnpm typecheck`. Commit.

### Task 3.5: `base/relation.ts`
- [ ] Port `lib/base/relation.js`. Run `pnpm typecheck`. Commit.

### Task 3.6: `base/eager.ts`
- [ ] Port `lib/base/eager.js`. Replace `.return()`/`.thenReturn()` with `BPromise` methods. Run `pnpm typecheck`. Commit.

### Task 3.7: `base/collection.ts`
- [ ] Port `lib/base/collection.js`. Replace `Promise.bind(context).thenReturn(...).map(...)` (~355), `.reduce(...).bind()` (~407), `Promise.rejected(...)` (~411 → `BPromise.reject`). Rewrite the `_(this)...` chain (~648) to native imperative. Run `pnpm typecheck`. Commit.

### Task 3.8: `base/model.ts`
- [ ] Port `lib/base/model.js`. Replace bluebird `.bind/.tap/.return` chains with `BPromise`. Run `pnpm typecheck`. Commit.

### Task 3.9: `sync.ts`
- [ ] Port `lib/sync.js`. Replace `Promise.bind(this).then(...).tap(...)` chains (lines ~77, ~135) with `BPromise.bind(this)`; carefully preserve `this.syncing` access in non-arrow callbacks. Rewrite the `_(knex._statements).filter({grouping:'columns'}).some('value.length')` chain (~133) to native: filter statements where `grouping === 'columns'` then test any has `value.length`. Run `pnpm typecheck`. Commit.

### Task 3.10: `eager.ts`
- [ ] Port `lib/eager.js`. Replace `Promise.map` (~99, concurrent) with `BPromise.map`; `.return()` with `BPromise` method. Run `pnpm typecheck`. Commit.

### Task 3.11: `relation.ts`
- [ ] Port `lib/relation.js`. Replace `require('inflection')` with `internal/inflection`. Rewrite `_.reject(_(response).map(key).uniq().value(), _.isNil)` (~370) to native: `_.reject(_.uniq(response.map(key)), _.isNil)`. Keep `instanceof ModelBase/CollectionBase` checks. Run `pnpm typecheck`. Commit.

### Task 3.12: `collection.ts`
- [ ] Port `lib/collection.js`. Replace `.bind(this)`, `.tap`, `.return`/`.thenReturn` chains (~161, ~351, ~202, ~308, ~360) with `BPromise`. Keep `createError`→`src/errors`. Run `pnpm typecheck`. Commit.

### Task 3.13: `model.ts`
- [ ] Port `lib/model.js` (largest file, 1566 lines). Replace all bluebird `Promise.bind/.tap/.return/.thenReturn` chains (~544, ~702, ~714, ~717-736, ~755, ~931, ~1056, ~1158, ~1238, ~1284). Keep `createError`→`src/errors`. Run `pnpm typecheck`. Commit.

### Task 3.14: `bookshelf.ts`
- [ ] Port `lib/bookshelf.js`. Keep the `plugin()` method's string-form warnings verbatim (`pagination`/`visibility`/`registry`/`processor`/`case-converter`/`virtuals`). Replace the `require(plugin)` string-load branch behaviour: keep it for back-compat but the documented path is passing functions. Replace `Promise.method` usages with `BPromise.method`. Run `pnpm typecheck`. Commit.

### Task 3.15: `index.ts`
- [ ] Create `src/index.ts` exporting the factory as default + named re-exports (`errors`, base classes if previously exported by `lib/bookshelf.js`). Mirror whatever `lib/bookshelf.js` / `bookshelf.js` exposed. Run `pnpm typecheck`. Commit `refactor: port entry to TS`.

**Phase 3 gate:** `pnpm typecheck` exits 0 across all of `src/`; no remaining imports of `bluebird`/`lodash`/`inflection`/`create-error` (verify: `grep -rE "bluebird|lodash|inflection|create-error" src` → no hits).

---

## Phase 4 — Migrate tests to Vitest/TS

> Port each existing test file to Vitest+TS, importing from `src/`. The ported tests must reproduce the baseline behaviour (Phase 0). This phase closes the per-module verification loop opened in Phase 3.

### Task 4.1: Port the integration test harness/helpers
**Files:**
- Create: `test/integration/helpers/*.ts` (from `test/integration/helpers/*.js`), `test/helpers/index.ts`
- [ ] Convert config/migration/inserts/objects helpers to TS. Keep sqlite `:memory:` config. Replace `require('bluebird')` in helpers with `BPromise` (or native — helpers are test-only). Replace the old global `Promise.longStackTraces()` / `onPossiblyUnhandledRejection` setup (now in `test/setup.ts`). Commit.

### Task 4.2: Port unit tests
- [ ] Convert `test/unit/{bookshelf,collection,events,sync,model}.js` → `*.test.ts` importing from `src/`. Replace chai `expect`/`should` + sinon with Vitest `expect`/`vi`, sinon-chai matchers with Vitest equivalents. Run `pnpm test`. Expected: unit tests pass. Commit per file or as one task.

### Task 4.3: Port integration tests
- [ ] Convert `test/integration/{relations,relation,json,model,collection,plugin}.js` → `*.test.ts`. Run `pnpm test`. Expected: pass on sqlite, matching baseline describe blocks. Commit.

### Task 4.4: Remove old `lib/`, test runner + deps
- [ ] Confirm Vitest imports only from `src/` and is green. Delete the entire `lib/` directory and the interim `bookshelf.js` entry (superseded by `src/index.ts`). Delete old `test/index.js`, `test/.eslintrc`, and `test/integration/output/*` if obsolete. Run `pnpm remove mocha chai sinon sinon-chai nyc`. Run `pnpm test` (full Vitest). Expected: green, parity with baseline (732 sqlite). Commit `test: complete Vitest migration; drop lib/, mocha/chai/sinon/nyc`.

**Phase 4 gate:** `pnpm test` green; describe-block coverage matches `baseline-results.md`.

---

## Phase 5 — Plugin infrastructure (bundled opt-in)

### Task 5.1: `plugins/virtuals.ts`
**Files:**
- Create: `src/plugins/virtuals.ts`, `test/integration/plugins/virtuals.test.ts`

**Interfaces:**
- Produces: `export default function virtuals(bookshelf, options?): void` — adds virtual-attribute support (port from upstream Bookshelf virtuals plugin behaviour: `virtuals` model property, `set`/`get` of virtual fields, included in `toJSON` unless `{virtuals:false}`).

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import knexFactory from 'knex';
import bookshelfv2 from '../../../src/index';
import virtuals from '../../../src/plugins/virtuals';

describe('plugins/virtuals (opt-in)', () => {
  let orm: ReturnType<typeof bookshelfv2>;
  beforeAll(() => {
    orm = bookshelfv2(knexFactory({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
    orm.plugin(virtuals);
  });

  it('computes a virtual attribute and includes it in toJSON', () => {
    const M = orm.Model.extend({
      virtuals: { fullName(this: any) { return `${this.get('first')} ${this.get('last')}`; } }
    });
    const m = new M({ first: 'Ada', last: 'Lovelace' });
    expect(m.get('fullName')).toBe('Ada Lovelace');
    expect(m.toJSON().fullName).toBe('Ada Lovelace');
  });
});
```

- [ ] **Step 2: Run → FAIL.** Run: `pnpm test test/integration/plugins/virtuals.test.ts`
- [ ] **Step 3: Implement `src/plugins/virtuals.ts`** porting the upstream virtuals plugin logic, typed, importing only from `src/` (no external deps).
- [ ] **Step 4: Run → PASS; `pnpm typecheck` → 0.**
- [ ] **Step 5: Commit** `feat(plugins): bundled opt-in virtuals plugin`.

### Task 5.2: `plugins/case-converter.ts`
**Files:**
- Create: `src/plugins/case-converter.ts`, `test/integration/plugins/case-converter.test.ts`

**Interfaces:**
- Produces: `export default function caseConverter(bookshelf, options?): void` — overrides `parse` (snake_case → camelCase) and `format` (camelCase → snake_case) using `internal/inflection` + `internal/lang`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import knexFactory from 'knex';
import bookshelfv2 from '../../../src/index';
import caseConverter from '../../../src/plugins/case-converter';

describe('plugins/case-converter (opt-in)', () => {
  let orm: ReturnType<typeof bookshelfv2>;
  beforeAll(() => {
    orm = bookshelfv2(knexFactory({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
    orm.plugin(caseConverter);
  });

  it('parse converts snake_case to camelCase', () => {
    const M = orm.Model.extend({ tableName: 't' });
    const m = new M();
    expect((m as any).parse({ first_name: 'Ada' })).toEqual({ firstName: 'Ada' });
  });

  it('format converts camelCase to snake_case', () => {
    const M = orm.Model.extend({ tableName: 't' });
    const m = new M();
    expect((m as any).format({ firstName: 'Ada' })).toEqual({ first_name: 'Ada' });
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/plugins/case-converter.ts`** (port upstream behaviour, typed, internal deps only).
- [ ] **Step 4: Run → PASS; `pnpm typecheck` → 0.**
- [ ] **Step 5: Commit** `feat(plugins): bundled opt-in case-converter plugin`.

**Phase 5 gate:** both plugins importable via `src/plugins/*`, work when passed to `.plugin()`, and `pnpm test` green.

---

## Phase 6 — Package finalization, cleanup & dual-build verification

### Task 6.1: Rename package + exports map (the interim-entry switch)
**Files:**
- Modify: `package.json`
- Delete: `bookshelf.js`

- [ ] **Step 1: Update `package.json`** — set name, type, exports, files; clear runtime deps:

```jsonc
{
  "name": "bookshelfv2",
  "version": "2.0.0",
  "type": "module",
  "exports": {
    ".":           { "types": "./dist/types/index.d.ts", "import": "./dist/esm/index.js", "require": "./dist/cjs/index.js" },
    "./plugins/*": { "types": "./dist/types/plugins/*.d.ts", "import": "./dist/esm/plugins/*.js", "require": "./dist/cjs/plugins/*.js" }
  },
  "files": ["dist"],
  "dependencies": {},
  "peerDependencies": { "knex": ">=3.1.0" },
  "engines": { "node": ">=16" }
}
```
Remove the old `main`, `bluebird`/`lodash`/`inflection`/`create-error` deps, `husky`/`lint-staged`/`jsdoc` blocks. Delete `bookshelf.js`.

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: `dist/{esm,cjs,types}` populated; `dist/types/plugins/virtuals.d.ts` exists.

- [ ] **Step 3: Verify zero runtime deps**

Run: `grep -rE "\"(bluebird|lodash|inflection|create-error)\"" package.json` → no hits; `node -e "console.log(Object.keys(require('./package.json').dependencies))"` → `[]`.

- [ ] **Step 4: Commit** `build: rename to bookshelfv2, exports map, zero runtime deps`.

### Task 6.2: Dual-package smoke test (ESM + CJS + instanceof)
**Files:**
- Create: `test/smoke/esm.mjs`, `test/smoke/cjs.cjs`

- [ ] **Step 1: Write ESM smoke** (`test/smoke/esm.mjs`)

```js
import bookshelfv2 from '../../dist/esm/index.js';
import knex from 'knex';
const orm = bookshelfv2(knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
const M = orm.Model.extend({ tableName: 't' });
const m = new M({ a: 1 });
if (!(m instanceof orm.Model)) throw new Error('instanceof failed (ESM)');
// public API: .tap must exist on a returned promise
const p = m.save(null, { method: 'insert' }).catch(() => {});
if (typeof p.tap !== 'function') throw new Error('.tap missing (ESM)');
console.log('ESM smoke OK');
```

- [ ] **Step 2: Write CJS smoke** (`test/smoke/cjs.cjs`)

```js
const bookshelfv2 = require('../../dist/cjs/index.js');
const knex = require('knex');
const orm = bookshelfv2(knex({ client: 'sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true }));
const M = orm.Model.extend({ tableName: 't' });
const m = new M({ a: 1 });
if (!(m instanceof orm.Model)) throw new Error('instanceof failed (CJS)');
console.log('CJS smoke OK');
```

- [ ] **Step 3: Run both**

Run: `node test/smoke/esm.mjs && node test/smoke/cjs.cjs`
Expected: `ESM smoke OK` and `CJS smoke OK`. If `.tap` is missing, BPromise is not on the public return path — fix Phase 3 wiring before proceeding.

- [ ] **Step 4: Add a `smoke` script + wire into CI**

Add `"smoke": "pnpm build && node test/smoke/esm.mjs && node test/smoke/cjs.cjs"`; add `- run: pnpm smoke` to `.github/workflows/ci.yml`.

- [ ] **Step 5: Commit** `test: dual ESM/CJS smoke incl. instanceof + .tap surface`.

### Task 6.3: Curated public `.d.ts` review
- [ ] Inspect `dist/types/index.d.ts`, `model.d.ts`, `collection.d.ts`. If `extend`-derived types are `any`-heavy, add a hand-written generic overlay (e.g. `src/types/public.d.ts` referenced from `index.ts`) typing `Model`/`Collection`/factory. Build, confirm a sample consumer gets useful completions. Commit `types: curated public type surface`.

### Task 6.4: File cleanup
**Files:**
- Delete: `.travis.yml`, `.istanbul.yml`, `.nycrc.yml`, `scripts/jsdoc.sh`, `scripts/jsdoc.config.json`, `scripts/postpublish.sh`, `docs/*.html`, `docs/scripts/`, `docs/styles/`, `docs/images/`

- [ ] **Step 1: Delete dead toolchain + generated docs**

```bash
git rm .travis.yml .istanbul.yml .nycrc.yml scripts/jsdoc.sh scripts/jsdoc.config.json scripts/postpublish.sh
git rm -r docs/*.html docs/scripts docs/styles docs/images
pnpm remove bookshelf-jsdoc-theme jsdoc 2>/dev/null || true
```

- [ ] **Step 2: Verify nothing references removed paths**

Run: `grep -rE "jsdoc|istanbul|nyc|travis" package.json` → no hits.

- [ ] **Step 3: Commit** `chore: remove jsdoc/travis/nyc toolchain and generated docs`.

### Task 6.5: Convert tutorials to markdown
**Files:**
- Create: `docs/guides/*.md` (associations, events, many-to-many, models, one-to-many, one-to-one, parse-and-format, polymorphic)
- Delete: `tutorials/`

- [ ] **Step 1: Convert each `tutorials/*.md`/jsdoc tutorial to a clean markdown guide** under `docs/guides/`, updating `bookshelf`→`bookshelfv2` import names and replacing string-plugin calls with opt-in import examples.
- [ ] **Step 2: Delete `tutorials/`.**
- [ ] **Step 3: Commit** `docs: convert tutorials to markdown guides`.

### Task 6.6: Update README + CHANGELOG
**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Update README** — name `bookshelfv2`, install (`pnpm add bookshelfv2 knex`), ESM+CJS usage, opt-in plugin example (`import virtuals from 'bookshelfv2/plugins/virtuals'`), Node >=16 + `moduleResolution: node16/nodenext/bundler` requirement for plugin types, zero-deps note.
- [ ] **Step 2: Add a CHANGELOG `2.0.0` entry** — TS rewrite, zero runtime deps, dual ESM/CJS, bundled opt-in plugins, `BPromise` note (public API preserved; only the dep removed).
- [ ] **Step 3: Commit** `docs: update README and CHANGELOG for 2.0.0`.

**Phase 6 gate (final acceptance):** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm smoke` all green; `package.json` `dependencies` empty; ESM `import` and CJS `require` both work; `model.save().tap(...)` works; opt-in plugin import works and tree-shakes; describe-block parity with `baseline-results.md`.

---

## Self-Review notes (author)

- **Spec coverage:** §2 architecture → Phase 3/file structure; §3.1 BPromise → Task 2.1 + ADR; §3.2 lang → 2.2; §3.3 inflection → 2.3; §3.4 errors → 2.4; §4 plugins → Phase 5 + 6.1 exports; §5 build/SWC/tsc/Vitest/CI → Phase 1; §6 cleanup → 6.4/6.5/6.6; §7 phases → Phases 0–6; §8 verification → per-phase gates + 6.2; §9 risks → mitigations embedded (mapSeries 3.3/3.10, bind 3.9, lodash chains 3.7/3.9/3.11, instanceof 6.2, Vitest rejection 1.3, interim entry Task 1 notes + 6.1, .d.ts 6.3); §10 ADR → Task 2.1.
- **Inventory authority:** the grep-verified bluebird/lodash lists in File Structure are the Phase 2 coverage checklist.
- **No placeholders:** new-code tasks (Phase 2, plugins, smoke) carry real test code; port tasks carry the exact transformation recipe + specific line references + the baseline suite as oracle (porting 6,366 lines verbatim into the plan is not useful — the source file IS the spec for a behaviour-preserving port).
