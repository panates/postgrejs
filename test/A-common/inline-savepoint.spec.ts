import { expect } from 'expect';
import { GlobalTypeMap } from '../../src/data-type-map.js';
import { PgSocket } from '../../src/protocol/pg-socket.js';

/**
 * The SAVEPOINT/RELEASE pair `rollbackOnError` needs travels in the same
 * write - and the same Sync - as the statement it protects, instead of
 * costing a round trip each. These assert the wire shape directly against a
 * stubbed `_send`, which is the whole of what the change produces; whether
 * the server is happy with that shape is covered by the integration tests.
 */
describe('Inline savepoint framing', () => {
  function capture(args: any): string {
    const socket: any = new PgSocket({});
    let sent: Buffer[] = [];
    socket._send = (data: Buffer | Buffer[]) => {
      sent = Array.isArray(data) ? data : [data];
      return true;
    };
    // The returned promise stays pending: nothing answers a stubbed socket,
    // and only what was written matters here.
    void socket.sendBindExecuteMessages(args, () => undefined);
    return sent.map(b => String.fromCharCode(b.readUInt8(0))).join('');
  }

  const baseArgs = {
    bind: { typeMap: GlobalTypeMap, statement: 'S_1', queryOptions: {} },
    execute: { fetchCount: 100 },
  };

  it('should send Bind+Execute+Sync unchanged when no savepoint is given', () => {
    expect(capture(baseArgs)).toStrictEqual('BES');
  });

  it('should wrap the statement in Parse/Bind/Execute pairs under one Sync', () => {
    const codes = capture({
      ...baseArgs,
      before: 'SAVEPOINT SP_1',
      after: 'RELEASE SP_1',
    });
    // Savepoint, the caller's own Bind/Execute, release, then a single Sync
    // for all three statements.
    expect(codes).toStrictEqual('PBEBEPBES');
  });

  it('should accept a leading statement on its own', () => {
    expect(capture({ ...baseArgs, before: 'SAVEPOINT SP_1' })).toStrictEqual(
      'PBEBES',
    );
  });

  it('should accept a trailing statement on its own', () => {
    expect(capture({ ...baseArgs, after: 'RELEASE SP_1' })).toStrictEqual(
      'BEPBES',
    );
  });

  it('should put the given SQL in the Parse message', () => {
    const socket: any = new PgSocket({});
    let sent: Buffer[] = [];
    socket._send = (data: Buffer | Buffer[]) => {
      sent = Array.isArray(data) ? data : [data];
      return true;
    };
    void socket.sendBindExecuteMessages(
      { ...baseArgs, before: 'SAVEPOINT SP_42', after: 'RELEASE SP_42' },
      () => undefined,
    );
    expect(sent[0].toString('utf8')).toContain('SAVEPOINT SP_42');
    expect(sent[5].toString('utf8')).toContain('RELEASE SP_42');
  });

  it('should name no statement or portal for the wrapping messages', () => {
    const socket: any = new PgSocket({});
    let sent: Buffer[] = [];
    socket._send = (data: Buffer | Buffer[]) => {
      sent = Array.isArray(data) ? data : [data];
      return true;
    };
    void socket.sendBindExecuteMessages(
      { ...baseArgs, before: 'SAVEPOINT SP_1' },
      () => undefined,
    );
    // Parse: int32 length, then the statement name as a C string - empty,
    // so the very next byte after the header is the terminator. Same for
    // the Bind that follows it, whose portal and statement names are both
    // empty. Naming either would collide with the caller's own unnamed
    // portal instead of being discarded harmlessly before it.
    expect(sent[0].readUInt8(5)).toStrictEqual(0);
    expect(sent[1].readUInt8(5)).toStrictEqual(0);
    expect(sent[1].readUInt8(6)).toStrictEqual(0);
  });
});
