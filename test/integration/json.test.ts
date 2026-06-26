/**
 * Vitest port of test/integration/json.js
 *
 * Tests JSON column support against the src/ ORM via the TypeScript harness.
 *
 * NOTE: These tests are PostgreSQL >= 9.2 only.  checkJsonSupport() returns
 * false for sqlite3, so the entire describe block is skipped via
 * describe.skipIf — mirroring the original mocha behaviour where the before()
 * hook skipped setup and the tests would error on a non-existent table.
 *
 * On postgresql the suite runs with isJsonSupported=true and compares raw
 * objects; the checkResponse helper handles the fallback for completeness.
 */

import {describe, it, expect, beforeAll} from 'vitest';
import {createRequire} from 'node:module';
import {bookshelf, initialize} from './helpers/harness';

const _require = createRequire(import.meta.url);

// CJS helpers — no TypeScript versions exist for the json sub-helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checkJsonSupport: (bookshelf: any) => boolean = _require('./helpers/json/supported.cjs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonMigration: (bookshelf: any) => Promise<void> = _require('./helpers/json/migration.cjs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonInserts: (bookshelf: any) => Promise<void> = _require('./helpers/json/inserts.cjs');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defineJsonObjects: (bookshelf: any) => {Models: {Command: any; Unit: any}} =
  _require('./helpers/json/objects.cjs');

const {Models: JsonModels} = defineJsonObjects(bookshelf);
const Command = JsonModels.Command;

const isJsonSupported = checkJsonSupport(bookshelf);

function checkResponse(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): void {
  if (!isJsonSupported) {
    // Knex stores objects as JSON strings in dialects without native JSON support.
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(expected)) {
      mapped[key] = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    }
    expect(actual).toEqual(mapped);
  } else {
    expect(actual).toEqual(expected);
  }
}

beforeAll(async () => {
  await initialize();

  if (isJsonSupported) {
    await jsonMigration(bookshelf);
    await jsonInserts(bookshelf);
  }
});

// Skip the whole suite when not on postgresql — sqlite3 does not natively
// parse JSON columns, so knex stores plain objects as "[object Object]".
describe.skipIf(!isJsonSupported)('JSON support', () => {
  it('can `fetch` a model with a JSON column', async () => {
    const command = await Command.forge({id: 0}).fetch();
    checkResponse(command.attributes, {
      id: 0,
      unit_id: 1,
      type: 'move',
      info: {
        target: {
          x: 5,
          y: 10
        }
      }
    });
  });

  it('returns the correct previous attributes when updating nested objects', async () => {
    const command = await Command.forge({id: 0}).fetch();
    const newTarget = {x: 7, y: 13};
    const originalInfo = command.get('info');
    const updatedInfo = structuredClone(originalInfo);
    updatedInfo.target = newTarget;

    command.set('info', updatedInfo);

    expect(command.get('info')).not.toEqual(command.previous('info'));
    expect(command.previous('info')).toEqual(originalInfo);
  });

  it('Trying to fetch a model automatically excludes JSON column', async () => {
    const command = await Command.forge({
      unit_id: 1,
      type: 'attack',
      info: {test: 'blah'}
    }).fetch();
    checkResponse(command.attributes, {
      id: 1,
      unit_id: 1,
      type: 'attack',
      info: {
        weapon: 'cannon',
        target: {
          x: 2,
          y: 2
        }
      }
    });
  });
});
