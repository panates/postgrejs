import decodeBytea from "postgres-bytea";
import { DataType, DataTypeOIDs } from "../definitions.js";
import { SmartBuffer } from "../protocol/SmartBuffer.js";

export const ByteaType: DataType = {
  name: "bytea",
  oid: DataTypeOIDs.bytea,
  jsType: "Buffer",

  parseBinary(v: Buffer): Buffer {
    return v;
  },

  encodeBinary(buf: SmartBuffer, v: Buffer): void {
    buf.writeBuffer(v);
  },

  parseText: decodeBytea,

  isType(v: any): boolean {
    return v instanceof Buffer;
  },
};

export const ArrayByteaType: DataType = {
  ...ByteaType,
  name: "_bytea",
  oid: DataTypeOIDs._bytea,
  elementsOID: DataTypeOIDs.bytea,
};
