import { describe, it, expect } from 'vitest';
import * as inflection from '../../../src/internal/inflection';

describe('inflection', () => {
  it('pluralize regular + common irregulars', () => {
    expect(inflection.pluralize('book')).toBe('books');
    expect(inflection.pluralize('category')).toBe('categories');
    expect(inflection.pluralize('person')).toBe('people');
  });
  it('singularize regular + common irregulars', () => {
    expect(inflection.singularize('books')).toBe('book');
    expect(inflection.singularize('categories')).toBe('category');
    expect(inflection.singularize('people')).toBe('person');
  });
  it('pluralize quiz', () => {
    expect(inflection.pluralize('quiz')).toBe('quizzes');
  });
  it('singularize ss-words', () => {
    expect(inflection.singularize('addresses')).toBe('address');
    expect(inflection.singularize('address')).toBe('address');
    expect(inflection.singularize('classes')).toBe('class');
  });
  it('underscore / camelize / capitalize', () => {
    expect(inflection.underscore('FooBar')).toBe('foo_bar');
    expect(inflection.camelize('foo_bar')).toBe('FooBar');
    expect(inflection.camelize('foo_bar', true)).toBe('fooBar');
    expect(inflection.capitalize('foo')).toBe('Foo');
  });
});
