import { expect } from 'expect';
import { DataTypeMap, DataTypeOIDs, GlobalTypeMap, Range } from 'postgrejs';
import {
  getTypeOid,
  setTypeOid,
} from '../../src/data-types/classes/type-oid.js';

describe('type OID carried on a value', () => {
  it('should stay invisible to everything that looks at a value', () => {
    // The reason it is a non-enumerable symbol rather than a property
    // named `oid`: a stamped value has to behave like an unstamped one
    // everywhere except inference.
    const r = setTypeOid(new Range(1, 10), DataTypeOIDs.int4range);
    expect(Object.keys(r)).toStrictEqual([
      'lower',
      'upper',
      'lowerInclusive',
      'upperInclusive',
      'isEmpty',
    ]);
    expect(JSON.parse(JSON.stringify({ r })).r).toStrictEqual(
      JSON.parse(JSON.stringify(new Range(1, 10))),
    );
    expect({ ...r }).toStrictEqual({ ...new Range(1, 10) });
    expect(r).toStrictEqual(new Range(1, 10));
  });

  it('should not be confused with an object that merely has an oid field', () => {
    // `{ oid: 3904 }` is an ordinary object somebody might put in a json
    // column, and a plain key would have made it look like a range.
    expect(getTypeOid({ oid: DataTypeOIDs.int4range })).toBeUndefined();
    expect(GlobalTypeMap.determine({ oid: 3904 })).toStrictEqual(
      DataTypeOIDs.json,
    );
  });

  describe('determine()', () => {
    it('should take the carried OID over matching by shape', () => {
      const r = new Range(1, 10, '[)', DataTypeOIDs.int8range);
      expect(GlobalTypeMap.determine(r)).toStrictEqual(DataTypeOIDs.int8range);
      const empty = Range.empty(DataTypeOIDs.daterange);
      expect(GlobalTypeMap.determine(empty)).toStrictEqual(
        DataTypeOIDs.daterange,
      );
    });

    it('should refuse a Range that carries none', () => {
      // Rather than letting JsonType take it - its isType() accepts any
      // object, so this used to go out declared `json` and come back
      // looking right.
      expect(() => GlobalTypeMap.determine(new Range(1, 10))).toThrow(
        /carries no type OID/,
      );
    });

    it('should leave every other value alone', () => {
      // The check runs before the walk, so nothing that was inferrable
      // before stops being so.
      expect(GlobalTypeMap.determine('A')).toStrictEqual(DataTypeOIDs.varchar);
      expect(GlobalTypeMap.determine(1)).toStrictEqual(DataTypeOIDs.int4);
      expect(GlobalTypeMap.determine(new Date())).toStrictEqual(
        DataTypeOIDs.timestamp,
      );
      expect(GlobalTypeMap.determine({ a: 1 })).toStrictEqual(
        DataTypeOIDs.json,
      );
      expect(GlobalTypeMap.determine([1, 2])).toStrictEqual(DataTypeOIDs._int4);
    });

    it('should work the same on a copied map', () => {
      const copy = new DataTypeMap(GlobalTypeMap);
      const r = new Range(1, 10, '[)', DataTypeOIDs.numrange);
      expect(copy.determine(r)).toStrictEqual(DataTypeOIDs.numrange);
      expect(() => copy.determine(new Range(1, 10))).toThrow(
        /carries no type OID/,
      );
    });
  });
});
