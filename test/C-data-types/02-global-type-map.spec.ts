import { DataTypeOIDs, GlobalTypeMap } from 'postgresql-client';

describe('GlobalTypeMap', function () {
  it('should determine bool oid from "Boolean"', async function () {
    expect(GlobalTypeMap.determine(true)).toStrictEqual(DataTypeOIDs.bool);
    expect(GlobalTypeMap.determine(false)).toStrictEqual(DataTypeOIDs.bool);
  });

  it('should determine int4 oid from "Number"', async function () {
    expect(GlobalTypeMap.determine(1)).toStrictEqual(DataTypeOIDs.int4);
    expect(GlobalTypeMap.determine(-142)).toStrictEqual(DataTypeOIDs.int4);
  });

  it('should determine int8 oid from "Number"', async function () {
    expect(GlobalTypeMap.determine(Number.MAX_SAFE_INTEGER + 1)).toStrictEqual(DataTypeOIDs.int8);
  });

  it('should determine int8 oid from "BigInt"', async function () {
    expect(GlobalTypeMap.determine(BigInt(1))).toStrictEqual(DataTypeOIDs.int8);
  });

  it('should determine float8 oid from "Number"', async function () {
    expect(GlobalTypeMap.determine(1.1)).toStrictEqual(DataTypeOIDs.float8);
    expect(GlobalTypeMap.determine(-142.2)).toStrictEqual(DataTypeOIDs.float8);
  });

  it('should determine timestamp oid from "Date"', async function () {
    expect(GlobalTypeMap.determine(new Date())).toStrictEqual(DataTypeOIDs.timestamp);
  });

  it('should determine date oid from "Date"', async function () {
    expect(GlobalTypeMap.determine(new Date('2020-12-15T00:00:00'))).toStrictEqual(DataTypeOIDs.date);
  });

  it('should determine time oid from "Date"', async function () {
    expect(GlobalTypeMap.determine(new Date('1970-01-01T10:30:00'))).toStrictEqual(DataTypeOIDs.time);
  });

  it('should determine time oid from "String"', async function () {
    expect(GlobalTypeMap.determine('10:30:00')).toStrictEqual(DataTypeOIDs.time);
  });

  it('should determine bytea oid from "Buffer"', async function () {
    expect(GlobalTypeMap.determine(Buffer.from('abc'))).toStrictEqual(DataTypeOIDs.bytea);
  });

  it('should determine box oid from "Object"', async function () {
    expect(GlobalTypeMap.determine({ x1: 1, x2: 2, y1: 1, y2: 2 })).toStrictEqual(DataTypeOIDs.box);
  });

  it('should determine point oid from "Object"', async function () {
    expect(GlobalTypeMap.determine({ x: 1, y: 2 })).toStrictEqual(DataTypeOIDs.point);
  });

  it('should determine circle oid from "Object"', async function () {
    expect(GlobalTypeMap.determine({ x: 1, y: 2, r: 3 })).toStrictEqual(DataTypeOIDs.circle);
  });

  it('should determine json oid from "Object"', async function () {
    expect(GlobalTypeMap.determine({ a: 1 })).toStrictEqual(DataTypeOIDs.json);
    expect(GlobalTypeMap.determine({})).toStrictEqual(DataTypeOIDs.json);
    expect(GlobalTypeMap.determine({})).toStrictEqual(DataTypeOIDs.json);
  });

  it('should determine uuid oid from UUID formatted string', async function () {
    expect(GlobalTypeMap.determine('17869c99-1fc0-4cbd-aaf8-2c197052464b')).toStrictEqual(DataTypeOIDs.uuid);
  });

  it('should determine varchar oid from "String"', async function () {
    expect(GlobalTypeMap.determine('hello world')).toStrictEqual(DataTypeOIDs.varchar);
  });

  it('should determine char oid from "String"', async function () {
    expect(GlobalTypeMap.determine('y')).toStrictEqual(DataTypeOIDs.char);
  });
});
