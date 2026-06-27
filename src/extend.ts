import { isFunction } from './internal/lang';

// Uses a hash of prototype properties and class properties to be extended.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function extend(this: any, protoProps?: any, staticProps?: any): any {
  // `this` is the Parent constructor — dynamic at call-time (Backbone-style
  // static method), so `any` is the pragmatic choice here.
  const Parent = this;

  // The constructor function for the new subclass is either defined by you
  // (the "constructor" property in your `extend` definition), or defaulted
  // by us to simply call the parent's constructor.
  const Child =
    protoProps && Object.hasOwn(protoProps, 'constructor')
      ? protoProps.constructor
      : function (this: unknown, ...args: unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (Parent as any).apply(this, args);
        };

  Object.assign(Child, Parent, staticProps);

  // Set the prototype chain to inherit from `Parent`.
  Child.prototype = Object.create(Parent.prototype, {
    constructor: {
      value: Child,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });

  if (protoProps) {
    Object.assign(Child.prototype, protoProps);
  }

  // Give child access to the parent prototype as part of "super"
  Child.__super__ = Parent.prototype;

  // If there is an "extended" function set on the parent,
  // call it with the extended child object.
  if (isFunction(Parent.extended)) Parent.extended(Child);

  return Child;
}
