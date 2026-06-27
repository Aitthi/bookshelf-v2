// TypeScript port of migration.js.
// The original JS file is kept for the legacy Mocha suite.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBookshelf = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableBuilder = any;

const drops = [
  'sites',
  'sitesmeta',
  'admins',
  'admins_sites',
  'authors',
  'authors_posts',
  'critics',
  'critics_comments',
  'blogs',
  'posts',
  'tags',
  'posts_tags',
  'comments',
  'users',
  'roles',
  'photos',
  'users_roles',
  'info',
  'Customer',
  'Settings',
  'hostnames',
  'instances',
  'uuid_test',
  'parsed_users',
  'tokens',
  'thumbnails',
  'lefts',
  'rights',
  'lefts_rights',
  'organization',
  'locales',
  'translations',
  'backups',
  'backup_types',
  'members'
];

export default function migrate(Bookshelf: AnyBookshelf): Promise<void> {
  const knex = Bookshelf.knex;
  const isPostgreSQL: boolean = knex.client.dialect === 'postgresql';

  return Promise.all(drops.map((tableName) => knex.schema.dropTableIfExists(tableName)))
    .then(() => {
      if (isPostgreSQL) return Bookshelf.knex.raw('DROP SCHEMA IF EXISTS "test" CASCADE');
    })
    .then(() => {
      if (isPostgreSQL) return knex.schema.createSchema('test');
    })
    .then(() => {
      if (!isPostgreSQL) return;
      return knex.schema.withSchema('test').createTable('authors', (table: TableBuilder) => {
        table.increments('id');
        table.string('name');
      });
    })
    .then(() => {
      return knex.schema
        .createTable('sites', (table: TableBuilder) => {
          table.increments('id');
          table.string('name');
        })
        .createTable('sitesmeta', (table: TableBuilder) => {
          table.increments('id');
          table.integer('site_id').notNullable();
          table.text('description');
        })
        .createTable('info', (table: TableBuilder) => {
          table.increments('id');
          table.integer('meta_id').notNullable();
          table.text('other_description');
        })
        .createTable('admins', (table: TableBuilder) => {
          table.increments('id');
          table.string('username');
          table.string('password');
          table.timestamps();
        })
        .createTable('admins_sites', (table: TableBuilder) => {
          table.increments('id');
          table.integer('admin_id').notNullable();
          table.integer('site_id').notNullable();
          table.string('item').defaultTo('test');
        })
        .createTable('blogs', (table: TableBuilder) => {
          table.increments('id');
          table.integer('site_id');
          table.string('name');
        })
        .createTable('authors', (table: TableBuilder) => {
          table.increments('id');
          table.integer('site_id').notNullable();
          table.string('first_name');
          table.string('last_name');
        })
        .createTable('critics', (table: TableBuilder) => {
          table.binary('id', 16).primary();
          table.string('name');
        })
        .createTable('critics_comments', (table: TableBuilder) => {
          table.increments();
          table.binary('critic_id', 16).notNullable();
          table.string('comment');
        })
        .createTable('posts', (table: TableBuilder) => {
          table.increments('id');
          table.integer('owner_id').notNullable();
          table.integer('blog_id').notNullable();
          table.string('name');
          table.text('content');
        })
        .createTable('authors_posts', (table: TableBuilder) => {
          table.increments('id');
          table.integer('author_id').notNullable();
          table.integer('post_id').notNullable();
        })
        .createTable('tags', (table: TableBuilder) => {
          table.increments('id');
          table.string('name');
        })
        .createTable('posts_tags', (table: TableBuilder) => {
          table.increments('id');
          table.integer('post_id').notNullable();
          table.integer('tag_id').notNullable();
        })
        .createTable('comments', (table: TableBuilder) => {
          table.increments('id');
          table.integer('post_id').notNullable();
          table.string('name');
          table.string('email');
          table.text('comment');
        })
        .createTable('users', (table: TableBuilder) => {
          table.increments('uid');
          table.string('username');
        })
        .createTable('roles', (table: TableBuilder) => {
          table.increments('rid');
          table.string('name');
        })
        .createTable('users_roles', (table: TableBuilder) => {
          table.integer('rid').notNullable();
          table.integer('uid').notNullable();
        })
        .createTable('photos', (table: TableBuilder) => {
          table.increments('id');
          table.string('url');
          table.string('caption');
          table.integer('imageable_id').notNullable();
          table.string('imageable_type');
        })
        .createTable('thumbnails', (table: TableBuilder) => {
          table.increments('id');
          table.string('url');
          table.string('caption');
          table.integer('ImageableId').notNullable();
          table.string('ImageableType');
        })
        .createTable('Customer', (table: TableBuilder) => {
          table.increments('id');
          table.string('name');
        })
        .createTable('Settings', (table: TableBuilder) => {
          table.increments('id');
          table.integer('Customer_id').notNullable();
          table.string('data', 64);
        })
        .createTable('hostnames', (table: TableBuilder) => {
          table.string('hostname');
          table.integer('instance_id').notNullable();
          table.enu('route', ['annotate', 'submit']);
        })
        .createTable('instances', (table: TableBuilder) => {
          table.bigIncrements('id');
          table.string('name');
        })
        .createTable('uuid_test', (table: TableBuilder) => {
          table.uuid('uuid');
          table.string('name');
        })
        .createTable('parsed_users', (table: TableBuilder) => {
          table.increments();
          table.string('name');
        })
        .createTable('tokens', (table: TableBuilder) => {
          table.increments();
          table.string('parsed_user_id');
          table.string('token');
        })
        .createTable('lefts', (table: TableBuilder) => {
          table.increments();
        })
        .createTable('rights', (table: TableBuilder) => {
          table.increments();
        })
        .createTable('lefts_rights', (table: TableBuilder) => {
          table.increments();
          table.string('parsed_name');
          table.integer('left_id').notNullable();
          table.integer('right_id').notNullable();
        })
        .createTable('organization', (table: TableBuilder) => {
          table.increments('organization_id');
          table.string('organization_name').notNullable();
          table.boolean('organization_is_active').defaultTo(false);
        })
        .createTable('members', (table: TableBuilder) => {
          table.integer('id').notNullable();
          table.integer('organization_id').notNullable();
          table.string('name');
        })
        .createTable('locales', (table: TableBuilder) => {
          table.string('isoCode');
        })
        .createTable('translations', (table: TableBuilder) => {
          table.string('code');
          table.string('customer');
        })
        .createTable('backup_types', (table: TableBuilder) => {
          table.increments();
          table.string('name');
        })
        .createTable('backups', (table: TableBuilder) => {
          table.increments();
          table.string('name');
          table.integer('backup_type_id');
        });
    });
}
