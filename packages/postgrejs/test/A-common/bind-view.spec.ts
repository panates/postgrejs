import { expect } from 'expect';
import { GlobalTypeMap } from '../../src/data-type-map.js';
import { Frontend } from '../../src/protocol/frontend.js';
import { PgSocket } from '../../src/protocol/pg-socket.js';

/**
 * The Bind carries the caller's data; the other messages in a statement
 * are a few dozen bytes. It is therefore built last and flushed as a
 * view into the shared send buffer rather than a copy of it, and the
 * concat that assembles the statement reads the view before anything
 * can overwrite it.
 *
 * Two things have to hold for that to be safe, and both are pinned here:
 * the view must carry the same bytes a copy would, and it must never
 * reach the socket, which does not copy synchronously.
 */
describe('Bind as a view of the send buffer', () => {
  const bindArgs = {
    typeMap: GlobalTypeMap,
    statement: 'S_1',
    queryOptions: {},
    params: [1, 'abc', Buffer.alloc(4096, 7)],
    paramTypes: undefined,
  };

  it('should produce the same bytes as a copy', () => {
    const frontend = new Frontend();
    // Copied straight away: the view is only valid until the next write.
    const view = Buffer.from(frontend.getBindMessage(bindArgs as any, false));
    const copy = frontend.getBindMessage(bindArgs as any);
    expect(view).toStrictEqual(copy);
  });

  it('should be invalidated by the next message, which is why it is built last', () => {
    // Not a wish but the reason for the ordering: taking a view and then
    // writing another message into the same buffer changes what the view
    // reads. Nothing in the send path does this - the concat runs first.
    const frontend = new Frontend();
    const view = frontend.getBindMessage(bindArgs as any, false);
    const before = Buffer.from(view);
    frontend.getParseMessage({ sql: 'select ' + 'x'.repeat(8192) });
    expect(Buffer.from(view).equals(before)).toStrictEqual(false);
  });

  it('should hand the socket one buffer, never the view', () => {
    const socket: any = new PgSocket({});
    const seen: any[] = [];
    socket._send = (data: Buffer | Buffer[]) => {
      seen.push(data);
      return true;
    };
    void socket.sendBindExecuteMessages(
      { bind: bindArgs, execute: { fetchCount: 100 } },
      () => undefined,
    );
    expect(seen.length).toStrictEqual(1);
    expect(Array.isArray(seen[0])).toStrictEqual(false);
    expect(Buffer.isBuffer(seen[0])).toStrictEqual(true);
    // A Bind of a 4KB parameter plus Execute and Sync: comfortably more
    // than the Bind alone, so what arrived is the assembled statement.
    expect(seen[0].length).toBeGreaterThan(4096);
    expect(String.fromCharCode(seen[0].readUInt8(0))).toStrictEqual('B');
  });
});
