import { describe, it, expect, beforeEach } from 'vitest';
import Events from '../../src/base/events';

describe('Events', () => {
  let events: Events;

  beforeEach(() => {
    events = new Events();
  });

  describe('#off()', () => {
    it('should only deregister the provided callback if passed', () => {
      function eventHandler1() {
        throw new Error('Expected event handler to have not been called');
      }

      function eventHandler2() {
        /* Expected to be called */
        (eventHandler2 as unknown as { callCount: number }).callCount += 1;
      }
      (eventHandler2 as unknown as { callCount: number }).callCount = 0;

      events.on('A', eventHandler1);
      events.on('A', eventHandler2);
      events.off('A', eventHandler1);
      expect(events.eventNames().length).toBe(1);

      events.trigger('A');
      expect((eventHandler2 as unknown as { callCount: number }).callCount).toBe(1);
    });

    it('should deregister all callbacks if no callback is passed', () => {
      function eventHandler1() {
        throw new Error('Expected event handler to have not been called');
      }

      function eventHandler2() {
        throw new Error('Expected event handler to have not been called');
      }

      events.on('A', eventHandler1);
      events.on('A', eventHandler2);
      events.off('A');
      events.trigger('A');

      expect(events.eventNames().length).toBe(0);
    });

    it('should deregister multiple space-separated events', () => {
      function eventHandler() {
        throw new Error('Expected event handler to have not been called');
      }

      events.on('A', eventHandler);
      events.on('B', eventHandler);
      events.off('A B');
      events.trigger('A');

      expect(events.eventNames().length).toBe(0);
    });
  });

  describe('#trigger()', () => {
    it('should pass additional arguments to the listener', () => {
      events.on('event', (name, arg1, arg2) => {
        expect(name).toBe('event');
        expect(arg1).toBe(1);
        expect(arg2).toBe(2);
      });
      events.trigger('event', 1, 2);
    });
  });

  describe('#once()', () => {
    it('should remove itself but not other events', () => {
      function onEventHandler() {
        /* Expected to be called */
        (onEventHandler as unknown as { callCount: number }).callCount += 1;
      }
      (onEventHandler as unknown as { callCount: number }).callCount = 0;

      function onceEventHandler() {
        /* Expected to be called */
        (onceEventHandler as unknown as { callCount: number }).callCount += 1;
      }
      (onceEventHandler as unknown as { callCount: number }).callCount = 0;

      events.on('A', onEventHandler);
      events.once('A', onceEventHandler);
      events.trigger('A');
      expect(events.eventNames().length).toBe(1);

      events.trigger('A');
      expect((onEventHandler as unknown as { callCount: number }).callCount).toBe(2);
      expect((onceEventHandler as unknown as { callCount: number }).callCount).toBe(1);
    });
  });
});
