/**
 * Integration tests for the bundled json-columns plugin (src/plugins/json-columns.ts).
 *
 * Uses a dedicated Knex + Bookshelf instance so the plugin mutations do not
 * bleed into the shared harness used by other test suites.
 *
 * TDD sequence (run once before implementation to see RED, then GREEN):
 *   pnpm test test/integration/plugins/json-columns.test.ts
 */

import Knex from 'knex';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import BookshelfFactory from '../../../src/index';
import jsonColumns from '../../../src/plugins/json-columns';

// ---------------------------------------------------------------------------
// Isolated Bookshelf instance — sqlite :memory: (parseOnFetch client)
// ---------------------------------------------------------------------------

const db = Knex({
  client: 'sqlite3',
  connection: {filename: ':memory:'},
  useNullAsDefault: true
});

const orm = BookshelfFactory(db);
orm.plugin(jsonColumns);

// ---------------------------------------------------------------------------
// Model fixtures
// ---------------------------------------------------------------------------

// Model WITH json columns (declared as a static `jsonColumns` array).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Settings: any = orm.Model.extend({tableName: 'settings'}, {jsonColumns: ['preferences', 'tags', 'code']});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Settings$Collection: any = orm.Collection.extend({model: Settings});

// Model WITHOUT json columns — must be left completely untouched.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plain: any = orm.Model.extend({tableName: 'plain'});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await db.schema.createTable('settings', (table) => {
    table.increments('id');
    table.text('preferences');
    table.text('tags');
    table.text('code');
  });
  await db.schema.createTable('plain', (table) => {
    table.increments('id');
    table.text('note');
  });
});

afterAll(async () => {
  await db.schema.dropTableIfExists('settings');
  await db.schema.dropTableIfExists('plain');
  await db.destroy();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('json-columns plugin', () => {
  it('stringifies JSON columns on save and parses them back on fetch', async () => {
    const saved = await new Settings({
      preferences: {theme: 'dark', notify: true},
      tags: ['a', 'b', 'c']
    }).save();
    const id = saved.get('id') as number;
    expect(id).toBeGreaterThan(0);

    // Raw DB row must contain the stringified JSON, not an object.
    const raw = await db('settings').where({id}).first();
    expect(raw.preferences).toBe('{"theme":"dark","notify":true}');
    expect(raw.tags).toBe('["a","b","c"]');

    // Fetched model must expose parsed JS values.
    const fetched = await Settings.forge({id}).fetch();
    expect(fetched.get('preferences')).toEqual({theme: 'dark', notify: true});
    expect(fetched.get('tags')).toEqual(['a', 'b', 'c']);
  });

  it('preserves a numeric-looking string verbatim instead of coercing it (Number quirk)', async () => {
    const saved = await new Settings({code: '00123'}).save();
    const id = saved.get('id') as number;

    const fetched = await Settings.forge({id}).fetch();
    // '00123' → Number('00123') is truthy → kept as the string '00123'
    // (NOT JSON.parse'd into the number 123).
    expect(fetched.get('code')).toBe('00123');
    expect(typeof fetched.get('code')).toBe('string');
  });

  it('stringifies JSON columns on a patch save', async () => {
    const created = await new Settings({preferences: {a: 1}}).save();
    const id = created.get('id') as number;

    await Settings.forge({id}).save({preferences: {a: 2, b: 3}}, {patch: true});

    const raw = await db('settings').where({id}).first();
    expect(raw.preferences).toBe('{"a":2,"b":3}');

    const fetched = await Settings.forge({id}).fetch();
    expect(fetched.get('preferences')).toEqual({a: 2, b: 3});
  });

  it('parses JSON columns for every model in a fetched collection', async () => {
    await db('settings').del();
    await new Settings({preferences: {n: 1}, tags: ['x']}).save();
    await new Settings({preferences: {n: 2}, tags: ['y', 'z']}).save();

    const collection = await Settings$Collection.forge().fetch();
    expect(collection.length).toBe(2);
    collection.models.forEach((m: {get: (k: string) => unknown}) => {
      expect(typeof m.get('preferences')).toBe('object');
      expect(Array.isArray(m.get('tags'))).toBe(true);
    });
  });

  it('leaves models without a jsonColumns declaration untouched', async () => {
    const saved = await new Plain({note: '{"not":"parsed"}'}).save();
    const id = saved.get('id') as number;

    const fetched = await Plain.forge({id}).fetch();
    // No jsonColumns → the string is stored and returned as-is.
    expect(fetched.get('note')).toBe('{"not":"parsed"}');
  });
});
