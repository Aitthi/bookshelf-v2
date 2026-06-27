import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { identity, extend as langExtend } from '../../src/internal/lang';
import SyncModule from '../../src/sync';

// Sync is exported as a function-constructor; cast to any so TypeScript allows `new`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Sync = SyncModule as any;

const snakeCase = (s: string): string => s.replace(/([A-Z])/g, '_$1').toLowerCase();

describe('Sync', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stubModel = (idAttribute?: string): any => {
    const qd: AnyRecord[] = [];

    return {
      idAttribute: idAttribute || 'id',
      id: 'pk',
      attributes: {
        idAttribute: 'pk',
      },
      tableName: 'testtable',
      format: identity,
      isNew() {
        return true;
      },
      queryData: qd,
      operation: null,
      query() {
        return this._query;
      },
      _query: {
        _statements: qd,
        where(where: unknown) {
          qd.push({ grouping: 'where', where });
        },
        limit(limit: unknown) {
          qd.push({ grouping: 'limit', limit });
        },
      },
      resetQuery() {
        return this;
      },
      getWhereParts() {
        return qd
          .filter((item) => item.grouping === 'where')
          .map((item) => item.where);
      },
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyRecord = Record<string, any>;

  it('accepts a withSchema option', () => {
    const testSchema = 'test';
    const setSchema = vi.fn();
    const mockModel = {
      query() {
        return { withSchema: setSchema };
      },
      resetQuery() {},
    };

    new Sync(mockModel as unknown, { withSchema: testSchema });

    expect(setSchema).toHaveBeenCalledWith(testSchema);
  });

  it('accepts a lock option if called with a transaction', () => {
    const setLock = vi.fn();
    const mockModel = {
      query() {
        return { forUpdate: setLock, transacting() {} };
      },
      resetQuery() {},
    };

    new Sync(mockModel as unknown, { lock: 'forUpdate', transacting: 'something' });

    expect(setLock).toHaveBeenCalled();
  });

  it('ignores the lock option if called without a transaction', () => {
    const setLock = vi.fn();
    const mockModel = {
      query() {
        return { forUpdate: setLock, transacting() {} };
      },
      resetQuery() {},
    };

    new Sync(mockModel as unknown, { lock: 'forUpdate' });

    expect(setLock).not.toHaveBeenCalled();
  });

  describe('prefixFields', () => {
    it('should prefix all keys of the passed in object with the tablename', () => {
      const sync = new Sync(stubModel());
      const attributes = {
        some: 'column',
        another: 'column',
      };

      expect(sync.prefixFields(attributes)).toEqual({
        'testtable.some': 'column',
        'testtable.another': 'column',
      });
    });

    it('should run after format for select', () => {
      const attributes = {
        Some: 'column',
        Another: 'column',
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = langExtend(stubModel(), {
        format(attrs: AnyRecord) {
          const data: AnyRecord = {};
          for (const key in attrs) {
            data[key.toLowerCase()] = attrs[key];
          }
          return data;
        },
      });
      const sync = new Sync(model);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sync as any).select = function (this: any) {
        expect(this.syncing.queryData[0].where).toEqual({
          'testtable.some': 'column',
          'testtable.another': 'column',
        });
      };

      return sync.first(attributes);
    });

    it('should format attributes for updates, including id attribute', async () => {
      const stubModelInstance = langExtend(stubModel('idAttribute'), {
        format(attrs: AnyRecord) {
          const data: AnyRecord = {};
          for (const key in attrs) {
            data[snakeCase(key)] = attrs[key];
          }
          return data;
        },
      });
      const updateFields = {
        someColumn: 'updated',
        otherColumn: 'updated',
      };

      let capturedAttrs: AnyRecord | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stubModelInstance._query as any).update = (attrs: AnyRecord) => {
        capturedAttrs = attrs;
      };

      const sync = new Sync(stubModelInstance);
      await sync.update(updateFields);

      expect(stubModelInstance.getWhereParts()).toEqual([{ id_attribute: 'pk' }]);
      expect(capturedAttrs).toEqual({
        some_column: 'updated',
        other_column: 'updated',
      });
    });

    it('should format id attribute for deletes', async () => {
      const stubModelInstance = langExtend(stubModel('idAttribute'), {
        idAttribute: 'idAttribute',
        format(attrs: AnyRecord) {
          const data: AnyRecord = {};
          for (const key in attrs) {
            data[snakeCase(key)] = attrs[key];
          }
          return data;
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stubModelInstance._query as any).del = () => {
        /* captured */
      };

      const sync = new Sync(stubModelInstance);
      await sync.del();

      expect(stubModelInstance.getWhereParts()).toEqual([{ id_attribute: 'pk' }]);
    });
  });

  describe('update', () => {
    it("doesn't try to update the primary key if it hasn't changed", async () => {
      const sync = new Sync(stubModel());
      let capturedAttrs: AnyRecord | undefined;
      Object.assign(sync.query, {
        update(attrs: AnyRecord) {
          capturedAttrs = attrs;
        },
        where(this: AnyRecord) {
          this._statements = [{ grouping: 'where' }];
        },
      });

      await sync.update({ id: 'pk', name: 'something' });
      expect(capturedAttrs).not.toHaveProperty('id');
    });

    it('will update the primary key if it has changed', async () => {
      const sync = new Sync(stubModel());
      let capturedAttrs: AnyRecord | undefined;
      Object.assign(sync.query, {
        update(attrs: AnyRecord) {
          capturedAttrs = attrs;
        },
        where(this: AnyRecord) {
          this._statements = [{ grouping: 'where' }];
        },
      });

      await sync.update({ id: 'updated', name: 'something' });
      expect(capturedAttrs).toHaveProperty('id');
      expect(capturedAttrs?.id).toBe('updated');
    });
  });
});
