import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "int8" field (text)', async function () {
    await testParse(
      conn(),
      DataTypeOIDs.int8,
      ['9007199254740995', '-9007199254740996'],
      [BigInt('9007199254740995'), -BigInt('9007199254740996')],
      { columnFormat: DataFormat.text },
    );
  });

  it('should parse "int8" field (binary)', async function () {
    await testParse(
      conn(),
      DataTypeOIDs.int8,
      ['9007199254740995', '-9007199254740995'],
      [BigInt('9007199254740995'), -BigInt('9007199254740995')],
      { columnFormat: DataFormat.binary },
    );
  });

  it('should parse "int8" array field (text)', async function () {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [-BigInt('9007199254740999'), BigInt('9007199254740997'), BigInt('9007199254740995')],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._int8, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "int8" array field (binary)', async function () {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [-BigInt('9007199254740999'), BigInt('9007199254740997'), BigInt('9007199254740995')],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._int8, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "int8" param', async function () {
    await testEncode(conn(), DataTypeOIDs.int8, [-BigInt('9007199254740995'), BigInt('9007199254740996')]);
  });

  it('should encode "int8" array param', async function () {
    const input = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [-BigInt('9007199254740999'), BigInt('9007199254740997'), BigInt('9007199254740995')],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    const output = [
      [
        [-BigInt('9007199254740995'), BigInt('9007199254740996'), null],
        [BigInt('9007199254740997'), BigInt('9007199254740998'), null],
      ],
      [
        [-BigInt('9007199254740999'), BigInt('9007199254740997'), BigInt('9007199254740995')],
        [null, BigInt('9007199254740994'), null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._int8, input, output);
  });
}
