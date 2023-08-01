import { DataType, DataTypeNames, DataTypeOIDs } from "../definitions.js";
import { SmartBuffer } from "../protocol/SmartBuffer.js";
import { fastParseInt } from "../util/fast-parseint.js";

export const OidType: DataType = {
  name: "oid",
  oid: DataTypeOIDs.oid,
  jsType: "number",

  parseBinary(v: Buffer): number {
    return v.readUInt32BE(0);
  },

  encodeBinary(buf: SmartBuffer, v: number): void {
    buf.writeUInt32BE(fastParseInt(v));
  },

  parseText: fastParseInt,

  isType(v: any): boolean {
    return typeof v === "number" && Number.isInteger(v) && !!DataTypeNames[v]
  },
};

export const ArrayOidType: DataType = {
  ...OidType,
  name: "_oid",
  oid: DataTypeOIDs._oid,
  elementsOID: DataTypeOIDs.oid,
};
