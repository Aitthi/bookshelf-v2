/**
 * Vitest port of test/integration/relations.js
 *
 * Tests eager-loading and relation-fetching against the src/ ORM via the TypeScript harness.
 *
 * Conversion notes:
 *   - module.exports wrapper → top-level describe
 *   - mocha → Vitest globals (describe/it/beforeAll/beforeEach/afterAll/afterEach)
 *   - this.test.title removed; output keys inlined as string literals
 *   - chai expect → Vitest expect
 *   - bluebird .tap()/.spread()/.throw() → native async/await
 *   - assert.equal kept via node:assert/strict
 *   - done callbacks → Promise-wrapped async/await
 *   - Bookshelf.knex → bookshelf.knex (harness import)
 *   - mocha before/after → Vitest beforeAll/afterAll
 */

import {describe, it, expect, beforeAll, beforeEach, afterAll, afterEach} from 'vitest';
import {equal} from 'node:assert/strict';
import {bookshelf, Models, generateEventModels, initialize} from './helpers/harness';
import {BPromise} from '../../src/internal/promise';
import outputRaw from './output/Relations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const output = outputRaw as Record<string, Record<string, {result: unknown}>>;
const dialect = bookshelf.knex.client.dialect as string;

// ---------------------------------------------------------------------------
// Sort helpers (mirrors test/integration/helpers/index.js)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortCollection(collection: any): any {
  if (!Array.isArray(collection)) return collection;
  collection.sort((a: any, b: any) => a.id - b.id);
  return collection.map((item: any) => sortObj(item));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortObj(model: any): any {
  if (typeof model !== 'object' || model === null || Array.isArray(model)) return model;
  const sorted: Record<string, unknown> = {};
  for (const attribute in model) {
    sorted[attribute] = sortCollection((model as Record<string, unknown>)[attribute]);
  }
  return sorted;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function json(model: any): unknown {
  const data = model.toJSON();
  if (Array.isArray(data)) return sortCollection(data);
  return sortObj(data);
}

function checkTest(title: string, options?: {sort?: boolean}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (resp: any) => {
    const result = options?.sort === false ? resp.toJSON() : json(resp);
    expect(result).toEqual(output[title][dialect].result);
  };
}

// ---------------------------------------------------------------------------
// Models (let for the three that get re-extended in Issue #578)
// ---------------------------------------------------------------------------

const Site = Models.Site;
const Admin = Models.Admin;
const Author = Models.Author;
const Critic = Models.Critic;
const CriticComment = Models.CriticComment;
const Blog = Models.Blog;
const Post = Models.Post;
const Comment = Models.Comment;
const User = Models.User;
const Thumbnail = Models.Thumbnail;
const Photo = Models.Photo;
const PhotoParsed = Models.PhotoParsed;
const Customer = Models.Customer;
const Hostname = Models.Hostname;
const UserTokenParsed = Models.UserTokenParsed;
// eslint-disable-next-line prefer-const
let LeftModel = Models.LeftModel;
// eslint-disable-next-line prefer-const
let RightModel = Models.RightModel;
// eslint-disable-next-line prefer-const
let JoinModel = Models.JoinModel;
const Locale = Models.Locale;
const Translation = Models.Translation;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Organization: any = Models.OrgModel.extend({
  members() {
    return this.hasMany(Models.Member, 'organization_id');
  }
});

beforeAll(async () => {
  await initialize();
  // In the original mocha suite, collection.js tests run before relations.js and create a photo
  // (imageable_id:10, imageable_type:'sites') and thumbnail (ImageableId:10, ImageableType:'sites')
  // pointing to a non-existent site. They are never cleaned up, so they appear in the DB when
  // the relations eager-load assertions run. We must seed them here for parity.
  await bookshelf.knex('photos').insert({
    url: 'http://image.dev',
    caption: 'this is a test image',
    imageable_id: 10,
    imageable_type: 'sites'
  });
  await bookshelf.knex('thumbnails').insert({
    url: 'http://image.dev',
    caption: 'this is a test image',
    ImageableId: 10,
    ImageableType: 'sites'
  });
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Relations', () => {
  describe('Bookshelf Relations', () => {
    // -------------------------------------------------------------------------
    describe('Standard Relations - Models', () => {
      it('handles belongsTo (blog, site)', async () => {
        const model = await new Blog({id: 4}).fetch();
        const result = await model.site().fetch();
        checkTest('handles belongsTo (blog, site)')(result);
      });

      it('handles hasMany (posts)', async () => {
        const model = await new Blog({id: 1}).fetch();
        const result = await model.posts().fetch();
        checkTest('handles hasMany (posts)')(result);
      });

      it('handles hasOne (meta)', async () => {
        const result = await new Site({id: 1}).meta().fetch();
        checkTest('handles hasOne (meta)')(result);
      });

      it('handles belongsToMany (posts)', async () => {
        const result = await new Author({id: 1}).posts().fetch();
        checkTest('handles belongsToMany (posts)')(result);
      });
    });

    // -------------------------------------------------------------------------
    describe('Eager Loading - Models', () => {
      it('eager loads "hasOne" relationships correctly (site -> meta)', async () => {
        const result = await new Site({id: 1}).fetch({withRelated: ['meta']});
        checkTest('eager loads "hasOne" relationships correctly (site -> meta)')(result);
      });

      it("does not load \"hasOne\" relationship when it doesn't exist (site -> meta)", async () => {
        const site = await new Site({id: 3}).fetch({withRelated: ['meta']});
        expect(site.toJSON()).not.toHaveProperty('meta');
      });

      it('eager loads "hasMany" relationships correctly (site -> authors, blogs)', async () => {
        const result = await new Site({id: 1}).fetch({withRelated: ['authors', 'blogs']});
        checkTest('eager loads "hasMany" relationships correctly (site -> authors, blogs)')(result);
      });

      it('eager loads "hasMany" relationships when children have duplicate ids', async () => {
        const organization = await new Organization({id: 2}).fetch({
          withRelated: ['members'],
          merge: false,
          remove: false
        });
        expect(organization.related('members').pluck('name')).toEqual(
          expect.arrayContaining(['Alice', 'Bob'])
        );
      });

      it('eager loads "belongsTo" relationships correctly (blog -> site)', async () => {
        const result = await new Blog({id: 3}).fetch({withRelated: ['site']});
        checkTest('eager loads "belongsTo" relationships correctly (blog -> site)')(result);
      });

      it('does not load "belongsTo" relationship when foreignKey is null (blog -> site) #1299', async () => {
        const result = await new Blog({id: 5}).fetch({withRelated: ['site']});
        checkTest('does not load "belongsTo" relationship when foreignKey is null (blog -> site) #1299')(result);
      });

      it('throws an error if you try to fetch a related object without the necessary key', async () => {
        try {
          await new Blog({id: 1}).site().fetch();
          throw new Error('This should not succeed');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      });

      it('eager loads "belongsToMany" models correctly (post -> tags)', async () => {
        const result = await new Post({id: 1}).fetch({withRelated: ['tags']});
        checkTest('eager loads "belongsToMany" models correctly (post -> tags)')(result);
      });

      it('attaches an empty related model or collection if the `EagerRelation` comes back blank', async () => {
        const result = await new Site({id: 3}).fetch({withRelated: ['meta', 'blogs', 'authors.posts']});
        checkTest('attaches an empty related model or collection if the `EagerRelation` comes back blank')(result);
      });

      it('maintains eager loaded column specifications, #510', async () => {
        const result = await new Site({id: 1}).fetch({
          withRelated: [
            {
              authors(qb: any) {
                qb.columns('id', 'site_id', 'first_name');
              }
            }
          ]
        });
        checkTest('maintains eager loaded column specifications, #510')(result);
      });

      it('can load relations when foreign key is 0', async () => {
        await new Models.Backup({id: 1, backup_type_id: 0}).save();
        const backups = await Models.Backup.fetchAll({withRelated: ['type']});
        const relatedType = backups.at(0).related('type');
        expect(typeof relatedType.get('name')).toBe('string');
        expect(relatedType.get('name')).not.toBe('');
      });

      it('throws an error on undefined first withRelated relations', async () => {
        await new Site({id: 1})
          .fetch({withRelated: ['undefinedRelation']})
          .then(
            () => {
              throw new Error('This should not succeed');
            },
            (err: Error) => {
              expect(err.message).toEqual('undefinedRelation is not defined on the model.');
            }
          );
      });

      it('throws an error on undefined non-first withRelated relations', async () => {
        await new Site({id: 1})
          .fetch({withRelated: ['authors', 'undefinedRelation']})
          .then(
            () => {
              throw new Error('This should not succeed');
            },
            (err: Error) => {
              expect(err.message).toEqual('undefinedRelation is not defined on the model.');
            }
          );
      });

      it('is possible to add withRelated in events', async () => {
        const TestSiteMeta = Models.SiteMeta.extend({
          initialize() {
            this.on('fetching fetching:collection', (model: any, columns: any, options: any) => {
              if (!options.withRelated) options.withRelated = [];
              options.withRelated.push('site');
            });
          }
        });
        const sitemeta = await new TestSiteMeta({id: 1}).fetch();
        expect(sitemeta.related('site').get('id')).toBeDefined();
      });

      describe("emits 'fetching' and 'fetched' events for eagerly loaded relations with", () => {
        afterEach(() => {
          delete (Site.prototype as any).initialize;
        });

        it('withRelated option', async () => {
          let countFetching = 0;
          let countFetched = 0;
          (Site.prototype as any).initialize = function () {
            this.on('fetching', () => {
              countFetching++;
            });
            this.on('fetched', () => {
              countFetched++;
            });
          };
          await Blog.forge({id: 1}).fetch({withRelated: ['site']});
          equal(countFetching, 1);
          equal(countFetched, 1);
        });

        it('load() method', async () => {
          let countFetching = 0;
          let countFetched = 0;
          (Site.prototype as any).initialize = function () {
            this.on('fetching', () => {
              countFetching++;
            });
            this.on('fetched', () => {
              countFetched++;
            });
          };
          const blog = await Blog.where({id: 1}).fetch();
          await blog.load('site');
          equal(countFetching, 1);
          equal(countFetched, 1);
        });
      });
    });

    // -------------------------------------------------------------------------
    describe('Eager Loading - Collections', () => {
      it('eager loads "hasOne" models correctly (sites -> meta)', async () => {
        const result = await Site.fetchAll({withRelated: ['meta']});
        checkTest('eager loads "hasOne" models correctly (sites -> meta)')(result);
      });

      it('eager loads "belongsTo" models correctly (blogs -> site) including #1299', async () => {
        const result = await Blog.fetchAll({withRelated: ['site']});
        checkTest('eager loads "belongsTo" models correctly (blogs -> site) including #1299')(result);
      });

      it('eager loads "hasMany" models correctly (site -> blogs)', async () => {
        const result = await new Site({id: 1}).fetch({withRelated: ['blogs']});
        checkTest('eager loads "hasMany" models correctly (site -> blogs)')(result);
      });

      it('eager loads "belongsToMany" models correctly (posts -> tags)', async () => {
        const result = await Post.where('blog_id', 1).fetchAll({withRelated: ['tags']});
        checkTest('eager loads "belongsToMany" models correctly (posts -> tags)')(result);
      });

      it('eager loads "belongsToMany" models correctly and parent is not undefined', async () => {
        const result = await Post.where('blog_id', 1).fetchAll({withRelated: ['tags']});
        expect(result.models[0].related('tags').relatedData.parentId).toEqual(1);
      });

      it('when parent model has custom id attribute and a parse method that mutates it', async () => {
        const organization = await Organization.forge({id: 1}).fetch({withRelated: ['members']});
        expect(organization.related('members').length).toBeGreaterThan(0);
      });
    });

    // -------------------------------------------------------------------------
    describe('Nested Eager Loading - Models', () => {
      it('eager loads "hasMany" -> "hasMany" (site -> authors.ownPosts)', async () => {
        const result = await new Site({id: 1}).fetch({withRelated: ['authors.ownPosts']});
        checkTest('eager loads "hasMany" -> "hasMany" (site -> authors.ownPosts)')(result);
      });

      it('eager loads "hasMany" -> "belongsToMany" (site -> authors.posts)', async () => {
        const result = await new Site({id: 1}).fetch({
          withRelated: {
            'authors.posts'(qb: any) {
              return qb.orderBy('posts.id', 'ASC');
            }
          }
        });
        checkTest('eager loads "hasMany" -> "belongsToMany" (site -> authors.posts)', {sort: false})(result);
      });

      it('does multi deep eager loads (site -> authors.ownPosts, authors.site, blogs.posts)', async () => {
        const result = await new Site({id: 1}).fetch({
          withRelated: ['authors.ownPosts', 'authors.site', 'blogs.posts']
        });
        checkTest('does multi deep eager loads (site -> authors.ownPosts, authors.site, blogs.posts)')(result);
      });
    });

    // -------------------------------------------------------------------------
    describe('Nested Eager Loading - Collections', () => {
      it('eager loads "hasMany" -> "hasMany" (sites -> authors.ownPosts)', async () => {
        const result = await Site.fetchAll({withRelated: ['authors.ownPosts']});
        checkTest('eager loads "hasMany" -> "hasMany" (sites -> authors.ownPosts)')(result);
      });
    });

    // -------------------------------------------------------------------------
    describe('Model & Collection - load', () => {
      it('eager loads relations on a populated model (site -> blogs, authors.site)', async () => {
        const m = await new Site({id: 1}).fetch();
        checkTest('eager loads relations on a populated model (site -> blogs, authors.site)')(m);
        await m.load(['blogs', 'authors.site']);
      });

      it('eager loads attributes on a collection (sites -> blogs, authors.site)', async () => {
        const c = await Site.fetchAll();
        checkTest('eager loads attributes on a collection (sites -> blogs, authors.site)')(c);
        await c.load(['blogs', 'authors.site']);
      });
    });

    // -------------------------------------------------------------------------
    describe('Pivot Tables', () => {
      beforeEach(async () => {
        await Promise.all([new Site({id: 1}).admins().detach(), new Site({id: 2}).admins().detach()]);
      });

      it("attaching event get's triggered", async () => {
        const site1 = new Site({id: 1});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        await admin1.save();
        await new Promise<void>((resolve, reject) => {
          site1.related('admins').on('attaching', (collection: any, modelToAttach: any) => {
            try {
              expect(collection).toBeTruthy();
              expect(modelToAttach.get('username')).toEqual(admin1.get('username'));
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          site1
            .related('admins')
            .attach(admin1)
            .catch(reject);
        });
      });

      it("creating event get's triggered", async () => {
        const site1 = new Site({id: 1});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        await admin1.save();
        await new Promise<void>((resolve, reject) => {
          site1.related('admins').on('creating', (collection: any, data: any, options: any) => {
            try {
              expect(collection).toBeTruthy();
              expect(data.site_id).toBeTruthy();
              expect(data.admin_id).toBeTruthy();
              // eslint-disable-next-line @typescript-eslint/no-unused-expressions
              expect(options == null).toBe(true);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
          site1
            .related('admins')
            .attach(admin1)
            .catch(reject);
        });
      });

      it('has an attaching event, which will fail if an error is thrown', async () => {
        const site1 = new Site({id: 1});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        await admin1.save();
        site1.related('admins').on('attaching', () => {
          throw new Error('This failed');
        });
        try {
          await site1.related('admins').attach(admin1);
          throw new Error('Expected error was not thrown');
        } catch (err: any) {
          equal(err.message, 'This failed');
        }
      });

      it('has an detaching event, which will fail if an error is thrown', async () => {
        const site1 = new Site({id: 1});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        await admin1.save();
        await site1.related('admins').attach(admin1);
        site1.related('admins').on('detaching', () => {
          throw new Error('This failed');
        });
        try {
          await site1.related('admins').detach(admin1);
          throw new Error('Expected error was not thrown');
        } catch (err: any) {
          equal(err.message, 'This failed');
        }
      });

      it('provides "attach" for creating or attaching records', async () => {
        const site1 = new Site({id: 1});
        const site2 = new Site({id: 2});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        const admin2 = new Admin({username: 'syncable', password: 'test'});

        await Promise.all([admin1.save(), admin2.save()]);
        const admin1_id = admin1.id;

        site1.related('admins').on('attached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 2);
        });
        site2.related('admins').on('attached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 1);
        });

        const [site1Admins, site2Admins] = await Promise.all([
          site1.related('admins').attach([admin1, admin2]),
          site2.related('admins').attach(admin2)
        ]);

        expect(site1Admins).toBe(site1.related('admins'));
        expect(site2Admins).toBe(site2.related('admins'));
        expect(site1.related('admins')).toHaveLength(2);
        expect(site2.related('admins')).toHaveLength(1);

        await Promise.all([
          (async () => {
            const c = await new Site({id: 1}).related('admins').fetch();
            c.forEach((m: any) => equal(m.hasChanged(), false));
            equal(c.at(0).pivot.get('item'), 'test');
            equal(c.length, 2);
          })(),
          (async () => {
            const c = await new Site({id: 2}).related('admins').fetch();
            equal(c.length, 1);
          })()
        ]);

        const [admins1, admins2] = await Promise.all([
          new Site({id: 1}).related('admins').fetch(),
          new Site({id: 2}).related('admins').fetch()
        ]);

        admins1.on('detached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 1);
        });
        admins2.on('detached', async (c: any) => {
          const col = await c.fetch({require: false});
          equal(col.length, 0);
        });

        await Promise.all([
          admins1.detach(admin1_id).then(() => expect(admins1).toHaveLength(1)),
          admins2.detach().then(() => expect(admins2).toHaveLength(0))
        ]);
      });

      it('keeps the attach method for eager loaded relations, #120', async () => {
        const site1 = new Site({id: 1});
        const site2 = new Site({id: 2});
        const admin1 = new Admin({username: 'syncable', password: 'test'});
        const admin2 = new Admin({username: 'syncable', password: 'test'});

        await Promise.all([
          admin1.save(),
          admin2.save(),
          site1.fetch({withRelated: 'admins'}),
          site2.fetch({withRelated: 'admins'})
        ]);
        const admin1_id = admin1.id;

        site1.related('admins').on('attached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 2);
        });
        site2.related('admins').on('attached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 1);
        });

        await Promise.all([
          site1.related('admins').attach([admin1, admin2]),
          site2.related('admins').attach(admin2)
        ]);

        expect(site1.related('admins')).toHaveLength(2);
        expect(site2.related('admins')).toHaveLength(1);

        await Promise.all([
          (async () => {
            const c = await new Site({id: 1}).related('admins').fetch();
            c.forEach((m: any) => equal(m.hasChanged(), false));
            equal(c.at(0).pivot.get('item'), 'test');
            equal(c.length, 2);
          })(),
          (async () => {
            const c = await new Site({id: 2}).related('admins').fetch();
            equal(c.length, 1);
          })()
        ]);

        const [admins1, admins2] = await Promise.all([
          new Site({id: 1}).related('admins').fetch(),
          new Site({id: 2}).related('admins').fetch()
        ]);

        admins1.on('detached', async (c: any) => {
          const col = await c.fetch();
          equal(col.length, 1);
        });
        admins2.on('detached', async (c: any) => {
          const col = await c.fetch({require: false});
          equal(col.length, 0);
        });

        await Promise.all([
          admins1.detach(admin1_id).then(() => expect(admins1).toHaveLength(1)),
          admins2.detach().then(() => expect(admins2).toHaveLength(0))
        ]);
      });

      it('can attach `belongsToMany` relation to models eager loaded with `fetchAll`, #629', async () => {
        const authors = await Author.fetchAll({withRelated: ['posts']});
        const [postsCollection, post] = await Promise.all([
          authors.at(0).related('posts').detach(),
          new Post({id: 1}).fetch()
        ]);
        expect(postsCollection).toHaveLength(0);
        const posts = await postsCollection.attach(post);
        expect(posts).toHaveLength(1);
      });

      it('keeps the pivotal helper methods when cloning a collection having `relatedData` with `type` "belongsToMany", #1197', () => {
        const pivotalProps = [
          'attach',
          'detach',
          'updatePivot',
          'withPivot',
          '_processPivot',
          '_processPlainPivot',
          '_processModelPivot'
        ];
        const author = new Author({id: 1});
        const posts = author.related('posts');
        pivotalProps.forEach((prop) => {
          expect((posts as any)[prop]).toBeInstanceOf(Function);
        });

        const clonedAuthor = author.clone();
        const clonedPosts = clonedAuthor.related('posts');
        pivotalProps.forEach((prop) => {
          expect((clonedPosts as any)[prop]).toBe((posts as any)[prop]);
        });
      });
    });

    // -------------------------------------------------------------------------
    describe('Updating pivot tables with `updatePivot`', () => {
      let admin1_id: any;
      let admin2_id: any;

      beforeAll(async () => {
        const admin1 = new Admin({username: 'updatetest', password: 'test'});
        const admin2 = new Admin({username: 'updatetest2', password: 'test'});
        await Promise.all([admin1.save(), admin2.save()]);
        admin1_id = admin1.id;
        admin2_id = admin2.id;
        await new Site({id: 1}).related('admins').attach([admin1, admin2]);
      });

      afterAll(async () => {
        await new Site({id: 1}).admins().detach();
      });

      it('updates all rows inside the pivot table belonging to the current model', async () => {
        const site1 = new Site({id: 1});
        const relation = await site1.admins().updatePivot({item: 'allupdated'});
        const col = await relation.withPivot(['item']).fetch();
        equal(col.get(admin1_id).pivot.get('item'), 'allupdated');
        equal(col.get(admin2_id).pivot.get('item'), 'allupdated');
      });

      it('updates all rows, which match the passed in query-criteria', async () => {
        const site1 = new Site({id: 1});
        const relation = await site1.admins().updatePivot(
          {item: 'anotherupdate'},
          {query: {whereIn: ['admin_id', [admin1_id]]}}
        );
        const col = await relation.withPivot(['item']).fetch();
        equal(col.get(admin1_id).pivot.get('item'), 'anotherupdate');
        equal(col.get(admin2_id).pivot.get('item'), 'allupdated');
      });

      it('throws an error if no columns are updated and `require: true` is passed as option', async () => {
        try {
          await new Site({id: 99999}).admins().updatePivot({item: 'testvalue'}, {require: true});
          throw new Error('this should not happen');
        } catch (err) {
          equal(err instanceof Error, true);
        }
      });
    });

    // -------------------------------------------------------------------------
    describe('Custom foreignKey & otherKey', () => {
      it('works with many-to-many (user -> roles)', async () => {
        const result = await new User({uid: 1}).roles().fetch();
        checkTest('works with many-to-many (user -> roles)')(result);
      });

      it('works with eager loaded many-to-many (user -> roles)', async () => {
        const result = await new User({uid: 1}).fetch({withRelated: ['roles']});
        checkTest('works with eager loaded many-to-many (user -> roles)')(result);
      });
    });

    // -------------------------------------------------------------------------
    describe('Polymorphic associations', () => {
      it('handles morphOne (photo)', async () => {
        const result = await new Author({id: 1}).photo().fetch();
        checkTest('handles morphOne (photo)')(result);
      });

      it('handles morphMany (photo)', async () => {
        const result = await new Site({id: 1}).photos().fetch();
        checkTest('handles morphMany (photo)')(result);
      });

      it('handles morphTo with custom morphValue (imageable "authors")', async () => {
        const result = await new Photo({imageable_id: 1, imageable_type: 'profile_pic'})
          .imageable()
          .fetch();
        checkTest('handles morphTo with custom morphValue (imageable "authors")')(result);
      });

      it('handles morphTo (imageble "authors", PhotoParsed)', async () => {
        const result = await new PhotoParsed({
          imageable_id_parsed: 1,
          imageable_type_parsed: 'profile_pic'
        })
          .imageableParsed()
          .fetch();
        checkTest('handles morphTo (imageble "authors", PhotoParsed)')(result);
      });

      it('has no side effects for morphTo (imageable "authors", PhotoParsed)', async () => {
        const photoParsed = new PhotoParsed({
          imageable_id_parsed: 1,
          imageable_type_parsed: 'profile_pic'
        });
        await photoParsed.imageableParsed().fetch();
        const result = await photoParsed.fetch();
        checkTest('has no side effects for morphTo (imageable "authors", PhotoParsed)')(result);
      });

      it('handles morphTo (imageable "sites")', async () => {
        const result = await new Photo({imageable_id: 1, imageable_type: 'sites'}).imageable().fetch();
        checkTest('handles morphTo (imageable "sites")')(result);
      });

      it('eager loads morphMany (sites -> photos)', async () => {
        const result = await new Site().fetchAll({withRelated: ['photos']});
        checkTest('eager loads morphMany (sites -> photos)')(result);
      });

      it('eager loads morphTo (photos -> imageable)', async () => {
        const result = await Photo.fetchAll({withRelated: ['imageable']});
        checkTest('eager loads morphTo (photos -> imageable)')(result);
      });

      it('eager loads beyond the morphTo, where possible', async () => {
        const result = await Photo.fetchAll({withRelated: ['imageable.authors']});
        checkTest('eager loads beyond the morphTo, where possible')(result);
      });

      it('handles morphOne with custom columnNames (thumbnail)', async () => {
        const result = await new Author({id: 1}).thumbnail().fetch();
        checkTest('handles morphOne with custom columnNames (thumbnail)')(result);
      });

      it('handles morphMany with custom columnNames (thumbnail)', async () => {
        const result = await new Site({id: 1}).thumbnails().fetch();
        checkTest('handles morphMany with custom columnNames (thumbnail)')(result);
      });

      it('handles morphTo with custom columnNames (imageable "authors")', async () => {
        const result = await new Thumbnail({ImageableId: 1, ImageableType: 'authors'}).imageable().fetch();
        checkTest('handles morphTo with custom columnNames (imageable "authors")')(result);
      });

      it('handles morphTo with custom columnNames (imageable "sites")', async () => {
        const result = await new Thumbnail({ImageableId: 1, ImageableType: 'sites'}).imageable().fetch();
        checkTest('handles morphTo with custom columnNames (imageable "sites")')(result);
      });

      it('eager loads morphMany with custom columnNames (sites -> thumbnails)', async () => {
        const result = await Site.fetchAll({withRelated: ['thumbnails']});
        checkTest('eager loads morphMany with custom columnNames (sites -> thumbnails)')(result);
      });

      it('eager loads morphTo with custom columnNames (thumbnails -> imageable)', async () => {
        const result = await Thumbnail.fetchAll({withRelated: ['imageable']});
        checkTest('eager loads morphTo with custom columnNames (thumbnails -> imageable)')(result);
      });

      it('eager loads beyond the morphTo with custom columnNames, where possible', async () => {
        const result = await Thumbnail.fetchAll({withRelated: ['imageable.authors']});
        checkTest('eager loads beyond the morphTo with custom columnNames, where possible')(result);
      });

      it('throws an error if the type attribute is not defined', async () => {
        await bookshelf.knex('photos').insert({caption: 'a caption', imageable_id: 1});
        try {
          const photos = await Photo.fetchAll({withRelated: ['imageable']});
          // If no error thrown, photos should be undefined (original assertion)
          expect(photos).toBeUndefined();
        } catch (error: any) {
          const expectedMessage =
            "The target polymorphic model could not be determined because it's missing the " +
            'type attribute';
          expect(error.message).toEqual(expectedMessage);
        } finally {
          await Photo.where('imageable_type', null).destroy({require: false});
        }
      });

      it('throws an error if the type attribute is not one of the expected types', async () => {
        const badType = 'not the one';
        await bookshelf.knex('photos').insert({
          caption: 'a caption',
          imageable_id: 1,
          imageable_type: badType
        });
        try {
          const photos = await Photo.fetchAll({withRelated: ['imageable']});
          // If no error thrown, photos should be undefined (original assertion)
          expect(photos).toBeUndefined();
        } catch (error: any) {
          const expectedMessage =
            'The target polymorphic type "' + badType + '" is not one of the defined target types';
          expect(error.message).toEqual(expectedMessage);
        } finally {
          await Photo.where('imageable_type', badType).destroy({require: false});
        }
      });
    });

    // -------------------------------------------------------------------------
    describe('`through` relations', () => {
      it('handles hasMany `through`', async () => {
        const result = await new Blog({id: 1}).comments().fetch();
        checkTest('handles hasMany `through`')(result);
      });

      it('eager loads hasMany `through`', async () => {
        const result = await Blog.where({site_id: 1}).fetchAll({withRelated: 'comments'});
        checkTest('eager loads hasMany `through`')(result);
      });

      it('eager loads hasMany `through` using where / fetchAll', async () => {
        const result = await Blog.where('site_id', 1).fetchAll({withRelated: 'comments'});
        checkTest('eager loads hasMany `through` using where / fetchAll')(result);
      });

      it('handles hasOne `through`', async () => {
        const result = await new Site({id: 1}).info().fetch();
        checkTest('handles hasOne `through`')(result);
      });

      it('eager loads hasOne `through`', async () => {
        const result = await Site.where('id', '<', 3).fetchAll({withRelated: 'info'});
        checkTest('eager loads hasOne `through`')(result);
      });

      it('eager loads belongsToMany `through`', async () => {
        const result = await Author.fetchAll({
          withRelated: {
            blogs(qb: any) {
              return qb.orderBy('blogs.id', 'ASC');
            }
          }
        });
        checkTest('eager loads belongsToMany `through`', {sort: false})(result);
      });

      it('eager loads belongsTo `through`', async () => {
        const result = await new Comment().fetchAll({withRelated: 'blog'});
        checkTest('eager loads belongsTo `through`')(result);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #63 - hasOne relations', () => {
    it('should return Customer (id=1) with settings', async () => {
      const model = await new Customer({id: 1}).fetch({withRelated: 'settings'});
      const cust = model.toJSON();
      expect(cust).toEqual({
        id: 1,
        name: 'Customer1',
        settings: {
          id: 1,
          Customer_id: 1,
          data: 'Europe/Paris'
        }
      });
    });

    it('should return Customer (id=4) with settings', async () => {
      const model = await new Customer({id: 4}).fetch({withRelated: 'settings'});
      const cust = model.toJSON();
      expect(cust).toEqual({
        id: 4,
        name: 'Customer4',
        settings: {
          id: 2,
          Customer_id: 4,
          data: 'UTC'
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #65, custom idAttribute with eager loaded belongsTo', () => {
    it('#65 - should eager load correctly for models', async () => {
      const result = await new Hostname({hostname: 'google.com'}).fetch({withRelated: 'instance'});
      checkTest('#65 - should eager load correctly for models')(result);
    });

    it('#65 - should eager load correctly for collections', async () => {
      const result = await new bookshelf.Collection([], {model: Hostname}).fetch({
        withRelated: 'instance'
      });
      checkTest('#65 - should eager load correctly for collections')(result);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #70 - fetching specific columns, and relations', () => {
    it('doesnt pass the columns along to sub-queries', async () => {
      const author = await new Author({id: 2}).fetch({
        withRelated: 'posts',
        columns: ['id', 'last_name']
      });
      expect(author.attributes.first_name).toBeUndefined();
      expect(author.related('posts').length).toEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #77 - Using collection.create() on relations', () => {
    it('maintains the correct parent model references when using related()', async () => {
      const site = await new Site().fetch({withRelated: 'authors'});
      const model = await site
        .related('authors')
        .create({first_name: 'Dummy', last_name: 'Account'});
      expect(model.attributes).toEqual({
        first_name: 'Dummy',
        last_name: 'Account',
        site_id: site.id,
        id: model.id
      });
      expect(site.related('authors')).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #97, #377 - Eager loading on parsed models', () => {
    it('correctly pairs eager-loaded models before parse()', async () => {
      const [parsedPosts, blog] = await Promise.all([
        new Blog({id: 1}).related('parsedPosts').fetch(),
        new Blog({id: 1}).fetch({withRelated: 'parsedPosts'})
      ]);
      expect(blog.related('parsedPosts').length).toEqual(parsedPosts.length);
    });

    it('parses eager-loaded models after pairing', async () => {
      const blog = await new Blog({id: 1}).fetch({withRelated: 'parsedPosts'});
      const attrs = blog.related('parsedPosts').at(0).attributes;
      Object.keys(attrs).forEach((key) => {
        expect(/_parsed$/.test(key)).toBe(true);
      });
    });

    it('parses eager-loaded models previous attributes after pairing', async () => {
      const blog = await new Blog({id: 1}).fetch({withRelated: 'parsedPosts'});
      const previous = blog.related('parsedPosts').at(0).previousAttributes();
      expect(previous).not.toEqual({});
      Object.keys(previous).forEach((key) => {
        expect(/_parsed$/.test(key)).toBe(true);
      });
    });

    it('parses eager-loaded morphTo relations (model)', async () => {
      const photos = await Photo.fetchAll({
        withRelated: 'imageableParsed.meta',
        log: true
      });
      photos.forEach((photo: any) => {
        const attrs = photo.related('imageableParsed').attributes;
        Object.keys(attrs).forEach((key) => {
          expect(/_parsed$/.test(key)).toBe(true);
        });
      });
      checkTest('parses eager-loaded morphTo relations (model)')(photos);
    });

    it('eager fetches belongsTo correctly on a dual parse', async () => {
      const model = await UserTokenParsed.forge({token: 'testing'}).fetch({withRelated: ['user']});
      expect(model.related('user').get('id')).toEqual(10);
    });

    it('eager fetches belongsTo correctly on a dual parse', async () => {
      let model = await UserTokenParsed.forge({token: 'testing'}).fetch();
      model = await model.load('user');
      expect(model.related('user').get('id')).toEqual(10);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #212 - Skipping unnecessary queries', () => {
    let siteSyncCount = 0;

    beforeAll(() => {
      (Photo.prototype as any).sync = function () {
        return {
          first: () =>
            BPromise.resolve([
              {
                id: 1,
                imageable_type: 'sites',
                imageable_id: null
              }
            ])
        };
      };

      (Author.prototype as any).sync = function () {
        return {
          select: () =>
            BPromise.resolve([
              {
                id: 1,
                dummy: 'author'
              }
            ]),
          first: () =>
            BPromise.resolve([
              {
                id: 1,
                first_name: 'Johannes',
                last_name: 'Lumpe',
                site_id: null
              }
            ])
        };
      };

      (Site.prototype as any).sync = function () {
        siteSyncCount++;
        return {
          select: () =>
            BPromise.resolve([
              {
                id: 1,
                dummy: 'content'
              }
            ]),
          first: () =>
            BPromise.resolve([
              {
                id: 1,
                dummy: 'content'
              }
            ])
        };
      };
    });

    afterAll(() => {
      delete (Photo.prototype as any).sync;
      delete (Author.prototype as any).sync;
      delete (Site.prototype as any).sync;
    });

    beforeEach(() => {
      siteSyncCount = 0;
    });

    // src/ bug: src/model.ts:737 calls `.bind(this)` on the result of `sync.first()`.
    // When `sync` is replaced with a plain-Promise stub, `.bind` is undefined (Bluebird-only API).
    // The original mocha suite used Bluebird globally so `.bind()` worked on all promises.
    // Suspect module: src/model.ts (_doFetch / fetch pipeline).
    it('should not run a query for eagerly loaded `belongsTo` relations if the foreign key is null', async () => {
      const a = new Author({id: 1});
      await a.fetch({withRelated: 'site'});
      equal(siteSyncCount, 0);
    });

    it('should not run a query for eagerly loaded `morphTo` relations if the foreign key is null', async () => {
      const p = new Photo({id: 1});
      await p.fetch({withRelated: 'imageable'});
      equal(siteSyncCount, 0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #353 - wrong key set on a belongsTo relation', () => {
    it('should not set the foreign key on the target model when saving', async () => {
      const model = await new Blog({id: 4}).fetch();
      const site = await model.site().fetch();
      await site.save();
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #578 - lifecycle events on pivot model for belongsToMany().through()', () => {
    function initializeModelsForLifecycleEvent(lifecycleEvent: string) {
      JoinModel = JoinModel.extend({
        initialize: (function (v: string) {
          return function (this: any) {
            this.on(v, function () {
              throw new Error('`' + v + '` triggered on JoinModel()');
            });
          };
        })(lifecycleEvent)
      });

      LeftModel = LeftModel.extend({
        rights() {
          return this.belongsToMany(RightModel).through(JoinModel);
        }
      });

      RightModel = RightModel.extend({
        lefts() {
          return this.belongsToMany(LeftModel).through(JoinModel).withPivot(['parsedName']);
        }
      });
    }

    async function joinModelLifecycleRoutine(lifecycleEvent: string) {
      initializeModelsForLifecycleEvent(lifecycleEvent);
      const left = await new LeftModel().save();
      // creating, saving, created, saved
      const right = await left.rights().create();
      // fetching, fetched
      await right.lefts().fetch();
      // updating, updated
      await left.rights().updatePivot({});
      const left2 = await new LeftModel().save();
      // attaching (creating new JoinModel row)
      await right.lefts().attach(left2);
      // destroying, destroyed
      await left.rights().detach(right);
    }

    [
      'creating',
      'created',
      'saving',
      'saved',
      'fetching',
      'fetched',
      'updating',
      'updated',
      'destroying',
      'destroyed'
    ].forEach((v) => {
      it('should trigger pivot model lifecycle event: ' + v, async () => {
        try {
          await joinModelLifecycleRoutine(v);
        } catch (err: any) {
          equal(err instanceof Error, true);
          equal(err.message, '`' + v + '` triggered on JoinModel()');
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('Issue #1388 - Custom foreignKeyTarget & otherKeyTarget', () => {
    it('works with hasOne relation (locale -> translation)', async () => {
      const result = await new Locale({isoCode: 'pt'}).translation().fetch();
      checkTest('works with hasOne relation (locale -> translation)')(result);
    });

    it('works with eager loaded hasOne relation (locale -> translation)', async () => {
      const result = await new Locale({isoCode: 'pt'}).fetch({withRelated: 'translation'});
      checkTest('works with eager loaded hasOne relation (locale -> translation)')(result);
    });

    it('works with hasOne `through` relation (customer -> locale)', async () => {
      const result = await new Customer({name: 'Customer2'}).locale().fetch();
      checkTest('works with hasOne `through` relation (customer -> locale)')(result);
    });

    it('works with eager loaded hasOne `through` relation (customer -> locale)', async () => {
      const result = await new Customer({name: 'Customer2'}).fetch({withRelated: 'locale'});
      checkTest('works with eager loaded hasOne `through` relation (customer -> locale)')(result);
    });

    it('works with hasMany relation (locale -> translations)', async () => {
      const result = await new Locale({isoCode: 'en'}).translations().fetch();
      checkTest('works with hasMany relation (locale -> translations)')(result);
    });

    it('works with eager loaded hasMany relation (locale -> translations)', async () => {
      const result = await new Locale({isoCode: 'en'}).fetch({withRelated: 'translations'});
      checkTest('works with eager loaded hasMany relation (locale -> translations)')(result);
    });

    it('works with hasMany `through` relation (customer -> locales)', async () => {
      const result = await new Customer({name: 'Customer1'}).locales().fetch();
      checkTest('works with hasMany `through` relation (customer -> locales)')(result);
    });

    it('works with eager loaded hasMany `through` relation (customer -> locales)', async () => {
      const result = await new Customer({name: 'Customer1'}).fetch({withRelated: 'locales'});
      checkTest('works with eager loaded hasMany `through` relation (customer -> locales)')(result);
    });

    it('works with belongsTo relation (translation -> locale)', async () => {
      const result = await new Translation({code: 'pt'}).locale().fetch();
      checkTest('works with belongsTo relation (translation -> locale)')(result);
    });

    it('works with eager loaded belongsTo relation (translation -> locale)', async () => {
      const result = await new Translation({code: 'pt'}).fetch({withRelated: 'locale'});
      checkTest('works with eager loaded belongsTo relation (translation -> locale)')(result);
    });

    it('works with belongsTo `through` relation (locale -> customer)', async () => {
      const result = await new Locale({isoCode: 'pt'}).customer().fetch();
      checkTest('works with belongsTo `through` relation (locale -> customer)')(result);
    });

    it('works with eager loaded belongsTo `through` relation (locale -> customer)', async () => {
      const result = await new Locale({isoCode: 'pt'}).fetch({withRelated: 'customer'});
      checkTest('works with eager loaded belongsTo `through` relation (locale -> customer)')(result);
    });

    it('works with belongsToMany relation (locale -> customers)', async () => {
      const result = await new Locale({isoCode: 'en'}).customers().fetch();
      checkTest('works with belongsToMany relation (locale -> customers)')(result);
    });

    it('works with eager loaded belongsToMany relation (locale -> customers)', async () => {
      const result = await new Locale({isoCode: 'en'}).fetch({withRelated: 'customers'});
      checkTest('works with eager loaded belongsToMany relation (locale -> customers)')(result);
    });

    it('works with belongsToMany `through` relation (locale -> customers)', async () => {
      const result = await new Locale({isoCode: 'en'}).customersThrough().fetch();
      checkTest('works with belongsToMany `through` relation (locale -> customers)')(result);
    });

    it('works with eager belongsToMany `through` relation (locale -> customers)', async () => {
      const result = await new Locale({isoCode: 'en'}).fetch({withRelated: 'customersThrough'});
      checkTest('works with eager belongsToMany `through` relation (locale -> customers)')(result);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Binary ID relations', () => {
    it('should group relations properly with binary ID columns', async () => {
      const critic1Id = Buffer.from('93', 'hex');
      const critic2Id = Buffer.from('90', 'hex');
      const critic1 = new Critic({id: critic1Id, name: '1'});
      const critic2 = new Critic({id: critic2Id, name: '2'});
      const comment1 = new CriticComment({critic_id: critic1Id, comment: 'c1-1'});
      const comment2 = new CriticComment({critic_id: critic1Id, comment: 'c1-2'});
      const comment3 = new CriticComment({critic_id: critic2Id, comment: 'c2-1'});

      await Promise.all([
        critic1.save(null, {method: 'insert'}),
        critic2.save(null, {method: 'insert'}),
        comment1.save(),
        comment2.save(),
        comment3.save()
      ]);

      const critics = (
        await Critic.where('name', 'IN', ['1', '2'])
          .orderBy('name', 'ASC')
          .fetchAll({withRelated: 'comments'})
      ).serialize();

      expect(critics).toHaveLength(2);
      expect(critics[0].comments).toHaveLength(2);
      expect(critics[1].comments).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('PR #2059 - opts.query on fetching with morphTo', () => {
    it('should correctly set query on fetching with morphTo', async () => {
      const {Photo: EventPhoto} = generateEventModels({
        fetching: (table: string, _model: any, _columns: any, options: any) => {
          equal(options.query._single.table, table);
        }
      });
      await EventPhoto.forge().fetchAll({withRelated: 'imageable'});
    });
  });
});
