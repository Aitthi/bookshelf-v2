import Bookshelf = require('@assetsart/bookshelf');
import virtuals = require('@assetsart/bookshelf/plugins/virtuals');
import caseConverter = require('@assetsart/bookshelf/plugins/case-converter');

declare const db: Bookshelf;
db.plugin(virtuals);
db.plugin(caseConverter);
