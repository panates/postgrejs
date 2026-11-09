import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

describe('DataType: int8', () => {
  const conn = new Connection();
  before(() => conn.connect());
  after(() => conn.close(0));

  it('should parse "int8" field (text)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.int8,
      ['9007199254740995', '-9007199254740996'],
      [BigInt('9007199254740995'), -BigInt('9007199254740996')],
      { columnFormat: DataFormat.text },
    );
  });

  it('should parse "int8" field (text) at the 15/16-digit boundary', async () => {
    // Every other (text) test above uses 16-digit values above
    // Number.MAX_SAFE_INTEGER, so they stay bigint - this exercises the
    // <=15-digit fast path (decodeTextBuffer's fastParseIntBuffer branch)
    // and the adjacent 16-digit-but-still-safe case, both of which should
    // decode to a plain number instead.
    await testParse(
      conn,
      DataTypeOIDs.int8,
      [
        '999999999999999',
        '-999999999999999',
        '1000000000000000',
        '-1000000000000000',
      ],
      [999999999999999, -999999999999999, 1000000000000000, -1000000000000000],
      { columnFormat: DataFormat.text },
    );
  });

  it('should parse "int8" field (binary)', async () => {
    await testParse(
      conn,
      DataTypeOIDs.int8,
      ['9007199254740995', '-9007199254740995'],
      [BigInt('9007199254740995'), -BigInt('9007199254740995')],
      { columnFormat: DataFormat.binary },
    );
  });

  it('should parse "int8" array field (text)', async () => {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [
          -BigInt('9007199254740999'),
          BigInt('9007199254740997'),
          BigInt('9007199254740995'),
        ],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._int8, input, input, {
      columnFormat: DataFormat.text,
    });
  });

  it('should parse "int8" array field (binary)', async () => {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [
          -BigInt('9007199254740999'),
          BigInt('9007199254740997'),
          BigInt('9007199254740995'),
        ],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testParse(conn, DataTypeOIDs._int8, input, input, {
      columnFormat: DataFormat.binary,
    });
  });

  it('should encode "int8" param', async () => {
    await testEncode(conn, DataTypeOIDs.int8, [
      -BigInt('9007199254740995'),
      BigInt('9007199254740996'),
    ]);
  });

  it('should encode "int8" array param', async () => {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [
          -BigInt('9007199254740999'),
          BigInt('9007199254740997'),
          BigInt('9007199254740995'),
        ],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    const output = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [
          -BigInt('9007199254740999'),
          BigInt('9007199254740997'),
          BigInt('9007199254740995'),
        ],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testEncode(conn, DataTypeOIDs._int8, input, output);
  });
});
