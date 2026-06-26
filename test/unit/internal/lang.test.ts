import { describe, it, expect } from 'vitest';
import * as _ from '../../../src/internal/lang';

describe('lang', () => {
  it('isString / isFunction / isPlainObject / isNil', () => {
    expect(_.isString('a')).toBe(true);
    expect(_.isString(1)).toBe(false);
    expect(_.isFunction(() => {})).toBe(true);
    expect(_.isPlainObject({})).toBe(true);
    expect(_.isPlainObject([])).toBe(false);
    expect(_.isNil(null)).toBe(true);
    expect(_.isNil(undefined)).toBe(true);
    expect(_.isNil(0)).toBe(false);
  });

  it('isEmpty for objects, arrays, strings, null', () => {
    expect(_.isEmpty({})).toBe(true);
    expect(_.isEmpty([])).toBe(true);
    expect(_.isEmpty('')).toBe(true);
    expect(_.isEmpty(null)).toBe(true);
    expect(_.isEmpty({ a: 1 })).toBe(false);
    expect(_.isEmpty([1])).toBe(false);
  });

  it('clone is shallow, cloneDeep is deep', () => {
    const src = { a: { b: 1 } };
    const shallow = _.clone(src);
    expect(shallow.a).toBe(src.a);
    const deep = _.cloneDeep(src);
    expect(deep.a).not.toBe(src.a);
    expect(deep).toEqual(src);
  });

  it('pick / omit / omitBy', () => {
    expect(_.pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    expect(_.omit({ a: 1, b: 2 }, ['b'])).toEqual({ a: 1 });
    expect(_.omitBy({ a: 1, b: null }, _.isNull)).toEqual({ a: 1 });
  });

  it('result resolves a value or invokes a function, with default', () => {
    expect(_.result({ a: 5 }, 'a')).toBe(5);
    expect(_.result({ a: () => 6 }, 'a')).toBe(6);
    expect(_.result({}, 'missing', 'def')).toBe('def');
  });

  it('mapValues / mapKeys', () => {
    expect(_.mapValues({ a: 1, b: 2 }, (v) => v * 2)).toEqual({ a: 2, b: 4 });
    expect(_.mapKeys({ a: 1 }, (_v, k) => k.toUpperCase())).toEqual({ A: 1 });
  });

  it('groupBy / uniq / flatten / drop', () => {
    expect(_.groupBy([1, 2, 3], (n) => (n % 2 ? 'odd' : 'even')))
      .toEqual({ odd: [1, 3], even: [2] });
    expect(_.uniq([1, 1, 2])).toEqual([1, 2]);
    expect(_.flatten([[1], [2, 3]])).toEqual([1, 2, 3]);
    expect(_.drop([1, 2, 3], 1)).toEqual([2, 3]);
  });

  it('camelCase / startsWith / escape / uniqueId', () => {
    expect(_.camelCase('foo_bar')).toBe('fooBar');
    expect(_.startsWith('hello', 'he')).toBe(true);
    expect(_.escape('<a>')).toBe('&lt;a&gt;');
    expect(_.uniqueId('m')).toMatch(/^m\d+$/);
  });

  it('defaultsDeep merges nested defaults without overwriting', () => {
    expect(_.defaultsDeep({ a: { x: 1 } }, { a: { x: 9, y: 2 } }))
      .toEqual({ a: { x: 1, y: 2 } });
  });
});
