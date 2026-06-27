// TypeScript version of the integration test database config.
// The JS original (config.js) is kept intact for the legacy Mocha suite.

export const sqlite3 = {
  filename: ':memory:'
};

export const mysql = {
  database: 'bookshelf_test',
  user: 'root',
  host: 'localhost',
  port: 3306
};

export const postgres = {
  database: 'bookshelf_test',
  user: 'postgres'
};
