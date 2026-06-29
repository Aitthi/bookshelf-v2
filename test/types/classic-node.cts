// Classic `node` (node10) moduleResolution fixture.
//
// Classic resolution ignores the package `exports` map entirely, so plugin
// subpaths resolve only via the `typesVersions` shim in package.json. This
// fixture guards that shim: it imports each bundled plugin by subpath under
// `moduleResolution: "node"` and would fail with TS2307 if the shim regressed.
// (The root import resolves via the package's `types` fallback field.)
import Bookshelf = require('@assetsart/bookshelf');
import jsonColumns = require('@assetsart/bookshelf/plugins/json-columns');
import virtuals = require('@assetsart/bookshelf/plugins/virtuals');
import caseConverter = require('@assetsart/bookshelf/plugins/case-converter');

declare const db: Bookshelf;
db.plugin(jsonColumns);
db.plugin(virtuals);
db.plugin(caseConverter);
