import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;

interface CategoryEntity {
  id: number;
  name: string;
}

class Category extends db.Model<Category> {
  override get tableName() {
    return 'category';
  }
  override get hasTimestamps() {
    return false;
  }
  override toJSON(): CategoryEntity {
    return db.Model.prototype.toJSON.apply(this, arguments as never) as CategoryEntity;
  }
  childrens() {
    return this.hasMany(Category, 'cat_parent', 'id').query((qb) => {
      qb.orderBy('sort');
    });
  }
  parent() {
    return this.belongsTo(Category, 'cat_parent');
  }
}

async function use() {
  const c = new Category();
  const fetched: Category = await c.where('id', 1).fetch();
  const all: Bookshelf.Collection<Category> = await c.fetchAll();
  const entity: CategoryEntity = fetched.toJSON();
  const name: string = fetched.get<string>('name');
  const kids: Bookshelf.Collection<Category> = c.childrens();
  const dad: Category = c.parent();
  void all;
  void entity;
  void name;
  void kids;
  void dad;
}
void use;
