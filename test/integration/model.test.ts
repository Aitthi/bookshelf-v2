/**
 * Vitest port of test/integration/model.js
 *
 * Tests Model methods against the src/ ORM via the TypeScript harness.
 *
 * Conversion notes:
 *   - module.exports = function(bookshelf){...} → top-level describe('Model', ...)
 *   - require('./helpers/objects')(bookshelf) → harness import (bookshelf, Models)
 *   - mocha → Vitest globals (describe/it/beforeAll/beforeEach/afterEach/afterAll)
 *   - mocha `context` → describe
 *   - chai expect → Vitest expect; node:assert for equal/deepEqual/ok/fail
 *   - bluebird Promise → native; Promise.delay → local delay(); Promise.join → Promise.all
 *   - .tap()/.call() → async/await or .then(); .catch(Type, fn) → catch + instanceof
 *   - sync STUB return values are wrapped in BPromise.resolve because the ORM chains
 *     `.bind()`/`.tap()` on `sync.first()` (see src/model.ts _doFetch) and on save results.
 *   - this.skip() (postgresql-only schema tests) → it.skip with a reason comment
 *   - the original mocha suite ran model.js FIRST against a freshly-seeded DB, so a single
 *     initialize() in beforeAll plus faithful in-file test order reproduces the same state.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach, afterAll} from 'vitest';
import {createRequire} from 'node:module';
import assert from 'node:assert';
// `equal` (strict) is a named import so its `asserts` signature satisfies TS2775.
import {equal} from 'node:assert/strict';
import {bookshelf, Models, initialize, formatNumber, countModels} from './helpers/harness';
import {BPromise} from '../../src/internal/promise';
import Sync from '../../src/sync';

const _require = createRequire(import.meta.url);
// lodash/uuid have no type declarations in this project (src uses native replacements),
// so they are loaded as untyped CJS modules.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _: any = _require('lodash');
const {v4: uuidv4} = _require('uuid') as {v4: () => string};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const QueryBuilder: any = _require('knex/lib/query/querybuilder');

// Non-strict deepEqual (matches the original `assert.deepEqual`); not an assertion
// signature, so no annotation is needed and TS2775 does not apply.
// eslint-disable-next-line @typescript-eslint/no-deprecated
const deepEqual = assert.deepEqual;
// Plain truthiness check — avoids TS2775 from node:assert's `asserts` signatures.
const ok = (value: unknown, message?: string): void => {
  if (!value) throw new Error(message ?? 'Assertion failed');
};

const dialect = bookshelf.knex.client.dialect as string;
const fmt = formatNumber(dialect);
const checkCount = (actual: unknown, expected: number) => {
  equal(actual, fmt(expected));
};
const countTestAuthors = countModels(Models.TestAuthor, {withSchema: 'test'});

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Shared, mutable sync stub — mirrors the original (mutated via _.extend in some tests).
// Returns BPromise so the ORM can chain `.bind()`/`.tap()` on the results.
const stubSync = {
  first() {
    return BPromise.resolve({});
  },
  select() {
    return BPromise.resolve({});
  },
  insert() {
    return BPromise.resolve({});
  },
  update() {
    return BPromise.resolve(1);
  },
  del() {
    return BPromise.resolve({});
  }
};

beforeAll(async () => {
  await initialize();
});

describe('Model', () => {
  describe('Events', () => {
    describe('creating', () => {
      it('contains all the attributes set on the model as the second argument', () => {
        const admin = new Models.Admin({username: 'bob'});

        admin.on('creating', (model: any, attributes: any) => {
          expect(attributes).toMatchObject({username: 'bob', password: 'supersecret'});
        });

        return admin.save({password: 'supersecret'});
      });
    });

    describe('updating', () => {
      it('contains all the attributes set on the model as the second argument', () => {
        const admin = new Models.Admin({username: 'bob'});

        admin.on('updating', (model: any, attributes: any) => {
          expect(attributes).toMatchObject({username: 'bob', password: 'supersecret'});
        });

        return admin.save().then(() => {
          admin.set({username: 'bob'});
          return admin.save({password: 'supersecret'});
        });
      });

      it('contains only the attributes passed to save() as the second argument if using the patch: true option', () => {
        const admin = new Models.Admin();

        admin.on('updating', (model: any, attributes: any) => {
          expect(attributes).toMatchObject({password: 'supersecret'});
          expect(attributes).not.toMatchObject({username: 'bob'});
        });

        return admin.save().then(() => {
          admin.set({username: 'bob'});
          return admin.save({password: 'supersecret'}, {patch: true});
        });
      });
    });

    describe('fetching:collection', () => {
      it('passes the collection as first argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetching:collection', (collection: any) => {
          expect(collection).toBeInstanceOf(bookshelf.Collection);
          expect(collection.model).toBe(Models.Site);
        });

        return site.fetchAll();
      });

      it('passes the column definitions to fetch as second argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetching:collection', (collection: any, columns: any) => {
          expect(columns).toBeInstanceOf(Array);
          expect(columns.length).toBeGreaterThan(0);
        });

        return site.fetchAll();
      });

      it('passes options as third argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetching:collection', (collection: any, columns: any, options: any) => {
          expect(options).toBeInstanceOf(Object);
          expect(options).toHaveProperty('query');
        });

        return site.fetchAll();
      });
    });

    describe('fetched:collection', () => {
      it('passes the collection as first argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetched:collection', (collection: any) => {
          expect(collection).toBeInstanceOf(bookshelf.Collection);
          expect(collection.model).toBe(Models.Site);
        });

        return site.fetchAll();
      });

      it('passes the fetched columns as second argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetched:collection', (collection: any, columns: any) => {
          expect(columns).toBeInstanceOf(Array);
          expect(columns.length).toBeGreaterThan(0);
        });

        return site.fetchAll();
      });

      it('passes options as third argument to the listener', () => {
        const site = new Models.Site();

        site.on('fetching:collection', (collection: any, columns: any, options: any) => {
          expect(options).toBeInstanceOf(Object);
          expect(options).toHaveProperty('query');
        });

        return site.fetchAll();
      });
    });
  });

  describe('extend/constructor/initialize', () => {
    const User = bookshelf.Model.extend(
      {
        idAttribute: 'user_id',
        getData() {
          return 'test';
        }
      },
      {
        classMethod() {
          return 'test';
        }
      }
    );

    const SubUser = User.extend(
      {
        otherMethod() {
          return this.getData();
        }
      },
      {
        classMethod2() {
          return 'test2';
        }
      }
    );

    const OtherUser = bookshelf.Model.extend(
      {
        idAttribute: 'user_id',
        getData() {
          return 'test';
        }
      },
      {
        classMethod() {
          return 'test';
        }
      }
    );

    it('can be extended', () => {
      const user = new User({name: 'hoge'});
      const subUser = new SubUser();

      expect(user.idAttribute).toBe('user_id');
      expect(user.getData()).toBe('test');
      expect(subUser.otherMethod()).toBe('test');
      expect(User.classMethod()).toBe('test');
      expect(SubUser.classMethod()).toBe('test');
      expect(SubUser.classMethod2()).toBe('test2');
    });

    it('accepts a custom `constructor` property', () => {
      const CustomUser = bookshelf.Model.extend({
        // Function expression (not a concise method) so it is constructable.
        constructor: function (this: any) {
          this.item = 'test';
          bookshelf.Model.apply(this, arguments as any);
        }
      });

      equal(new CustomUser().item, 'test');
    });

    it('initializes an empty object for storing changed attributes', () => {
      equal(User.prototype.changed, undefined);
      deepEqual(new User().changed, {});
    });

    describe('should have own errors: name of', () => {
      it('NotFoundError', () => {
        const err = new User.NotFoundError();
        const suberr = new SubUser.NotFoundError();

        expect(User.NotFoundError).not.toEqual(bookshelf.Model.NotFoundError);
        expect(err).toBeInstanceOf(bookshelf.Model.NotFoundError);
        expect(User.NotFoundError).not.toEqual(SubUser.NotFoundError);
        expect(err).not.toBeInstanceOf(SubUser.NotFoundError);
        expect(suberr).toBeInstanceOf(User.NotFoundError);
        expect(User.NotFoundError).not.toEqual(OtherUser.NotFoundError);
        expect(err).not.toBeInstanceOf(OtherUser.NotFoundError);
      });

      it('NoRowsUpdatedError', () => {
        const err = new User.NoRowsUpdatedError();
        const suberr = new SubUser.NoRowsUpdatedError();

        expect(User.NoRowsUpdatedError).not.toEqual(bookshelf.Model.NoRowsUpdatedError);
        expect(err).toBeInstanceOf(bookshelf.Model.NoRowsUpdatedError);
        expect(User.NoRowsUpdatedError).not.toEqual(SubUser.NoRowsUpdatedError);
        expect(err).not.toBeInstanceOf(SubUser.NoRowsUpdatedError);
        expect(suberr).toBeInstanceOf(User.NoRowsUpdatedError);
        expect(User.NoRowsUpdatedError).not.toEqual(OtherUser.NoRowsUpdatedError);
        expect(err).not.toBeInstanceOf(OtherUser.NoRowsUpdatedError);
      });

      it('NoRowsDeletedError', () => {
        const err = new User.NoRowsDeletedError();
        const suberr = new SubUser.NoRowsDeletedError();

        expect(User.NoRowsDeletedError).not.toEqual(bookshelf.Model.NoRowsDeletedError);
        expect(err).toBeInstanceOf(bookshelf.Model.NoRowsDeletedError);
        expect(User.NoRowsDeletedError).not.toEqual(SubUser.NoRowsDeletedError);
        expect(err).not.toBeInstanceOf(SubUser.NoRowsDeletedError);
        expect(suberr).toBeInstanceOf(User.NoRowsDeletedError);
        expect(User.NoRowsDeletedError).not.toEqual(OtherUser.NoRowsDeletedError);
        expect(err).not.toBeInstanceOf(OtherUser.NoRowsDeletedError);
      });
    });
  });

  describe('forge', () => {
    it('should create a new model instance', () => {
      const User = bookshelf.Model.extend({
        tableName: 'users'
      });
      const user = User.forge();

      equal(user.tableName, 'users');
      expect(user).toBeInstanceOf(User);
    });
  });

  describe('#id, #idAttribute', () => {
    it('should attach the id as a property on the model', () => {
      const test = new bookshelf.Model({id: 1});
      equal(test.id, 1);
    });

    it('should reference idAttribute as the key for model.id', () => {
      const Test = bookshelf.Model.extend({
        idAttribute: '_id'
      });
      const test = new Test({_id: 2});

      equal(test.id, 2);
    });

    it('#id should be set when model has custom parse method', () => {
      const TestModel = bookshelf.Model.extend({
        idAttribute: 'test_id',
        parse(attrs: any) {
          return _.mapKeys(attrs, (val: any, key: string) => _.camelCase(key));
        }
      });
      const test = new TestModel({test_id: 2}, {parse: true});

      equal(test.id, 2);
    });
  });

  describe('#requireFetch', () => {
    const FalseAuthor = Models.Author.extend({requireFetch: false});

    describe('with #fetch()', () => {
      it('resolves to null if no record exists and the {require: false} model option is set', () => {
        return new FalseAuthor({id: 200}).fetch().then((model: any) => {
          equal(model, null);
        });
      });

      it('allows overriding the model level {require: false} option', () => {
        return new FalseAuthor({id: 200})
          .fetch({require: true})
          .then(() => {
            assert.fail('Expected the promise to be rejected but it resolved');
          })
          .catch((error: any) => {
            equal(error instanceof FalseAuthor.NotFoundError, true);
            equal(error.message, 'EmptyResponse');
          });
      });

      it('rejects with NotFoundError by default', () => {
        return new Models.Author({id: 200})
          .fetch()
          .then(() => {
            assert.fail('Expected the promise to be rejected but it resolved');
          })
          .catch((error: any) => {
            equal(error instanceof Models.Author.NotFoundError, true);
            equal(error.message, 'EmptyResponse');
          });
      });

      it('allows overriding the default Model level option', () => {
        return new FalseAuthor({id: 200}).fetch({require: false}).then((model: any) => {
          equal(model, null);
        });
      });
    });

    describe('with #fetchAll()', () => {
      it('resolves to null if no record exists and the {require: false} model option is set', () => {
        return new FalseAuthor()
          .where({id: 200})
          .fetchAll()
          .then((models: any) => {
            equal(models.length, 0);
          });
      });

      it('is not affected by the model level {require: true} option', () => {
        return new Models.Author()
          .where({id: 200})
          .fetchAll()
          .then((models: any) => {
            equal(models.length, 0);
          });
      });
    });
  });

  describe('query', () => {
    let model: any;

    beforeEach(() => {
      model = new bookshelf.Model();
    });

    it('returns the Knex builder when no arguments are passed', () => {
      equal(model.query() instanceof QueryBuilder, true);
    });

    it('calls Knex builder method with the first argument, returning the model', () => {
      const q = model.query('where', {id: 1});
      equal(q, model);
    });

    it('passes along additional arguments to the Knex method in the first argument', () => {
      const qb = model.resetQuery().query();
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 0);

      const q = model.query('where', {id: 1});
      equal(q, model);
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 1);
    });

    it('allows passing an object to query', () => {
      const qb = model.resetQuery().query();
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 0);

      const q = model.query({where: {id: 1}, orWhere: ['id', '>', '10']});
      equal(q, model);
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 2);
    });

    it('allows passing a function to query', () => {
      const qb = model.resetQuery().query();
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 0);

      const q = model.query(function (this: any) {
        this.where({id: 1}).orWhere('id', '>', '10');
      });

      equal(q, model);
      equal(_.filter(qb._statements, {grouping: 'where'}).length, 2);
    });
  });

  describe('tableName', () => {
    let table: any;

    beforeEach(() => {
      table = new bookshelf.Model({}, {tableName: 'customers'});
    });

    it('can be passed in the initialize options', () => {
      equal(table.tableName, 'customers');
    });

    it('should set the tableName for the query builder', () => {
      equal(table.query()._single.table, 'customers');
    });
  });

  describe('parse', () => {
    const ParsedSite = Models.Site.extend({
      parse(attrs: any) {
        attrs.name = 'Test: ' + attrs.name;
        return attrs;
      }
    });

    it('parses the model attributes on fetch', () => {
      return new ParsedSite({id: 1}).fetch().then((model: any) => {
        equal(model.get('name').indexOf('Test: '), 0);
      });
    });

    it("doesn't parse the model attributes on creation", () => {
      const site = new ParsedSite({name: 'Site'});
      equal(site.get('name'), 'Site');
    });

    it('parses the model attributes on creation if {parse: true} is passed', () => {
      const site = new ParsedSite({name: 'Site'}, {parse: true});
      equal(site.get('name'), 'Test: Site');
    });
  });

  describe('format', () => {
    // TODO: better way to test this.
    it('calls format when saving', () => {
      const M = bookshelf.Model.extend({
        tableName: 'test',
        format(attrs: any) {
          return _.reduce(
            attrs,
            (memo: any, val: any, key: string) => {
              memo[_.snakeCase(key)] = val;
              return memo;
            },
            {}
          );
        }
      });

      const m = new M({firstName: 'Tim', lastName: 'G'});
      m.sync = function (this: any) {
        const data = this.format(_.extend({}, this.attributes));
        equal(data.first_name, 'Tim');
        equal(data.last_name, 'G');
        return stubSync;
      };

      return m.save();
    });

    it('does not mutate attributes on format', () => {
      const M = bookshelf.Model.extend({
        tableName: 'sites',
        format(this: any, attrs: any) {
          ok(attrs !== this.attributes);
          return attrs;
        }
      });

      return M.forge({id: 1})
        .fetch()
        .then((m: any) => m.load());
    });
  });

  describe('refresh', () => {
    const Site = Models.Site;

    it('will fetch a record by present attributes without an ID attribute', () => {
      return Site.forge({name: 'knexjs.org'})
        .refresh()
        .then((model: any) => {
          expect(model.id).toBe(1);
        });
    });

    it("will update a model's attributes by fetching only by `idAttribute`", () => {
      return Site.forge({id: 1, name: 'NOT THE CORRECT NAME'})
        .refresh()
        .then((model: any) => {
          expect(model.get('name')).toBe('knexjs.org');
        });
    });
  });

  describe('#fetch()', () => {
    const Site = Models.Site;
    const Author = Models.Author;

    it('issues a first (get one) to Knex, triggering a fetched event, returning a promise', () => {
      let count = 0;
      const model = Site.forge({id: 1});
      model.on('fetched', () => {
        count++;
      });

      return model.fetch().then((model: any) => {
        equal(model.get('id'), 1);
        equal(model.get('name'), 'knexjs.org');
        equal(count, 1);
      });
    });

    it('has a fetching event, which will fail if an error is thrown or if a rejected promise is provided', () => {
      const model = new Site({id: 1});
      model.on('fetching', () => {
        throw new Error('This failed');
      });

      return model
        .fetch()
        .then(() => {
          throw new Error('Err');
        })
        .catch((err: any) => {
          ok(err.message === 'This failed');
        });
    });

    it('allows access to the query builder on the options object in the fetching event', () => {
      const model = new Site({id: 1});
      model.on('fetching', (model: any, columns: any, options: any) => {
        ok(typeof options.query.whereIn === 'function');
      });

      return model.fetch();
    });

    it('does not fail, when joining another table having some columns with the same names - #176', () => {
      const model = new Site({id: 1});
      model.query((qb: any) => {
        qb.join('authors', 'authors.site_id', '=', 'sites.id');
      });

      return model.fetch();
    });

    it('allows specification of select columns as an `options` argument', () => {
      return new Author({id: 1}).fetch({columns: ['first_name']}).then((model: any) => {
        deepEqual(model.toJSON(), {id: 1, first_name: 'Tim'});
      });
    });

    it('allows specification of select columns in query callback', () => {
      return new Author({id: 1})
        .query('select', 'first_name')
        .fetch()
        .then((model: any) => {
          deepEqual(model.toJSON(), {id: 1, first_name: 'Tim'});
        });
    });

    it('will still select default columns if `distinct` is called without columns - #807', () => {
      return new Author({id: 1})
        .query('distinct')
        .fetch()
        .then((model: any) => {
          deepEqual(model.toJSON(), {
            id: 1,
            first_name: 'Tim',
            last_name: 'Griesser',
            site_id: 1
          });
        });
    });

    it('rejects with an error if no record exists', () => {
      return new Author({id: 200})
        .fetch()
        .then(() => {
          assert.fail('Expected the promise to be rejected but it resolved');
        })
        .catch((error: any) => {
          equal(error instanceof Author.NotFoundError, true);
          equal(error.message, 'EmptyResponse');
        });
    });

    it('resolves to null if no record exists and the {require: false} option is passed', () => {
      return new Author({id: 200}).fetch({require: false}).then((model: any) => {
        equal(model, null);
      });
    });

    // postgresql-only: uses {withSchema: 'test'} which only exists for postgres in the harness
    it.skip('uses the schema name passed in options', () => {
      return new Models.TestAuthor({id: 1}).fetch({withSchema: 'test'}).then((author: any) => {
        expect(author.get('name')).toEqual('Ryan Coogler');
      });
    });

    it('locks the table when called with the forUpdate option during a transaction', () => {
      let newAuthorId: any;

      return new Models.Author()
        .save({first_name: 'foo', site_id: 1})
        .then((author: any) => {
          newAuthorId = author.id;

          return Promise.all([
            bookshelf.transaction((t: any) => {
              return new Models.Author({id: author.id})
                .fetch({transacting: t, lock: 'forUpdate'})
                .then(() => delay(100))
                .then(() => {
                  return new Models.Author({id: author.id}).fetch({
                    transacting: t
                  });
                })
                .then((author: any) => {
                  expect(author.get('first_name')).toBe('foo');
                });
            }),
            delay(25).then(() => {
              return new Models.Author({id: author.id}).save({
                first_name: 'changed'
              });
            })
          ]);
        })
        .then(() => {
          return new Models.Author({id: newAuthorId}).destroy();
        });
    });

    it('locks the table when called with the forShare option during a transaction', () => {
      let newAuthorId: any;

      return new Models.Author()
        .save({first_name: 'foo', site_id: 1})
        .then((author: any) => {
          newAuthorId = author.id;

          return Promise.all([
            bookshelf.transaction((t: any) => {
              return new Models.Author({id: author.id})
                .fetch({transacting: t, lock: 'forShare'})
                .then(() => delay(100))
                .then(() => {
                  return new Models.Author({id: author.id}).fetch({
                    transacting: t
                  });
                })
                .then((author: any) => {
                  expect(author.get('first_name')).toBe('foo');
                });
            }),
            delay(60).then(() => {
              return new Models.Author({id: author.id}).save({
                first_name: 'changed'
              });
            })
          ]);
        })
        .then(() => {
          return new Models.Author({id: newAuthorId}).destroy();
        });
    });

    it("does not try to format the idAttribute if it's already formatted", () => {
      return new Models.OrgModel({organization_id: 2}).fetch().then((organization: any) => {
        if (dialect === 'postgresql') {
          expect(organization.attributes).toEqual({
            organization_id: 2,
            id: 2,
            name: 'Duplicates',
            is_active: false
          });
        } else {
          expect(organization.attributes).toEqual({
            organization_id: 2,
            id: 2,
            name: 'Duplicates',
            is_active: 0
          });
        }
      });
    });

    it("formats the idAttribute if it's not already formatted", () => {
      return new Models.OrgModel({id: 2}).fetch().then((organization: any) => {
        if (dialect === 'postgresql') {
          expect(organization.attributes).toEqual({id: 2, name: 'Duplicates', is_active: false});
        } else {
          expect(organization.attributes).toEqual({id: 2, name: 'Duplicates', is_active: 0});
        }
      });
    });
  });

  describe('#fetchAll()', () => {
    const Site = Models.Site;

    it('triggers `fetching:collection` and `fetched:collection` events', () => {
      const site = new Site();
      let isFetchingTriggered = false;
      let isFetchedTriggered = false;

      site.on('fetching:collection', () => {
        equal(isFetchingTriggered, false);
        equal(isFetchedTriggered, false);
        isFetchingTriggered = true;
      });

      site.on('fetched:collection', () => {
        equal(isFetchingTriggered, true);
        equal(isFetchedTriggered, false);
        isFetchedTriggered = true;
      });

      return site.fetchAll().then(() => {
        equal(isFetchingTriggered, true);
        equal(isFetchedTriggered, true);
      });
    });

    it('should load models with duplicate ids when the merge and remove options are false', () => {
      return new Models.Member().fetchAll({merge: false, remove: false}).then((members: any) => {
        expect(members.length).toBe(3);
        expect(members.pluck('name')).toEqual(expect.arrayContaining(['Alice', 'Bob']));
      });
    });

    it('should merge models with duplicate ids by default', () => {
      return new Models.Member().fetchAll().then((members: any) => {
        expect(members.length).toBe(2);
        expect(members.pluck('name')).toEqual(expect.arrayContaining(['Alice', 'Shuri']));
      });
    });

    it('returns an empty collection if there are no results', () => {
      return new Models.Member()
        .where('name', 'hal9000')
        .fetchAll()
        .then((models: any) => {
          equal(models.length, 0);
        });
    });
  });

  describe('#fetchPage()', () => {
    it('fetches a single page of results with defaults', () => {
      return Models.Customer.forge()
        .fetchPage()
        .then((results: any) => {
          expect(results).toHaveProperty('models');
          expect(results).toHaveProperty('pagination');

          ['rowCount', 'pageCount', 'page', 'pageSize'].forEach((prop) => {
            expect(results.pagination).toHaveProperty(prop);
          });

          expect(results.pagination.rowCount).toBe(4);
          expect(results.pagination.pageCount).toBe(1);
          expect(results.pagination.page).toBe(1);
          expect(results.pagination.pageSize).toBe(10);
        });
    });

    it('fetches a single page of results without returning rowCount or pageCount', () => {
      return Models.Customer.forge()
        .fetchPage({disableCount: true})
        .then((results: any) => {
          expect(results).toHaveProperty('models');
          expect(results).toHaveProperty('pagination');

          expect(results.pagination).toHaveProperty('page');
          expect(results.pagination).toHaveProperty('pageSize');
          expect(results.pagination).not.toHaveProperty('rowCount');
          expect(results.pagination).not.toHaveProperty('pageCount');

          expect(results.pagination.page).toBe(1);
          expect(results.pagination.pageSize).toBe(10);
        });
    });

    it('returns an empty collection if there are no results', () => {
      return bookshelf
        .knex('critics_comments')
        .del()
        .then(() => Models.CriticComment.forge().fetchPage())
        .then((results: any) => {
          equal(results.length, 0);
        });
    });

    it('returns an empty collection with the {require: false} option if there are no results', () => {
      return bookshelf
        .knex('critics_comments')
        .del()
        .then(() => {
          return Models.CriticComment.forge().fetchPage({require: false});
        })
        .then((results: any) => {
          expect(results.length).toBe(0);
        });
    });

    it('returns the limit and offset instead of page and pageSize', () => {
      return Models.Customer.forge()
        .fetchPage({limit: 2, offset: 2})
        .then((results: any) => {
          ['rowCount', 'pageCount', 'limit', 'offset'].forEach((prop) => {
            expect(results.pagination).toHaveProperty(prop);
          });
        });
    });

    it('fetches a page of results with specified page size', () => {
      return Models.Customer.forge()
        .fetchPage({pageSize: 2})
        .then((results: any) => {
          expect(results.pagination.rowCount).toBe(4);
          expect(results.pagination.pageCount).toBe(2);
          expect(results.pagination.page).toBe(1);
        });
    });

    it('fetches a page with specified offset', () => {
      return Models.Customer.forge()
        .orderBy('id', 'ASC')
        .fetchPage({limit: 2, offset: 2})
        .then((results: any) => {
          expect(parseInt(results.models[0].get('id'))).toBe(3);
          expect(parseInt(results.models[1].get('id'))).toBe(4);
        });
    });

    it('fetches a page by page number', () => {
      return Models.Customer.forge()
        .orderBy('id', 'ASC')
        .fetchPage({pageSize: 2, page: 2})
        .then((results: any) => {
          expect(parseInt(results.models[0].get('id'))).toBe(3);
          expect(parseInt(results.models[1].get('id'))).toBe(4);
        });
    });

    it('fetches a page when other columns are specified on the original query', () => {
      return Models.Customer.forge()
        .query((qb: any) => {
          qb.column.apply(qb, ['name']);
        })
        .fetchPage()
        .then((results: any) => {
          expect(results.pagination.rowCount).toBe(4);
        });
    });

    it('returns correct values for rowCount and pageCount when hasTimestamps is used', () => {
      return Models.Admin.forge()
        .fetchPage({page: 1, pageSize: 4})
        .then((admins: any) => {
          expect(typeof admins.pagination.rowCount).toBe('number');
          expect(typeof admins.pagination.pageCount).toBe('number');
        });
    });

    describe('inside a transaction', () => {
      it('returns consistent results for rowCount and number of models', () => {
        return bookshelf.transaction((t: any) => {
          const options: any = {transacting: t};

          return Models.Site.forge({name: 'A new site'})
            .save(null, options)
            .then(() => {
              options.pageSize = 25;
              options.page = 1;
              return Models.Site.forge().fetchPage(options);
            })
            .then((sites: any) => {
              expect(sites.pagination.rowCount).toEqual(sites.models.length);
            });
        });
      });
    });

    describe('with groupBy', () => {
      it('counts grouped rows instead of total rows', () => {
        let total: number;

        return Models.Blog.count()
          .then((count: any) => {
            total = parseInt(count, 10);

            return Models.Blog.forge()
              .query((qb: any) => {
                qb.max('id');
                qb.groupBy('site_id');
                qb.whereNotNull('site_id');
              })
              .fetchPage();
          })
          .then((blogs: any) => {
            expect(blogs.pagination.rowCount).toBe(blogs.length);
            expect(blogs.length).toBeLessThan(total);
          });
      });

      it('counts grouped rows when using table name qualifier', () => {
        let total: number;

        return Models.Blog.count()
          .then((count: any) => {
            total = parseInt(count, 10);

            return Models.Blog.forge()
              .query((qb: any) => {
                qb.max('id');
                qb.groupBy('blogs.site_id');
                qb.whereNotNull('site_id');
              })
              .fetchPage();
          })
          .then((blogs: any) => {
            expect(blogs.pagination.rowCount).toBe(blogs.length);
            expect(blogs.length).toBeLessThan(total);
          });
      });
    });

    describe('with distinct', () => {
      it('counts distinct occurences of a column instead of total rows', () => {
        let total: number;

        return Models.Post.count()
          .then((count: any) => {
            total = parseInt(count, 10);

            return Models.Post.forge()
              .query((qb: any) => {
                qb.distinct('owner_id');
              })
              .fetchPage();
          })
          .then((distinctPostOwners: any) => {
            expect(distinctPostOwners.pagination.rowCount).toBe(distinctPostOwners.length);
            expect(distinctPostOwners.length).toBeLessThan(total);
          });
      });
    });

    describe('with fetch options', () => {
      const Site = Models.Site;

      afterEach(() => {
        delete Site.prototype.initialize;
      });

      it('ignores standard options for count query', () => {
        const allOptions: any[] = [];

        Site.prototype.initialize = function (this: any) {
          this.on('fetching:collection', (collection: any, columns: any, options: any) => {
            allOptions.push(_.omit(options, 'query'));
          });
        };

        const site = new Site();

        return site
          .fetchPage({
            require: true,
            withRelated: ['blogs'],
            columns: 'name'
          })
          .then(() => {
            expect(allOptions.length).toBe(2);
            expect(allOptions[1]).not.toEqual(allOptions[0]);

            const countOptions = allOptions.find((option) => {
              return !_.has(option, ['require', 'withRelated', 'columns']);
            });
            const fetchOptions = allOptions.find((option) => {
              return _.has(option, ['require', 'withRelated', 'columns']);
            });

            expect(countOptions).not.toBeNull();
            expect(fetchOptions).not.toBeNull();
          });
      });

      it('keeps custom options for count query', () => {
        const allOptions: any[] = [];

        Site.prototype.initialize = function (this: any) {
          this.on('fetching:collection', (collection: any, columns: any, options: any) => {
            allOptions.push(_.omit(options, 'query'));
          });
        };

        const site = new Site();

        return site
          .fetchPage({
            withRelated: ['blogs'],
            customOption: true
          })
          .then(() => {
            expect(allOptions.length).toBe(2);
            expect(allOptions[1]).not.toEqual(allOptions[0]);

            const countOptions = allOptions.find((option) => {
              return !_.has(option, ['withRelated']);
            });
            const fetchOptions = allOptions.find((option) => {
              return _.has(option, ['withRelated']);
            });

            expect(countOptions).not.toBeNull();
            expect(countOptions.customOption).toBe(true);
            expect(countOptions.customOption).toBe(fetchOptions.customOption);
            expect(fetchOptions).not.toBeNull();
            expect(fetchOptions.customOption).toBe(true);
          });
      });
    });
  });

  describe('.fetchPage()', () => {
    it('fetches a page without having to call .forge() manually', () => {
      return Models.Customer.fetchPage().then((results: any) => {
        expect(results).toHaveProperty('models');
        expect(results).toHaveProperty('pagination');
      });
    });
  });

  describe('orderBy', () => {
    it('returns results in the correct order', () => {
      const asc = Models.Customer.forge()
        .orderBy('id', 'ASC')
        .fetchAll()
        .then((result: any) => {
          return result.toJSON().map((row: any) => row.id);
        });

      const desc = Models.Customer.forge()
        .orderBy('id', 'DESC')
        .fetchAll()
        .then((result: any) => {
          return result.toJSON().map((row: any) => row.id);
        });

      return Promise.all([asc, desc]).then((results: any) => {
        expect(results[0].reverse()).toEqual(results[1]);
      });
    });

    it('returns DESC order results with a minus sign', () => {
      return Models.Customer.forge()
        .orderBy('-id')
        .fetchAll()
        .then((results: any) => {
          expect(parseInt(results.models[0].get('id'))).toBe(4);
        });
    });
  });

  describe('#save()', () => {
    const Site = Models.Site;

    afterAll(() => {
      return Site.forge({id: 6})
        .destroy()
        .catch(() => {});
    });

    it('saves a new object', () => {
      return new Site({name: 'Fourth Site'})
        .save()
        .then((m: any) => {
          equal(Number(m.get('id')), 5);
          return new bookshelf.Collection(null, {model: Site}).fetch();
        })
        .then((c: any) => {
          equal(c.last().id, 5);
          equal(c.last().get('name'), 'Fourth Site');
          equal(c.length, 5);
        });
    });

    it('saves all attributes that are currently set on the model plus the ones passed as argument', () => {
      const blog = new Models.Blog({name: 'A Cool Blog'});

      return blog
        .save({site_id: 1})
        .then((savedBlog: any) => {
          expect(savedBlog.attributes).toMatchObject({name: 'A Cool Blog', site_id: 1});
          return blog.fetch();
        })
        .then((fetchedBlog: any) => {
          expect(fetchedBlog.attributes).toMatchObject({name: 'A Cool Blog', site_id: 1});
        })
        .finally(() => {
          return blog.destroy();
        });
    });

    it('ensure events are triggered sequentially when the handlers do async stuff', () => {
      const m = new Site({name: 'new'});

      m.on('saving', (model: any) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            model.set('x', 'y');
            resolve();
          }, 200);
        });
      });

      m.on('saving', (model: any) => {
        equal(model.get('x'), 'y');
        model.unset('x');
        m.off();
      });

      return m.save(null, {method: 'insert'}).then(() => {
        return m.destroy();
      });
    });

    it('updates an existing object', () => {
      return new Site({id: 5, name: 'Fourth Site Updated'})
        .save()
        .then(() => {
          return new bookshelf.Collection(null, {model: Site}).fetch();
        })
        .then((c: any) => {
          equal(c.last().id, 5);
          equal(c.last().get('name'), 'Fourth Site Updated');
          equal(c.length, 5);
        });
    });

    it('allows passing a method to save, to call insert or update explicitly', () => {
      return new Site({id: 6, name: 'Fifth site, explicity created'})
        .save(null, {method: 'insert'})
        .then(() => {
          return Site.fetchAll();
        })
        .then((c: any) => {
          equal(c.length, 6);
          equal(c.last().id, 6);
          equal(c.last().get('name'), 'Fifth site, explicity created');
        });
    });

    it('errors if the row was not updated', () => {
      return new Site({id: 200, name: 'This doesnt exist'}).save().then(
        () => {
          throw new Error('This should not succeed');
        },
        (err: any) => {
          expect(err.message).toBe('No Rows Updated');
        }
      );
    });

    it('does not error if the row was not updated but require is false', () => {
      return new Site({id: 200, name: 'This doesnt exist'}).save({}, {require: false});
    });

    it('should not error if updated row was not affected', () => {
      return new Site({
        id: 5,
        name: 'Fifth site, explicity created'
      }).save();
    });

    it('does not constrain on the `id` during update unless defined', () => {
      const m = new bookshelf.Model({id: null}).query({
        where: {uuid: 'testing'}
      });
      const query = m.query();
      query.update = function (this: any) {
        equal(_.filter(this._statements, {grouping: 'where'}).length, 1);
        return BPromise.resolve(1);
      };
      m.refresh = () => BPromise.resolve({});

      return m.save(null, {method: 'update'}).then(() => {
        const m2 = new bookshelf.Model({id: 1}).query({
          where: {uuid: 'testing'}
        });
        const query2 = m2.query();
        query2.update = function (this: any) {
          equal(_.filter(this._statements, {grouping: 'where'}).length, 2);
          return {};
        };
        m2.refresh = () => BPromise.resolve({});

        return m2.save(null, {method: 'update'});
      });
    });

    it('allows {patch: true} as an option for only updating passed data', () => {
      const user = new bookshelf.Model({id: 1, first_name: 'Testing'}, {tableName: 'users'});
      const query = user.query();
      user.refresh = () => BPromise.resolve({});

      // biome-ignore lint/suspicious/noThenProperty: test mock intentionally intercepts knex query builder's thenable to assert internal state
      query.then = function (this: any, onFulfilled: any, onRejected: any) {
        deepEqual(this._single.update, {bio: 'Short user bio'});
        equal(_.filter(this._statements, {grouping: 'where'}).length, 1);
        return BPromise.resolve(1).then(onFulfilled, onRejected);
      };

      return user.save({bio: 'Short user bio'}, {patch: true}).then((model: any) => {
        equal(model.id, 1);
        equal(model.get('bio'), 'Short user bio');
        equal(model.get('first_name'), 'Testing');
      });
    });

    it('fires saving and creating and then saves', () => {
      const user = new bookshelf.Model({first_name: 'Testing'}, {tableName: 'users'});
      let events = 0;
      user.sync = function () {
        return _.extend(stubSync, {
          insert() {
            equal(events, 2);
            return BPromise.resolve({});
          }
        });
      };
      user.on('creating saving updating', () => {
        return Promise.resolve().then(() => {
          return Promise.resolve().then(() => {
            events++;
          });
        });
      });

      return user.save();
    });

    it('fires saving and then creating triggers', () => {
      const user = new bookshelf.Model({first_name: 'Testing'}, {tableName: 'users'});
      const triggered: string[] = [];
      user.sync = function () {
        return _.extend(stubSync, {
          insert() {
            deepEqual(triggered, ['saving', 'creating']);
            return BPromise.resolve({});
          }
        });
      };
      user.on('saving', () => {
        return Promise.resolve().then(() => {
          triggered.push('saving');
        });
      });
      user.on('creating', () => {
        return Promise.resolve().then(() => {
          triggered.push('creating');
        });
      });

      return user.save();
    });

    it('refreshes the model after updating', () => {
      return new Models.Member({id: 1}).save({name: 'Okoye'}).then((member: any) => {
        deepEqual(member.attributes, {id: 1, name: 'Okoye', organization_id: 1});
      });
    });

    it('refreshes the model after inserting', () => {
      return new Models.Tag({name: 'books'}).save().then((tag: any) => {
        deepEqual(tag.attributes, {id: 5, name: 'books'});
      });
    });

    it('does not refresh the model if {autoRefresh: false} option is passed', () => {
      return new Models.Member({id: 1}).save({name: 'Okoye'}, {autoRefresh: false}).then((member: any) => {
        deepEqual(member.attributes, {id: 1, name: 'Okoye'});
      });
    });

    it('does not trigger a "fetched" event after refreshing the model', () => {
      const member = new Models.Member({id: 1});
      let isFetchedTriggered = false;
      member.on('fetched', () => {
        isFetchedTriggered = true;
      });

      return member.save({name: 'Shuri'}).then(() => {
        equal(isFetchedTriggered, false);
      });
    });

    it('rejects if the saving event throws an error', () => {
      const Test = bookshelf.Model.extend({
        tableName: 'test',
        initialize(this: any) {
          this.on('saving', this.handler, this);
        },
        handler() {
          throw new Error('Test');
        }
      });
      const test = new Test();

      return test.save().catch((e: any) => {
        expect(e.message).toBe('Test');
      });
    });

    it('Allows setting a uuid, #24 #130', () => {
      const uuidval = uuidv4();
      const SubSite = Models.Uuid.extend({
        initialize(this: any) {
          this.on('saving', this._generateId);
        },
        _generateId(model: any) {
          if (model.isNew()) {
            model.set(model.idAttribute, uuidval);
          }
        }
      });
      const subsite = new SubSite({name: 'testing'});

      return subsite
        .save()
        .then((model: any) => {
          expect(model.id).toBe(uuidval);
          expect(model.get('name')).toBe('testing');
        })
        .then(() => {
          return new SubSite({uuid: uuidval}).fetch();
        })
        .then((model: any) => {
          expect(model.get('name')).toBe('testing');
        });
    });

    it('passes custom `options` passed to `timestamp()` - #881', () => {
      function stubTimestamp(options: any) {
        expect(options.customOption).toBe(testOptions.customOption);
      }
      const site = Models.Site.forge({id: 881}, {hasTimestamps: true});
      const testOptions = {method: 'insert', customOption: 'CUSTOM_OPTION'};
      site.timestamp = stubTimestamp;

      return site.save(null, testOptions).then((s: any) => s.destroy());
    });

    it('will not break with prefixed id, #583', () => {
      const acmeOrg = new Models.OrgModel({
        name: 'ACME, Inc',
        is_active: true
      });
      let acmeOrg1: any;

      return acmeOrg
        .save()
        .then(() => {
          acmeOrg1 = new Models.OrgModel({name: 'ACME, Inc'});
          return acmeOrg1.fetch();
        })
        .then(() => {
          equal(typeof acmeOrg1.get('id'), 'number');
          equal(acmeOrg1.attributes.name, 'ACME, Inc');
          equal(acmeOrg1.attributes.organization_id, undefined);
          equal(acmeOrg1.attributes.organization_name, undefined);
          expect(acmeOrg.attributes.name).toBe('ACME, Inc');
        });
    });
  });

  describe('destroy', () => {
    const Site = Models.Site;

    it('issues a delete to the Knex, returning a promise', () => {
      return new Site({id: 5})
        .destroy()
        .then(() => {
          return new bookshelf.Collection(null, {model: Site}).fetch();
        })
        .then((c: any) => {
          equal(c.length, 4);
        });
    });

    it('fails if no idAttribute or wheres are defined on the model', () => {
      return new Site().destroy().then(null, (e: any) => {
        equal(e.toString(), 'Error: A model cannot be destroyed without a "where" clause or an idAttribute.');
      });
    });

    it('triggers a destroying event on the model', async () => {
      await new Promise<void>((resolve) => {
        const m = new Site({id: 4});
        m.on('destroying', () => {
          m.off();
          resolve();
        });

        m.destroy();
      });
    });

    it('will not destroy the model if an error is thrown during the destroying event', () => {
      const m = new Site({id: 1});
      m.on('destroying', (model: any) => {
        if (model.id === 1) {
          throw new Error('You cannot destroy the first site');
        }
      });

      return m.destroy().then(null, (e: any) => {
        equal(e.toString(), 'Error: You cannot destroy the first site');
      });
    });

    it('allows access to the query builder on the options object in the destroying event', () => {
      const m = new Site({id: 1});
      m.sync = function () {
        const sync: any = stubSync;
        sync.query = m.query();
        return sync;
      };
      m.on('destroying', (model: any, options: any) => {
        ok(typeof options.query.whereIn === 'function');
      });

      return m.destroy();
    });

    it('will throw an error when trying to destroy a non-existent object', () => {
      return new Site({id: 1337})
        .destroy()
        .then(() => {
          throw new Error('Should not have succeeded');
        })
        .catch((error: any) => {
          ok(error instanceof bookshelf.NoRowsDeletedError);
        });
    });

    it('will not throw an error when trying to destroy a non-existent object with {require: false}', () => {
      return new Site({id: 1337}).destroy({require: false}).then((site: any) => {
        ok(site instanceof Site);
      });
    });

    // postgresql-only: uses {withSchema: 'test'} which only exists for postgres in the harness
    it.skip('can destroy from the correct schema', () => {
      let initialCount: number;

      return countTestAuthors()
        .then((count: number) => {
          initialCount = count;
          return new Models.TestAuthor({id: 1}).destroy({
            withSchema: 'test'
          });
        })
        .then((author: any) => {
          expect(author.get('name')).toBeUndefined();
          return countTestAuthors();
        })
        .then((count: number) => {
          expect(count).toBeLessThan(initialCount);
        });
    });
  });

  describe('count', () => {
    it('counts the number of models in a collection', () => {
      return Models.Post.forge()
        .count()
        .then((count: any) => {
          checkCount(count, 5);
        });
    });

    it('optionally counts by column (excluding null values)', () => {
      const author = Models.Author.forge();
      return author
        .count()
        .then((count: any) => {
          checkCount(count, 5);
          return author.count('last_name');
        })
        .then((count: any) => {
          checkCount(count, 4);
        });
    });

    it('counts a filtered query', () => {
      return Models.Post.forge()
        .query('where', 'blog_id', 1)
        .count()
        .then((count: any) => {
          checkCount(count, 2);
        });
    });

    it('resets query after completing', () => {
      const posts = Models.Post.collection();
      return posts
        .query('where', 'blog_id', 1)
        .count()
        .then((count: any) => {
          checkCount(count, 2);
          return posts.count();
        })
        .then((count: any) => {
          checkCount(count, 5);
        });
    });

    // postgresql-only: uses {withSchema: 'test'} which only exists for postgres in the harness
    it.skip('counts from the correct schema', () => {
      let initialCount: number;

      return countTestAuthors()
        .then((count: number) => {
          initialCount = count;
          return Models.TestAuthor.forge().save({name: 'Testing'}, {withSchema: 'test'});
        })
        .then(() => {
          return countTestAuthors();
        })
        .then((count: number) => {
          expect(count).toBeGreaterThan(initialCount);
        });
    });
  });

  describe('resetQuery', () => {
    it('deletes the `_builder` property, resetting the model query builder', () => {
      const m = new bookshelf.Model().query('where', {id: 1});
      equal(_.filter(m.query()._statements, {grouping: 'where'}).length, 1);
      m.resetQuery();
      equal(_.filter(m.query()._statements, {grouping: 'where'}).length, 0);
    });
  });

  describe('hasTimestamps', () => {
    describe('Date value', () => {
      // NOTE: the original suite skipped this whole block on MySQL (knex issue #2524).
      // On sqlite3 (the dialect under test here) the tests run normally.
      let admin: any;

      beforeEach(() => {
        return Models.Admin.forge({username: 'a_new_user'})
          .save()
          .then((newAdmin: any) => {
            admin = newAdmin;
          });
      });

      afterEach(() => {
        return admin.destroy();
      });

      it('is the same between saving and fetching models', () => {
        return Models.Admin.forge({id: admin.id})
          .fetch({require: true})
          .then((fetchedAdmin: any) => {
            expect(fetchedAdmin.get('created_at')).toEqual(admin.get('created_at'));
            expect(fetchedAdmin.get('updated_at')).toEqual(admin.get('updated_at'));
          });
      });

      it('is the same between saving and fetching all models', () => {
        return Models.Admin.forge()
          .where({id: admin.id})
          .fetchAll()
          .then((admins: any) => {
            expect(admins.at(0).get('created_at')).toEqual(admin.get('created_at'));
            expect(admins.at(0).get('updated_at')).toEqual(admin.get('updated_at'));
          });
      });

      it('is the same after updating model', () => {
        return admin.save({username: 'updated_user'}, {patch: true}).then((updatedAdmin: any) => {
          expect(updatedAdmin.get('created_at')).toEqual(admin.get('created_at'));
        });
      });

      it('is the same for eager loaded related items', () => {
        return Models.Site.forge({name: 'a site'})
          .save()
          .tap((site: any) => {
            return site.admins().attach(admin);
          })
          .then((site: any) => {
            return Models.Site.forge({id: site.id}).fetch({
              withRelated: 'admins'
            });
          })
          .tap((site: any) => {
            const relatedAdmin = site.related('admins').shift();
            expect(relatedAdmin.get('created_at')).toEqual(admin.get('created_at'));
            expect(relatedAdmin.get('updated_at')).toEqual(admin.get('updated_at'));
          })
          .then((site: any) => {
            return site.destroy();
          });
      });

      it('is the same for related items', () => {
        return Models.Site.forge({name: 'a site'})
          .save()
          .bind({})
          .tap(function (this: any, site: any) {
            this.site = site;
            return site.admins().attach(admin);
          })
          .then((site: any) => {
            return Models.Site.forge({id: site.id}).admins().fetch();
          })
          .then(function (this: any, admins: any) {
            expect(admins.at(0).get('created_at')).toEqual(admin.get('created_at'));
            expect(admins.at(0).get('updated_at')).toEqual(admin.get('updated_at'));
            return this.site.destroy();
          });
      });
    });

    describe('On update', () => {
      it('does not update created_at when {method: "update"} is passed as option to save', () => {
        const m = new bookshelf.Model(null, {hasTimestamps: true});
        m.sync = function (this: any) {
          expect(this.get('created_at')).toBeUndefined();
          expect(this.get('updated_at')).toBeInstanceOf(Date);
          return stubSync;
        };

        return m.save({item: 'test'}, {method: 'update'});
      });

      it("does not update created_at timestamp if the user doesn't set it", () => {
        const admin = new Models.Admin();
        let originalDate: any;

        return admin
          .save()
          .then((savedAdmin: any) => {
            originalDate = savedAdmin.get('created_at');

            return delay(1000).then(() => {
              return savedAdmin.save('username', 'pablo');
            });
          })
          .then((updatedAdmin: any) => {
            expect(updatedAdmin.get('created_at')).toEqual(originalDate);
          });
      });

      it("will automatically set the updated_at timestamp if the user doesn't set it", () => {
        const admin = new Models.Admin();
        let originalDate: any;

        return admin
          .save()
          .then((savedAdmin: any) => {
            originalDate = savedAdmin.get('updated_at');

            return delay(1000).then(() => {
              return savedAdmin.save('username', 'pablo');
            });
          })
          .then((updatedAdmin: any) => {
            const updatedDate = updatedAdmin.get('updated_at');
            expect(updatedDate.getTime()).not.toBe(originalDate.getTime());
          });
      });

      it("will not update the updated_at timestamp if the model hasn't changed", () => {
        const admin = new Models.Admin();
        let originalDate: any;

        return admin
          .save()
          .then((savedAdmin: any) => {
            originalDate = savedAdmin.get('updated_at');

            return delay(1000).then(() => {
              return savedAdmin.save();
            });
          })
          .then((updatedAdmin: any) => {
            expect(updatedAdmin.get('updated_at')).toEqual(originalDate);
          });
      });

      it('will set the updated_at timestamp to the user supplied value', () => {
        const admin = new Models.Admin();
        let oldUpdatedAt: any;
        const newUpdatedAt = new Date('2019-09-01 12:13:14');
        newUpdatedAt.setMinutes(newUpdatedAt.getMinutes() + 10);

        return admin
          .save()
          .then((savedAdmin: any) => {
            oldUpdatedAt = savedAdmin.get('updated_at');
            return savedAdmin.save('updated_at', newUpdatedAt);
          })
          .then((updatedAdmin: any) => {
            expect(updatedAdmin.get('updated_at')).toEqual(newUpdatedAt);
            expect(updatedAdmin.get('updated_at')).not.toEqual(oldUpdatedAt);
          });
      });

      it("will not change the existing created_at timestamp if user doesn't set a value for it", () => {
        const model = new Models.Admin();
        let createdAt: any;

        return model
          .save()
          .then((savedAdmin: any) => {
            createdAt = savedAdmin.get('created_at');
            return savedAdmin.save('username', 'pablo');
          })
          .then((updatedAdmin: any) => {
            expect(updatedAdmin.get('created_at')).toEqual(createdAt);
          });
      });

      it('will set the created_at timestamp to the user supplied value', () => {
        const admin = new Models.Admin();
        let oldCreatedAt: any;
        const newCreatedAt = new Date(1999, 1, 1);

        return admin
          .save()
          .then((savedAdmin: any) => {
            oldCreatedAt = savedAdmin.get('created_at');
            return admin.save('created_at', newCreatedAt);
          })
          .then((updatedAdmin: any) => {
            expect(updatedAdmin.get('created_at')).toEqual(newCreatedAt);
            expect(updatedAdmin.get('created_at')).not.toEqual(oldCreatedAt);
          });
      });

      it('saves correct attributes when modified inside event hook', () => {
        const author = new Models.Author({
          site_id: 1,
          first_name: 'donny',
          last_name: 'immutable'
        });

        return author
          .save()
          .then(() => {
            const onSaving = function (this: any) {
              // don't allow modification of 'last_name' field
              this.attributes = this.pick(['id', 'site_id', 'first_name']);
            };

            author.on('saving', function (this: any) {
              onSaving.apply(this, arguments as any);
            });

            return author.save({first_name: 'tony', last_name: 'ravioli'});
          })
          .then(() => {
            return author.refresh();
          })
          .then(() => {
            expect(author.get('first_name')).toBe('tony');
            expect(author.get('last_name')).toBe('immutable');
            return author.destroy();
          });
      });
    });

    describe('On insert', () => {
      let m: any;

      beforeEach(() => {
        m = new (bookshelf.Model.extend({hasTimestamps: true}))();
      });

      it('sets created_at and updated_at when {method: "insert"} is passed as option', () => {
        m.sync = function (this: any) {
          expect(this.get('created_at')).toBeInstanceOf(Date);
          expect(this.get('updated_at')).toBeInstanceOf(Date);
          return stubSync;
        };

        return m.save({id: 1, item: 'test'}, {method: 'insert'});
      });

      it('will set the created_at and updated_at columns if true', () => {
        m.sync = function (this: any) {
          expect(this.get('created_at')).toBeInstanceOf(Date);
          expect(this.get('updated_at')).toBeInstanceOf(Date);
          return stubSync;
        };

        return m.save({item: 'test'});
      });

      it("sets created_at to the user specified value if present in the model's attributes", () => {
        const userDate = new Date(1999, 1, 1);
        m.sync = function (this: any) {
          expect(this.get('created_at')).toEqual(userDate);
          return stubSync;
        };

        return m.save({item: 'test', created_at: userDate});
      });

      it("sets updated_at to the user specified value if present in the model's attributes", () => {
        const userDate = new Date(1999, 1, 1);
        m.sync = function (this: any) {
          expect(this.get('updated_at')).toEqual(userDate);
          return stubSync;
        };

        return m.save({item: 'test', updated_at: userDate});
      });

      it('will set the timestamps columns to provided time in date option', () => {
        const dateInThePast = new Date(1999, 1, 1);
        m.sync = function (this: any) {
          equal(this.get('created_at').toISOString(), dateInThePast.toISOString());
          equal(this.get('updated_at').toISOString(), dateInThePast.toISOString());
          return stubSync;
        };

        return m.save({item: 'test'}, {date: dateInThePast});
      });
    });

    it('allows passing hasTimestamps in the options hash of model instantiation', () => {
      const m = new bookshelf.Model(null, {hasTimestamps: true});
      m.sync = function (this: any) {
        expect(this.get('created_at')).toBeInstanceOf(Date);
        expect(this.get('updated_at')).toBeInstanceOf(Date);
        return stubSync;
      };

      return m.save({item: 'test'});
    });

    it('allows custom keys for the created and updated values', () => {
      const m = new bookshelf.Model(null, {
        hasTimestamps: ['createdAt', 'updatedAt']
      });
      m.sync = function (this: any) {
        expect(this.get('createdAt')).toBeInstanceOf(Date);
        expect(this.get('updatedAt')).toBeInstanceOf(Date);
        return stubSync;
      };

      return m.save({item: 'test'});
    });

    it('will accept a falsy value as an option for the updated key name to ignore it', () => {
      const m = new bookshelf.Model(null, {
        hasTimestamps: ['createdAt', null]
      });
      m.sync = function (this: any) {
        expect(this.get('createdAt')).toBeInstanceOf(Date);
        expect(this.get('updatedAt')).toBeUndefined();
        return stubSync;
      };

      return m.save({item: 'test'});
    });

    it('will not set an attribute named "null" when passing a literal null as a key name', () => {
      const m = new bookshelf.Model(null, {
        hasTimestamps: ['createdAt', null]
      });
      m.sync = function (this: any) {
        expect(this.get('null')).toBeUndefined();
        return stubSync;
      };

      return m.save({item: 'test'});
    });

    it('will accept a falsy value as an option for the created key to ignore it', () => {
      const m = new bookshelf.Model(null, {
        hasTimestamps: [null, 'updatedAt']
      });
      m.sync = function (this: any) {
        expect(this.get('updatedAt')).toBeInstanceOf(Date);
        expect(this.get('createdAt')).toBeUndefined();
        return stubSync;
      };

      return m.save({item: 'test'});
    });

    it('will not set timestamps on the model if the associated columns are ommitted in fetch', () => {
      return Models.Admin.forge({id: 1})
        .fetch({columns: ['id']})
        .then((admin: any) => {
          expect(admin.get('created_at')).toBeUndefined();
        });
    });
  });

  describe('defaults', () => {
    it('assigns defaults on save, rather than initialize', () => {
      const Item = bookshelf.Model.extend({
        defaults: {
          item: 'test',
          json: {key1: 'defaultValue1', key2: 'defaultValue2'}
        }
      });
      const item = new Item({newItem: 'test2', json: {key1: 'value1'}});
      deepEqual(item.toJSON(), {
        newItem: 'test2',
        json: {key1: 'value1'}
      });
      item.sync = function (this: any) {
        deepEqual(this.toJSON(), {
          id: 1,
          item: 'test',
          newItem: 'test2',
          json: {key1: 'value1', key2: 'defaultValue2'}
        });
        return stubSync;
      };

      return item.save({id: 1});
    });

    it('only assigns defaults when creating a model, unless {defaults: true} is passed in the save options', () => {
      const Item = bookshelf.Model.extend({defaults: {item: 'test'}});
      const item = new Item({id: 1, newItem: 'test2'});
      deepEqual(item.toJSON(), {id: 1, newItem: 'test2'});
      item.sync = function (this: any) {
        deepEqual(this.toJSON(), {id: 1, newItem: 'test2'});
        return stubSync;
      };

      return item.save().then(() => {
        item.sync = function (this: any) {
          deepEqual(this.toJSON(), {id: 2, item: 'test', newItem: 'test2'});
          return stubSync;
        };
        return item.save({id: 2}, {defaults: true});
      });
    });
  });

  describe('sync', () => {
    it('creates a new instance of Sync', () => {
      const model = new bookshelf.Model();
      equal(model.sync() instanceof Sync, true);
    });
  });

  describe('isNew', () => {
    it('uses the idAttribute to determine if the model isNew', () => {
      const model = new bookshelf.Model();
      model.id = 1;
      equal(model.isNew(), false);
      model.set('id', null);
      equal(model.isNew(), true);
    });
  });

  describe('#previous()', () => {
    it('returns undefined for attributes that have not been set, fetched or saved yet', () => {
      const model = new Models.Site({id: 1});
      equal(model.previous('name'), undefined);
    });

    it("returns undefined for attributes that have been set if the model hasn't been synced yet", () => {
      const model = new Models.Site({id: 1});
      equal(model.previous('id'), undefined);
    });

    it('returns the previous value of an attribute the last time it was synced', () => {
      const model = new Models.Site({id: 1});

      return model.fetch().then(() => {
        model.set('id', 2);
        equal(model.previous('id'), 1);
      });
    });

    it("returns the current value of an attribute if it hasn't been changed", () => {
      const model = new Models.Site({id: 1});

      return model.fetch().then(() => {
        equal(model.previous('id'), 1);
      });
    });

    it('returns undefined if no attribute name is supplied', () => {
      const model = new Models.Site({id: 1});
      equal(model.previous(), undefined);
    });
  });

  describe('#previousAttributes()', () => {
    it("returns the model's current attributes if no attributes were changed after fetch", () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        expect(site.previousAttributes()).toEqual(site.attributes);
      });
    });

    it("returns the model's current attributes if no attributes were changed after fetching collection", () => {
      return bookshelf.Collection.extend({
        model: Models.Site
      })
        .forge()
        .fetch()
        .then((sites: any) => {
          expect(sites.at(0).previousAttributes()).toEqual(sites.at(0).attributes);
        });
    });

    it("returns the model's current attributes if no attributes were changed after save", () => {
      return new Models.Site({id: 1})
        .fetch()
        .then((site: any) => {
          return site.save({name: site.get('name')});
        })
        .then((site: any) => {
          expect(site.previousAttributes()).toEqual(site.attributes);
        });
    });

    it("returns the model's original attributes if the model has changed", () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        const originalAttributes = _.clone(site.attributes);
        site.set('name', 'Blah');
        expect(site.previousAttributes()).toEqual(originalAttributes);
        expect(site.previousAttributes()).not.toEqual(site.attributes);
      });
    });

    it("returns a model's original attributes if a model in a collection has changed", () => {
      return bookshelf.Collection.extend({
        model: Models.Site
      })
        .forge()
        .fetch()
        .then((sites: any) => {
          const site = sites.at(0);
          const originalAttributes = _.clone(site.attributes);
          site.set('name', 'Blah');
          expect(site.previousAttributes()).toEqual(originalAttributes);
          expect(site.previousAttributes()).not.toEqual(site.attributes);
        });
    });

    it("returns the model's original attributes after save", () => {
      let originalAttributes: any;

      return new Models.Site({id: 1})
        .fetch()
        .then((site: any) => {
          originalAttributes = _.clone(site.attributes);
          return site.save({name: 'Blah'});
        })
        .then((site: any) => {
          expect(site.previousAttributes()).toEqual(originalAttributes);
          expect(site.previousAttributes()).not.toEqual(site.attributes);
        })
        .finally(() => {
          return new Models.Site({id: 1}).save({name: originalAttributes.name});
        });
    });

    it("returns the model's original attributes after save on the 'updated' event", async () => {
      await new Promise<void>((resolve) => {
        let originalAttributes: any;
        const siteModel = new Models.Site({id: 1});

        siteModel.on('updated', (site: any) => {
          expect(site.previousAttributes()).toEqual(originalAttributes);
          expect(site.previousAttributes()).not.toEqual(site.attributes);

          new Models.Site({id: 1}).save({name: originalAttributes.name}).finally(() => resolve());
        });

        siteModel.fetch().then((site: any) => {
          originalAttributes = _.clone(site.attributes);
          return siteModel.save({name: 'Blah'});
        });
      });
    });

    it("returns the model's current attributes after save without changes on the 'updated' event", async () => {
      await new Promise<void>((resolve) => {
        let originalAttributes: any;
        const siteModel = new Models.Site({id: 1});

        siteModel.on('updated', (site: any) => {
          expect(site.previousAttributes()).toEqual(site.attributes);
          new Models.Site({id: 1}).save({name: originalAttributes.name}).finally(() => resolve());
        });

        siteModel.fetch().then((site: any) => {
          originalAttributes = _.clone(site.attributes);
          return siteModel.save({name: site.get('name')});
        });
      });
    });

    it("returns the model's current attributes after save without changes on the 'updated' event with a collection", async () => {
      await new Promise<void>((resolve) => {
        let originalAttributes: any;
        const SiteModel = Models.Site.extend({
          initialize(this: any) {
            this.on('updated', (site: any) => {
              expect(site.previousAttributes()).toEqual(site.attributes);
              new Models.Site({id: originalAttributes.id})
                .save({name: originalAttributes.name})
                .finally(() => resolve());
            });
          }
        });
        const Sites = bookshelf.Collection.extend({
          model: SiteModel
        });

        Sites.forge()
          .fetch()
          .then((sites: any) => {
            const site = sites.at(0);
            originalAttributes = _.clone(site.attributes);
            return site.save({name: site.get('name')});
          });
      });
    });

    it("returns the model's original attributes after destroy", () => {
      let originalAttributes: any;

      return new Models.Site({name: 'Blah'})
        .save()
        .then((site: any) => {
          originalAttributes = _.clone(site.attributes);
          return site.destroy();
        })
        .then((site: any) => {
          expect(site.previousAttributes()).toEqual(originalAttributes);
          expect(site.previousAttributes()).not.toEqual(site.attributes);
        });
    });

    it('returns an empty object if no model data has been fetched yet', () => {
      const site = new Models.Site({id: 1});
      expect(site.previousAttributes()).toEqual({});
    });

    it("returns the model's current attributes when the model is eager loaded without changes", () => {
      return new Models.Author({id: 1}).fetch({withRelated: ['site']}).then((author: any) => {
        const site = author.related('site');
        expect(site.previousAttributes()).toEqual(site.attributes);
      });
    });

    it("returns the model's original attributes when the model is eager loaded", () => {
      return new Models.Author({id: 1}).fetch({withRelated: ['site']}).then((author: any) => {
        const site = author.related('site');
        const originalAttributes = _.clone(site.attributes);

        site.set('name', 'changed name');

        expect(site.previousAttributes()).toEqual(originalAttributes);
        expect(site.attributes).not.toEqual(originalAttributes);
      });
    });
  });

  describe('#hasChanged()', () => {
    it('returns true if passing an attribute name that has changed since the last sync', () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        site.set('name', 'Changed site');
        equal(site.hasChanged('name'), true);
      });
    });

    it('returns false if passing an attribute name that has not changed since the last sync', () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        site.set('name', 'Changed site');
        equal(site.hasChanged('id'), false);
      });
    });

    it('returns true if no arguments are provided and an attribute of the model has changed', () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        site.set('name', 'Changed site');
        equal(site.hasChanged(), true);
      });
    });

    it("returns false if no arguments are provided and the model hasn't changed", () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        equal(site.hasChanged(), false);
      });
    });

    it('returns false if attribute is changed and then changed again to the initial value', () => {
      return new Models.Site({id: 1}).fetch().then((site: any) => {
        const name = site.get('name');

        site.set('name', 'Changed site');
        site.set('name', name);

        equal(site.hasChanged('name'), false);
      });
    });

    it('returns false after an attribute is changed and the model is saved', () => {
      let originalName: any;

      return new Models.Site({id: 3})
        .fetch()
        .then((site: any) => {
          originalName = site.get('name');
          return site.save({name: 'Changed site'});
        })
        .then((savedSite: any) => {
          equal(savedSite.hasChanged('name'), false);
        })
        .finally(() => {
          if (originalName) return new Models.Site({id: 3}).save({name: originalName});
        });
    });
  });

  describe('Model.collection', () => {
    it('creates a new collection for the current model', () => {
      expect(bookshelf.Model.collection()).toBeInstanceOf(bookshelf.Collection);

      const NewModel = bookshelf.Model.extend({test: 1});
      const newModelCollection = NewModel.collection([{id: 1}]);

      expect(newModelCollection).toBeInstanceOf(bookshelf.Collection);
      expect(newModelCollection.at(0)).toBeInstanceOf(NewModel);
    });
  });

  describe('Model.count', () => {
    it('counts the number of matching records in the database', () => {
      return Models.Post.count().then((count: any) => {
        checkCount(count, 5);
      });
    });
  });

  describe('model.once', () => {
    const Post = Models.Post;

    it('event.once return a promise', () => {
      const p = new Post({id: 1});
      p.once('event', () => {
        return Promise.resolve(1);
      });
      const promise = p.triggerThen('event');

      equal(promise instanceof Promise, true);

      return promise.then((results: any) => {
        deepEqual(results, [1]);
      });
    });
  });

  describe('model.clone', () => {
    const Post = Models.Post;

    it('should be equivalent when cloned', () => {
      const original = Post.forge({author: 'Johnny', body: 'body'});
      original.related('comments').add({email: 'some@email.com'});
      const cloned = original.clone();

      deepEqual(_.omit(cloned, 'cid'), _.omit(original, 'cid'));
    });

    it('should contain a copy of internal QueryBuilder object - #945', () => {
      const original = Post.forge({author: 'Rhys'}).where('share_count', '>', 10).query('orderBy', 'created_at');

      const cloned = original.clone();

      expect(original.query()).not.toBe(cloned.query());
      expect(original.query().toString()).toBe(cloned.query().toString());

      // Check that a query listener is registered. We must assume that this
      // is the link to `Model.on('query').
      expect(cloned.query()._events).toHaveProperty('query');
    });
  });

  describe('model.saveMethod', () => {
    const Post = Models.Post;

    it('should default to insert for new model', () => {
      const post = Post.forge();
      post.isNew = () => {
        return true;
      };
      expect(post.saveMethod()).toBe('insert');
    });

    it('should default to update for non-new model', () => {
      const post = Post.forge();
      post.isNew = () => {
        return false;
      };
      expect(post.saveMethod()).toBe('update');
    });

    it('should normalize to lowercase', () => {
      const post = Post.forge();
      expect(post.saveMethod({method: 'UpDATe'})).toBe('update');
      expect(post.saveMethod({method: 'INSERT'})).toBe('insert');
    });

    it('should always update on patch', () => {
      const post = Post.forge();
      expect(post.saveMethod({patch: true})).toBe('update');
    });
  });
});
