import type Bookshelf from '../index.js';

declare function jsonColumns(bookshelf: ReturnType<typeof Bookshelf>, options?: unknown): void;
export default jsonColumns;
