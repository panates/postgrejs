import { expect } from 'expect';
import { SafeEventEmitter } from '../../src/safe-event-emitter.js';

describe('SafeEventEmitter', () => {
  it('should emit normally when listeners are present', () => {
    const emitter = new SafeEventEmitter();
    let received: any;
    emitter.on('data', (v: any) => (received = v));
    expect(emitter.emit('data', 42)).toStrictEqual(true);
    expect(received).toStrictEqual(42);
  });

  it('should swallow an unhandled "error" event instead of throwing', () => {
    const emitter = new SafeEventEmitter();
    // Node's own EventEmitter throws synchronously when 'error' is emitted
    // with no listener attached - this override exists specifically to
    // avoid that.
    expect(emitter.emit('error', new Error('boom'))).toStrictEqual(false);
  });

  it('should still deliver "error" when a listener is attached', () => {
    const emitter = new SafeEventEmitter();
    let caught: any;
    emitter.on('error', (e: any) => (caught = e));
    expect(emitter.emit('error', new Error('boom'))).toStrictEqual(true);
    expect(caught?.message).toStrictEqual('boom');
  });

  it('should return false instead of throwing when a listener itself throws', () => {
    const emitter = new SafeEventEmitter();
    emitter.on('data', () => {
      throw new Error('listener blew up');
    });
    expect(emitter.emit('data', 1)).toStrictEqual(false);
  });
});
