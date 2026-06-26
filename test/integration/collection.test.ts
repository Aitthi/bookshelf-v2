/**
 * Vitest port of test/integration/collection.js
 *
 * Tests Collection methods against the src/ ORM via the TypeScript harness.
 *
 * Conversion notes:
 *   - mocha → Vitest globals (describe/it/beforeAll)
 *   - node:assert strict (equal/deepEqual/fail) kept as-is
 *   - chai expect → Vitest expect (toBe/toEqual/toHaveProperty/toBeInstanceOf)
 *   - bluebird .tap() replaced with explicit async/await or .then() returning value
 *   - bluebird .catch(Type, handler) replaced with standard catch + instanceof check
 *   - this.test.title removed; sqlite3 output result inlined directly
 */

import {describe, it, expect, beforeAll} from 'vitest';
import {equal, deepEqual, fail} from 'node:assert/strict';
import {bookshelf, Models, initialize, formatNumber} from './helpers/harness';
import output from './output/Collection';

const dialect = bookshelf.knex.client.dialect as string;
const json = (model: unknown) => JSON.parse(JSON.stringify(model));
const fmt = formatNumber(dialect);
const checkCount = (actual: unknown, expected: number) => {
  equal(actual, fmt(expected));
};

// Models members accessed as Models.Site, Models.Author, etc. throughout.

beforeAll(async () => {
  await initialize();
});

describe('Collection', () => {
  describe('.extend()', () => {
    it('should have own EmptyError', () => {
      const Sites = bookshelf.Collection.extend({model: Models.Site});
      const OtherSites = bookshelf.Collection.extend({model: Models.Site});
      const err = new Sites.EmptyError();

      expect(Sites.EmptyError).not.toEqual(bookshelf.Collection.EmptyError);
      expect(Sites.EmptyError).not.toEqual(OtherSites.EmptyError);
      expect(err).toBeInstanceOf(bookshelf.Collection.EmptyError);
    });
  });

  describe('#count()', () => {
    it('counts the number of models in a collection', async () => {
      const count = await bookshelf.Collection.extend({tableName: 'posts'}).forge().count();
      checkCount(count, 5);
    });

    it('optionally counts by column (excluding null values)', async () => {
      const authors = bookshelf.Collection.extend({tableName: 'authors'}).forge();
      const count1 = await authors.count();
      checkCount(count1, 5);
      const count2 = await authors.count('last_name');
      checkCount(count2, 4);
    });

    it('counts a filtered query', async () => {
      const count = await bookshelf.Collection.extend({tableName: 'posts'})
        .forge()
        .query('where', 'blog_id', 1)
        .count();
      checkCount(count, 2);
    });

    it('counts a `hasMany` relation', async () => {
      const count = await new Models.Blog({id: 1}).posts().count();
      checkCount(count, 2);
    });

    it('counts a `hasMany` `through` relation', async () => {
      const count = await new Models.Blog({id: 1}).comments().count();
      checkCount(count, 1);
    });
  });

  describe('#fetch()', () => {
    it('fetches the models in a collection', async () => {
      const resp = await bookshelf.Collection.extend({tableName: 'posts'}).forge().fetch();
      deepEqual(
        json(resp),
        (output as Record<string, Record<string, {result: unknown}>>)['fetches the models in a collection'][
          dialect
        ].result
      );
    });

    it('returns an empty collection if no models can be fetched', async () => {
      const collection = await bookshelf.Collection.extend({tableName: 'posts'})
        .forge()
        .where('owner_id', 99)
        .fetch();
      equal(collection.length, 0);
      equal(collection.models.length, 0);
    });

    it('throws an error if no models can be fetched with the require option', async () => {
      await bookshelf.Collection.extend({tableName: 'posts'})
        .forge()
        .where('owner_id', 99)
        .fetch({require: true})
        .then(() => {
          fail('Expected the promise to be rejected but it resolved');
        })
        .catch((error: Error) => {
          equal(error.message, 'EmptyResponse');
        });
    });
  });

  describe('#fetchPage()', () => {
    it('fetches a page from a collection', async () => {
      const results = await Models.Customer.collection().fetchPage();
      expect(results).toHaveProperty('models');
      expect(results).toHaveProperty('pagination');
    });

    it('fetches a page from a relation collection', async () => {
      const results = await Models.User.forge({uid: 1}).roles().fetchPage();
      expect(results.length).toBe(2);
      expect(results).toHaveProperty('models');
      expect(results).toHaveProperty('pagination');
    });

    it('fetches a page from a relation collection with additional condition', async () => {
      const results = await Models.User.forge({uid: 1})
        .roles()
        .query((query: {where: (...args: unknown[]) => unknown}) => {
          query.where('roles.rid', '!=', 4);
        })
        .fetchPage();
      expect(results.length).toBe(1);
      expect(results).toHaveProperty('models');
      expect(results).toHaveProperty('pagination');
    });
  });

  describe('#fetchOne()', () => {
    it('fetches a single model from the collection', async () => {
      const model = await new Models.Site({id: 1}).authors().fetchOne();
      // Just check that we got the right relation key back
      expect(model.get('site_id')).toBe(1);
    });

    it('maintains a clone of the query builder from the current collection', async () => {
      await new Models.Site({id: 1})
        .authors()
        .query({where: {id: 40}})
        .fetchOne()
        .then(() => {
          fail('Expected the promise to be rejected but it resolved');
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(Models.Author.NotFoundError);
        });
    });

    it('rejects with an error if no record exists', async () => {
      await new Models.Site({id: 1})
        .authors()
        .query({where: {id: 40}})
        .fetchOne()
        .then(() => {
          fail('Expected the promise to be rejected but it resolved');
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(Models.Author.NotFoundError);
          equal((error as Error).message, 'EmptyResponse');
        });
    });

    it('resolves to null with the {require: false} option if no model exists', async () => {
      const model = await new Models.Site({id: 1})
        .authors()
        .query({where: {id: 40}})
        .fetchOne({require: false});
      equal(model, null);
    });
  });

  describe('#orderBy()', () => {
    it('orders the results by column in ascending order', async () => {
      const result = await new Models.Site({id: 1}).authors().orderBy('first_name', 'ASC').fetch();
      const expectedCollection = [
        {id: 2, site_id: 1, first_name: 'Bazooka', last_name: 'Joe'},
        {id: 1, site_id: 1, first_name: 'Tim', last_name: 'Griesser'}
      ];
      deepEqual(result.toJSON(), expectedCollection);
    });

    it('orders the results by column in descending order', async () => {
      const result = await new Models.Site({id: 1}).authors().orderBy('first_name', 'DESC').fetch();
      const expectedCollection = [
        {id: 1, site_id: 1, first_name: 'Tim', last_name: 'Griesser'},
        {id: 2, site_id: 1, first_name: 'Bazooka', last_name: 'Joe'}
      ];
      deepEqual(result.toJSON(), expectedCollection);
    });

    it('orders the results in ascending order when chained with fetchPage()', async () => {
      const sites = await Models.Site.collection().orderBy('name').fetchPage();
      const expectedCollection = [
        {id: 3, name: 'backbonejs.org'},
        {id: 2, name: 'bookshelfjs.org'},
        {id: 1, name: 'knexjs.org'}
      ];
      deepEqual(sites.toJSON(), expectedCollection);
    });

    it('orders the results in descending order when chained with fetchPage()', async () => {
      const sites = await Models.Site.collection().orderBy('name', 'DESC').fetchPage();
      const expectedCollection = [
        {id: 1, name: 'knexjs.org'},
        {id: 2, name: 'bookshelfjs.org'},
        {id: 3, name: 'backbonejs.org'}
      ];
      deepEqual(sites.toJSON(), expectedCollection);
    });
  });

  describe('#create()', () => {
    it('creates and saves a new model instance, saving it to the collection', async () => {
      const model = await Models.Site.collection().create({name: 'google.com'});
      expect(model.get('name')).toBe('google.com');
      await model.destroy();
    });

    it('should populate a `hasMany` or `morphMany` with the proper keys', async () => {
      // hasMany
      const author = await new Models.Site({id: 10})
        .authors()
        .create({first_name: 'test', last_name: 'tester'});
      expect(author.get('first_name')).toBe('test');
      expect(author.get('last_name')).toBe('tester');
      expect(author.get('site_id')).toBe(10);
      await author.destroy();

      // morphMany
      const photo = await new Models.Site({id: 10}).photos().create({
        url: 'http://image.dev',
        caption: 'this is a test image'
      });
      expect(photo.get('imageable_id')).toBe(10);
      expect(photo.get('imageable_type')).toBe('sites');
      expect(photo.get('url')).toBe('http://image.dev');

      // morphMany with custom columnNames
      const thumbnail = await new Models.Site({id: 10}).thumbnails().create({
        url: 'http://image.dev',
        caption: 'this is a test image'
      });
      expect(thumbnail.get('ImageableId')).toBe(10);
      expect(thumbnail.get('ImageableType')).toBe('sites');
      expect(thumbnail.get('url')).toBe('http://image.dev');
    });

    it('should not set incorrect foreign key in a `hasMany` `through` relation - #768', async () => {
      // Will fail if an unknown field (e.g. blog_id) is added to the insert query.
      const comment = await new Models.Blog({id: 768})
        .comments()
        .create({post_id: 5, comment: 'test comment'});
      await comment.destroy();
    });

    it('should automatically create a join model when joining a belongsToMany', async () => {
      const admin = await new Models.Site({id: 1})
        .admins()
        .create({username: 'test', password: 'test'});
      expect(admin.get('username')).toBe('test');
    });

    it('should populate the nested relations with the proper keys', async () => {
      const author = await Models.Author.forge({id: 1}).fetch({withRelated: 'site.photos'});
      const photo = await author
        .related('site')
        .related('photos')
        .create({
          imageable_id: author.related('site').id,
          url: 'http://image.dev',
          caption: 'this is a test image'
        });
      expect(photo.get('url')).toBe('http://image.dev');
      await photo.destroy();
    });

    it('can require items in the response', async () => {
      try {
        await bookshelf.Collection.extend({tableName: 'posts'})
          .query('where', {id: '1000'})
          .fetch({require: true});
        fail('Expected the promise to be rejected but it resolved');
      } catch (err) {
        expect(err).toBeInstanceOf(bookshelf.Collection.EmptyError);
        expect((err as Error).message).toBe('EmptyResponse');
      }
    });

    it('correctly parses added relation keys', async () => {
      const author = await Models.Site.forge({id: 1})
        .related('authorsParsed')
        .create({first_name_parsed: 'John', last_name_parsed: 'Smith'});
      expect(author.get('first_name_parsed')).toBe('John');
      expect(author.get('last_name_parsed')).toBe('Smith');
      expect(author.get('site_id_parsed')).toBe(1);
      await author.destroy();
    });
  });

  describe('#clone()', () => {
    it('should contain a copy of internal QueryBuilder object - #945', () => {
      const original = Models.Post.collection()
        .query('where', 'share_count', '>', 10)
        .query('orderBy', 'created_at');
      const cloned = original.clone();

      expect(original.query()).not.toBe(cloned.query());
      expect(original.query().toString()).toBe(cloned.query().toString());

      // Check that a query listener is registered (link to Model.on('query')).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((cloned.query() as any)._events).toHaveProperty('query');
    });
  });

  describe('#where()', () => {
    it('constrains the fetch call with the specified query conditions', async () => {
      const Sites = bookshelf.Collection.extend({model: Models.Site});
      const sites = await new Sites().where({name: 'bookshelfjs.org'}).fetch();
      equal(sites.length, 1);
      equal(sites.models[0].get('name'), 'bookshelfjs.org');
    });

    it('can constrain the fetch call with the "key, comparator, value" type conditions', async () => {
      const Sites = bookshelf.Collection.extend({model: Models.Site});
      const sites = await new Sites().where('name', '<>', 'bookshelfjs.org').fetch();
      equal(sites.length, 2);
      equal(sites.models[0].get('name'), 'knexjs.org');
      equal(sites.models[1].get('name'), 'backbonejs.org');
    });
  });
});
