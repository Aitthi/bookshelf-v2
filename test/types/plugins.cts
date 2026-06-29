import Bookshelf = require('@assetsart/bookshelf');
import virtuals = require('@assetsart/bookshelf/plugins/virtuals');
import caseConverter = require('@assetsart/bookshelf/plugins/case-converter');
import jsonColumns = require('@assetsart/bookshelf/plugins/json-columns');

declare const db: Bookshelf;
db.plugin(virtuals);
db.plugin(caseConverter);
db.plugin(jsonColumns);
