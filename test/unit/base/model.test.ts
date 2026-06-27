import { describe, it, expect } from 'vitest';
import ModelBase from '../../../src/base/model';

describe('base/model construction', () => {
  it('is extendable and instantiable (constructor-function, not ES class)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const M = (ModelBase as any).extend({ tableName: 'users' });
    const m = new M({ id: 1 });
    expect(m).toBeInstanceOf(M);
    expect(m.tableName).toBe('users'); // prototype default NOT shadowed
    expect(m.get('id')).toBe(1);
  });
});
