import { expect } from 'expect';
import { DataFormat, DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import type { Protocol } from '../../src/protocol/protocol.js';
import { resolveColumnFormats } from '../../src/util/resolve-column-formats.js';

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

describe('resolveColumnFormats() with unknownTypesAsString', () => {
  // 999999 stands in for an enum, a composite or an extension type: an
  // OID the type map has never heard of, whose binary bytes nothing here
  // can read.
  const UNKNOWN = 999999;
  const fields = [
    field(DataTypeOIDs.int4),
    field(UNKNOWN),
    field(DataTypeOIDs.text),
  ];

  it('should ask for text only on the columns it cannot decode', () => {
    expect(
      resolveColumnFormats(
        fields,
        { unknownTypesAsString: true },
        GlobalTypeMap,
      ),
    ).toStrictEqual([DataFormat.binary, DataFormat.text, DataFormat.binary]);
  });

  it('should leave columnFormat alone when every column is decodable', () => {
    // The no-op case allocates nothing and keeps sending a single code.
    expect(
      resolveColumnFormats(
        [field(DataTypeOIDs.int4), field(DataTypeOIDs.text)],
        { unknownTypesAsString: true },
        GlobalTypeMap,
      ),
    ).toStrictEqual(DataFormat.binary);
  });

  it('should do nothing when the base format is already text', () => {
    // Nothing to rescue: a column with no registered type decodes as the
    // string the server printed either way.
    expect(
      resolveColumnFormats(
        fields,
        { columnFormat: DataFormat.text, unknownTypesAsString: true },
        GlobalTypeMap,
      ),
    ).toStrictEqual(DataFormat.text);
  });

  it('should be inert without a type map', () => {
    // It cannot answer "could this be decoded" without one, and the call
    // sites that have no map in hand have no fields either.
    expect(
      resolveColumnFormats(fields, { unknownTypesAsString: true }),
    ).toStrictEqual(DataFormat.binary);
  });

  it('should do nothing when the option is off', () => {
    expect(resolveColumnFormats(fields, {}, GlobalTypeMap)).toStrictEqual(
      DataFormat.binary,
    );
  });

  it('should combine with fetchAsString rather than fight it', () => {
    expect(
      resolveColumnFormats(
        fields,
        {
          unknownTypesAsString: true,
          fetchAsString: [DataTypeOIDs.int4],
        },
        GlobalTypeMap,
      ),
    ).toStrictEqual([DataFormat.text, DataFormat.text, DataFormat.binary]);
  });

  it('should fill in a columnFormat array shorter than the row', () => {
    expect(
      resolveColumnFormats(
        fields,
        { columnFormat: [DataFormat.text], unknownTypesAsString: true },
        GlobalTypeMap,
      ),
    ).toStrictEqual([DataFormat.text, DataFormat.text, DataFormat.binary]);
  });
});
