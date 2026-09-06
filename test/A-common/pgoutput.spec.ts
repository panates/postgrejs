import { expect } from 'expect';
import type { PgOutputRelation } from '../../src/protocol/pgoutput.js';
import { formatLsn, PgOutputDecoder } from '../../src/protocol/pgoutput.js';

const PG_EPOCH_MS = Date.UTC(2000, 0, 1);

function u8(n: number): Buffer {
  return Buffer.from([n]);
}
function ch(c: string): Buffer {
  return Buffer.from([c.charCodeAt(0)]);
}
function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function i32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
}
function cstr(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
}
function lsnBuf(value: bigint): Buffer {
  return Buffer.concat([
    u32(Number(value >> 32n)),
    u32(Number(value & 0xffffffffn)),
  ]);
}
function timeBuf(date: Date): Buffer {
  const micros = BigInt(date.getTime() - PG_EPOCH_MS) * 1000n;
  return Buffer.concat([
    u32(Number(micros >> 32n)),
    u32(Number(micros & 0xffffffffn)),
  ]);
}

function relationMessage(): Buffer {
  return Buffer.concat([
    ch('R'),
    u32(100), // relationId
    cstr('public'),
    cstr('users'),
    ch('d'), // replicaIdentity: default
    u16(2), // column count
    u8(1), // isKey
    cstr('id'),
    u32(23), // int4 oid
    i32(-1),
    u8(0), // not key
    cstr('name'),
    u32(1043), // varchar oid
    i32(-1),
  ]);
}

function tupleBuf(values: (['t', string] | ['n'] | ['u'])[]): Buffer {
  const parts: Buffer[] = [u16(values.length)];
  for (const v of values) {
    if (v[0] === 't') {
      const data = Buffer.from(v[1], 'utf8');
      parts.push(ch('t'), u32(data.length), data);
    } else {
      parts.push(ch(v[0]));
    }
  }
  return Buffer.concat(parts);
}

describe('PgOutputDecoder', () => {
  function withRelation(): PgOutputDecoder {
    const decoder = new PgOutputDecoder();
    decoder.decode(relationMessage());
    return decoder;
  }

  it('should decode a Begin message', () => {
    const decoder = new PgOutputDecoder();
    const finalLsn = 0x12345678n;
    const commitTime = new Date('2024-01-01T00:00:00.000Z');
    const msg = decoder.decode(
      Buffer.concat([ch('B'), lsnBuf(finalLsn), timeBuf(commitTime), u32(777)]),
    );
    expect(msg).toStrictEqual({
      kind: 'begin',
      finalLsn,
      commitTime,
      xid: 777,
    });
  });

  it('should decode a Commit message, ignoring its flags byte', () => {
    const decoder = new PgOutputDecoder();
    const commitLsn = 0x1000n;
    const endLsn = 0x2000n;
    const commitTime = new Date('2024-06-15T12:30:00.000Z');
    const msg = decoder.decode(
      Buffer.concat([
        ch('C'),
        u8(0),
        lsnBuf(commitLsn),
        lsnBuf(endLsn),
        timeBuf(commitTime),
      ]),
    );
    expect(msg).toStrictEqual({
      kind: 'commit',
      commitLsn,
      endLsn,
      commitTime,
    });
  });

  it('should decode an Origin message', () => {
    const decoder = new PgOutputDecoder();
    const commitLsn = 0xabcdn;
    const msg = decoder.decode(
      Buffer.concat([ch('O'), lsnBuf(commitLsn), cstr('my_origin')]),
    );
    expect(msg).toStrictEqual({
      kind: 'origin',
      commitLsn,
      name: 'my_origin',
    });
  });

  it('should decode a Relation message and remember it for later lookups', () => {
    const decoder = new PgOutputDecoder();
    const msg = decoder.decode(relationMessage());
    const expected: PgOutputRelation = {
      relationId: 100,
      schema: 'public',
      name: 'users',
      replicaIdentity: 'd',
      columns: [
        { isKey: true, name: 'id', dataTypeId: 23, typeModifier: -1 },
        { isKey: false, name: 'name', dataTypeId: 1043, typeModifier: -1 },
      ],
    };
    expect(msg).toStrictEqual({ kind: 'relation', relation: expected });
  });

  it('should decode a Type message', () => {
    const decoder = new PgOutputDecoder();
    const msg = decoder.decode(
      Buffer.concat([ch('Y'), u32(16384), cstr('public'), cstr('my_enum')]),
    );
    expect(msg).toStrictEqual({
      kind: 'type',
      dataTypeId: 16384,
      schema: 'public',
      name: 'my_enum',
    });
  });

  it('should decode an Insert message against a previously seen relation', () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('I'),
        u32(100),
        ch('N'),
        tupleBuf([
          ['t', '1'],
          ['t', 'ada'],
        ]),
      ]),
    );
    expect(msg.kind).toStrictEqual('insert');
    if (msg.kind === 'insert') {
      expect(msg.row).toStrictEqual({ id: '1', name: 'ada' });
    }
  });

  it('should decode an Update message with no old row (no replica identity data)', () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('U'),
        u32(100),
        ch('N'),
        tupleBuf([
          ['t', '1'],
          ['t', 'updated'],
        ]),
      ]),
    );
    expect(msg).toStrictEqual({
      kind: 'update',
      relation: (decoder as any)._relations.get(100),
      row: { id: '1', name: 'updated' },
      oldRow: undefined,
    });
  });

  it("should decode an Update message carrying the old row's key columns ('K')", () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('U'),
        u32(100),
        ch('K'),
        tupleBuf([['t', '1'], ['n']]),
        ch('N'),
        tupleBuf([
          ['t', '1'],
          ['t', 'updated'],
        ]),
      ]),
    );
    expect(msg.kind).toStrictEqual('update');
    if (msg.kind === 'update') {
      expect(msg.oldRow).toStrictEqual({ id: '1', name: null });
      expect(msg.row).toStrictEqual({ id: '1', name: 'updated' });
    }
  });

  it("should decode an Update message carrying the whole old row ('O')", () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('U'),
        u32(100),
        ch('O'),
        tupleBuf([
          ['t', '1'],
          ['t', 'before'],
        ]),
        ch('N'),
        tupleBuf([
          ['t', '1'],
          ['t', 'after'],
        ]),
      ]),
    );
    expect(msg.kind).toStrictEqual('update');
    if (msg.kind === 'update') {
      expect(msg.oldRow).toStrictEqual({ id: '1', name: 'before' });
      expect(msg.row).toStrictEqual({ id: '1', name: 'after' });
    }
  });

  it('should decode a Delete message', () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('D'),
        u32(100),
        ch('K'),
        tupleBuf([['t', '1'], ['n']]),
      ]),
    );
    expect(msg.kind).toStrictEqual('delete');
    if (msg.kind === 'delete') {
      expect(msg.oldRow).toStrictEqual({ id: '1', name: null });
    }
  });

  it('should leave an unchanged, TOASTed column out of the decoded row entirely', () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([
        ch('I'),
        u32(100),
        ch('N'),
        tupleBuf([['t', '1'], ['u']]),
      ]),
    );
    expect(msg.kind).toStrictEqual('insert');
    if (msg.kind === 'insert') {
      expect(msg.row).toStrictEqual({ id: '1' });
      expect('name' in msg.row).toStrictEqual(false);
    }
  });

  it('should decode a Truncate message covering multiple relations', () => {
    const decoder = withRelation();
    const msg = decoder.decode(
      Buffer.concat([ch('T'), u32(1), u8(0), u32(100)]),
    );
    expect(msg.kind).toStrictEqual('truncate');
    if (msg.kind === 'truncate') {
      expect(msg.relations.length).toStrictEqual(1);
      expect(msg.relations[0].relationId).toStrictEqual(100);
    }
  });

  it('should decode a logical decoding Message', () => {
    const decoder = new PgOutputDecoder();
    const lsn = 0x99n;
    const content = Buffer.from('payload');
    const msg = decoder.decode(
      Buffer.concat([
        ch('M'),
        u8(1),
        lsnBuf(lsn),
        cstr('my-prefix'),
        u32(content.length),
        content,
      ]),
    );
    expect(msg).toStrictEqual({
      kind: 'message',
      prefix: 'my-prefix',
      lsn,
      content,
    });
  });

  it('should report an unrecognized message code instead of throwing', () => {
    const decoder = new PgOutputDecoder();
    const msg = decoder.decode(ch('Z'));
    expect(msg).toStrictEqual({ kind: 'unknown', code: 'Z' });
  });

  it('should throw when a change arrives for a relation never described', () => {
    const decoder = new PgOutputDecoder();
    expect(() =>
      decoder.decode(Buffer.concat([ch('I'), u32(999), ch('N'), u16(0)])),
    ).toThrow(/relation 999 before its description/);
  });
});

describe('formatLsn()', () => {
  it('should format an LSN as PostgreSQL prints it, hi/lo hex joined by "/"', () => {
    expect(formatLsn(0x16b3748n)).toStrictEqual('0/16B3748');
    expect(formatLsn(0x1_00000000n + 0xffn)).toStrictEqual('1/FF');
  });
});
