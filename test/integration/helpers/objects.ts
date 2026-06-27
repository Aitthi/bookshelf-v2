// TypeScript port of objects.js — all models and collections used in integration tests.
// The original JS file is kept for the legacy Mocha suite.
// Lodash usage replaced with native JS and camelCase from src/internal/lang.

import {camelCase} from '../../../src/internal/lang';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBookshelf = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModel = any;

/** Simple snakeCase: handles camelCase → snake_case. */
function snakeCase(str: string): string {
  return str
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function _parsed(attributes: Record<string, unknown>): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  for (const name of Object.keys(attributes)) {
    parsed[`${name}_parsed`] = attributes[name];
  }
  return parsed;
}

function _format(attributes: Record<string, unknown>): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const name of Object.keys(attributes)) {
    formatted[name.replace('_parsed', '')] = attributes[name];
  }
  return formatted;
}

export default function defineObjects(Bookshelf: AnyBookshelf): {
  Models: Record<string, AnyModel>;
  generateEventModels: (eventHooks: {
    fetching: (table: string, model: AnyModel, columns: unknown, options: unknown) => void;
  }) => {Photo: AnyModel; Site: AnyModel; Author: AnyModel};
} {
  const Info = Bookshelf.Model.extend({
    tableName: 'info'
  });

  const SiteMeta = Bookshelf.Model.extend({
    tableName: 'sitesmeta',
    site() {
      return this.belongsTo(Site);
    },
    info() {
      return this.hasOne(Info);
    }
  });

  const Uuid = Bookshelf.Model.extend({
    idAttribute: 'uuid',
    tableName: 'uuid_test'
  });

  const Site: AnyModel = Bookshelf.Model.extend({
    tableName: 'sites',
    defaults: {name: 'Your Cool Site'},
    authors() {
      return this.hasMany(Author);
    },
    authorsParsed() {
      return this.hasMany(AuthorParsed);
    },
    photos() {
      return this.morphMany(Photo, 'imageable');
    },
    thumbnails() {
      return this.morphMany(Thumbnail, 'imageable', ['ImageableType', 'ImageableId']);
    },
    blogs() {
      return this.hasMany(Blog);
    },
    meta() {
      return this.hasOne(SiteMeta);
    },
    info() {
      return this.hasOne(Info).through(SiteMeta, 'meta_id');
    },
    admins() {
      return this.belongsToMany(Admin).withPivot('item');
    }
  });

  const SiteParsed: AnyModel = Site.extend({
    parse: _parsed,
    format: _format,
    photos() {
      return this.morphMany(PhotoParsed, 'imageable');
    }
  });

  const Admin = Bookshelf.Model.extend({
    tableName: 'admins',
    hasTimestamps: true
  });

  const TestAuthor = Bookshelf.Model.extend({
    tableName: 'authors'
  });

  const Author: AnyModel = Bookshelf.Model.extend({
    tableName: 'authors',
    site() {
      return this.belongsTo(Site);
    },
    photo() {
      return this.morphOne(Photo, 'imageable', 'profile_pic');
    },
    thumbnail() {
      return this.morphOne(Thumbnail, 'imageable', ['ImageableType', 'ImageableId']);
    },
    posts() {
      return this.belongsToMany(Post);
    },
    ownPosts() {
      return this.hasMany(Post, 'owner_id');
    },
    blogs() {
      return this.belongsToMany(Blog).through(Post, 'owner_id');
    }
  });

  const AuthorParsed: AnyModel = Author.extend({
    parse: _parsed,
    format: _format,
    photos() {
      return this.morphMany(PhotoParsed, 'imageable', 'profile_pic');
    }
  });

  const Critic = Bookshelf.Model.extend({
    tableName: 'critics',
    comments() {
      return this.hasMany(CriticComment);
    }
  });

  const CriticComment = Bookshelf.Model.extend({
    tableName: 'critics_comments',
    critic() {
      return this.belongsTo(Critic);
    }
  });

  const Blog: AnyModel = Bookshelf.Model.extend({
    tableName: 'blogs',
    site() {
      return this.belongsTo(Site);
    },
    posts() {
      return this.hasMany(Post);
    },
    parsedPosts() {
      return this.hasMany(PostParsed);
    },
    validate(attrs: Record<string, unknown>) {
      if (!attrs.title) return 'A title is required.';
    },
    comments() {
      return this.hasMany(Comment).through(Post);
    }
  });

  const Post: AnyModel = Bookshelf.Model.extend({
    tableName: 'posts',
    defaults: {name: '', content: ''},
    hasTimestamps: false,
    blog() {
      return this.belongsTo(Blog);
    },
    authors() {
      return this.belongsToMany(Author);
    },
    tags() {
      return this.belongsToMany(Tag);
    },
    comments() {
      return this.hasMany(Comment);
    }
  });

  const PostParsed: AnyModel = Post.extend({
    parse: _parsed
  });

  const Comment = Bookshelf.Model.extend({
    tableName: 'comments',
    defaults: {email: '', comment: ''},
    posts() {
      return this.belongsTo(Post);
    },
    blog() {
      return this.belongsTo(Blog).through(Post);
    }
  });

  const Tag = Bookshelf.Model.extend({
    tableName: 'tags',
    posts() {
      return this.belongsToMany(Post);
    }
  });

  const User = Bookshelf.Model.extend({
    tableName: 'users',
    idAttribute: 'uid',
    roles() {
      return this.belongsToMany(Role, 'users_roles', 'uid', 'rid');
    }
  });

  const Role = Bookshelf.Model.extend({
    tableName: 'roles',
    idAttribute: 'rid',
    users() {
      return this.belongsToMany(User, 'users_roles', 'rid', 'uid');
    }
  });

  const Photo: AnyModel = Bookshelf.Model.extend({
    tableName: 'photos',
    imageable() {
      return this.morphTo('imageable', Site, [Author, 'profile_pic']);
    },
    imageableParsed() {
      return this.morphTo('imageable', [AuthorParsed, 'profile_pic'], SiteParsed);
    }
  });

  const Thumbnail = Bookshelf.Model.extend({
    tableName: 'thumbnails',
    imageable() {
      return this.morphTo('imageable', ['ImageableType', 'ImageableId'], Site, Author);
    }
  });

  const PhotoParsed: AnyModel = Photo.extend({
    parse: _parsed,
    format: _format
  });

  const Settings = Bookshelf.Model.extend({tableName: 'Settings'});

  const Customer = Bookshelf.Model.extend({
    tableName: 'Customer',
    settings() {
      return this.hasOne(Settings);
    },
    locale() {
      return this.hasOne(Locale).through(Translation, 'isoCode', 'customer', 'code', 'name');
    },
    locales() {
      return this.hasMany(Locale).through(Translation, 'isoCode', 'customer', 'code', 'name');
    }
  });

  const Hostname = Bookshelf.Model.extend({
    tableName: 'hostnames',
    idAttribute: 'hostname',
    instance() {
      return this.belongsTo(Instance);
    }
  });

  const Instance = Bookshelf.Model.extend({
    tableName: 'instances',
    hostnames() {
      return this.hasMany(Hostname);
    }
  });

  // Replaces lodash _.transform / _.snakeCase / _.camelCase with native equivalents.
  const ParsedModel = Bookshelf.Model.extend({
    format(attrs: Record<string, unknown>) {
      return Object.keys(attrs).reduce(
        (result: Record<string, unknown>, key) => {
          result[snakeCase(key)] = attrs[key];
          return result;
        },
        {}
      );
    },
    parse(attrs: Record<string, unknown>) {
      return Object.keys(attrs).reduce(
        (result: Record<string, unknown>, key) => {
          result[camelCase(key)] = attrs[key];
          return result;
        },
        {}
      );
    }
  });

  const UserTokenParsed = ParsedModel.extend({
    tableName: 'tokens',
    user() {
      return this.belongsTo(UserParsed);
    }
  });

  const UserParsed = ParsedModel.extend({
    tableName: 'parsed_users'
  });

  const LeftModel = Bookshelf.Model.extend({
    tableName: 'lefts'
  });

  const RightModel = Bookshelf.Model.extend({
    tableName: 'rights'
  });

  // Replaces lodash _.reduce with native Object.keys().reduce().
  const JoinModel = Bookshelf.Model.extend({
    tableName: 'lefts_rights',
    defaults: {parsedName: ''},
    format(attrs: Record<string, unknown>) {
      return Object.keys(attrs).reduce(
        (memo: Record<string, unknown>, key) => {
          memo[snakeCase(key)] = attrs[key];
          return memo;
        },
        {}
      );
    },
    parse(attrs: Record<string, unknown>) {
      return Object.keys(attrs).reduce(
        (memo: Record<string, unknown>, key) => {
          memo[camelCase(key)] = attrs[key];
          return memo;
        },
        {}
      );
    },
    lefts() {
      return this.belongsTo(LeftModel);
    },
    rights() {
      return this.belongsTo(RightModel);
    }
  });

  const OrgModel = Bookshelf.Model.extend({
    tableName: 'organization',
    idAttribute: 'organization_id',
    format(fields: Record<string, unknown>) {
      const cols: Record<string, unknown> = {};
      for (const f of Object.keys(fields)) {
        cols[`organization_${f}`] = fields[f];
      }
      return cols;
    },
    parse(cols: Record<string, unknown>) {
      const fields: Record<string, unknown> = {};
      for (const c of Object.keys(cols)) {
        fields[c.replace(/^organization_/, '')] = cols[c];
      }
      return fields;
    }
  });

  const Member = Bookshelf.Model.extend({
    tableName: 'members'
  });

  const Translation = Bookshelf.Model.extend({
    tableName: 'translations',
    locale() {
      return this.belongsTo(Locale, 'code', 'isoCode');
    }
  });

  const Locale = Bookshelf.Model.extend({
    tableName: 'locales',
    customer() {
      return this.belongsTo(Customer).through(Translation, 'isoCode', 'customer', 'code', 'name');
    },
    customers() {
      return this.belongsToMany(Customer, 'translations', 'code', 'customer', 'isoCode', 'name');
    },
    customersThrough() {
      return this.belongsToMany(Customer).through(Translation, 'code', 'customer', 'isoCode', 'name');
    },
    translation() {
      return this.hasOne(Translation, 'code', 'isoCode');
    },
    translations() {
      return this.hasMany(Translation, 'code', 'isoCode');
    }
  });

  const BackupType = Bookshelf.Model.extend({
    tableName: 'backup_types'
  });

  const Backup = Bookshelf.Model.extend({
    tableName: 'backups',
    type() {
      return this.belongsTo(BackupType);
    }
  });

  function generateEventModels(eventHooks: {
    fetching: (table: string, model: AnyModel, columns: unknown, options: unknown) => void;
  }): {Photo: AnyModel; Site: AnyModel; Author: AnyModel} {
    const EvPhoto: AnyModel = Bookshelf.Model.extend({
      tableName: 'photos',
      imageable() {
        return this.morphTo('imageable', EvSite, [EvAuthor, 'profile_pic']);
      }
    });

    const EvSite: AnyModel = Bookshelf.Model.extend({
      tableName: 'sites',
      photos() {
        return this.morphMany(EvPhoto, 'imageable');
      },
      initialize() {
        this.constructor.__super__.initialize.apply(this, arguments);
        this.on('fetching', (model: AnyModel, columns: unknown, options: unknown) => {
          eventHooks.fetching('sites', model, columns, options);
        });
      }
    });

    const EvAuthor: AnyModel = Bookshelf.Model.extend({
      tableName: 'authors',
      site() {
        return this.belongsTo(EvSite);
      },
      photo() {
        return this.morphOne(EvPhoto, 'imageable', 'profile_pic');
      },
      initialize() {
        this.constructor.__super__.initialize.apply(this, arguments);
        this.on('fetching', (model: AnyModel, columns: unknown, options: unknown) => {
          eventHooks.fetching('authors', model, columns, options);
        });
      }
    });

    return {Photo: EvPhoto, Site: EvSite, Author: EvAuthor};
  }

  return {
    generateEventModels,
    Models: {
      Site,
      SiteParsed,
      SiteMeta,
      Admin,
      TestAuthor,
      Author,
      AuthorParsed,
      Critic,
      CriticComment,
      Backup,
      BackupType,
      Blog,
      Post,
      PostParsed,
      Comment,
      Tag,
      User,
      UserParsed,
      UserTokenParsed,
      Role,
      Photo,
      PhotoParsed,
      Thumbnail,
      Info,
      Customer,
      Settings,
      Instance,
      Hostname,
      Uuid,
      LeftModel,
      RightModel,
      JoinModel,
      OrgModel,
      Member,
      Locale,
      Translation
    }
  };
}
