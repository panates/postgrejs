import { ArrayBoolType, BoolType } from "./data-types/BoolType.js";
import { ArrayBoxType, BoxType } from "./data-types/BoxType.js";
import { ArrayByteaType, ByteaType } from "./data-types/ByteaType.js";
import { ArrayCharType, CharType } from "./data-types/CharType.js";
import { ArrayCircleType, CircleType } from "./data-types/CircleType.js";
import { ArrayDateType, DateType } from "./data-types/DateType.js";
import { ArrayFloat4Type, Float4Type } from "./data-types/Float4Type.js";
import { ArrayFloat8Type, Float8Type } from "./data-types/Float8Type.js";
import { ArrayInt2Type, Int2Type } from "./data-types/Int2Type.js";
import { ArrayInt4Type, Int4Type } from "./data-types/Int4Type.js";
import { ArrayInt8Type, Int8Type } from "./data-types/Int8Type.js";
import { ArrayJsonbType, JsonbType } from "./data-types/JsonbType.js";
import { ArrayJsonType, JsonType } from "./data-types/JsonType.js";
import { ArrayLsegType, LsegType } from "./data-types/LsegType.js";
import { ArrayNumericType, NumericType } from "./data-types/NumericType.js";
import { ArrayOidType, OidType } from "./data-types/OidType.js";
import { ArrayPointType, PointType } from "./data-types/PointType.js";
import { ArrayTimestampType, TimestampType } from "./data-types/TimestampType.js";
import { ArrayTimestamptzType, TimestamptzType } from "./data-types/TimestamptzType.js";
import { ArrayTimeType, TimeType } from "./data-types/TimeType.js";
import { ArrayUuidType, UuidType } from "./data-types/UuidType.js";
import { ArrayVarcharType, VarcharType } from "./data-types/VarcharType.js";
import { DataType, DataTypeOIDs, Maybe, OID } from "./definitions.js";

export class DataTypeMap {
  private _itemsByOID: Record<OID, DataType> = {};
  private _items: DataType[] = [];

  constructor(other?: DataTypeMap) {
    if (other instanceof DataTypeMap) Object.assign(this._items, other._items);
  }

  get(oid: OID): DataType {
    return this._itemsByOID[oid];
  }

  register(dataTypes: DataType | DataType[]): void {
    dataTypes = Array.isArray(dataTypes) ? dataTypes : [dataTypes];
    for (const t of dataTypes) {
      this._itemsByOID[t.oid] = t;
      const i = this._items.findIndex((tt) => tt.oid === t.oid);
      if (i >= 0) this._items[i] = t;
      else this._items.push(t);
    }
  }

  determine(value: any): Maybe<OID> {
    if (value == null) return DataTypeOIDs.unknown;
    const valueIsArray = Array.isArray(value);
    let i: number;
    let t: DataType;
    for (i = this._items.length - 1; i >= 0; i--) {
      t = this._items[i];
      if (valueIsArray) {
        if (t.elementsOID && t.isType(value[0])) return t.oid;
      } else if (!t.elementsOID && t.isType(value)) return t.oid;
    }
  }
}

export const GlobalTypeMap = new DataTypeMap();

GlobalTypeMap.register([OidType, ArrayOidType]);
GlobalTypeMap.register([JsonbType, ArrayJsonbType]);
GlobalTypeMap.register([JsonType, ArrayJsonType]);

GlobalTypeMap.register([BoolType, ArrayBoolType]);
GlobalTypeMap.register([NumericType, ArrayNumericType]);
GlobalTypeMap.register([Float4Type, ArrayFloat4Type]);
GlobalTypeMap.register([Float8Type, ArrayFloat8Type]);
GlobalTypeMap.register([Int2Type, ArrayInt2Type]);
GlobalTypeMap.register([Int4Type, ArrayInt4Type]);
GlobalTypeMap.register([Int8Type, ArrayInt8Type]);

GlobalTypeMap.register([ByteaType, ArrayByteaType]);
GlobalTypeMap.register([CircleType, ArrayCircleType]);
GlobalTypeMap.register([PointType, ArrayPointType]);
GlobalTypeMap.register([LsegType, ArrayLsegType]);
GlobalTypeMap.register([BoxType, ArrayBoxType]);

GlobalTypeMap.register({...VarcharType, name: "bpchar", oid: DataTypeOIDs.bpchar});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: "_bpchar",
  oid: DataTypeOIDs._bpchar,
  elementsOID: DataTypeOIDs.bpchar,
});

GlobalTypeMap.register({...VarcharType, name: "name", oid: DataTypeOIDs.name});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: "_name",
  oid: DataTypeOIDs._name,
  elementsOID: DataTypeOIDs.name,
});

GlobalTypeMap.register({...VarcharType, name: "text", oid: DataTypeOIDs.text});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: "_text",
  oid: DataTypeOIDs._text,
  elementsOID: DataTypeOIDs.text,
});
GlobalTypeMap.register({...VarcharType, name: "xml", oid: DataTypeOIDs.xml});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: "_xml",
  oid: DataTypeOIDs._xml,
  elementsOID: DataTypeOIDs.xml,
});
GlobalTypeMap.register([VarcharType, ArrayVarcharType]);
GlobalTypeMap.register([UuidType, ArrayUuidType]);
GlobalTypeMap.register([CharType, ArrayCharType]);

GlobalTypeMap.register([TimestamptzType, ArrayTimestamptzType]);
GlobalTypeMap.register([TimeType, ArrayTimeType]);
GlobalTypeMap.register([DateType, ArrayDateType]);
GlobalTypeMap.register([TimestampType, ArrayTimestampType]);
