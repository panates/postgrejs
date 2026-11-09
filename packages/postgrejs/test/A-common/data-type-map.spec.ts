import { expect } from 'expect';
import { DataTypeMap, DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import type { DataType } from '../../src/interfaces/data-type.js';

describe('DataTypeMap', () => {
  const fakeType: DataType = {
    name: 'fake',
    oid: 999999,
    jsType: 'string',
    isType: () => false,
    decodeBinary: () => 'fake',
    decodeText: () => 'fake',
  };

  describe('determine()', () => {
    it('should pass over a type marked not inferrable, however well it matches', () => {
      const map = new DataTypeMap();
      map.register({ ...fakeType, isType: (v: any) => typeof v === 'string' });
      expect(map.determine('anything')).toStrictEqual(fakeType.oid);
      map.register({
        ...fakeType,
        isType: (v: any) => typeof v === 'string',
        inferrable: false,
      });
      expect(map.determine('anything')).toStrictEqual(DataTypeOIDs.unknown);
    });

    it('should type an array from the first value inside it', () => {
      // `value[0]` answered `_int2vector` for an array of number arrays -
      // a vector is the one registered type an array of numbers matches -
      // so a perfectly ordinary 2-D array went out as something the
      // caller never mentioned.
      expect(
        GlobalTypeMap.determine([
          [1, 2],
          [3, 4],
        ]),
      ).toStrictEqual(DataTypeOIDs._int4);
      expect(GlobalTypeMap.determine([[1.5], [2.5]])).toStrictEqual(
        DataTypeOIDs._float8,
      );
    });

    it('should read past a leading null to find that value', () => {
      // `[null, 2, 3]` asked what type null is, and nothing answers that.
      expect(GlobalTypeMap.determine([null, 2, 3])).toStrictEqual(
        DataTypeOIDs._int4,
      );
      expect(GlobalTypeMap.determine([null, true])).toStrictEqual(
        DataTypeOIDs._bool,
      );
    });

    it('should still answer unknown when there is no value to read', () => {
      expect(GlobalTypeMap.determine([])).toStrictEqual(DataTypeOIDs.unknown);
      expect(GlobalTypeMap.determine([null, null])).toStrictEqual(
        DataTypeOIDs.unknown,
      );
    });
  });

  describe('copy constructor', () => {
    it('should answer get() for every type the source held', () => {
      // The regression this pins: only `_items` was copied, so `get()` -
      // which every decode goes through - answered undefined for all of
      // them and callers silently received raw Buffers.
      const copy = new DataTypeMap(GlobalTypeMap);
      for (const oid of [
        DataTypeOIDs.int2,
        DataTypeOIDs.int4,
        DataTypeOIDs.int8,
        DataTypeOIDs.numeric,
        DataTypeOIDs.text,
        DataTypeOIDs.timestamptz,
        DataTypeOIDs._int4,
      ]) {
        expect(copy.get(oid)).toStrictEqual(GlobalTypeMap.get(oid));
      }
    });

    it('should keep determine() answering as the source does', () => {
      // Against the source rather than against literal OIDs: the point is
      // that a copy infers what the original infers, whatever that is.
      const copy = new DataTypeMap(GlobalTypeMap);
      for (const v of [1, 'text value', true, 1.5, [1, 2], new Date(), null]) {
        expect(copy.determine(v)).toStrictEqual(GlobalTypeMap.determine(v));
      }
    });

    it('should not let a registration on the copy reach the source', () => {
      const copy = new DataTypeMap(GlobalTypeMap);
      copy.register(fakeType);
      expect(copy.get(999999)).toStrictEqual(fakeType);
      expect(GlobalTypeMap.get(999999)).toBeUndefined();
    });

    it('should let the copy override a type the source already had', () => {
      const copy = new DataTypeMap(GlobalTypeMap);
      const override: DataType = {
        ...GlobalTypeMap.get(DataTypeOIDs.int4),
        decodeBinary: () => 'overridden',
      };
      copy.register(override);
      expect(copy.get(DataTypeOIDs.int4)).toStrictEqual(override);
      expect(GlobalTypeMap.get(DataTypeOIDs.int4)).not.toStrictEqual(override);
    });

    it('should carry the inferrable flag across', () => {
      const copy = new DataTypeMap(GlobalTypeMap);
      expect(copy.get(DataTypeOIDs.char).inferrable).toStrictEqual(false);
    });

    it('should produce an empty map when given nothing', () => {
      const empty = new DataTypeMap();
      expect(empty.get(DataTypeOIDs.int4)).toBeUndefined();
      expect(empty.determine(1)).toStrictEqual(DataTypeOIDs.unknown);
    });
  });
});
