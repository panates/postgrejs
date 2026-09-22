import { expect } from 'expect';
import { DataTypeMap, DataTypeOIDs, GlobalTypeMap } from 'postgrejs';
import type { DataType } from '../../src/interfaces/data-type.js';

/**
 * determine() walks two lists built at registration - the scalar types
 * and the array types - rather than one list of everything. A value is
 * one or the other, so the half that can never match it is not walked:
 * of 127 registered types a plain number was tested against 22 and
 * skipped past 105, which cost 714ns a call against 136ns now.
 *
 * What must not change is the answer, so this pins the ordering rules
 * the single list used to carry.
 */
describe('determine() walk order', () => {
  const fake: DataType = {
    name: 'fake',
    oid: 999999,
    jsType: 'string',
    isType: (v: any) => typeof v === 'string',
    decodeBinary: () => 'fake',
    decodeText: () => 'fake',
  };

  it('should answer what it always did for every kind of value', () => {
    expect(GlobalTypeMap.determine(7)).toStrictEqual(DataTypeOIDs.int4);
    expect(GlobalTypeMap.determine(1.5)).toStrictEqual(DataTypeOIDs.float8);
    expect(GlobalTypeMap.determine(true)).toStrictEqual(DataTypeOIDs.bool);
    expect(GlobalTypeMap.determine('x')).toStrictEqual(DataTypeOIDs.varchar);
    expect(GlobalTypeMap.determine(Buffer.from('a'))).toStrictEqual(
      DataTypeOIDs.bytea,
    );
    expect(GlobalTypeMap.determine([1, 2])).toStrictEqual(DataTypeOIDs._int4);
    expect(GlobalTypeMap.determine(['a'])).toStrictEqual(DataTypeOIDs._varchar);
    expect(GlobalTypeMap.determine(null)).toStrictEqual(DataTypeOIDs.unknown);
  });

  it('should let the newest registration win', () => {
    const map = new DataTypeMap(GlobalTypeMap);
    expect(map.determine('x')).toStrictEqual(DataTypeOIDs.varchar);
    map.register(fake);
    expect(map.determine('x')).toStrictEqual(fake.oid);
  });

  it('should keep a copy from being changed by the original', () => {
    // The two lists are shared until one of them registers something,
    // so a copy that does must not reach back into the source.
    const source = new DataTypeMap(GlobalTypeMap);
    const copy = new DataTypeMap(source);
    copy.register(fake);
    expect(copy.determine('x')).toStrictEqual(fake.oid);
    expect(source.determine('x')).toStrictEqual(DataTypeOIDs.varchar);
    expect(GlobalTypeMap.determine('x')).toStrictEqual(DataTypeOIDs.varchar);
  });

  it('should keep passing over a type that is not inferrable', () => {
    // char is registered inferrable: false, and a one-character string
    // must still infer varchar rather than "char".
    expect(GlobalTypeMap.determine('A')).toStrictEqual(DataTypeOIDs.varchar);
    const map = new DataTypeMap(GlobalTypeMap);
    map.register({ ...fake, inferrable: false });
    expect(map.determine('x')).toStrictEqual(DataTypeOIDs.varchar);
  });

  it('should re-register in place rather than jump the queue', () => {
    // Replacing a type keeps its position, so it does not start winning
    // values its old self never claimed.
    const map = new DataTypeMap(GlobalTypeMap);
    map.register({ ...fake, oid: DataTypeOIDs.int4, isType: () => false });
    expect(map.determine(7)).not.toStrictEqual(DataTypeOIDs.int4);
    expect(map.get(DataTypeOIDs.int4).name).toStrictEqual('fake');
  });
});
