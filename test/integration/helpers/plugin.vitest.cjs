// Trackable plugin function for Vitest integration tests.
// helpers/plugin.js uses `sinon.spy()` which requires a global `sinon`
// that is not available in Vitest context — this is the drop-in replacement.
// Both the test and Bookshelf's createRequire share the same Node.js CJS module cache,
// so the reference returned here IS the same object that Bookshelf calls.
'use strict';

const calls = [];

function pluginSpy(bookshelf, options) {
  calls.push([bookshelf, options]);
}

pluginSpy.calls = calls;
pluginSpy.reset = function () {
  calls.length = 0;
};

module.exports = pluginSpy;
