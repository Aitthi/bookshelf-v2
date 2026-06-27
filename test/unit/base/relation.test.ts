import { describe, it, expect } from 'vitest';
import RelationBase from '../../../src/base/relation';

describe('base/relation', () => {
  it('constructs and is extendable (constructor-function)', () => {
    const r = new (RelationBase as any)('hasMany', null, { foreignKey: 'x' });
    expect(r.type).toBe('hasMany');
    expect(r.foreignKey).toBe('x');
    const R = (RelationBase as any).extend({ custom() { return 1; } });
    expect(new R('hasOne', null, {}).custom()).toBe(1);
  });
});
