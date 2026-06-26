// Virtuals plugin for Bookshelf v2
// ----------------------------------
// Opt-in plugin that layers computed (virtual) attributes onto a Model.
//
// Usage:
//   import virtuals from './plugins/virtuals';
//   orm.plugin(virtuals);
//
//   const Person = orm.Model.extend({
//     tableName: 'persons',
//     virtuals: {
//       // getter-only: plain function
//       fullName() { return this.get('first') + ' ' + this.get('last'); },
//       // getter + setter pair
//       reverseName: {
//         get() { return this.get('last') + ', ' + this.get('first'); },
//         set(v) {
//           const [last, first] = v.split(', ');
//           this.set({last, first});
//         }
//       }
//     }
//   });

// any: bookshelf is a dynamic bag (Model/Collection constructors + knex + registry)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVal = any;

/** A getter-only virtual: a plain function called with `this = model`. */
type VirtualGetter = (this: AnyVal) => AnyVal;

/** A virtual defined as an object with a required `get` and optional `set`. */
interface VirtualDefinition {
  get(this: AnyVal): AnyVal;
  set?(this: AnyVal, value: AnyVal): void;
}

/** Either form a virtual entry may take. */
type VirtualEntry = VirtualGetter | VirtualDefinition;

/** The `virtuals` map as declared on a model prototype. */
// any: values are user-supplied dynamic virtual defs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VirtualsMap = Record<string, VirtualEntry>;

/** Narrow a VirtualEntry to the getter/setter object form. */
function isGetSet(v: VirtualEntry): v is VirtualDefinition {
  return typeof v === 'object' && v !== null && typeof (v as VirtualDefinition).get === 'function';
}

/**
 * Call the getter for a single virtual entry, regardless of which form it takes.
 */
function callGetter(virtual: VirtualEntry, model: AnyVal): AnyVal {
  return isGetSet(virtual) ? virtual.get.call(model) : (virtual as VirtualGetter).call(model);
}

/**
 * Virtuals plugin factory.
 *
 * Mutates `bookshelf.Model.prototype` to intercept `get`, `set`, and
 * `serialize` so that the `virtuals` property declared on a model subclass
 * participates transparently in attribute access and serialisation.
 *
 * @param bookshelf - The Bookshelf instance to augment.
 */
// any: bookshelf is a runtime-provided dynamic bag; options are plugin-level (unused here)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function virtualsPlugin(bookshelf: AnyVal, _options?: AnyVal): void {
  const proto = bookshelf.Model.prototype;

  // Capture the originals before overwriting so overrides can delegate.
  // any: these are prototype method references on a dynamic ORM class
  const originalGet: (this: AnyVal, attr: string) => AnyVal = proto.get;
  const originalSet: (this: AnyVal, key: AnyVal, val?: AnyVal, options?: AnyVal) => AnyVal = proto.set;
  const originalSerialize: (this: AnyVal, options?: AnyVal) => AnyVal = proto.serialize;

  Object.assign(bookshelf.Model.prototype, {
    /**
     * Intercepts `model.get(attr)`.
     * If `attr` names a virtual, the virtual getter is invoked and its return
     * value is returned.  Otherwise delegates to the original `get`.
     */
    get(this: AnyVal, attr: string): AnyVal {
      // any: this.virtuals is a user-defined prototype property, not typed at base level
      const virtuals: VirtualsMap | undefined = this.virtuals;
      if (virtuals != null && Object.prototype.hasOwnProperty.call(virtuals, attr)) {
        return callGetter(virtuals[attr], this);
      }
      return originalGet.call(this, attr);
    },

    /**
     * Intercepts `model.set(key, value)` and `model.set({...})`.
     * Keys matching a virtual with a `set` function are routed to it; keys
     * matching a getter-only virtual are silently dropped (mirrors classic
     * plugin behaviour).  All remaining keys are forwarded to the original
     * `set`.
     */
    set(this: AnyVal, key: AnyVal, val?: AnyVal, options?: AnyVal): AnyVal {
      if (key == null) return this;

      // any: this.virtuals is a user-defined prototype property
      const virtuals: VirtualsMap | undefined = this.virtuals;

      if (typeof key === 'object') {
        // Object-style call: set({key: value}, options?)
        // `val` carries the options hash in this signature form.
        // any: key is a plain attrs object in this branch
        const attrs: Record<string, AnyVal> = key;
        // any: filtered attrs for non-virtual keys
        const realAttrs: Record<string, AnyVal> = {};

        for (const k of Object.keys(attrs)) {
          if (virtuals != null && Object.prototype.hasOwnProperty.call(virtuals, k)) {
            const virtual = virtuals[k];
            if (isGetSet(virtual) && typeof virtual.set === 'function') {
              virtual.set.call(this, attrs[k]);
            }
            // getter-only virtual: silently ignore the write
          } else {
            realAttrs[k] = attrs[k];
          }
        }

        // Delegate the non-virtual portion; `val` is the options arg here.
        return originalSet.call(this, realAttrs, val, options);
      }

      // String-key call: set('key', value, options?)
      if (virtuals != null && Object.prototype.hasOwnProperty.call(virtuals, key)) {
        const virtual = virtuals[key];
        if (isGetSet(virtual) && typeof virtual.set === 'function') {
          virtual.set.call(this, val);
        }
        // getter-only virtual: silently ignore
        return this;
      }

      return originalSet.call(this, key, val, options);
    },

    /**
     * Intercepts `model.serialize(options)` / `model.toJSON(options)`.
     * Appends all virtual attribute values to the serialised output.
     * Pass `{ virtuals: false }` in options to suppress virtuals entirely.
     */
    serialize(this: AnyVal, options?: AnyVal): AnyVal {
      // any: options is a freeform options bag at this layer
      const result: AnyVal = originalSerialize.call(this, options);

      // originalSerialize can return null when options.omitNew && isNew()
      if (result == null) return result;

      // Caller has explicitly opted out of virtuals in this serialisation.
      if (options != null && options.virtuals === false) return result;

      // any: this.virtuals is a user-defined prototype property
      const virtuals: VirtualsMap | undefined = this.virtuals;
      if (virtuals == null) return result;

      for (const attr of Object.keys(virtuals)) {
        result[attr] = callGetter(virtuals[attr], this);
      }

      return result;
    }
  });
}
