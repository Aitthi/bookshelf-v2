import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { vi } from 'vitest';
import assert from 'node:assert';
import Model from '../../src/model';
import Collection from '../../src/collection';

describe('Model', () => {
  describe('#save()', () => {
    it('should clone the passed in `options` object', () => {
      const model = new Model();
      const options = {
        query: {},
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (model as any).sync = (opts: unknown) => {
        assert.notStrictEqual(options, opts);
        return {
          insert: () => Promise.resolve({}),
        };
      };

      (model as any).refresh = () => Promise.resolve({});

      return model.save(null, options as any).then(() => {
        assert.equal(Object.keys(options).filter((k) => !['query'].includes(k)).length, 0);
      });
    });

    describe('when the save method is update', () => {
      it('should not call model.parse with a non-object argument', () => {
        const model = new Model();
        (model as any).sync = () => {
          return {
            update: () => Promise.resolve(1),
          };
        };
        (model as any).refresh = () => Promise.resolve({});
        const parse = vi.spyOn(model as any, 'parse');
        return model.save(null, { method: 'update' } as any).then(() => {
          expect(parse).not.toHaveBeenCalledWith(undefined);
        });
      });

      it('should merge the updated attributes on the existing model', () => {
        const model = new Model({ oldProp: 'b' });
        (model as any).sync = () => {
          return {
            update: () => Promise.resolve([{ newProp: 'a' }]),
          };
        };
        (model as any).refresh = () => Promise.resolve({});
        const parse = vi.spyOn(model as any, 'parse');
        return model.save(null, { method: 'update' } as any).then((updatedModel: any) => {
          expect(parse).toHaveBeenCalledWith({ newProp: 'a' });
          expect(updatedModel.toJSON()).toEqual({ oldProp: 'b', newProp: 'a' });
        });
      });
    });

    describe('when the save method is insert', () => {
      it('should not call model.parse with a non-object argument', () => {
        const model = new Model();
        (model as any).id = '12345';
        (model as any).sync = () => {
          return {
            insert: () => Promise.resolve(['12345']),
          };
        };
        (model as any).refresh = () => Promise.resolve({});
        const parse = vi.spyOn(model as any, 'parse');
        return model.save(null, { method: 'insert' } as any).then(() => {
          expect(parse).not.toHaveBeenCalledWith('12345');
        });
      });
    });
  });

  describe('#timestamp()', () => {
    it('will set the updated_at and the created_at attributes to a new date for new models', () => {
      const newModel = new Model({}, { hasTimestamps: true } as any);
      (newModel as any).timestamp();

      expect((newModel as any).get('created_at')).toBeInstanceOf(Date);
      expect((newModel as any).get('updated_at')).toBeInstanceOf(Date);
    });

    it('will not set the created_at attribute to a new date for existing models', () => {
      const existingModel = new Model({ id: 1 }, { hasTimestamps: true } as any);
      (existingModel as any).timestamp();

      expect((existingModel as any).get('created_at')).toBeUndefined();
      expect((existingModel as any).get('updated_at')).toBeInstanceOf(Date);
    });

    it('will set the created_at attribute when inserting new models with a predefined id value', () => {
      const model = new Model({ id: 1 }, { hasTimestamps: true } as any);
      (model as any).timestamp({ method: 'insert' });

      expect((model as any).get('created_at')).toBeInstanceOf(Date);
      expect((model as any).get('updated_at')).toBeInstanceOf(Date);
    });

    it("will not set timestamps on a model if hasTimestamps isn't set", () => {
      const model = new Model();
      (model as any).timestamp();

      expect((model as any).get('created_at')).toBeFalsy();
      expect((model as any).get('updated_at')).toBeFalsy();
    });
  });

  describe('#toJSON()', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ModelCollection: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let testModel: any;

    beforeAll(() => {
      ModelCollection = (Collection as any).extend({ model: Model });
    });

    beforeEach(() => {
      testModel = new Model({ id: 1, firstName: 'Joe', lastName: 'Shmoe', address: '123 Main St.' });
    });

    it('includes the idAttribute in the hash', () => {
      const DifferentModel = (Model as any).extend({ idAttribute: '_id' });
      const tm = new DifferentModel({ _id: 1, name: 'Joe' });
      assert.deepEqual(tm.toJSON(), { _id: 1, name: 'Joe' });
    });

    it('includes the relations loaded on the model', () => {
      testModel.relations = {
        someList: new ModelCollection([{ id: 1 }, { id: 2 }]),
      };
      const json = testModel.toJSON();

      assert.deepEqual(Object.keys(json), ['id', 'firstName', 'lastName', 'address', 'someList']);
      assert.equal(json.someList.length, 2);
    });

    describe('with "shallow" option', () => {
      it("doesn't include the relations loaded on the model if {shallow: true} is passed", () => {
        testModel.relations = {
          someList: new ModelCollection([{ id: 1 }, { id: 2 }]),
        };
        const shallow = testModel.toJSON({ shallow: true });

        assert.deepEqual(Object.keys(shallow), ['id', 'firstName', 'lastName', 'address']);
      });
    });

    describe('with "omitNew" option', () => {
      it('does not omit new models from collections and relations when {omitNew: false} is passed', () => {
        testModel.relations = {
          someList: new ModelCollection([{ id: 2 }, { attr2: 'Test' }]),
          someRel: new Model({ id: 3 }),
          otherRel: new Model({ attr3: 'Test' }),
        };
        const coll = new ModelCollection([testModel, new Model({ attr5: 'Test' }), new Model({ id: 4, attr4: 'Test' })]);
        const json = coll.toJSON({ omitNew: false });

        assert.equal(json.length, 3);
        assert.equal(json[0].someList.length, 2);
        assert.deepEqual(Object.keys(json[0]), ['id', 'firstName', 'lastName', 'address', 'someList', 'someRel', 'otherRel']);
        assert.deepEqual(Object.keys(json[1]), ['attr5']);
        assert.deepEqual(Object.keys(json[2]), ['id', 'attr4']);
      });

      it('does not omit new models from collections and relations when omitNew is not specified', () => {
        testModel.relations = {
          someList: new ModelCollection([{ id: 2 }, { attr2: 'Test' }]),
          someRel: new Model({ id: 3 }),
          otherRel: new Model({ attr3: 'Test' }),
        };
        const coll = new ModelCollection([testModel, new Model({ attr5: 'Test' }), new Model({ id: 4, attr4: 'Test' })]);
        const json = coll.toJSON();

        assert.equal(json.length, 3);
        assert.equal(json[0].someList.length, 2);
        assert.deepEqual(Object.keys(json[0]), ['id', 'firstName', 'lastName', 'address', 'someList', 'someRel', 'otherRel']);
        assert.deepEqual(Object.keys(json[1]), ['attr5']);
        assert.deepEqual(Object.keys(json[2]), ['id', 'attr4']);
      });

      it('omits new models from collections and relations when {omitNew: true} is passed', () => {
        testModel.relations = {
          someList: new ModelCollection([{ id: 2 }, { attr2: 'Test' }]),
          someRel: new Model({ id: 3 }),
          otherRel: new Model({ attr3: 'Test' }),
        };
        const coll = new ModelCollection([testModel, new Model({ attr5: 'Test' }), new Model({ id: 4, attr4: 'Test' })]);
        const omitNew = coll.toJSON({ omitNew: true });

        assert.equal(omitNew.length, 2);
        assert.deepEqual(Object.keys(omitNew[0]), ['id', 'firstName', 'lastName', 'address', 'someList', 'someRel']);
        assert.deepEqual(Object.keys(omitNew[1]), ['id', 'attr4']);
        assert.equal(omitNew[0].someList.length, 1);
      });

      it('returns null for a new model when {omitNew: true} is passed', () => {
        const tm = new Model({ attr1: 'Test' });
        const omitNew = (tm as any).toJSON({ omitNew: true });
        assert.deepEqual(omitNew, null);
      });
    });

    describe('with "visible" option', () => {
      it("only shows the fields specified in the model's \"visible\" property", () => {
        testModel.visible = ['firstName'];
        assert.deepEqual(testModel.toJSON(), { firstName: 'Joe' });
      });

      it('only shows the fields specified in the "options.visible" property', () => {
        const json = testModel.toJSON({ visible: ['firstName'] });
        assert.deepEqual(json, { firstName: 'Joe' });
      });

      it("allows overriding the model's \"visible\" property with a \"options.visible\" argument", () => {
        testModel.visible = ['lastName'];
        const json = testModel.toJSON({ visible: ['firstName'] });
        assert.deepEqual(json, { firstName: 'Joe' });
      });
    });

    describe('with "hidden" option', () => {
      it("hides the fields specified in the model's \"hidden\" property", () => {
        testModel.hidden = ['firstName'];
        assert.deepEqual(testModel.toJSON(), { id: 1, lastName: 'Shmoe', address: '123 Main St.' });
      });

      it('hides the fields specified in the "options.hidden" property', () => {
        const json = testModel.toJSON({ hidden: ['firstName', 'id'] });
        assert.deepEqual(json, { lastName: 'Shmoe', address: '123 Main St.' });
      });

      it('prioritizes "hidden" if there are conflicts when using both "hidden" and "visible"', () => {
        testModel.visible = ['firstName', 'lastName'];
        testModel.hidden = ['lastName'];
        assert.deepEqual(testModel.toJSON(), { firstName: 'Joe' });
      });

      it('prioritizes "options.hidden" if there are conflicts when using both "options.hidden" and "options.visible"', () => {
        const json = testModel.toJSON({ visible: ['firstName', 'lastName'], hidden: ['lastName'] });
        assert.deepEqual(json, { firstName: 'Joe' });
      });

      it("allows overriding the model's \"hidden\" property with a \"options.hidden\" argument", () => {
        testModel.hidden = ['lastName'];
        const json = testModel.toJSON({ hidden: ['firstName', 'id'] });
        assert.deepEqual(json, { lastName: 'Shmoe', address: '123 Main St.' });
      });

      it("prioritizes \"options.hidden\" when overriding both the model's \"hidden\" and \"visible\" properties with \"options.hidden\" and \"options.visible\" arguments", () => {
        testModel.visible = ['lastName', 'address'];
        testModel.hidden = ['address'];
        const json = testModel.toJSON({ visible: ['firstName', 'lastName'], hidden: ['lastName'] });

        assert.deepEqual(json, { firstName: 'Joe' });
      });
    });

    it("ignores the model's \"hidden\" and \"visible\" properties with the \"options.visibility\" argument", () => {
      testModel.visible = ['firstName', 'lastName'];
      testModel.hidden = ['lastName'];
      const json = testModel.toJSON({ visibility: false });

      assert.deepEqual(json, { id: 1, firstName: 'Joe', lastName: 'Shmoe', address: '123 Main St.' });
    });

    describe('with JSON.stringify', () => {
      it('serializes correctly', () => {
        testModel.visible = ['firstName'];
        assert.deepEqual(JSON.stringify(testModel), '{"firstName":"Joe"}');
      });

      it('serializes correctly when placed as object property', () => {
        testModel.visible = ['firstName'];
        const obj = { model: testModel };
        assert.deepEqual(JSON.stringify(obj), '{"model":{"firstName":"Joe"}}');
      });

      it('serializes correctly when placed in an array', () => {
        testModel.visible = ['firstName'];
        const arr = [testModel];
        assert.deepEqual(JSON.stringify(arr), '[{"firstName":"Joe"}]');
      });
    });
  });

  describe('#hasChanged()', () => {
    it('returns true if an attribute was set on a new model instance', () => {
      const model = new Model({ test: 'something' });
      expect((model as any).hasChanged('test')).toBe(true);
    });

    it("returns false if the attribute isn't set on a new model instance", () => {
      const model = new Model({ test: 'something' });
      expect((model as any).hasChanged('id')).toBe(false);
    });

    it("returns false if the attribute isn't updated after a sync operation", () => {
      const model = new Model({ test: 'something' });
      (model as any)._reset();
      expect((model as any).hasChanged('test')).toBe(false);
    });

    it('returns true if an existing attribute is updated', () => {
      const model = new Model({ test: 'something' });
      (model as any)._reset();
      (model as any).set('test', 'something else');
      expect((model as any).hasChanged('test')).toBe(true);
    });
  });
});
