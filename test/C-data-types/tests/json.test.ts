import { Connection, DataFormat, DataTypeOIDs } from 'postgrejs';
import { testEncode, testParse } from './_testers.js';

const toStringArray = arr => arr.map(o => (o ? JSON.stringify(o) : null));

export function createTests(conn: () => Connection) {
  it('should parse "json" field (text)', async () => {
    const output = [{ a: 1 }, { a: 2 }];
    const input = toStringArray(output);
    await testParse(conn(), DataTypeOIDs.json, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "json" field (binary)', async () => {
    const output = [{ a: 1 }, { a: 2 }];
    const input = toStringArray(output);
    await testParse(conn(), DataTypeOIDs.json, input, output, { columnFormat: DataFormat.binary });
  });

  it('should parse "json" array field (text)', async () => {
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    const input = toStringArray(output);
    await testParse(conn(), DataTypeOIDs._json, input, output, { columnFormat: DataFormat.text });
  });

  it('should parse "json" array field (binary)', async () => {
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    const input = toStringArray(output);
    await testParse(conn(), DataTypeOIDs._json, input, output, { columnFormat: DataFormat.binary });
  });

  it('should encode "json" param', async () => {
    const input = [{ a: 1 }, { a: 2 }];
    await testEncode(conn(), DataTypeOIDs.json, input, input);
  });

  it('should encode "json" array param', async () => {
    const input = [
      [
        [{ a: 1 }, { a: 2 }],
        [{ a: 3 }, { a: 4 }],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }],
      ],
    ];
    const output = [
      [
        [{ a: 1 }, { a: 2 }, null],
        [{ a: 3 }, { a: 4 }, null],
      ],
      [
        [{ a: 5 }, { a: 6 }, { a: 7 }],
        [null, { a: 8 }, null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._json, input, output);
  });
}
