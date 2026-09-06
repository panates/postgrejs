import { expect } from 'expect';
import { LogicalReplication } from '../../src/connection/logical-replication.js';
import { Protocol } from '../../src/protocol/protocol.js';

const Code = Protocol.BackendMessageCode;

function fakeIntlCon(state = 1) {
  const calls: string[] = [];
  return {
    state,
    socket: {
      pause: () => calls.push('pause'),
      resume: () => calls.push('resume'),
      sendCopyData: () => calls.push('sendCopyData'),
    },
    calls,
    execute: async () => {
      calls.push('execute');
    },
    close: async () => {
      calls.push('close');
    },
  } as any;
}

/** A pgoutput Relation message the decoder needs before any row change. */
function relationMessage(id: number, schema: string, name: string): Buffer {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const cstr = (s: string) => Buffer.concat([Buffer.from(s), Buffer.from([0])]);
  return Buffer.concat([
    Buffer.from('R'),
    u32(id),
    cstr(schema),
    cstr(name),
    Buffer.from('d'),
    Buffer.from([0, 0]), // 0 columns - enough to build a Change from
  ]);
}

/** A pgoutput Insert message referencing a previously-seen relation. */
function insertMessage(relationId: number): Buffer {
  const u32 = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  return Buffer.concat([
    Buffer.from('I'),
    u32(relationId),
    Buffer.from('N'),
    Buffer.from([0, 0]), // 0 columns
  ]);
}

/** Wraps a pgoutput message as the XLogData ('w') CopyData payload _handleCopyData() expects. */
function xlogData(message: Buffer, lsn = 1n): Buffer {
  const walStart = Buffer.alloc(8);
  walStart.writeBigUInt64BE(lsn);
  const sendTime = Buffer.alloc(8);
  sendTime.writeBigUInt64BE(0n);
  return Buffer.concat([
    Buffer.from('w'),
    walStart,
    walStart,
    sendTime,
    message,
  ]);
}

describe('LogicalReplication', () => {
  it('should refuse to construct without a publication', () => {
    expect(() => new LogicalReplication({} as any)).toThrow(
      /requires a publication/,
    );
  });

  it('should default the slot name to a random one when none is given', () => {
    const a = new LogicalReplication({ publication: 'p' });
    const b = new LogicalReplication({ publication: 'p' });
    expect(a.slot).toMatch(/^postgrejs_/);
    expect(a.slot).not.toStrictEqual(b.slot);
  });

  it('should use the given slot name verbatim', () => {
    const lr = new LogicalReplication({ publication: 'p', slot: 'my_slot' });
    expect(lr.slot).toStrictEqual('my_slot');
  });

  it('should report confirmedLsn as a formatted LSN', () => {
    const lr = new LogicalReplication({ publication: 'p' });
    expect(lr.confirmedLsn).toStrictEqual('0/0');
  });

  describe('ack()', () => {
    it('should advance confirmedLsn to pendingLsn and send a status update', async () => {
      const intlCon = fakeIntlCon();
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._intlCon = intlCon;
      (lr as any)._pendingLsn = 123n;
      await lr.ack();
      expect(lr.confirmedLsn).toStrictEqual(formatted(123n));
      expect(intlCon.calls).toContain('sendCopyData');
    });

    function formatted(lsn: bigint): string {
      return `${(lsn >> 32n).toString(16).toUpperCase()}/${(lsn & 0xffffffffn).toString(16).toUpperCase()}`;
    }
  });

  describe('_sendStatus()', () => {
    it('should do nothing when there is no connection yet', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      expect(() => (lr as any)._sendStatus(false)).not.toThrow();
    });

    it('should mark the reply-requested byte when asked', () => {
      const intlCon = fakeIntlCon();
      let sent: Buffer | undefined;
      intlCon.socket.sendCopyData = (buf: Buffer) => (sent = buf);
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._intlCon = intlCon;
      (lr as any)._sendStatus(true);
      expect(sent?.[33]).toStrictEqual(1);
      expect(sent?.length).toStrictEqual(34);
    });
  });

  describe('_capture (CaptureCallback)', () => {
    it('should record a server error and let the async iterator throw it', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      const err = new Error('replication failed');
      (lr as any)._capture(Code.ErrorResponse, err, () => undefined);
      expect((lr as any)._error).toBe(err);
    });

    it('should finish and wake on ReadyForQuery, calling done()', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      let doneCalled = false;
      (lr as any)._capture(Code.ReadyForQuery, {}, () => (doneCalled = true));
      expect((lr as any)._finished).toStrictEqual(true);
      expect(doneCalled).toStrictEqual(true);
    });

    it('should ignore CopyBothResponse and any other unrecognized code', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      expect(() =>
        (lr as any)._capture(Code.CopyBothResponse, {}, () => undefined),
      ).not.toThrow();
      expect(() =>
        (lr as any)._capture(Code.NoticeResponse, {}, () => undefined),
      ).not.toThrow();
    });
  });

  describe('_handleCopyData()', () => {
    it("should send a status update on a primary keepalive ('k') asking for a reply", () => {
      const intlCon = fakeIntlCon();
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._intlCon = intlCon;
      const msg = Buffer.alloc(18);
      msg[0] = 0x6b; // 'k'
      msg.writeBigUInt64BE(555n, 1);
      msg[17] = 1; // reply requested
      (lr as any)._handleCopyData(msg);
      expect((lr as any)._receivedLsn).toStrictEqual(555n);
      expect(intlCon.calls).toContain('sendCopyData');
    });

    it("should not reply to a keepalive that doesn't ask for one", () => {
      const intlCon = fakeIntlCon();
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._intlCon = intlCon;
      const msg = Buffer.alloc(18);
      msg[0] = 0x6b;
      msg[17] = 0;
      (lr as any)._handleCopyData(msg);
      expect(intlCon.calls).not.toContain('sendCopyData');
    });

    it('should ignore any CopyData kind other than keepalive/XLogData', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      const msg = Buffer.from('?unexpected');
      expect(() => (lr as any)._handleCopyData(msg)).not.toThrow();
      expect((lr as any)._queue.length).toStrictEqual(0);
    });

    it('should decode XLogData, queue the change, and pause once backlogged', () => {
      const intlCon = fakeIntlCon();
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._intlCon = intlCon;
      (lr as any)._handleCopyData(xlogData(relationMessage(1, 'public', 't')));
      (lr as any)._handleCopyData(xlogData(insertMessage(1)));
      (lr as any)._handleCopyData(xlogData(insertMessage(1)));
      expect((lr as any)._queue.length).toStrictEqual(2);
      expect(intlCon.calls).toContain('pause');
    });

    it('should not queue anything for a bookkeeping-only message (commit)', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      const commit = Buffer.concat([
        Buffer.from('C'),
        Buffer.alloc(1 + 8 + 8 + 8),
      ]);
      (lr as any)._handleCopyData(xlogData(commit));
      expect((lr as any)._queue.length).toStrictEqual(0);
    });
  });

  describe('_accepts() filtering', () => {
    function change(overrides: Partial<any> = {}) {
      return {
        command: 'insert',
        table: 'public.t',
        relation: { name: 't' },
        lsn: 1n,
        ...overrides,
      };
    }

    it('should accept anything when no filters are configured', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      expect((lr as any)._accepts(change())).toStrictEqual(true);
    });

    it('should reject a command not in the configured list', () => {
      const lr = new LogicalReplication({
        publication: 'p',
        commands: ['delete'],
      });
      expect((lr as any)._accepts(change())).toStrictEqual(false);
    });

    it('should reject a table not in the configured list', () => {
      const lr = new LogicalReplication({
        publication: 'p',
        tables: ['other'],
      });
      expect((lr as any)._accepts(change())).toStrictEqual(false);
    });

    it('should accept a table matched by its bare (unqualified) name', () => {
      const lr = new LogicalReplication({ publication: 'p', tables: ['t'] });
      expect((lr as any)._accepts(change())).toStrictEqual(true);
    });

    it('should defer to a custom filter function', () => {
      const lr = new LogicalReplication({
        publication: 'p',
        filter: () => false,
      });
      expect((lr as any)._accepts(change())).toStrictEqual(false);
    });
  });

  describe('_fail()', () => {
    it('should record the error, finish, and wake a pending iterator', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      let woke = false;
      (lr as any)._waiting = () => (woke = true);
      (lr as any)._fail(new Error('socket died'));
      expect((lr as any)._error?.message).toStrictEqual('socket died');
      expect((lr as any)._finished).toStrictEqual(true);
      expect(woke).toStrictEqual(true);
    });

    it('should keep the first error rather than overwrite it', () => {
      const lr = new LogicalReplication({ publication: 'p' });
      (lr as any)._fail(new Error('first'));
      (lr as any)._fail(new Error('second'));
      expect((lr as any)._error.message).toStrictEqual('first');
    });
  });
});
