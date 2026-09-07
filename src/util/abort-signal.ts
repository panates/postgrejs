/**
 * The error an aborted operation rejects with.
 *
 * Prefers the signal's own reason, so `AbortSignal.timeout()` still reports
 * itself as a TimeoutError and a caller's `controller.abort(myError)` still
 * arrives intact. The database error that actually ended the query (SQLSTATE
 * 57014) is attached as `cause` rather than replacing it: the reason is what
 * callers branch on, the cause is what they need when reporting it.
 */
export function abortError(signal: AbortSignal, cause?: unknown): Error {
  const reason: unknown = signal.reason;
  const err =
    reason instanceof Error
      ? reason
      : Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        });
  if (cause !== undefined && (err as { cause?: unknown }).cause === undefined) {
    try {
      (err as { cause?: unknown }).cause = cause;
    } catch {
      // A reason the caller froze; the error itself is still correct.
    }
  }
  return err;
}

/**
 * Runs `run()` under an AbortSignal, asking `cancel()` to interrupt it if the
 * signal fires.
 *
 * Cancelling a PostgreSQL query is a request, not a guarantee: it travels on
 * its own connection and the statement may well finish first. So this does
 * not settle early - it lets the query end the way the server ends it and
 * only then reports the abort, which is also what keeps the connection
 * usable, since its response still has to be read either way.
 *
 * The listener is always removed again: one long-lived signal shared by many
 * queries would otherwise accumulate a listener per query.
 */
export async function withAbortSignal<T>(
  signal: AbortSignal | undefined,
  cancel: () => Promise<void>,
  run: () => Promise<T>,
): Promise<T> {
  if (!signal) return run();
  // Already aborted: nothing has been sent, so nothing needs cancelling.
  if (signal.aborted) throw abortError(signal);
  const onAbort = () => {
    // A failed cancel (the session already gone, say) must not replace the
    // error the query itself is about to report.
    cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await run();
  } catch (e) {
    if (signal.aborted) throw abortError(signal, e);
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
