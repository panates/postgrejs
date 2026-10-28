import { expect } from 'expect';
import { BindParam, Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: bytea', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "bytea" field (text)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs.bytea, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse an empty "bytea" field (text)', async () => {
    // Boundary case for the buffer-native hex decoder's zero-length loop
    // (a `\x` marker with zero payload bytes).
    await testParse(conn, DataTypeOIDs.bytea, [''], [Buffer.alloc(0)], {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bytea" field (binary)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs.bytea, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "bytea" array field (text)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs._bytea, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "bytea" array field (binary)', async () => {
    const input = ['ABCDE', 'FGHIJ'];
    const output = [
      Buffer.from([65, 66, 67, 68, 69]),
      Buffer.from([70, 71, 72, 73, 74]),
    ];
    await testParse(conn, DataTypeOIDs._bytea, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "bytea" param', async () => {
    const input = [
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]),
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 71]),
    ];
    await testEncode(conn, DataTypeOIDs.bytea, input, input);
  });

  it('should encode "bytea" array param', async () => {
    const input = [
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]),
      Buffer.from([195, 158, 65, 68, 66, 69, 69, 71]),
    ];
    await testEncode(conn, DataTypeOIDs._bytea, input);
  });

  // joist-orm#2119: a Uint8Array was inferred `json` and an explicit
  // BindParam(17, ...) failed inside the encoder, so a caller holding
  // ordinary byte views had to convert them first.
  describe('a byte view that is not a Buffer', () => {
    const backing = new Uint8Array([42, 0, 128, 255, 43]);
    const view = backing.subarray(1, 4);

    async function hex(sql: string, param: any): Promise<string> {
      const r = await conn.query(sql, {
        params: [param],
        rowDecoder: 'object',
      });
      return r.rows![0].value;
    }

    it('should send a Uint8Array as bytea', async () => {
      const value = await hex("select encode($1::bytea, 'hex') as value", view);
      expect(value).toStrictEqual('0080ff');
    });

    it('should send a Uint8Array named by BindParam', async () => {
      const value = await hex(
        "select encode($1::bytea, 'hex') as value",
        new BindParam(DataTypeOIDs.bytea, view),
      );
      expect(value).toStrictEqual('0080ff');
    });

    it('should send an array of Uint8Array as bytea[]', async () => {
      const value = await hex(
        "select encode(($1::bytea[])[1], 'hex') as value",
        [view],
      );
      expect(value).toStrictEqual('0080ff');
    });
  });
});
