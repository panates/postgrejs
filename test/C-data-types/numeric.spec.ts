import { expect } from 'expect';
import {
  BindParam,
  Connection,
  DataFormat,
  DataTypeMap,
  DataTypeOIDs,
  GlobalTypeMap,
  Numeric,
} from 'postgrejs';
import { numberBytesToString } from '../../src/data-types/numeric-type.js';
import { testEncode, testParse } from './_testers.js';

const NUMERIC_NAN = 0xc000;
const NUMERIC_PINF = 0xd000;
const NUMERIC_NINF = 0xf000;

/**
 * numeric, but handing back the decimal string the decoder builds from
 * the wire instead of the float it turns that string into.
 *
 * Reading the number would compare two doubles and say nothing about the
 * digits; this compares what was actually reconstructed from the
 * base-10000 groups against what the server printed for the same value,
 * which is the only thing that can catch a wrong digit.
 */
const StringNumeric: any = {
  ...GlobalTypeMap.get(DataTypeOIDs.numeric),
  decodeBinary(v: Buffer, offset = 0) {
    const len = v.readInt16BE(offset);
    const weight = v.readInt16BE(offset + 2);
    const sign = v.readUInt16BE(offset + 4);
    const scale = v.readInt16BE(offset + 6);
    if (sign === NUMERIC_NAN) return 'NaN';
    if (sign === NUMERIC_PINF) return 'Infinity';
    if (sign === NUMERIC_NINF) return '-Infinity';
    const digits: number[] = [];
    for (let i = 0; i < len; i++) digits[i] = v.readInt16BE(offset + 8 + i * 2);
    return numberBytesToString(digits, scale, weight, sign);
  },
};
const stringNumericMap = new DataTypeMap(GlobalTypeMap);
stringNumericMap.register(StringNumeric);

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

describe('DataType: numeric', () => {
  const conn = new Connection();
  let supportsInfinity = false;
  before(async () => {
    await conn.connect();
    // numeric Infinity/-Infinity were added in PostgreSQL 14 - NaN alone
    // has always been a valid numeric value.
    const serverVersion = conn.sessionParameters.server_version;
    supportsInfinity = parseInt(serverVersion, 10) >= 14;
  });
  after(() => conn.close(0));

  it('should parse "numeric" field (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.numeric,
      ['321.2345', '-1232.567'],
      [321.2345, -1232.567],
      {
        columnFormat: DataFormat.text,
      },
    );
  });

  it('should parse "numeric" field (binary)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.numeric,
      ['12345.123456789', '-1232.567'],
      [12345.123456789, -1232.567],
      {
        columnFormat: DataFormat.binary,
      },
    );
  });

  it('should parse "NaN"/"Infinity"/"-Infinity" (text)', async function () {
    if (!supportsInfinity) return this.skip();
    await testParse(
      conn,
      DataTypeOIDs.numeric,
      ['NaN', 'Infinity', '-Infinity'],
      [NaN, Infinity, -Infinity],
      {
        columnFormat: DataFormat.text,
      },
    );
  });

  it('should parse "NaN"/"Infinity"/"-Infinity" (binary)', async function () {
    if (!supportsInfinity) return this.skip();
    // Regression test: the sign field was read as a signed int16, so the
    // NaN/+Infinity/-Infinity sign bitmasks (0xC000/0xD000/0xF000, all with
    // the top bit set) never matched their unsigned constants and silently
    // decoded as 0.
    await testParse(
      conn,
      DataTypeOIDs.numeric,
      ['NaN', 'Infinity', '-Infinity'],
      [NaN, Infinity, -Infinity],
      {
        columnFormat: DataFormat.binary,
      },
    );
  });

  it('should parse "numeric" array field (text)', async () => {
    const input = [
      [
        [-1.2, 2.5, null],
        [1.2, 2.5, null],
      ],
      [
        [-10.6, 4.5, 0],
        [null, 6.5, null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._numeric, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "numeric" array field (binary)', async () => {
    const input = [
      [
        [-1.25, 5.25, null],
        [0.8, 150.4, null],
      ],
      [
        [-10.6, 500.4, 0],
        [null, 2.5, null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._numeric, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "numeric" param', async () => {
    await testEncode(conn, DataTypeOIDs.numeric, [-1.2345, 1232.567]);
  });

  it('should encode "numeric" array param', async () => {
    const input = [
      [
        [-1.25, 5.25],
        [0.9, 150.43],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53],
      ],
    ];
    const output = [
      [
        [-1.25, 5.25, null],
        [0.9, 150.43, null],
      ],
      [
        [-10.6, 500.42, 0],
        [null, 2.53, null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._numeric, input, output);
  });

  it('should encode "numeric" in binary, keeping precision a float cannot', async () => {
    // The whole point of numeric: given as text, it has to survive the
    // trip without going through a double on the way.
    for (const v of [
      '12345678901234567890.123456789',
      '-98765432109876543210',
      '0.0001',
      '10000',
      '0',
    ]) {
      const r = await conn.query('select $1::numeric::text as t', {
        params: [new BindParam(DataTypeOIDs.numeric, v)],
      });
      expect(r.rows?.[0][0]).toStrictEqual(v);
    }
  });

  it('should encode "numeric" NaN and infinities in binary', async function () {
    if (!supportsInfinity) return this.skip();
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = await conn.query('select $1::numeric::text as t', {
        params: [new BindParam(DataTypeOIDs.numeric, v)],
      });
      expect(r.rows?.[0][0]).toStrictEqual(String(v));
    }
  });

  it('should rebuild the exact digits the server printed', async () => {
    // The binary form is base-10000 groups; turning them back into
    // decimal digits is the whole of decodeBinary, and a handful of
    // examples does not pin it down - so the values are generated, up to
    // 22 digits either side of the point, and compared against the same
    // parameter selected as ::text in a second query.
    const rnd = mulberry(20260920);
    const values: string[] = [
      '0',
      '1',
      '-1',
      '0.1',
      '19.99',
      '100.00',
      '0.00001',
      '10000',
      '99999999',
      '0.5',
      '1000.0001',
      '0.0001',
      '123456789012345678901234567890.123456',
      'NaN',
    ];
    for (let i = 0; i < 600; i++) {
      const ip = Math.floor(rnd() * 22);
      const fp = Math.floor(rnd() * 22);
      let v = '';
      for (let j = 0; j < ip; j++) v += Math.floor(rnd() * 10);
      v = v.replace(/^0+/, '') || '0';
      if (fp) {
        let f = '';
        for (let j = 0; j < fp; j++) f += Math.floor(rnd() * 10);
        v += '.' + f;
      }
      values.push(rnd() < 0.5 ? v : '-' + v);
    }
    for (let k = 0; k < values.length; k += 150) {
      const chunk = values.slice(k, k + 150);
      const params = chunk.map(v => new BindParam(DataTypeOIDs.numeric, v));
      const built = await conn.query(
        'select ' + chunk.map((_, i) => `$${i + 1}::numeric`).join(','),
        {
          params,
          columnFormat: DataFormat.binary,
          typeMap: stringNumericMap,
        },
      );
      const printed = await conn.query(
        'select ' + chunk.map((_, i) => `($${i + 1}::numeric)::text`).join(','),
        { params },
      );
      for (let i = 0; i < chunk.length; i++)
        expect(`${chunk[i]} -> ${built.rows?.[0][i]}`).toStrictEqual(
          `${chunk[i]} -> ${printed.rows?.[0][i]}`,
        );
    }
  });

  it('should keep the sign and the scale padding a column asks for', async () => {
    // A declared scale pads the value on the wire - numeric(40,6)
    // holding 19.99 arrives as 19.990000 - and the digits have to come
    // back the same way.
    await conn.execute(
      'drop table if exists t_num_scale;' +
        ' create table t_num_scale(a numeric(40,6), b numeric(40,6))',
    );
    await conn.execute("insert into t_num_scale values ('19.99', '-0.5')");
    const built = await conn.query('select a, b from t_num_scale', {
      columnFormat: DataFormat.binary,
      typeMap: stringNumericMap,
    });
    const printed = await conn.query(
      'select a::text, b::text from t_num_scale',
    );
    expect(built.rows?.[0]).toStrictEqual(printed.rows?.[0]);
    expect(built.rows?.[0][0]).toStrictEqual('19.990000');
    await conn.execute('drop table t_num_scale');
  });

  it('should read back exactly what was written, against the same query', async () => {
    // The assertion cannot drift with the server: the value and its
    // ::text rendering come from one statement, so the comparison is
    // always against what this server would have printed.
    await conn.execute(
      'drop table if exists t_num_exact;' +
        ' create table t_num_exact(a numeric)',
    );
    const values = [
      '123456789012345678901234567890.123456',
      '12345678901234567.89',
      '9007199254740993',
      '-99999999999999999999.99',
      '0.00000000000000001',
      '19.99',
      '0.1',
    ];
    await conn.query(
      'insert into t_num_exact values' +
        values.map((_, i) => `($${i + 1})`).join(','),
      { params: values.map(v => new BindParam(DataTypeOIDs.numeric, v)) },
    );
    for (const format of [DataFormat.binary, DataFormat.text]) {
      const r = await conn.query('select a, a::text from t_num_exact', {
        columnFormat: format,
        objectRows: false,
      });
      for (const row of r.rows!) expect(String(row[0])).toStrictEqual(row[1]);
    }
    await conn.execute('drop table t_num_exact');
  });

  it('should write a decoded value straight back with no BindParam', async () => {
    // What a bare string could not do: determine() types one as varchar
    // and the server refuses it for a numeric column. A Numeric names
    // its own type, so read-modify-write works.
    await conn.execute(
      'drop table if exists t_num_back; create table t_num_back(a numeric)',
    );
    const v = '123456789012345678901234567890.123456';
    const read = await conn.query('select $1::numeric f', {
      params: [new BindParam(DataTypeOIDs.numeric, v)],
      columnFormat: DataFormat.binary,
    });
    const decoded = read.rows?.[0][0];
    expect(decoded).toBeInstanceOf(Numeric);
    await conn.query('insert into t_num_back values($1)', {
      params: [decoded],
    });
    const back = await conn.query('select a::text from t_num_back');
    expect(back.rows?.[0][0]).toStrictEqual(v);
    await conn.execute('drop table t_num_back');
  });

  it('should leave a value a double carries as a number', async () => {
    const r = await conn.query(
      "select 19.99::numeric a, 0.1::numeric b, '19.990000'::numeric(40,6) c," +
        ' 0::numeric d, (-1)::numeric e',
      { columnFormat: DataFormat.binary, objectRows: true },
    );
    const row = r.rows?.[0] as any;
    expect(row).toStrictEqual({ a: 19.99, b: 0.1, c: 19.99, d: 0, e: -1 });
  });

  it('should widen inside an array too', async () => {
    // _numeric inherits the element decoder by spread, so the array path
    // is the same code - checked here rather than assumed.
    const r = await conn.query(
      "select array['19.99','12345678901234567.89']::numeric[] f",
      { columnFormat: DataFormat.binary },
    );
    const arr = r.rows?.[0][0] as any[];
    expect(arr[0]).toStrictEqual(19.99);
    expect(arr[1]).toBeInstanceOf(Numeric);
    expect(String(arr[1])).toStrictEqual('12345678901234567.89');
  });

  it('should still hand the raw text back under fetchAsString', async () => {
    // A separate path that never reaches the decoder: the column is
    // asked for as text and the bytes come back as they are, so every
    // value is a string, exact ones included.
    const r = await conn.query(
      "select 19.99::numeric a, '12345678901234567.89'::numeric b",
      { fetchAsString: [DataTypeOIDs.numeric], objectRows: true },
    );
    expect(r.rows?.[0]).toStrictEqual({
      a: '19.99',
      b: '12345678901234567.89',
    });
  });
});
