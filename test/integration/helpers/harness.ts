/**
 * TypeScript integration-test harness entry point.
 *
 * Exports:
 *   bookshelf  – a Bookshelf instance backed by an in-memory SQLite3 database
 *   Models     – all model constructors (same names as the JS helpers)
 *   initialize – async function that runs migrations + seed inserts
 *
 * The legacy JS helpers (config.js, migration.js, inserts.js, objects.js, index.js)
 * are kept intact for the existing Mocha/Chai suite.
 */

import Knex from 'knex';
import BookshelfFactory from '../../../src/index';
import migrate from './migration';
import doInserts from './inserts';
import defineObjects from './objects';

// ---------------------------------------------------------------------------
// Database connection – sqlite :memory: for fast, isolated test runs
// ---------------------------------------------------------------------------

const db = Knex({
  client: 'sqlite3',
  connection: {filename: ':memory:'},
  useNullAsDefault: true
});

// ---------------------------------------------------------------------------
// Bookshelf instance
// ---------------------------------------------------------------------------

const bookshelf = BookshelfFactory(db);

// ---------------------------------------------------------------------------
// Models + generateEventModels
// ---------------------------------------------------------------------------

const {Models, generateEventModels} = defineObjects(bookshelf);

// ---------------------------------------------------------------------------
// initialize() – idempotent: drops all tables, recreates schema, seeds data.
// Call once per test suite (beforeAll) or per test (if isolation is needed).
// ---------------------------------------------------------------------------

export async function initialize(): Promise<void> {
  await migrate(bookshelf);
  await doInserts(bookshelf);
}

// ---------------------------------------------------------------------------
// Helper re-exports from the old index.js (JS versions kept for Mocha)
// ---------------------------------------------------------------------------

export function formatNumber(dialect: string): (count: number | string) => number | string {
  const map: Record<string, (count: number | string) => number | string> = {
    mysql: (c) => c,
    sqlite3: (c) => c,
    postgresql: (count) => count.toString()
  };
  return map[dialect] ?? ((c) => c);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function countModels(Model: any, options?: unknown): () => Promise<number> {
  return async () => {
    const count = await Model.forge().count(options);
    if (typeof count === 'string') return parseInt(count, 10);
    return count as number;
  };
}

// ---------------------------------------------------------------------------
// Named exports
// ---------------------------------------------------------------------------

export {bookshelf, Models, generateEventModels};
export default bookshelf;
