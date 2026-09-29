import { EventEmitter } from 'events';

/**
 * An `EventEmitter` whose listeners cannot take the process down.
 *
 * A listener that throws would otherwise escape into whatever was
 * emitting - the socket's own data handler, more often than not - and
 * an `error` event with nobody listening would throw by definition.
 */
export class SafeEventEmitter extends EventEmitter {
  emit(event: string | symbol, ...args: any[]): boolean {
    try {
      if (event === 'error' && !this.listenerCount('error')) return false;
      return super.emit(event, ...args);
    } catch {
      return false;
    }
  }
}
