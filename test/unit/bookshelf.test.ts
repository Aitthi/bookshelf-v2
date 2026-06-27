import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { vi } from 'vitest';
import assert from 'node:assert';
import knex from 'knex';
import bookshelfFactory from '../../src/index';
import BookshelfModel from '../../src/model';

describe('Bookshelf', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bookshelf: any;

  beforeAll(() => {
    bookshelf = bookshelfFactory(knex({ client: 'sqlite3', useNullAsDefault: true }));
  });

  afterAll(() => {
    return bookshelf.knex.destroy();
  });

  describe('Construction', () => {
    it('should fail without a knex instance', () => {
      assert.throws(() => bookshelfFactory(undefined as any), /Invalid knex/);
    });

    it('should fail if passing a random object', () => {
      assert.throws(
        () => bookshelfFactory({ config: 'something', options: ['one', 'two'] } as any),
        /Invalid knex/,
      );
    });
  });

  describe('Collection and Model registry with relations', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let TestModel: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let TestCollection: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ModelWithRelations: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let modelWithRelations: any;

    beforeAll(() => {
      TestModel = bookshelf.Model.extend({ tableName: 'related' });
      TestCollection = bookshelf.Collection.extend();

      bookshelf.model('TestModel', TestModel);
      bookshelf.collection('TestCollection', TestCollection);

      ModelWithRelations = bookshelf.Model.extend({
        testHasOne() {
          return this.hasOne('TestModel');
        },
        testHasMany() {
          return this.hasMany('TestCollection');
        },
        testMorphTo() {
          return this.morphTo('morphable', ['relType', 'relId'], 'TestModel', ['TestModel', 'relValue']);
        },
        testNotResolved() {
          return this.hasOne('NonexistentModel');
        },
        testThrough() {
          return this.hasMany('TestCollection').through('TestModel');
        },
      });

      modelWithRelations = new ModelWithRelations();
    });

    it('can access registered models through collection methods', () => {
      assert.deepStrictEqual(modelWithRelations.testHasOne().relatedData.target, TestModel);
    });

    it('can access registered collections through collection methods', () => {
      assert.deepStrictEqual(modelWithRelations.testHasMany().relatedData.target, TestCollection);
    });

    it('passes the registered model name to the relation method', () => {
      const relationSpy = vi.spyOn(bookshelf.Model.prototype, '_relation');
      modelWithRelations.testHasOne();
      // Check first two args match (sinon calledWith is partial — spy may receive more args)
      expect(relationSpy.mock.calls[0].slice(0, 2)).toEqual(['hasOne', 'TestModel']);
      relationSpy.mockRestore();
    });

    it('throws a ModelNotResolved error for nonexistent relations', () => {
      assert.throws(() => modelWithRelations.testNotResolved(), {
        message: 'The model NonexistentModel could not be resolved from the registry.',
      });
    });

    it('can be used in through() relations', () => {
      const relation = modelWithRelations.testThrough();
      assert.strictEqual(relation.relatedData.throughTableName, 'related');
    });

    it('can be used in morphTo() relations', () => {
      // Spy on the BASE BookshelfModel.prototype.morphTo — the function the wrapper
      // delegates to AFTER resolving string model names. This matches what the mocha
      // test does: sinon.spy(require('../../lib/model').prototype, 'morphTo').
      const morphToSpy = vi.spyOn(BookshelfModel.prototype, 'morphTo');

      try {
        // Wrap in try/catch because Bookshelf evaluates morph targets and we
        // don't care that the target is not a valid morph model
        modelWithRelations.testMorphTo();
        morphToSpy.mockRestore();
      } catch (error: unknown) {
        const msg = (error as Error).message;
        if (msg !== 'The target polymorphic type "undefined" is not one of the defined target types') {
          morphToSpy.mockRestore();
          throw error;
        }

        expect(morphToSpy.mock.calls[0].slice(0, 4)).toEqual([
          'morphable',
          ['relType', 'relId'],
          TestModel,
          [TestModel, 'relValue'],
        ]);
        morphToSpy.mockRestore();
      }
    });
  });

  describe('.VERSION', () => {
    it('should equal version number in package.json', async () => {
      const { default: p } = await import('../../package.json');
      assert.strictEqual(bookshelf.VERSION, p.version);
    });
  });

  describe('.collection()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let TestCollection: any;

    beforeAll(() => {
      TestCollection = bookshelf.Collection.extend({ property: 'something' });
    });

    beforeEach(() => {
      bookshelf.registry.collections = {};
    });

    it('registers a collection', () => {
      const RegisteredCollection = bookshelf.collection('TestCollection', TestCollection);
      assert.deepStrictEqual(RegisteredCollection, TestCollection);
    });

    it('returns a previously registered collection if passing a string', () => {
      const RegisteredCollection = bookshelf.collection('TestCollection', TestCollection);
      assert.deepStrictEqual(bookshelf.collection('TestCollection'), RegisteredCollection);
    });

    it('preserves instance properties', () => {
      bookshelf.collection('TestCollection', TestCollection);
      assert.strictEqual(bookshelf.collection('TestCollection').prototype.property, 'something');
    });

    it('returns undefined if the specified collection is not found', () => {
      assert.strictEqual(bookshelf.collection('DoesNotExist'), undefined);
    });

    it('throws when trying to register an already registered collection name', () => {
      bookshelf.collection('TestCollection', TestCollection);
      assert.throws(() => bookshelf.collection('TestCollection', TestCollection));
    });
  });

  describe('.model()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let TestModel: any;

    beforeAll(() => {
      TestModel = bookshelf.Model.extend({ tableName: 'records' }, { custom: 'something' });
    });

    beforeEach(() => {
      bookshelf.registry.models = {};
    });

    it('registers a model', () => {
      const RegisteredModel = bookshelf.model('TestModel', TestModel);
      assert.deepStrictEqual(RegisteredModel, TestModel);
    });

    it('returns a previously registered model if passing a string', () => {
      const RegisteredModel = bookshelf.model('TestModel', TestModel);
      assert.deepStrictEqual(bookshelf.model('TestModel'), RegisteredModel);
    });

    it('preserves instance properties', () => {
      bookshelf.model('TestModel', TestModel);
      assert.strictEqual(bookshelf.model('TestModel').prototype.tableName, 'records');
    });

    it('preserves class properties', () => {
      bookshelf.model('TestModel', TestModel);
      assert.strictEqual(bookshelf.model('TestModel').custom, 'something');
    });

    it('throws when trying to register an already registered model name', () => {
      bookshelf.model('TestModel', TestModel);
      assert.throws(() => bookshelf.model('TestModel', TestModel));
    });

    it('returns undefined if the specified model is not found', () => {
      assert.strictEqual(bookshelf.model('DoesNotExist'), undefined);
    });
  });

  describe('.resolve()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ModelOne: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ModelTwo: any;

    beforeAll(() => {
      ModelOne = bookshelf.Model.extend({});
      ModelTwo = bookshelf.Model.extend({});
      bookshelf.resolve = (name: string) => {
        if (name === 'One') return ModelOne;
        if (name === 'Two') return ModelTwo;
      };
    });

    it('can be used to resolve models with a custom function', () => {
      assert.deepStrictEqual(bookshelf.model('One'), ModelOne);
      assert.deepStrictEqual(bookshelf.model('Two'), ModelTwo);
    });

    it('returns undefined if no model is resolved', () => {
      assert.strictEqual(bookshelf.model('Three'), undefined);
    });
  });
});
