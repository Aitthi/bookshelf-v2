import Bookshelf from '@assetsart/bookshelf';
import type { Model, Collection, BPromise } from '@assetsart/bookshelf';
import { errors } from '@assetsart/bookshelf';

declare const db: ReturnType<typeof Bookshelf>;

class User extends db.Model<User> {
  override get tableName() {
    return 'users';
  }
}

const _isErr: typeof errors.NotFoundError = errors.NotFoundError;
type _M = Model<User>;
type _C = Collection<User>;
type _P = BPromise<User>;
const _p: _P = new User().fetch();
void _isErr;
void _p;
