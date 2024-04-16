import { Connection, DataFormat, DataTypeOIDs } from 'postgresql-client';
import { testEncode, testParse } from './_testers.js';

export function createTests(conn: () => Connection) {
  it('should parse "xml" field (text)', async function () {
    const input = ['<tag>1</tag>', '<tag>2</tag>'];
    await testParse(conn(), DataTypeOIDs.xml, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "xml" field (binary)', async function () {
    const input = ['<tag>1</tag>', '<tag>2</tag>'];
    await testParse(conn(), DataTypeOIDs.xml, input, input, { columnFormat: DataFormat.binary });
  });

  it('should parse "xml" array field (text)', async function () {
    const input = [
      [
        ['<tag>1</tag>', '<tag>2</tag>', null],
        ['<tag>3</tag>', '<tag>4</tag>', null],
      ],
      [
        ['<tag>5</tag>', '<tag>6</tag>', '<tag>7</tag>'],
        [null, '<tag>8</tag>', null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._xml, input, input, { columnFormat: DataFormat.text });
  });

  it('should parse "xml" array field (binary)', async function () {
    const input = [
      [
        ['<tag>1</tag>', '<tag>2</tag>', null],
        ['<tag>3</tag>', '<tag>4</tag>', null],
      ],
      [
        ['<tag>5</tag>', '<tag>6</tag>', '<tag>7</tag>'],
        [null, '<tag>8</tag>', null],
      ],
    ];
    await testParse(conn(), DataTypeOIDs._xml, input, input, { columnFormat: DataFormat.binary });
  });

  it('should encode "xml" param', async function () {
    await testEncode(conn(), DataTypeOIDs.xml, ['abc', 'bcd']);
  });

  it('should encode "xml" array param', async function () {
    const input = [
      [
        ['<tag>1</tag>', '<tag>2</tag>', null],
        ['<tag>3</tag>', '<tag>4</tag>', null],
      ],
      [
        ['<tag>5</tag>', '<tag>6</tag>', '<tag>7</tag>'],
        [null, '<tag>8</tag>', null],
      ],
    ];
    await testEncode(conn(), DataTypeOIDs._xml, input);
  });
}
