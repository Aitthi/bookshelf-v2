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

// Public BPromise type — namespace-qualified (CJS).
type P = Bookshelf.BPromise<User>;
const _p: P = u.fetch();
void _p;

// Attribute bag defaults to `any` (drop-in parity) — these lines compile only
// because the default is `any`, NOT `unknown`. They guard against a regression
// back to the unknown-default bag.
const _num: number = u.get('count'); // get<V = any> → assignable to number
void _num;
declare const _coll: Bookshelf.Collection<User>;
for (const row of _coll.toJSON()) {
  void row.anything; // toJSON<E = any> → E[] of any; property access is allowed
}
const _attr: string = u.attributes.host_name; // Record<string, any>
const _id: number = u.id; // id: any
void _attr;
void _id;

// Write-side params accept named interfaces (no index signature) — guards the
// `Record<string, unknown>` → `any` flip on save/where/set/forge/create.
interface UserRow {
  id: number;
  host_name: string;
}
declare const row: UserRow;
void u.save(row);
void u.save(row, {patch: true});
void u.set(row);
void u.where(row);
void u.where('host_expire', new Date()); // value accepts Date/null, not just string|number|boolean
void _coll.add([row]);
void _coll.create(row);
