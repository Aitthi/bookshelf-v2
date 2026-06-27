import Bookshelf = require('@assetsart/bookshelf');

// Factory returns an instance usable as a type and a value.
declare const db: Bookshelf;

// Self-type generic extend — the core pattern of all 1161 consumer models.
class User extends db.Model<User> {
  override get tableName() {
    return 'users';
  }
}

// Namespace access (GetCmsModel relies on this).
type C = Bookshelf.Collection<User>;
type M = Bookshelf.Model<User>;

const u = new User();
const _t: string = u.tableName;
