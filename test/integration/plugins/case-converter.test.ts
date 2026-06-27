/**
 * Integration tests for the bundled case-converter plugin (src/plugins/case-converter.ts).
 *
 * Uses a dedicated Knex + Bookshelf instance so the plugin mutations do not
 * bleed into the shared harness used by other test suites.
 *
 * TDD sequence (run once before implementation to see RED, then GREEN):
 *   pnpm test test/integration/plugins/case-converter.test.ts
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import Knex from 'knex';
import BookshelfFactory from '../../../src/index';
import caseConverter from '../../../src/plugins/case-converter';

// ---------------------------------------------------------------------------
// Isolated Bookshelf instance — sqlite :memory:
// ---------------------------------------------------------------------------

const db = Knex({
  client: 'sqlite3',
  connection: {filename: ':memory:'},
  useNullAsDefault: true
});

const orm = BookshelfFactory(db);
orm.plugin(caseConverter);

// ---------------------------------------------------------------------------
// Model fixtures
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Person = orm.Model.extend({
  tableName: 'persons'
});

// ---------------------------------------------------------------------------
// beforeAll / afterAll: schema for round-trip test
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await db.schema.createTable('persons', (table) => {
    table.increments('id');
    table.string('first_name');
    table.string('last_name');
  });
});

afterAll(async () => {
  await db.schema.dropTableIfExists('persons');
  await db.destroy();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('case-converter plugin', () => {
  describe('parse() — DB row → camelCase model attributes', () => {
    it('converts snake_case keys to camelCase', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.parse({first_name: 'Ada', last_name: 'Lovelace'}) as Record<string, unknown>;
      expect(result).toEqual({firstName: 'Ada', lastName: 'Lovelace'});
    });

    it('leaves already-camelCase keys unchanged', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.parse({id: 1, firstName: 'Ada'}) as Record<string, unknown>;
      // id has no underscores → unchanged; firstName → camelize('firstName', true) = 'firstName'
      expect(result).toEqual({id: 1, firstName: 'Ada'});
    });

    it('handles a single underscore-separated key', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.parse({first_name: 'Ada'}) as Record<string, unknown>;
      expect(result.firstName).toBe('Ada');
      expect(result).not.toHaveProperty('first_name');
    });
  });

  describe('format() — camelCase model attributes → snake_case DB columns', () => {
    it('converts camelCase keys to snake_case', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.format({firstName: 'Ada', lastName: 'Lovelace'}) as Record<string, unknown>;
      expect(result).toEqual({first_name: 'Ada', last_name: 'Lovelace'});
    });

    it('leaves already-snake_case keys unchanged', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.format({id: 1, first_name: 'Ada'}) as Record<string, unknown>;
      expect(result).toEqual({id: 1, first_name: 'Ada'});
    });

    it('handles a single camelCase key', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)();
      const result = m.format({firstName: 'Ada'}) as Record<string, unknown>;
      expect(result.first_name).toBe('Ada');
      expect(result).not.toHaveProperty('firstName');
    });
  });

  describe('round-trip: save (camelCase) → fetch (camelCase)', () => {
    it('stores and retrieves a model with camelCase attributes transparently', async () => {
      // Save with camelCase attrs — format() should convert to snake_case for the DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = await new (Person as any)({firstName: 'Ada', lastName: 'Lovelace'}).save();
      const savedId = saved.get('id') as number;
      expect(savedId).toBeGreaterThan(0);

      // Fetch back — parse() should convert snake_case DB row to camelCase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetched = await (Person as any).forge({id: savedId}).fetch();
      expect(fetched.get('firstName')).toBe('Ada');
      expect(fetched.get('lastName')).toBe('Lovelace');
      // snake_case keys should NOT appear on the model
      expect(fetched.get('first_name')).toBeUndefined();
      expect(fetched.get('last_name')).toBeUndefined();
    });
  });
});
