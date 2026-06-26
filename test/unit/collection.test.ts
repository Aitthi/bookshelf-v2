import { describe, it, expect, beforeEach, vi } from 'vitest';
import assert from 'node:assert';
import CollectionBase from '../../src/base/collection';
import ModelBase from '../../src/base/model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const compact = <T>(arr: T[]): T[] => arr.filter(Boolean);

describe('Collection', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Collection = (CollectionBase as any).extend({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: (ModelBase as any).extend({
      tableName: 'test_table',
      idAttribute: 'some_id',
      invokedMethod() {
        return Promise.resolve(this.id);
      },
    }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let collection: any;

  beforeEach(() => {
    collection = new Collection([{ some_id: 1, name: 'Test' }, { name: 'Test2' }, { name: 'Test3' }]);
  });

  it('should have a tableName method that returns the tableName of the model', () => {
    assert.equal(collection.tableName(), 'test_table');
  });

  it('should be iterable', () => {
    const models: unknown[] = [];
    collection = new Collection([{ some_id: 1 }, { some_id: 2 }]);
    for (const model of collection) {
      models.push(model);
    }
    assert.equal(models.length, collection.length);
  });

  it('should have an idAttribute method, returning the idAttribute of the model', () => {
    assert.equal(collection.idAttribute(), 'some_id');
  });

  it('should initialize the items passed to the constructor', () => {
    assert.equal(collection.length, 3);
    assert.equal(collection.at(0).id, 1);
    assert.equal(collection.at(1).id, undefined);
  });

  it('should use the `reset` method, to reset the collection', () => {
    collection.reset([]);
    assert.equal(collection.length, 0);
  });

  it('should use _prepareModel to prep model instances', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = new (ModelBase as any)({ id: 1 });
    expect(model).toBe(collection._prepareModel(model));
    const newModel = collection._prepareModel({ some_id: 1 });
    assert.equal(newModel instanceof collection.model, true);
  });

  it('contains a mapThen method which calls map on the models and returns a when.all promise', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spyIterator = vi.fn((model: any) => model.id);

    return collection.mapThen(spyIterator).then((resp: unknown[]) => {
      assert.equal(spyIterator.mock.calls.length, 3);
      assert.deepEqual(compact(resp), [1]);
    });
  });

  it('contains an invokeThen method which does an invoke on the models and returns a when.all promise', () => {
    return collection.invokeThen('invokedMethod').then((resp: unknown[]) => {
      expect(compact(resp)).toEqual([1]);
    });
  });

  describe('#add()', () => {
    it('adds new models to the collection', () => {
      const originalLength = collection.length;
      const newLength = collection.add({ some_id: 3, name: 'Alice' }).length;
      expect(newLength).toBeGreaterThan(originalLength);
    });

    it('ignores duplicate models by default', () => {
      collection.add({ some_id: 1, name: 'Not Test' });
      expect(collection.at(0).get('name')).toBe('Test');
    });

    it('merges duplicate models when the merge option is set', () => {
      collection.add({ some_id: 1, name: 'Not Test' }, { merge: true });
      expect(collection.at(0).get('name')).toBe('Not Test');
    });

    it("Ignores the remove option when it's set to true", () => {
      const originalLength = collection.length;
      const newLength = collection.add(null, { remove: true }).length;

      expect(collection.at(0).get('name')).toBe('Test');
      expect(newLength).toBe(originalLength);
    });

    it("Ignores the add option when it's set to false and still adds new models", () => {
      const originalLength = collection.length;
      const newLength = collection.add({ some_id: 3, name: 'Alice' }, { add: false }).length;
      expect(newLength).toBeGreaterThan(originalLength);
    });
  });

  describe('#first()', () => {
    it('returns the first element in the collection', () => {
      const first = collection.first();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.equal(first instanceof (ModelBase as any), true);
      assert.equal(first.get('name'), 'Test');
    });

    it('returns undefined if the collection is empty', () => {
      collection = new Collection();
      const first = collection.first();
      assert.equal(typeof first, 'undefined');
    });
  });

  describe('#last()', () => {
    it('returns the last element in the collection', () => {
      const last = collection.last();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assert.equal(last instanceof (ModelBase as any), true);
      assert.equal(last.get('name'), 'Test3');
    });

    it('returns undefined if the collection is empty', () => {
      collection = new Collection();
      const last = collection.last();
      assert.equal(typeof last, 'undefined');
    });
  });

  describe('#set()', () => {
    it('should accept a single object as argument', () => {
      collection.set({ some_id: 3, name: 'New Model' });
      expect(collection.at(0).get('name')).toBe('New Model');
    });

    it('should accept Models as argument', () => {
      const model = new collection.model({ some_id: 3, name: 'New Model' });
      collection.set([model]);
      expect(collection.at(0).get('name')).toBe('New Model');
    });

    it('should delete old models and add new ones by default', () => {
      collection.set([
        { some_id: 1, name: 'Item 1' },
        { some_id: 2, name: 'Item 2' },
      ]);
      assert.equal(collection.length, 2);
      assert.equal(collection.at(0).get('name'), 'Item 1');
      assert.equal(collection.at(1).get('name'), 'Item 2');
    });

    it('should delete old models and add new ones with similar binary IDs', () => {
      collection = new Collection([{ some_id: Buffer.from('90', 'hex'), name: 'Test' }, { name: 'No Id' }]);
      collection.set([
        { some_id: Buffer.from('90', 'hex'), name: 'Item 1' },
        { some_id: Buffer.from('93', 'hex'), name: 'Item 2' },
      ]);
      assert.equal(collection.length, 2);
      assert.equal(collection.at(0).get('name'), 'Item 1');
      assert.equal(collection.at(1).get('name'), 'Item 2');
    });

    it('should merge duplicate models by default', () => {
      collection.set({ some_id: 1, name: 'Not Test' });
      expect(collection.at(0).get('name')).toBe('Not Test');
      expect(collection.length).toBe(1);
    });

    it('should merge duplicate models in the new set', () => {
      collection.set([
        { some_id: 1, name: 'Not Test' },
        { some_id: 1, name: 'Not Test As Well' },
      ]);
      expect(collection.at(0).get('name')).toBe('Not Test As Well');
      expect(collection.toJSON().length).toBe(collection.length);
      expect(collection.length).toBe(1);
    });

    it('should not remove models with {remove: false} option set', () => {
      collection.set([{ some_id: 2, name: 'Item2' }], { remove: false });
      assert.equal(collection.length, 4);
    });

    it('should not merge new attribute values with {merge: false} option set', () => {
      collection.set([{ some_id: 1, name: 'WontChange' }], { merge: false });
      assert.equal(collection.get(1).get('name'), 'Test');
    });

    it('should add duplicate models if both the remove and merge options are false', () => {
      const originalLength = collection.length;
      const newLength = collection.set({ some_id: 1, name: 'Not Test' }, { merge: false, remove: false }).length;
      expect(newLength).toBeGreaterThan(originalLength);
    });

    it('should not add models with {add: false} option set', () => {
      collection.set([{ some_id: 3, name: 'WontAdd' }], { add: false });
      assert.equal(collection.get(3), undefined);
    });

    it('should support large arrays', { timeout: 120000 }, () => {
      const count = 200000;
      const models = [];

      for (let i = 0; i < count; ++i) {
        models.push(new collection.model({ some_id: i, name: 'Large-' + i }));
      }

      collection.set(models, { add: true, remove: false, merge: false });

      assert.equal(collection.get(count - 1).get('name'), 'Large-' + (count - 1));
    });
  });
});
