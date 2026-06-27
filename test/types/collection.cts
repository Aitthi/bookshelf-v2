import Bookshelf = require('@assetsart/bookshelf');

declare const db: Bookshelf;
declare function jsonColumns(bookshelf: Bookshelf): void;

class Tag extends db.Model<Tag> {
  override get tableName() {
    return 'tags';
  }
}

// .plugin(fn) must accept a third-party plugin (bookshelf-json-columns pattern).
db.plugin(jsonColumns);
db.plugin('virtuals');
db.plugin(['case-converter']);

// model registry + transaction.
db.model('Tag', Tag);

async function use() {
  const c = new Tag().fetchAll();
  const col: Bookshelf.Collection<Tag> = await c;
  const first: Tag = col.first();
  const arr: Tag[] = col.toArray();
  const filtered: Tag[] = col.filter((t) => t.tableName === 'tags');
  const names: string[] = col.map<string>((t) => t.tableName);
  const cloned: Bookshelf.Collection<Tag> = col.clone();
  const q = cloned.query((qb) => {
    qb.where('x', 1);
  });
  void first;
  void arr;
  void filtered;
  void names;
  void q;
}
void use;
