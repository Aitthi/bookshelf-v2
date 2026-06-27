import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;

class Product extends db.Model<Product> {
  override get tableName() {
    return 'products';
  }
  requireFetch = false;
  category() {
    return this.belongsTo(Category, 'cate_id');
  }
  tags() {
    return this.hasMany(Tag, 'product_id');
  }
}
class Category extends db.Model<Category> {
  override get tableName() {
    return 'category';
  }
  requireFetch = false;
}
class Tag extends db.Model<Tag> {
  override get tableName() {
    return 'tags';
  }
  requireFetch = false;
}

// Replicates GetCmsModel's relation-key extraction (utils.ts lines ~289-305).
type FunctionKeys<B> = { [K in keyof B]: B[K] extends (...args: any[]) => any ? K : never }[keyof B];
type Cleaned<I> = Omit<I, keyof Bookshelf.Model<any> | 'requireFetch'>;

// The user-defined relation methods must survive the Omit; base members must not.
type ProductRelations = FunctionKeys<Cleaned<Product>>;

// Compile-time assertion: relation keys are exactly 'category' | 'tags'.
type Expect<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _assert: Expect<ProductRelations, 'category' | 'tags'> = true;
void _assert;

// Collection<infer M> inferability (utils.ts line ~292).
type RawReturn = ReturnType<Product['tags']>;
type RelatedModel = RawReturn extends Bookshelf.Collection<infer M> ? M : RawReturn;
const _inferAssert: Expect<RelatedModel, Tag> = true;
void _inferAssert;

// vectorize.ts value-usage under the unknown attribute bag (explicit type args).
async function vectorizeUsage() {
  const found = await new Product().where('id', 1).fetch();
  const images = JSON.parse(found.get<string>('images') || '[]');
  const sku: string = found.get<string>('sku');
  const cloned = found.clone().query((qb) => {
    qb.select(['a', 'b']);
  });
  // Lock omit/pick presence (Blocker 3 — keyof Model<any> must include them).
  const picked = found.pick<{ id: number }>('id');
  void images;
  void sku;
  void cloned;
  void picked;
}
void vectorizeUsage;
