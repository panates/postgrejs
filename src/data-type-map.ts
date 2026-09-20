import { DataTypeOIDs } from './constants.js';
import {
  ArrayBitType,
  ArrayVarbitType,
  BitType,
  VarbitType,
} from './data-types/bit-type.js';
import { ArrayBoolType, BoolType } from './data-types/bool-type.js';
import { ArrayBoxType, BoxType } from './data-types/box-type.js';
import { ArrayByteaType, ByteaType } from './data-types/bytea-type.js';
import { ArrayCharType, CharType } from './data-types/char-type.js';
import { ArrayCircleType, CircleType } from './data-types/circle-type.js';
import {
  getTypeOid,
  REQUIRES_TYPE_OID,
} from './data-types/classes/type-oid.js';
import { ArrayDateType, DateType } from './data-types/date-type.js';
import { ArrayFloat4Type, Float4Type } from './data-types/float4-type.js';
import { ArrayFloat8Type, Float8Type } from './data-types/float8-type.js';
import {
  ArrayCidrType,
  ArrayInetType,
  CidrType,
  InetType,
} from './data-types/inet-type.js';
import { ArrayInt2Type, Int2Type } from './data-types/int2-type.js';
import {
  ArrayInt2VectorType,
  Int2VectorType,
} from './data-types/int2-vector-type.js';
import { ArrayInt4Type, Int4Type } from './data-types/int4-type.js';
import { ArrayInt8Type, Int8Type } from './data-types/int8-type.js';
import { ArrayIntervalType, IntervalType } from './data-types/interval-type.js';
import { ArrayJsonType, JsonType } from './data-types/json-type.js';
import { ArrayJsonbType, JsonbType } from './data-types/jsonb-type.js';
import { ArrayJsonPathType, JsonPathType } from './data-types/jsonpath-type.js';
import { ArrayLineType, LineType } from './data-types/line-type.js';
import { ArrayLsegType, LsegType } from './data-types/lseg-type.js';
import {
  ArrayMacaddr8Type,
  ArrayMacaddrType,
  Macaddr8Type,
  MacaddrType,
} from './data-types/macaddr-type.js';
import { ArrayNumericType, NumericType } from './data-types/numeric-type.js';
import { ArrayOidType, OidType } from './data-types/oid-type.js';
import {
  ArrayOidVectorType,
  OidVectorType,
} from './data-types/oid-vector-type.js';
import {
  ArrayPathType,
  ArrayPolygonType,
  PathType,
  PolygonType,
} from './data-types/path-type.js';
import { ArrayPgLsnType, PgLsnType } from './data-types/pg-lsn-type.js';
import { ArrayPointType, PointType } from './data-types/point-type.js';
import { RangeTypes } from './data-types/range-type.js';
import { ArrayTidType, TidType } from './data-types/tid-type.js';
import { ArrayTimeType, TimeType } from './data-types/time-type.js';
import {
  ArrayTimestampType,
  TimestampType,
} from './data-types/timestamp-type.js';
import {
  ArrayTimestamptzType,
  TimestamptzType,
} from './data-types/timestamptz-type.js';
import { ArrayTimeTzType, TimeTzType } from './data-types/timetz-type.js';
import {
  ArrayTsQueryType,
  ArrayTsVectorType,
  TsQueryType,
  TsVectorType,
} from './data-types/tsvector-type.js';
import { ArrayUuidType, UuidType } from './data-types/uuid-type.js';
import { ArrayVarcharType, VarcharType } from './data-types/varchar-type.js';
import {
  ArrayCidType,
  ArrayXid8Type,
  ArrayXidType,
  CidType,
  Xid8Type,
  XidType,
} from './data-types/xid-type.js';
import type { DataType } from './interfaces/data-type.js';
import type { OID } from './types.js';

export class DataTypeMap {
  private _itemsByOID: Record<OID, DataType> = {};
  private _items: DataType[] = [];

  /**
   * Copies another map, so a connection can start from GlobalTypeMap and
   * override a type or two without touching the global one.
   *
   * Both indexes have to be copied. `_items` alone is what `determine()`
   * walks, but every decode goes through `get()`, which reads
   * `_itemsByOID` - a copy carrying only the first one answers `undefined`
   * for every OID, and get-parsers.ts then falls back to its default
   * parser, handing the caller raw Buffers instead of decoded values with
   * nothing reported.
   */
  constructor(other?: DataTypeMap) {
    if (other instanceof DataTypeMap) {
      this._items = [...other._items];
      this._itemsByOID = { ...other._itemsByOID };
    }
  }

  get(oid: OID): DataType {
    return this._itemsByOID[oid];
  }

  register(dataTypes: DataType | DataType[]): void {
    dataTypes = Array.isArray(dataTypes) ? dataTypes : [dataTypes];
    for (const t of dataTypes) {
      this._itemsByOID[t.oid] = t;
      const i = this._items.findIndex(tt => tt.oid === t.oid);
      if (i >= 0) this._items[i] = t;
      else this._items.push(t);
    }
  }

  determine(value: any): OID {
    if (value == null) return DataTypeOIDs.unknown;
    if (typeof value === 'object') {
      // A value that already knows which type it came from says so,
      // rather than being matched by shape - which is the only thing
      // that can work when several types share one JavaScript class.
      const carried = getTypeOid(value);
      if (carried !== undefined) return carried;
      const ctor = (value as { constructor?: Record<symbol, unknown> })
        .constructor;
      if (ctor && ctor[REQUIRES_TYPE_OID]) {
        // Checked before the walk below rather than after it: JsonType
        // takes any object, so left to the walk this value would quietly
        // go out declared `json` and come back looking right.
        throw new TypeError(
          `A ${(ctor as { name?: string }).name} carries no type OID, and ` +
            'which PostgreSQL type it is cannot be told from the value - ' +
            'give it one (`new Range(lower, upper, bounds, oid)`) or name ' +
            'it at the call site (`new BindParam(oid, value)`)',
        );
      }
    }
    const valueIsArray = Array.isArray(value);
    let i: number;
    let t: DataType;
    for (i = this._items.length - 1; i >= 0; i--) {
      t = this._items[i];
      // Walked newest-registered first, so a later registration of the
      // same OID wins - and a type marked `inferrable: false` is never
      // picked here at all, however well `isType` matches.
      if (t.inferrable === false) continue;
      if (valueIsArray) {
        if (t.elementsOID && t.isType(value[0])) return t.oid;
      } else if (!t.elementsOID && t.isType(value)) return t.oid;
    }
    return DataTypeOIDs.unknown;
  }
}

export const GlobalTypeMap = new DataTypeMap();

GlobalTypeMap.register([OidType, ArrayOidType]);
GlobalTypeMap.register([OidVectorType, ArrayOidVectorType]);
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
GlobalTypeMap.register([LineType, ArrayLineType]);
GlobalTypeMap.register([PathType, ArrayPathType]);
GlobalTypeMap.register([PolygonType, ArrayPolygonType]);

GlobalTypeMap.register([Int2VectorType, ArrayInt2VectorType]);

GlobalTypeMap.register({
  ...VarcharType,
  name: 'bpchar',
  oid: DataTypeOIDs.bpchar,
});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: '_bpchar',
  oid: DataTypeOIDs._bpchar,
  elementsOID: DataTypeOIDs.bpchar,
});

GlobalTypeMap.register({
  ...VarcharType,
  name: 'name',
  oid: DataTypeOIDs.name,
});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: '_name',
  oid: DataTypeOIDs._name,
  elementsOID: DataTypeOIDs.name,
});

GlobalTypeMap.register({
  ...VarcharType,
  name: 'text',
  oid: DataTypeOIDs.text,
});
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: '_text',
  oid: DataTypeOIDs._text,
  elementsOID: DataTypeOIDs.text,
});
GlobalTypeMap.register({ ...VarcharType, name: 'xml', oid: DataTypeOIDs.xml });
GlobalTypeMap.register({
  ...ArrayVarcharType,
  name: '_xml',
  oid: DataTypeOIDs._xml,
  elementsOID: DataTypeOIDs.xml,
});
GlobalTypeMap.register([VarcharType, ArrayVarcharType]);
GlobalTypeMap.register([UuidType, ArrayUuidType]);
GlobalTypeMap.register([CharType, ArrayCharType]);

GlobalTypeMap.register([TimestamptzType, ArrayTimestamptzType]);
GlobalTypeMap.register([TimeType, ArrayTimeType]);
GlobalTypeMap.register([TimeTzType, ArrayTimeTzType]);
GlobalTypeMap.register([DateType, ArrayDateType]);
GlobalTypeMap.register([TimestampType, ArrayTimestampType]);
GlobalTypeMap.register([IntervalType, ArrayIntervalType]);
GlobalTypeMap.register(RangeTypes);

GlobalTypeMap.register([InetType, ArrayInetType]);
GlobalTypeMap.register([CidrType, ArrayCidrType]);
GlobalTypeMap.register([BitType, ArrayBitType]);
GlobalTypeMap.register([VarbitType, ArrayVarbitType]);
GlobalTypeMap.register([JsonPathType, ArrayJsonPathType]);
GlobalTypeMap.register([TsVectorType, ArrayTsVectorType]);
GlobalTypeMap.register([TsQueryType, ArrayTsQueryType]);
GlobalTypeMap.register([XidType, ArrayXidType]);
GlobalTypeMap.register([Xid8Type, ArrayXid8Type]);
GlobalTypeMap.register([CidType, ArrayCidType]);
GlobalTypeMap.register([TidType, ArrayTidType]);
GlobalTypeMap.register([PgLsnType, ArrayPgLsnType]);
GlobalTypeMap.register([MacaddrType, ArrayMacaddrType]);
GlobalTypeMap.register([Macaddr8Type, ArrayMacaddr8Type]);
