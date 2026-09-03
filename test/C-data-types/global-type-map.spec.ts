import { expect } from 'expect';
import { DataTypeOIDs, GlobalTypeMap } from 'postgrejs';

describe('GlobalTypeMap', () => {
  it('should determine bool oid from "Boolean"', async () => {
    expect(GlobalTypeMap.determine(true)).toStrictEqual(DataTypeOIDs.bool);
    expect(GlobalTypeMap.determine(false)).toStrictEqual(DataTypeOIDs.bool);
  });

  it('should determine int4 oid from "Number"', async () => {
    expect(GlobalTypeMap.determine(1)).toStrictEqual(DataTypeOIDs.int4);
    expect(GlobalTypeMap.determine(-142)).toStrictEqual(DataTypeOIDs.int4);
  });

  it('should determine int8 oid from "Number"', async () => {
    expect(GlobalTypeMap.determine(Number.MAX_SAFE_INTEGER + 1)).toStrictEqual(
      DataTypeOIDs.int8,
    );
  });

  it('should determine int8 oid for numbers outside the 32-bit int4 range', async () => {
    // Regression test: values between the int4 boundary and
    // Number.MAX_SAFE_INTEGER used to be mis-detected as int4 (isType()
    // only checked <= MAX_SAFE_INTEGER, not the real int4 range), causing
    // a RangeError from writeInt32BE when encoding.
    expect(GlobalTypeMap.determine(2147483648)).toStrictEqual(
      DataTypeOIDs.int8,
    );
    expect(GlobalTypeMap.determine(-2147483649)).toStrictEqual(
      DataTypeOIDs.int8,
    );
    expect(GlobalTypeMap.determine(5000000000)).toStrictEqual(
      DataTypeOIDs.int8,
    );
    expect(GlobalTypeMap.determine(-5000000000)).toStrictEqual(
      DataTypeOIDs.int8,
    );
  });

  it('should determine int4 oid for numbers at the exact 32-bit boundary', async () => {
    expect(GlobalTypeMap.determine(2147483647)).toStrictEqual(
      DataTypeOIDs.int4,
    );
    expect(GlobalTypeMap.determine(-2147483648)).toStrictEqual(
      DataTypeOIDs.int4,
    );
  });

  it('should determine int8 oid from "BigInt"', async () => {
    expect(GlobalTypeMap.determine(BigInt(1))).toStrictEqual(DataTypeOIDs.int8);
  });

  it('should determine float8 oid from "Number"', async () => {
    expect(GlobalTypeMap.determine(1.1)).toStrictEqual(DataTypeOIDs.float8);
    expect(GlobalTypeMap.determine(-142.2)).toStrictEqual(DataTypeOIDs.float8);
  });

  it('should determine timestamp oid from "Date"', async () => {
    expect(GlobalTypeMap.determine(new Date())).toStrictEqual(
      DataTypeOIDs.timestamp,
    );
  });

  it('should determine date oid from "Date"', async () => {
    expect(
      GlobalTypeMap.determine(new Date('2020-12-15T00:00:00')),
    ).toStrictEqual(DataTypeOIDs.date);
  });

  it('should determine time oid from "Date"', async () => {
    expect(
      GlobalTypeMap.determine(new Date('1970-01-01T10:30:00')),
    ).toStrictEqual(DataTypeOIDs.time);
  });

  it('should determine time oid from "String"', async () => {
    expect(GlobalTypeMap.determine('10:30:00')).toStrictEqual(
      DataTypeOIDs.time,
    );
  });

  it('should determine bytea oid from "Buffer"', async () => {
    expect(GlobalTypeMap.determine(Buffer.from('abc'))).toStrictEqual(
      DataTypeOIDs.bytea,
    );
  });

  it('should determine box oid from "Object"', async () => {
    expect(
      GlobalTypeMap.determine({ x1: 1, x2: 2, y1: 1, y2: 2 }),
    ).toStrictEqual(DataTypeOIDs.box);
  });

  it('should determine point oid from "Object"', async () => {
    expect(GlobalTypeMap.determine({ x: 1, y: 2 })).toStrictEqual(
      DataTypeOIDs.point,
    );
  });

  it('should determine circle oid from "Object"', async () => {
    expect(GlobalTypeMap.determine({ x: 1, y: 2, r: 3 })).toStrictEqual(
      DataTypeOIDs.circle,
    );
  });

  it('should determine json oid from "Object"', async () => {
    expect(GlobalTypeMap.determine({ a: 1 })).toStrictEqual(DataTypeOIDs.json);
    expect(GlobalTypeMap.determine({})).toStrictEqual(DataTypeOIDs.json);
    expect(GlobalTypeMap.determine({})).toStrictEqual(DataTypeOIDs.json);
  });

  it('should determine uuid oid from UUID formatted string', async () => {
    expect(
      GlobalTypeMap.determine('17869c99-1fc0-4cbd-aaf8-2c197052464b'),
    ).toStrictEqual(DataTypeOIDs.uuid);
  });

  it('should determine varchar oid from "String"', async () => {
    expect(GlobalTypeMap.determine('hello world')).toStrictEqual(
      DataTypeOIDs.varchar,
    );
  });

  it('should determine char oid from "String"', async () => {
    expect(GlobalTypeMap.determine('y')).toStrictEqual(DataTypeOIDs.char);
  });

  it('should not determine char oid for a single multi-byte character', async () => {
    // Regression test: isType() used to check JS string .length (UTF-16
    // code units) instead of UTF-8 byte length, so any single non-ASCII
    // character (e.g. 'é', '中') was wrongly auto-detected as PostgreSQL's
    // 1-byte "char" type, whose encoder then wrote 2-3 bytes for it,
    // causing the server to reject the bind parameter outright.
    expect(GlobalTypeMap.determine('é')).toStrictEqual(DataTypeOIDs.varchar);
    expect(GlobalTypeMap.determine('中')).toStrictEqual(DataTypeOIDs.varchar);
  });
});
