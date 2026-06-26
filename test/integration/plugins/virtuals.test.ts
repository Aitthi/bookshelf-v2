/**
 * Integration tests for the bundled virtuals plugin (src/plugins/virtuals.ts).
 *
 * Uses a dedicated Knex + Bookshelf instance so the plugin mutations do not
 * bleed into the shared harness used by other test suites.
 *
 * TDD sequence (run once before implementation to see RED, then GREEN):
 *   pnpm test test/integration/plugins/virtuals.test.ts
 */

import {describe, it, expect, beforeAll} from 'vitest';
import Knex from 'knex';
import BookshelfFactory from '../../../src/index';
import virtualsPlugin from '../../../src/plugins/virtuals';

// ---------------------------------------------------------------------------
// Isolated Bookshelf instance — sqlite :memory:
// ---------------------------------------------------------------------------

const db = Knex({
  client: 'sqlite3',
  connection: {filename: ':memory:'},
  useNullAsDefault: true
});

const orm = BookshelfFactory(db);
orm.plugin(virtualsPlugin);

// ---------------------------------------------------------------------------
// Model fixtures
// ---------------------------------------------------------------------------

/** Getter-only virtual: fullName computed from first + last. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Person = orm.Model.extend({
  tableName: 'persons',
  virtuals: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullName(this: any) {
      return `${this.get('first') as string} ${this.get('last') as string}`;
    }
  }
});

/** Getter + setter virtual: reverseName stores back to first/last. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PersonWithSetter = orm.Model.extend({
  tableName: 'persons',
  virtuals: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reverseName: {
      get(this: any): string {
        return `${this.get('last') as string}, ${this.get('first') as string}`;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(this: any, value: string): void {
        const [last, first] = value.split(', ');
        // Call originalSet path by setting real attributes directly via object form.
        // We avoid recursing through the virtual interceptor by using the real attrs.
        this.attributes.first = first ?? '';
        this.attributes.last = last ?? '';
      }
    }
  }
});

// ---------------------------------------------------------------------------
// beforeAll: no migrations needed — models are never persisted in these tests.
// ---------------------------------------------------------------------------

beforeAll(() => {
  // nothing to migrate; all tests operate on in-memory model instances
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('virtuals plugin', () => {
  describe('getter-only virtual', () => {
    it('model.get() returns the computed virtual value', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)({first: 'Jane', last: 'Doe'});
      expect(m.get('fullName')).toBe('Jane Doe');
    });

    it('model.get() still returns real attributes', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)({first: 'Jane', last: 'Doe'});
      expect(m.get('first')).toBe('Jane');
    });

    it('toJSON() includes the virtual attribute', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)({first: 'Jane', last: 'Doe'});
      const json = m.toJSON() as Record<string, unknown>;
      expect(json.fullName).toBe('Jane Doe');
      expect(json.first).toBe('Jane');
      expect(json.last).toBe('Doe');
    });

    it('toJSON({virtuals: false}) omits virtual attributes', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)({first: 'Jane', last: 'Doe'});
      const json = m.toJSON({virtuals: false}) as Record<string, unknown>;
      expect(json).not.toHaveProperty('fullName');
      expect(json.first).toBe('Jane');
    });

    it('model.set() on a getter-only virtual is silently ignored', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (Person as any)({first: 'Jane', last: 'Doe'});
      // Should not throw and should not corrupt real attrs
      m.set('fullName', 'Ignored Value');
      expect(m.get('first')).toBe('Jane');
      expect(m.get('last')).toBe('Doe');
    });
  });

  describe('getter + setter virtual', () => {
    it('model.get() returns the getter result', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (PersonWithSetter as any)({first: 'Jane', last: 'Doe'});
      expect(m.get('reverseName')).toBe('Doe, Jane');
    });

    it('model.set(key, value) invokes the virtual setter', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (PersonWithSetter as any)({first: '', last: ''});
      m.set('reverseName', 'Smith, John');
      expect(m.get('first')).toBe('John');
      expect(m.get('last')).toBe('Smith');
    });

    it('model.set({key: value}) object form invokes the virtual setter', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (PersonWithSetter as any)({first: '', last: ''});
      m.set({reverseName: 'Brown, Alice', extra: 'x'});
      expect(m.get('first')).toBe('Alice');
      expect(m.get('last')).toBe('Brown');
      // real attribute should also be set
      expect(m.get('extra')).toBe('x');
    });

    it('toJSON() includes the virtual getter result', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (PersonWithSetter as any)({first: 'Jane', last: 'Doe'});
      const json = m.toJSON() as Record<string, unknown>;
      expect(json.reverseName).toBe('Doe, Jane');
    });

    it('toJSON({virtuals: false}) excludes the virtual', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (PersonWithSetter as any)({first: 'Jane', last: 'Doe'});
      const json = m.toJSON({virtuals: false}) as Record<string, unknown>;
      expect(json).not.toHaveProperty('reverseName');
    });
  });
});
