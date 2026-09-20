import { expect } from 'expect';
import { DataFormat, DataTypeOIDs } from 'postgrejs';
import type { Protocol } from '../../src/protocol/protocol.js';
import {
  fetchAsStringEqual,
  resolveColumnFormats,
} from '../../src/util/resolve-column-formats.js';

function field(dataTypeId: number): Protocol.RowDescription {
  return {
    fieldName: 'f',
    tableId: 0,
    columnId: 0,
    dataTypeId,
    fixedSize: 0,
    modifier: 0,
    format: DataFormat.binary,
  };
}

describe('resolveColumnFormats()', () => {
  const fields = [
    field(DataTypeOIDs.int4),
    field(DataTypeOIDs.timestamptz),
    field(DataTypeOIDs._timestamptz),
  ];

  it('should leave columnFormat alone when nothing asks for a string', () => {
    // Nothing to map means nothing to allocate: the single format code
    // keeps being sent as a single code.
    expect(resolveColumnFormats(fields, {})).toStrictEqual(DataFormat.binary);
    expect(
      resolveColumnFormats(fields, { columnFormat: DataFormat.text }),
    ).toStrictEqual(DataFormat.text);
    expect(
      resolveColumnFormats(fields, {
        columnFormat: DataFormat.text,
        fetchAsString: [],
      }),
    ).toStrictEqual(DataFormat.text);
  });

  it('should leave columnFormat alone when the list matches no column', () => {
    expect(
      resolveColumnFormats(fields, { fetchAsString: [DataTypeOIDs.json] }),
    ).toStrictEqual(DataFormat.binary);
  });

  it('should ask for text only on the columns the list names', () => {
    expect(
      resolveColumnFormats(fields, {
        fetchAsString: [DataTypeOIDs.timestamptz],
      }),
    ).toStrictEqual([DataFormat.binary, DataFormat.text, DataFormat.binary]);
  });

  it('should select an array column by its own oid, never its element oid', () => {
    // The whole array literal is what fetchAsString hands back, so listing
    // `timestamptz` must leave a `timestamptz[]` column alone.
    expect(
      resolveColumnFormats(fields, {
        fetchAsString: [DataTypeOIDs._timestamptz],
      }),
    ).toStrictEqual([DataFormat.binary, DataFormat.binary, DataFormat.text]);
  });

  it('should override an explicit columnFormat for its own columns only', () => {
    expect(
      resolveColumnFormats(fields, {
        columnFormat: DataFormat.binary,
        fetchAsString: [DataTypeOIDs.timestamptz],
      }),
    ).toStrictEqual([DataFormat.binary, DataFormat.text, DataFormat.binary]);
    expect(
      resolveColumnFormats(fields, {
        columnFormat: [DataFormat.text, DataFormat.binary, DataFormat.text],
        fetchAsString: [DataTypeOIDs.timestamptz],
      }),
    ).toStrictEqual([DataFormat.text, DataFormat.text, DataFormat.text]);
  });

  it('should fill in a columnFormat array shorter than the row', () => {
    // A short array would otherwise write fewer result format codes than
    // there are columns, which the protocol does not allow.
    expect(
      resolveColumnFormats(fields, {
        columnFormat: [DataFormat.text],
        fetchAsString: [DataTypeOIDs.timestamptz],
      }),
    ).toStrictEqual([DataFormat.text, DataFormat.text, DataFormat.binary]);
  });

  it('should leave columnFormat alone when the columns are unknown', () => {
    expect(
      resolveColumnFormats(undefined, {
        fetchAsString: [DataTypeOIDs.timestamptz],
      }),
    ).toStrictEqual(DataFormat.binary);
  });
});

describe('fetchAsStringEqual()', () => {
  it('should treat absent and empty as the same list', () => {
    expect(fetchAsStringEqual(undefined, undefined)).toStrictEqual(true);
    expect(fetchAsStringEqual(undefined, [])).toStrictEqual(true);
    expect(fetchAsStringEqual([], undefined)).toStrictEqual(true);
    expect(fetchAsStringEqual(undefined, [25])).toStrictEqual(false);
  });

  it('should compare contents, not identity', () => {
    expect(fetchAsStringEqual([25, 114], [25, 114])).toStrictEqual(true);
    expect(fetchAsStringEqual([25, 114], [114, 25])).toStrictEqual(false);
    expect(fetchAsStringEqual([25], [25, 114])).toStrictEqual(false);
  });
});
