import { expect } from 'expect';
import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

// The canonical spellings, spaces inside the parentheses included.
const input = [
  "'a' & 'b'",
  "'a' | 'b' & 'c'",
  "( 'a' | 'b' ) & 'c'",
  "!'a'",
  "'a' <-> 'b'",
  "'a' <3> 'b'",
  "'a' <-> ( 'b' <-> 'c' )",
  "'d':*AB",
];

/** A deterministic generator, so a failure is reproducible. */
function mulberry(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('DataType: tsquery', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "tsquery" field (text)', async () => {
    await testParse(conn, DataTypeOIDs.tsquery, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tsquery" field (binary)', async () => {
    await testParse(conn, DataTypeOIDs.tsquery, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should parse "tsquery" array field (text)', async () => {
    await testParse(conn, DataTypeOIDs._tsquery, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "tsquery" array field (binary)', async () => {
    await testParse(conn, DataTypeOIDs._tsquery, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "tsquery" param', async () => {
    await testEncode(conn, DataTypeOIDs.tsquery, input, input);
  });

  it('should encode "tsquery" array param', async () => {
    await testEncode(conn, DataTypeOIDs._tsquery, input, input);
  });

  it('should read a query of nothing but stop words as empty', async () => {
    const r = await conn.query("select to_tsquery('english', 'the') f", {
      columnFormat: DataFormat.binary,
    });
    expect(r.rows?.[0][0]).toStrictEqual('');
  });

  it('should print any tree the way the server prints it', async () => {
    // Where the parentheses go is the whole of this decoder, and it is
    // not something a handful of examples pins down - so the trees are
    // generated. This is what caught the prefix star being printed after
    // the weight letters rather than before them.
    const atoms = ['a', 'b:AB', 'c:*', 'd:AB*', 'e:D'];
    const ops = ['&', '|', '<->', '<3>'];
    const rnd = mulberry(20260920);
    const build = (depth: number): string => {
      if (depth === 0) return atoms[Math.floor(rnd() * atoms.length)];
      if (rnd() < 0.15) return '!' + build(depth - 1);
      const op = ops[Math.floor(rnd() * ops.length)];
      return `(${build(depth - 1)} ${op} ${build(depth - 1)})`;
    };
    const queries = new Set<string>();
    while (queries.size < 150) queries.add(build(1 + Math.floor(rnd() * 3)));
    for (const q of queries) {
      const bin = await conn.query('select $1::tsquery f', {
        params: [q],
        columnFormat: DataFormat.binary,
      });
      const txt = await conn.query('select $1::tsquery f', {
        params: [q],
        columnFormat: DataFormat.text,
      });
      expect(`${q} -> ${bin.rows?.[0][0]}`).toStrictEqual(
        `${q} -> ${txt.rows?.[0][0]}`,
      );
    }
  });
});
