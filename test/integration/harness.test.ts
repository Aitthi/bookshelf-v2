/**
 * Smoke test for the TypeScript Vitest integration harness.
 *
 * Verifies that:
 *   1. initialize() completes without error (migrations + seed inserts)
 *   2. Core CRUD round-trips work against the in-memory SQLite DB
 *   3. Basic relations (hasMany, belongsTo, belongsToMany) resolve correctly
 *   4. The Bookshelf instance from src/ is the one being exercised
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {bookshelf, Models, initialize} from './helpers/harness';

const {Site, Author, Blog, Post, Tag, User, Role, Comment} = Models;

beforeAll(async () => {
  await initialize();
});

afterAll(async () => {
  await bookshelf.knex.destroy();
});

// ---------------------------------------------------------------------------
// 1. Sanity – bookshelf instance
// ---------------------------------------------------------------------------

describe('bookshelf instance', () => {
  it('exposes a knex instance', () => {
    expect(bookshelf.knex).toBeDefined();
  });

  it('exposes Model and Collection constructors', () => {
    expect(typeof bookshelf.Model).toBe('function');
    expect(typeof bookshelf.Collection).toBe('function');
  });

  it('exposes the VERSION string', () => {
    expect(typeof bookshelf.VERSION).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 2. Basic fetch
// ---------------------------------------------------------------------------

describe('Site model', () => {
  it('fetches all sites', async () => {
    const sites = await Site.fetchAll();
    expect(sites.length).toBeGreaterThanOrEqual(3);
  });

  it('fetches a single site by id', async () => {
    const site = await Site.forge({id: 1}).fetch();
    expect(site).not.toBeNull();
    expect(site!.get('name')).toBe('knexjs.org');
  });
});

// ---------------------------------------------------------------------------
// 3. Save / destroy
// ---------------------------------------------------------------------------

describe('Site model — save and destroy', () => {
  it('saves a new site and destroys it', async () => {
    const site = await Site.forge({name: 'test-harness-site'}).save();
    // Capture id before destroy() — destroy() calls clear() which unsets attributes.
    const savedId = site.id as number;
    expect(savedId).toBeTruthy();

    const fetched = await Site.forge({id: savedId}).fetch();
    expect(fetched!.get('name')).toBe('test-harness-site');

    await site.destroy();
    const gone = await Site.forge({id: savedId}).fetch({require: false});
    expect(gone).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. hasMany relation
// ---------------------------------------------------------------------------

describe('Site#authors (hasMany)', () => {
  it('loads authors for site 1', async () => {
    const site = await Site.forge({id: 1}).fetch({withRelated: ['authors']});
    const authors = site!.related('authors');
    expect(authors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 5. belongsTo relation
// ---------------------------------------------------------------------------

describe('Author#site (belongsTo)', () => {
  it('loads the related site', async () => {
    const author = await Author.forge({id: 1}).fetch({withRelated: ['site']});
    const site = author!.related('site');
    expect(site.get('name')).toBe('knexjs.org');
  });
});

// ---------------------------------------------------------------------------
// 6. belongsToMany relation
// ---------------------------------------------------------------------------

describe('Post#tags (belongsToMany)', () => {
  it('loads tags for post 1', async () => {
    const post = await Post.forge({id: 1}).fetch({withRelated: ['tags']});
    const tags = post!.related('tags');
    expect(tags.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// 7. hasMany through
// ---------------------------------------------------------------------------

describe('Blog#comments (hasMany through Post)', () => {
  it('loads comments through posts for blog 1', async () => {
    const blog = await Blog.forge({id: 1}).fetch({withRelated: ['comments']});
    const comments = blog!.related('comments');
    expect(comments.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 8. belongsToMany with non-default keys (User ↔ Role)
// ---------------------------------------------------------------------------

describe('User#roles (belongsToMany with custom keys)', () => {
  it('loads roles for user 1', async () => {
    const user = await User.forge({uid: 1}).fetch({withRelated: ['roles']});
    const roles = user!.related('roles');
    expect(roles.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 9. Collection fetchAll with where
// ---------------------------------------------------------------------------

describe('Collection query', () => {
  it('filters authors by site_id', async () => {
    const authors = await Author.where({site_id: 1}).fetchAll();
    expect(authors.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 10. Count
// ---------------------------------------------------------------------------

describe('Model.count', () => {
  it('counts all sites', async () => {
    const count = await Site.count();
    expect(Number(count)).toBeGreaterThanOrEqual(3);
  });
});
