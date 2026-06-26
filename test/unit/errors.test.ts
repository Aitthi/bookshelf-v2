import { describe, it, expect } from 'vitest';
import * as errors from '../../src/errors';

describe('errors', () => {
  it('each error is an Error subclass with the right name', () => {
    for (const name of ['NotFoundError', 'EmptyError', 'NoRowsUpdatedError', 'NoRowsDeletedError', 'ModelNotResolvedError'] as const) {
      const Err = (errors as Record<string, new (m?: string) => Error>)[name];
      const e = new Err('msg');
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(Err);
      expect(e.name).toBe(name);
      expect(e.message).toBe('msg');
    }
  });
});
