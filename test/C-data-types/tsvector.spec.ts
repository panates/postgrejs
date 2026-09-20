import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// Written in the canonical form the server prints, so that parsing and
// encoding can share one list.
const input = [
  "'a' 'b'",
  "'cat':1,3 'dog':2",
  "'a':1A,2B,3C,4",
  "'quo' 'te''':1",
  "'a b':1A,2",
  "'ü':1A",
];

describe('DataType: tsvector', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "tsvector" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.tsvector, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tsvector" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.tsvector, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "tsvector" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._tsvector, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tsvector" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._tsvector, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "tsvector" param', async () => {
    await testEncode(conn, DataTypeOIDs.tsvector, input, input);
  });

  it('should encode "tsvector" array param', async () => {
    await testEncode(conn, DataTypeOIDs._tsvector, input, input);
  });

  it('should let the server order and deduplicate a literal', async () => {
    // Which is the reason there is no binary encoder: the parameter
    // travels as text and comes back meaning exactly what the same
    // literal would have.
    await testEncode(
      conn,
      DataTypeOIDs.tsvector,
      ['b a', 'a:2 a:1', ''],
      ["'a' 'b'", "'a':1,2", ''],
    );
  });

  it('should read the two formats the same, whatever the document', async () => {
    const docs = [
      'The quick brown fox jumps over the lazy dog',
      'PostgreSQL is a powerful, open source object-relational database',
      "It's got apostrophes, hyphen-words and 123 numbers",
    ];
    for (const d of docs) {
      const bin = await conn.query('select to_tsvector($1) f', {
        params: [d],
        columnFormat: DataFormat.binary,
      });
      const txt = await conn.query('select to_tsvector($1) f', {
        params: [d],
        columnFormat: DataFormat.text,
      });
      expect(bin.rows?.[0][0]).toStrictEqual(txt.rows?.[0][0]);
      expect(typeof bin.rows?.[0][0]).toStrictEqual('string');
    }
  });
});
