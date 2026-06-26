import { describe, it, expect } from 'vitest';
import CollectionBase from '../../../src/base/collection';
import ModelBase from '../../../src/base/model';

describe('base/collection construction', () => {
  it('is extendable and instantiable (constructor-function, not ES class)', () => {
    // A valid `model` constructor is required by CollectionBase (lib parity), so
    // supply one; the rest proves the constructor-function fix.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const C = (CollectionBase as any).extend({ model: ModelBase, foo() { return 'bar'; } });
    const c = new C();
    expect(c).toBeInstanceOf(C);
    expect(typeof c.foo).toBe('function');
    expect(c.foo()).toBe('bar');
  });
});
