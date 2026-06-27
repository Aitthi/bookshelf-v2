// Events
// ---------------

import { EventEmitter } from 'node:events';
import { BPromise } from '../internal/promise';
import { flatMap, once } from '../internal/lang';

const eventNames = (text: string): string[] => text.split(/\s+/);

/**
 * @class Events
 * @description
 * Base Event class inherited by {@link Model} and {@link Collection}. It's not
 * meant to be used directly, and is only displayed here for completeness.
 */
class Events extends EventEmitter {
  /**
   * Registers an event listener. The callback will be invoked whenever the event is fired. The event string may also be
   * a space-delimited list of several event names.
   *
   * @method Events#on
   * @param {string} nameOrNames The name or space separated names of events to register a callback for.
   * @param {function} callback That callback to invoke whenever the event is fired.
   * @return {mixed} The object where this is called on is returned to allow chaining this method call.
   */
  on(nameOrNames: string, callback: (...args: unknown[]) => void): this {
    eventNames(nameOrNames).forEach((name) => {
      super.on(name, callback);
    });
    return this;
  }

  /**
   * @method Events#off
   * @description
   * Remove a previously-bound callback event listener from an object. If no
   * event name is specified, callbacks for all events will be removed.
   *
   * @param {string} nameOrNames
   *   The name of the event or space separated list of events to stop listening
   *   to.
   * @param {function} callback That callback to remove.
   */
  off(nameOrNames: string | symbol | null | undefined, callback?: (...args: unknown[]) => void): this {
    if (nameOrNames == null) {
      return this.removeAllListeners();
    }

    // Events only supports string event names (space-delimited); symbol is for signature compat only
    eventNames(nameOrNames as string).forEach((name) => {
      if (callback === undefined) {
        this.removeAllListeners(name);
        return;
      }
      this.removeListener(name, callback);
    });
    return this;
  }

  /**
   * @method Events#trigger
   * @description
   * Trigger callbacks for the given event, or space-delimited list of events.
   * Subsequent arguments to `trigger` will be passed along to the event
   * callback.
   *
   * @param {string} nameOrNames
   *   The name of the event to trigger. Also accepts a space separated list of
   *   event names.
   * @param {...mixed} [args]
   *   Extra arguments to pass to the event listener callback function.
   */
  trigger(nameOrNames: string, ...args: unknown[]): this {
    eventNames(nameOrNames).forEach((name) => {
      this.emit(name, nameOrNames, ...args);
    });
    return this;
  }

  /**
   * A promise version of {@link Events#trigger}, returning a promise which
   * resolves with all return values from triggered event handlers. If any of the
   * event handlers throw an `Error` or return a rejected promise, the promise
   * will be rejected. Used internally on the {@link Model#event:creating "creating"},
   * {@link Model#event:updating "updating"}, {@link Model#event:saving "saving"}, and
   * {@link Model@event:destroying "destroying"} events, and can be helpful when needing
   * async event handlers (e.g. for validations).
   *
   * @method Events#triggerThen
   * @param {string} name
   *   The event name or a whitespace-separated list of event names to be triggered.
   * @param {...mixed} [args] Arguments to be passed to any registered event handlers.
   * @returns {Promise}
   *   A promise resolving to the return values of any triggered handlers.
   */
  triggerThen(nameOrNames: string, ...args: unknown[]): BPromise<unknown[]> {
    const names = eventNames(nameOrNames);
    // any: EventEmitter.listeners() returns Function[]; cast to callable signature for .apply
    const listeners = flatMap(names, (name) => this.listeners(name) as ((...a: unknown[]) => unknown)[]);
    return BPromise.mapSeries(listeners, (listener) => listener.apply(this, args));
  }

  /**
   * @method Events#once
   * @description
   * Just like {@link Events#on}, but causes the bound callback to fire only
   * once before being removed. Handy for saying "the next time that X happens,
   * do this". When multiple events are passed in using the space separated
   * syntax, the event will fire once for every event you passed in, not once
   * for a combination of all events.
   *
   * @param {string} nameOrNames
   *   The name of the event or space separated list of events to register a
   *   callback for.
   * @param {function} callback
   *   That callback to invoke only once when the event is fired.
   */
  once(name: string, callback: (...args: unknown[]) => unknown): this {
    const wrapped = once(function (this: Events, ...callArgs: unknown[]) {
      this.off(name, wrapped);
      return callback.apply(this, callArgs);
    });
    // any: attaching _callback property to a function object (event handler identity pattern)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapped as any)._callback = callback;
    return this.on(name, wrapped);
  }
}

export default Events;
