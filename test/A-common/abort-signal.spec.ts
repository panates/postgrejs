import { expect } from 'expect';
import { abortError, withAbortSignal } from '../../src/util/abort-signal.js';

describe('abort-signal', () => {
  describe('abortError()', () => {
    it("should reuse the signal's own reason when it is an Error", () => {
      const ac = new AbortController();
      const reason = new Error('custom reason');
      ac.abort(reason);
      expect(abortError(ac.signal)).toBe(reason);
    });

    it('should build a new AbortError when the reason is not an Error at all', () => {
      // Node's default AbortSignal reason (a DOMException) happens to be
      // instanceof Error too, so reaching this fallback needs a caller
      // that passed something else entirely to abort() - which the API
      // allows, since abort()'s argument is never restricted to Error.
      const ac = new AbortController();
      ac.abort('a plain string reason');
      const err = abortError(ac.signal);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toStrictEqual('AbortError');
      expect(err.message).toStrictEqual('The operation was aborted');
    });

    it('should build a new AbortError for the default DOMException reason too, since it is Error-derived', () => {
      // Documents the Node behavior the test above works around: an
      // AbortController.abort() with no reason produces a DOMException
      // that IS `instanceof Error`, so it takes the "reuse reason" branch,
      // not this fallback - included so that assumption stays checked.
      const ac = new AbortController();
      ac.abort();
      expect(ac.signal.reason).toBeInstanceOf(Error);
    });

    it('should attach cause when the reason does not already carry one', () => {
      const ac = new AbortController();
      ac.abort(new Error('custom reason'));
      const err = abortError(ac.signal, 'the underlying db error');
      expect((err as any).cause).toStrictEqual('the underlying db error');
    });

    it('should not overwrite a cause the reason already carries', () => {
      const ac = new AbortController();
      const reason = new Error('custom reason', { cause: 'original cause' });
      ac.abort(reason);
      const err = abortError(ac.signal, 'a different cause');
      expect((err as any).cause).toStrictEqual('original cause');
    });

    it('should silently skip attaching cause when the reason is frozen', () => {
      const ac = new AbortController();
      const reason = Object.freeze(new Error('frozen reason'));
      ac.abort(reason);
      // Assigning .cause on a frozen object throws in strict mode - caught
      // and ignored, since the error itself is still correct without it.
      expect(() => abortError(ac.signal, 'some cause')).not.toThrow();
      const err = abortError(ac.signal, 'some cause');
      expect(err).toBe(reason);
      expect((err as any).cause).toBeUndefined();
    });
  });

  describe('withAbortSignal()', () => {
    it('should call run() directly when no signal is given', async () => {
      const result = await withAbortSignal(
        undefined,
        async () => {
          throw new Error('cancel should never be called');
        },
        async () => 'ok',
      );
      expect(result).toStrictEqual('ok');
    });

    it('should reject immediately, without calling run(), when already aborted', async () => {
      const ac = new AbortController();
      ac.abort(new Error('already gone'));
      let ran = false;
      await expect(
        withAbortSignal(
          ac.signal,
          async () => undefined,
          async () => {
            ran = true;
            return 'ok';
          },
        ),
      ).rejects.toThrow('already gone');
      expect(ran).toStrictEqual(false);
    });

    it('should call cancel() and report the abort when the signal fires mid-run', async () => {
      const ac = new AbortController();
      let cancelCalled = false;
      const result = withAbortSignal(
        ac.signal,
        async () => {
          cancelCalled = true;
        },
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('SQLSTATE 57014')), 10);
          }),
      );
      setTimeout(() => ac.abort(new Error('user cancelled')), 0);
      const error: any = await result.catch(e => e);
      expect(cancelCalled).toStrictEqual(true);
      expect(error.message).toStrictEqual('user cancelled');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause.message).toStrictEqual('SQLSTATE 57014');
    });

    it("should not let a failed cancel() replace the query's own error", async () => {
      const ac = new AbortController();
      const result = withAbortSignal(
        ac.signal,
        async () => {
          throw new Error('cancel() itself failed');
        },
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error('SQLSTATE 57014')), 10);
          }),
      );
      setTimeout(() => ac.abort(new Error('user cancelled')), 0);
      const error: any = await result.catch(e => e);
      // Still reports as the abort, not the cancel() failure - cancel()'s
      // own rejection is swallowed rather than surfacing.
      expect(error.message).toStrictEqual('user cancelled');
    });

    it('should propagate a rejection unrelated to the signal unchanged', async () => {
      const ac = new AbortController();
      await expect(
        withAbortSignal(
          ac.signal,
          async () => undefined,
          async () => {
            throw new Error('a plain failure, signal never fired');
          },
        ),
      ).rejects.toThrow('a plain failure, signal never fired');
    });
  });
});
