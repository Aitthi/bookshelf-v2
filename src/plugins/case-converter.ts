// Case-converter plugin for Bookshelf v2
// ----------------------------------------
// Opt-in plugin that automatically converts database column keys between
// snake_case (DB / wire format) and camelCase (JavaScript attribute names).
//
// Usage:
//   import caseConverter from './plugins/case-converter';
//   orm.plugin(caseConverter);
//
//   // DB row { first_name: 'Ada' } arrives via parse() as { firstName: 'Ada' }
//   // model.format({ firstName: 'Ada' }) sends { first_name: 'Ada' } to DB

import { camelize, underscore } from '../internal/inflection';
import { mapKeys } from '../internal/lang';

// any: bookshelf is a runtime-provided dynamic bag (Model/Collection + knex + registry)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVal = any;

/**
 * Case-converter plugin factory.
 *
 * Mutates `bookshelf.Model.prototype` to intercept `parse` and `format` so
 * that model attributes are transparently converted between camelCase (in JS)
 * and snake_case (in the database).
 *
 * - `parse`  (DB → model): snake_case keys → camelCase  (delegating to the
 *   original `parse` first, then remapping keys).
 * - `format` (model → DB): camelCase keys → snake_case  (delegating to the
 *   original `format` first, then remapping keys).
 *
 * @param bookshelf - The Bookshelf instance to augment.
 */
// any: bookshelf is a runtime-provided dynamic bag; options are plugin-level (unused here)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function caseConverterPlugin(bookshelf: AnyVal, _options?: AnyVal): void {
  const proto = bookshelf.Model.prototype;

  // Capture originals before overwriting so overrides can delegate.
  // any: these are prototype method references on a dynamic ORM class
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalParse: (this: AnyVal, attrs: any, options?: any) => any = proto.parse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalFormat: (this: AnyVal, attrs: any) => any = proto.format;

  Object.assign(bookshelf.Model.prototype, {
    /**
     * Intercepts `model.parse(attrs, options)`.
     * Delegates to the original `parse`, then remaps all keys from
     * snake_case → camelCase using `camelize(key, true)` (lower-first letter).
     *
     * Example: `{ first_name: 'Ada' }` → `{ firstName: 'Ada' }`
     */
    // any: attrs is a dynamic DB row object; return type is the remapped attrs bag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse(this: AnyVal, attrs: any, options?: any): any {
      // any: result of original parse is a dynamic attribute bag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed: any = originalParse.call(this, attrs, options);
      if (parsed == null || typeof parsed !== 'object') return parsed;
      // any: mapKeys returns Record<string, unknown>; cast back to any for ORM layer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapKeys(parsed as Record<string, unknown>, (_v, k) => camelize(k, true)) as any;
    },

    /**
     * Intercepts `model.format(attrs)`.
     * Delegates to the original `format`, then remaps all keys from
     * camelCase → snake_case using `underscore(key)`.
     *
     * Example: `{ firstName: 'Ada' }` → `{ first_name: 'Ada' }`
     */
    // any: attrs is a dynamic camelCase attribute bag; return type is the snake_case version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    format(this: AnyVal, attrs: any): any {
      // any: result of original format is a dynamic attribute bag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatted: any = originalFormat.call(this, attrs);
      if (formatted == null || typeof formatted !== 'object') return formatted;
      // any: mapKeys returns Record<string, unknown>; cast back to any for ORM layer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapKeys(formatted as Record<string, unknown>, (_v, k) => underscore(k)) as any;
    }
  });
}
