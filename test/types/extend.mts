import Bookshelf from '@assetsart/bookshelf';
import type { Model, Collection } from '@assetsart/bookshelf';
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
void _isErr;
