import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: char', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "char" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "char" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b'], {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "char" array field (text)', async () => {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._char, input, output, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "char" array field (binary)', async () => {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._char, input, output, {
      columnFormat: DataFormat.binary,
    });
  });

  describe('inference', () => {
    // A plain string passed to query() must never be declared "char" to
    // the server. testEncode/testParse above go through BindParam, which
    // asks for the type explicitly and is unaffected.

    it('should let a one-character parameter concatenate', async () => {
      // This answered `operator is not unique: character varying || "char"`
      // while inference reached for 18.
      const r = await conn.query("select 'A' || $1 as v", {
        params: ['B'],
        objectRows: true,
      });
      expect(r.rows?.[0]).toStrictEqual({ v: 'AB' });
      const r2 = await conn.query('select $1 || $2 as v', {
        params: ['A', 'B'],
        objectRows: true,
      });
      expect(r2.rows?.[0]).toStrictEqual({ v: 'AB' });
    });

    it('should not cut an array typed from a one-character first element', async () => {
      // determine() reads value[0] alone, so a leading 'A' used to make
      // the whole array "char"[] and every later element came back cut to
      // one byte - silently, and not even an explicit cast helped, since
      // the cut happened here rather than on the server.
      const input = ['A', 'BB', 'CCC'];
      const r = await conn.query('select $1 as v', {
        params: [input],
        objectRows: true,
      });
      expect(r.rows?.[0]).toStrictEqual({ v: input });
    });
  });

  it('should encode "char" param', async () => {
    await testEncode(conn, DataTypeOIDs.char, ['abc', 'bcd'], ['a', 'b']);
  });

  it('should encode "char" array param', async () => {
    const input = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'fg', 'jkl'],
        [null, 'h', null],
      ],
    ];
    const output = [
      [
        ['a', 'b', null],
        ['c', 'd', null],
      ],
      [
        ['e', 'f', 'j'],
        [null, 'h', null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._char, input, output);
  });
});
