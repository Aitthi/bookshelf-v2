/**
 * Vitest port of test/integration/plugin.js
 *
 * Tests Bookshelf#plugin() against the src/ ORM via the TypeScript harness.
 * sinon.spy() replaced with vi.fn(); the path-based plugin test uses a
 * dedicated CJS helper (plugin.vitest.cjs) loaded via createRequire so that
 * both the test file and Bookshelf's internal requirePlugin share the same
 * Node.js module-cache entry.
 */

import {describe, it, expect, beforeAll, beforeEach, vi} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {bookshelf, Models, initialize} from './helpers/harness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const _require = createRequire(import.meta.url);

// Shared trackable plugin spy (CJS, so both this file and Bookshelf's
// createRequire return the same object from cache).
const pluginSpy = _require('./helpers/plugin.vitest.cjs') as {
  calls: [unknown, unknown][];
  reset(): void;
} & ((...args: unknown[]) => void);

const {Site} = Models;

let options: Record<string, unknown>;
let spy: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  await initialize();
});

beforeEach(() => {
  options = {};
  spy = vi.fn();
});

describe('Plugin', () => {
  it('can be the path to a plugin', () => {
    pluginSpy.reset();
    bookshelf.plugin(path.resolve(__dirname, 'helpers/plugin.vitest.cjs'), options);
    expect(pluginSpy.calls.length).toBe(1);
    expect(pluginSpy.calls[0][0]).toBe(bookshelf);
    expect(pluginSpy.calls[0][1]).toBe(options);
  });

  it('can be an array of plugins', () => {
    bookshelf.plugin([spy], options);
    expect(spy).toHaveBeenCalledWith(bookshelf, options);
  });

  it('can be a function', () => {
    bookshelf.plugin(spy, options);
    expect(spy).toHaveBeenCalledWith(bookshelf, options);
  });

  it('returns the Bookshelf instance for chaining', () => {
    expect(bookshelf.plugin(spy, options)).toBe(bookshelf);
  });

  it('can modify the `Collection` model returned by `Model#collection`', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testPlugin = (bs: any) => {
      bs.Collection = bs.Collection.extend({test: 'test'});
    };
    bookshelf.plugin(testPlugin);
    expect((bookshelf.Model.collection() as {test?: string}).test).toBe('test');
  });

  it('can modify the `Collection` model used by relations', () => {
    // Depends on the previous test having extended Collection with {test:'test'}.
    const authors = Site.forge().related('authors') as {test?: string};
    expect(authors.test).toBe('test');
  });
});
