/**
 * A connection whose socket closed without anyone asking it to - the
 * backend terminated by an administrator, a failover, a network fault.
 *
 * Reported on `Connection`'s `'close'` event as its reason, for a pooled
 * connection on `Pool`'s `'destroy'` (as the second argument) and
 * `'error'`, and as the rejection of whatever query was in flight when it
 * happened - one object for all of them, so a caller that needs both can
 * pair them by identity. `Pool` emits `'error'` for this and for a connection that
 * could not be created in the first place, and those want different
 * handling - this class is how a listener tells them apart:
 *
 * ```ts
 * pool.on('error', err => {
 *   if (err.code === '08006') log.warn('pooled connection lost', err.processID);
 *   else log.error('could not open a connection', err);
 * });
 * ```
 *
 * `code` is there so that branching does not have to mean `instanceof`,
 * which fails across duplicated copies of the package and is awkward from
 * JavaScript. It reads the same way `DatabaseError.code` does - a
 * SQLSTATE - and `08006 connection_failure` is the one this is. The server
 * never sends it: it cannot report that its own connection went away, so
 * there is no ambiguity about where a code of this value came from.
 *
 * The message deliberately says nothing else: it matches what other
 * drivers report for the same event, so code that branches on it keeps
 * working. What happened to *this* connection is on the object instead -
 * `processID` names the backend, and `cause` carries the socket error
 * when there was one (a clean FIN leaves none).
 */
export class ConnectionLostError extends Error {
  /**
   * SQLSTATE 08006, `connection_failure`. Synthesized here rather than
   * received - see the class doc.
   */
  readonly code: string = '08006';
  /** The backend's process id, as it was before the connection reset. */
  readonly processID?: number;

  constructor(processID?: number, cause?: unknown) {
    super('Connection terminated unexpectedly');
    this.name = 'ConnectionLostError';
    this.processID = processID;
    // Assigned rather than passed to the constructor, as abortError()
    // does - same reason, the option is newer than this package's floor.
    if (cause !== undefined) {
      try {
        (this as { cause?: unknown }).cause = cause;
      } catch {
        /* c8 ignore next */
      }
    }
  }
}
