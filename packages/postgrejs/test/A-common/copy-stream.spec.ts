import { expect } from 'expect';
import {
  CopyFromStream,
  CopyToStream,
} from '../../src/connection/copy-stream.js';
import { Protocol } from '../../src/protocol/protocol.js';

const Code = Protocol.BackendMessageCode;

function fakeSocket() {
  const calls: string[] = [];
  return {
    calls,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    sendCopyData: (_data: Buffer, cb?: (err?: Error | null) => void) => {
      calls.push('sendCopyData');
      cb?.();
      return true;
    },
    sendCopyDone: () => {
      calls.push('sendCopyDone');
      return true;
    },
    sendCopyFail: () => {
      calls.push('sendCopyFail');
      return true;
    },
  } as any;
}

function noop(): void {
  /* the CaptureCallback's own `done` - unused by most cases here */
}

describe('CopyToStream', () => {
  it('should resolve waitStarted() once CopyOutResponse arrives, recording its formats', async () => {
    const stream = new CopyToStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(
      Code.CopyOutResponse,
      { overallFormat: 1, columnFormats: [1, 0] },
      noop,
    );
    await p;
    expect(stream.overallFormat).toStrictEqual(1);
    expect(stream.columnFormats).toStrictEqual([1, 0]);
    stream.destroy();
  });

  it('should resolve waitStarted() immediately once already started', async () => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    await stream.waitStarted();
    stream.destroy();
  });

  it('should reject waitStarted() immediately once already errored', async () => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.ErrorResponse, new Error('boom'), noop);
    await expect(stream.waitStarted()).rejects.toThrow('boom');
  });

  it('should push CopyData bytes onto the stream', () => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.capture(Code.CopyData, { data: Buffer.from('row1') }, noop);
    // read() returns whatever push() already buffered, synchronously - no
    // need to wait for flowing-mode's 'data' event to fire.
    expect(stream.read()?.toString()).toStrictEqual('row1');
    stream.destroy();
  });

  it('should pause the socket once push() reports backpressure', () => {
    const socket = fakeSocket();
    const stream = new CopyToStream(socket);
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    // Never consumed, so push() itself will eventually report false once
    // its internal buffer (highWaterMark, 16KB by default) fills up.
    let paused = false;
    for (let i = 0; i < 2000 && !paused; i++) {
      stream.capture(Code.CopyData, { data: Buffer.alloc(64).fill('x') }, noop);
      paused = socket.calls.includes('pause');
    }
    expect(paused).toStrictEqual(true);
    stream.destroy();
  });

  it('should discard CopyData once the stream has been destroyed', () => {
    const socket = fakeSocket();
    const stream = new CopyToStream(socket);
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.destroy();
    let pushed = 0;
    stream.on('data', () => pushed++);
    stream.capture(Code.CopyData, { data: Buffer.from('late') }, noop);
    expect(pushed).toStrictEqual(0);
  });

  it('should resume the socket on the next _read() once it was paused', () => {
    const socket = fakeSocket();
    const stream = new CopyToStream(socket);
    (stream as any)._paused = true;
    (stream as any)._read();
    expect(socket.calls).toContain('resume');
    stream.destroy();
  });

  it('should record rowCount from CommandComplete', () => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.capture(Code.CommandComplete, { rowCount: 42 }, noop);
    expect(stream.rowCount).toStrictEqual(42);
    stream.destroy();
  });

  it('should report an unexpected message before the copy starts as an error', async () => {
    const stream = new CopyToStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(Code.NoticeResponse as any, {}, noop);
    // Setting _error alone doesn't reject an in-flight waitStarted() - it
    // only becomes visible once the capture cycle actually ends.
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
    await expect(p).rejects.toThrow(/did not start a COPY TO STDOUT/);
  });

  it('should ignore an unexpected message once the copy has already started', () => {
    const stream = new CopyToStream(fakeSocket());
    // Binary format (1), not 0 - a falsy overallFormat would fail the
    // `!this.overallFormat` check the same way null/undefined would.
    stream.capture(Code.CopyOutResponse, { overallFormat: 1 }, noop);
    stream.capture(Code.NoticeResponse as any, {}, noop);
    expect((stream as any)._error).toBeUndefined();
    stream.destroy();
  });

  it('should end the stream on ReadyForQuery with no error', done => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.on('end', () => done());
    stream.resume();
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
  });

  it('should destroy the stream on ReadyForQuery with an error', done => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.capture(Code.ErrorResponse, new Error('copy failed'), noop);
    stream.on('error', e => {
      expect(e.message).toStrictEqual('copy failed');
      done();
    });
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
  });

  it('should not push/destroy from _finish() while discarding', () => {
    const stream = new CopyToStream(fakeSocket());
    stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
    stream.destroy();
    let doneErr: any = 'not called';
    stream.capture(Code.ReadyForQuery, {}, e => (doneErr = e));
    expect(doneErr).toBeUndefined();
  });

  it('should reject waitStarted() with a generic message if the copy ends before it ever starts', async () => {
    const stream = new CopyToStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
    await expect(p).rejects.toThrow(/Copy ended before it started/);
  });

  describe('fail()', () => {
    it('should reject a still-pending waitStarted()', async () => {
      const stream = new CopyToStream(fakeSocket());
      const p = stream.waitStarted();
      stream.fail(new Error('socket died'));
      await expect(p).rejects.toThrow('socket died');
    });

    it('should destroy the stream when nothing was waiting on it', done => {
      const stream = new CopyToStream(fakeSocket());
      stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
      stream.on('error', e => {
        expect(e.message).toStrictEqual('socket died');
        done();
      });
      stream.fail(new Error('socket died'));
    });

    it('should be a no-op once already settled', () => {
      const stream = new CopyToStream(fakeSocket());
      stream.capture(Code.CopyOutResponse, { overallFormat: 0 }, noop);
      // fail() with nothing else waiting destroys the stream - an
      // unhandled 'error' event would otherwise throw uncaught.
      stream.on('error', () => undefined);
      stream.fail(new Error('first'));
      expect(() => stream.fail(new Error('second'))).not.toThrow();
    });
  });
});

describe('CopyFromStream', () => {
  it('should resolve waitStarted() once CopyInResponse arrives', async () => {
    const stream = new CopyFromStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(Code.CopyInResponse, {}, noop);
    await p;
  });

  it('should reject waitStarted() immediately once already errored', async () => {
    const stream = new CopyFromStream(fakeSocket());
    // An ErrorResponse also destroys the stream immediately here (unlike
    // CopyToStream's) - an unhandled 'error' event would otherwise throw.
    stream.on('error', () => undefined);
    stream.capture(Code.ErrorResponse, new Error('boom'), noop);
    await expect(stream.waitStarted()).rejects.toThrow('boom');
  });

  it('should record rowCount from CommandComplete', () => {
    const stream = new CopyFromStream(fakeSocket());
    stream.capture(Code.CopyInResponse, {}, noop);
    stream.capture(Code.CommandComplete, { rowCount: 7 }, noop);
    expect(stream.rowCount).toStrictEqual(7);
  });

  it('should destroy the stream on a server-side ErrorResponse mid-copy', done => {
    const stream = new CopyFromStream(fakeSocket());
    stream.capture(Code.CopyInResponse, {}, noop);
    stream.on('error', e => {
      expect(e.message).toStrictEqual('bad data');
      done();
    });
    stream.capture(Code.ErrorResponse, new Error('bad data'), noop);
  });

  it('should not double-destroy an ErrorResponse that arrives after the copy already ended', () => {
    const stream = new CopyFromStream(fakeSocket());
    stream.capture(Code.CopyInResponse, {}, noop);
    (stream as any)._copyEnded = true;
    expect(() =>
      stream.capture(Code.ErrorResponse, new Error('late'), noop),
    ).not.toThrow();
  });

  it('should report an unexpected message while waiting to start as an error', async () => {
    const stream = new CopyFromStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(Code.NoticeResponse as any, {}, noop);
    // Setting _error alone doesn't reject an in-flight waitStarted() - it
    // only becomes visible once the capture cycle actually ends.
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
    await expect(p).rejects.toThrow(/did not start a COPY FROM STDIN/);
  });

  it('should write a Buffer chunk straight through via sendCopyData', done => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._write(Buffer.from('x'), 'utf8', (err?: Error) => {
      expect(err).toBeUndefined();
      expect(socket.calls).toContain('sendCopyData');
      done();
    });
  });

  it('should convert a non-Buffer chunk before sending it', done => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._write('hello', 'utf8', (err?: Error) => {
      expect(err).toBeUndefined();
      expect(socket.calls).toContain('sendCopyData');
      done();
    });
  });

  it('should short-circuit _write() once already errored', done => {
    const stream = new CopyFromStream(fakeSocket());
    (stream as any)._error = new Error('already broken');
    (stream as any)._write(Buffer.from('x'), 'utf8', (err?: Error) => {
      expect(err?.message).toStrictEqual('already broken');
      done();
    });
  });

  it('should short-circuit _final() once already errored', done => {
    const stream = new CopyFromStream(fakeSocket());
    (stream as any)._error = new Error('already broken');
    (stream as any)._final((err?: Error) => {
      expect(err?.message).toStrictEqual('already broken');
      done();
    });
  });

  it('should send CopyDone from _final() and wait for CommandComplete/ReadyForQuery', done => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._final((err?: Error) => {
      expect(err).toBeUndefined();
      done();
    });
    expect(socket.calls).toContain('sendCopyDone');
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
  });

  it("should send CopyFail with the error's message when destroyed with an error", () => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._destroy(new Error('aborted'), () => undefined);
    expect(socket.calls).toContain('sendCopyFail');
  });

  it('should send a generic CopyFail message when destroyed with no error', () => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._destroy(null, () => undefined);
    expect(socket.calls).toContain('sendCopyFail');
  });

  it('should not re-send CopyFail once the copy already ended', () => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    (stream as any)._copyEnded = true;
    let called = false;
    (stream as any)._destroy(null, () => (called = true));
    expect(called).toStrictEqual(true);
    expect(socket.calls).not.toContain('sendCopyFail');
  });

  it('should reject waitStarted() with a generic message if the copy ends before it ever starts', async () => {
    const stream = new CopyFromStream(fakeSocket());
    const p = stream.waitStarted();
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
    await expect(p).rejects.toThrow(/Copy ended before it started/);
  });

  it('should complete a pending _final() callback with the error once one arrives', done => {
    const socket = fakeSocket();
    const stream = new CopyFromStream(socket);
    stream.capture(Code.CopyInResponse, {}, noop);
    stream.on('error', () => undefined); // the ErrorResponse below also destroys
    (stream as any)._final((err?: Error) => {
      expect(err?.message).toStrictEqual('bad data');
      done();
    });
    stream.capture(Code.ErrorResponse, new Error('bad data'), noop);
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
  });

  it('should destroy the stream on ReadyForQuery when an error is pending with nothing else waiting on it', done => {
    // Not reachable through the public capture flow alone - a real
    // ErrorResponse this late would already have destroyed the stream
    // itself (see the ErrorResponse case above), leaving nothing for
    // _finish()'s own fallback destroy to do. Forced directly to prove
    // that fallback still works correctly on its own terms.
    const stream = new CopyFromStream(fakeSocket());
    (stream as any)._error = new Error('stray error');
    stream.on('error', e => {
      expect(e.message).toStrictEqual('stray error');
      done();
    });
    stream.capture(Code.ReadyForQuery, {}, () => undefined);
  });

  describe('fail()', () => {
    it('should reject a still-pending waitStarted()', async () => {
      const stream = new CopyFromStream(fakeSocket());
      const p = stream.waitStarted();
      stream.fail(new Error('socket died'));
      await expect(p).rejects.toThrow('socket died');
    });

    it('should settle a pending _final() completion callback instead of waitStarted()', done => {
      const socket = fakeSocket();
      const stream = new CopyFromStream(socket);
      stream.capture(Code.CopyInResponse, {}, noop);
      (stream as any)._final((err?: Error) => {
        expect(err?.message).toStrictEqual('socket died');
        done();
      });
      stream.fail(new Error('socket died'));
    });

    it('should destroy the stream when nothing was waiting on it', done => {
      const stream = new CopyFromStream(fakeSocket());
      stream.capture(Code.CopyInResponse, {}, noop);
      stream.on('error', e => {
        expect(e.message).toStrictEqual('socket died');
        done();
      });
      stream.fail(new Error('socket died'));
    });

    it('should be a no-op once already settled', () => {
      const stream = new CopyFromStream(fakeSocket());
      stream.capture(Code.CopyInResponse, {}, noop);
      stream.on('error', () => undefined);
      stream.fail(new Error('first'));
      expect(() => stream.fail(new Error('second'))).not.toThrow();
    });
  });
});
