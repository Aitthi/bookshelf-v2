import { describe, it, expect, vi } from 'vitest';
import { BPromise } from '../../../src/internal/promise';

describe('BPromise', () => {
  it('tap returns original value and runs side effect', async () => {
    const seen: number[] = [];
    const out = await BPromise.resolve(5).tap((v) => { seen.push(v); });
    expect(out).toBe(5);
    expect(seen).toEqual([5]);
  });

  it('tap waits for an async side effect', async () => {
    const order: string[] = [];
    await BPromise.resolve(1).tap(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push('side');
    }).then(() => order.push('after'));
    expect(order).toEqual(['side', 'after']);
  });

  it('bind sets this for subsequent non-arrow callbacks', async () => {
    const ctx = { name: 'ctx' };
    const result = await BPromise.bind(ctx).then(function (this: typeof ctx) {
      return this.name;
    });
    expect(result).toBe('ctx');
  });

  it('return/thenReturn replaces the resolution value', async () => {
    expect(await BPromise.resolve(1).return(2)).toBe(2);
    expect(await BPromise.resolve(1).thenReturn(3)).toBe(3);
  });

  it('static map is concurrent and preserves order', async () => {
    const out = await BPromise.map([3, 1, 2], async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('static mapSeries runs sequentially in order', async () => {
    const order: number[] = [];
    await BPromise.mapSeries([3, 1, 2], async (n) => {
      await new Promise((r) => setTimeout(r, n));
      order.push(n);
    });
    expect(order).toEqual([3, 1, 2]); // sequential: not reordered by delay
  });

  it('reduce accumulates with an initial value', async () => {
    const sum = await BPromise.reduce([1, 2, 3], (acc, n) => acc + n, 0);
    expect(sum).toBe(6);
  });

  it('join resolves all then calls handler', async () => {
    const r = await BPromise.join(BPromise.resolve(1), BPromise.resolve(2), (a: number, b: number) => a + b);
    expect(r).toBe(3);
  });

  it('method wraps a sync throw into a rejection and preserves this', async () => {
    const obj = {
      mult: BPromise.method(function (this: { factor: number }, n: number) {
        if (n < 0) throw new Error('neg');
        return n * this.factor;
      })
    };
    expect(await obj.mult.call({ factor: 2 }, 3)).toBe(6);
    await expect(obj.mult.call({ factor: 2 }, -1)).rejects.toThrow('neg');
  });

  it('try catches synchronous throws', async () => {
    await expect(BPromise.try(() => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('asCallback delivers node-style (err, value)', async () => {
    const cb = vi.fn();
    await BPromise.resolve(7).asCallback(cb);
    expect(cb).toHaveBeenCalledWith(null, 7);
  });

  it('then returns a BPromise (subclass preserved)', () => {
    expect(BPromise.resolve(1).then((x) => x)).toBeInstanceOf(BPromise);
  });
});
