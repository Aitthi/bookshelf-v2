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

describe('base/collection sortBy – lodash-parity ordering', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const C = (CollectionBase as any).extend({ model: ModelBase });

  it('orders normal < null (reviewer case: n=[5,null,3] → [3,5,null])', () => {
    const c = new C();
    // Build models with attribute `n`: 5, null, 3 (insertion order matters for
    // stability check — the original index must be preserved for equal criteria).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MB = ModelBase as any;
    const m5 = new MB({ n: 5 });
    const mNull = new MB({ n: null });
    const m3 = new MB({ n: 3 });
    c.add([m5, mNull, m3], { silent: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted: any[] = c.sortBy('n');
    const values = sorted.map((m: typeof ModelBase.prototype) => m.get('n'));
    expect(values).toEqual([3, 5, null]);
  });

  it('orders undefined last (undefined criteria sort after null)', () => {
    const c = new C();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MB = ModelBase as any;
    const mUndef = new MB({ n: undefined });
    const mNull = new MB({ n: null });
    const m1 = new MB({ n: 1 });
    c.add([mUndef, mNull, m1], { silent: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted: any[] = c.sortBy('n');
    const values = sorted.map((m: typeof ModelBase.prototype) => m.get('n'));
    // Expected lodash order: normal(1) < null < undefined
    expect(values[0]).toBe(1);
    expect(values[1]).toBeNull();
    expect(values[2]).toBeUndefined();
  });

  it('is stable: equal criteria preserve insertion order', () => {
    const c = new C();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MB = ModelBase as any;
    const ma = new MB({ n: 2, tag: 'a' });
    const mb = new MB({ n: 2, tag: 'b' });
    const mc = new MB({ n: 2, tag: 'c' });
    c.add([ma, mb, mc], { silent: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted: any[] = c.sortBy('n');
    const tags = sorted.map((m: typeof ModelBase.prototype) => m.get('tag'));
    expect(tags).toEqual(['a', 'b', 'c']);
  });
});
