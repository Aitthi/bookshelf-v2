import Bookshelf from './bookshelf';

export default Bookshelf;

// Named re-export of error classes for TypeScript consumers (the errors are also
// attached to the bookshelf instance at runtime, as before).
export * as errors from './errors';
