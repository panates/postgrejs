import {
    DataType, DataTypeOIDs,
    Maybe,
    OID
} from './definitions';

import {ArrayBoolType, BoolType} from './data-types/BoolType';
import {ArrayInt2Type, Int2Type} from './data-types/Int2Type';
import {ArrayInt4Type, Int4Type} from './data-types/Int4Type';
import {ArrayInt8Type, Int8Type} from './data-types/Int8Type';
import {ArrayFloat4Type, Float4Type} from './data-types/Float4Type';
import {ArrayFloat8Type, Float8Type} from './data-types/Float8Type';
import {ArrayOidType, OidType} from './data-types/OidType';
import {ArrayDateType, DateType} from './data-types/DateType';
import {ArrayTimestampType, TimestampType} from './data-types/TimestampType';
import {ArrayTimestamptzType, TimestamptzType} from './data-types/TimestamptzType';
import {ArrayCharType, CharType} from './data-types/CharType';
import {ArrayVarcharType, VarcharType} from './data-types/VarcharType';
import {ArrayJsonType, JsonType} from './data-types/JsonType';
import {ArrayByteaType, ByteaType} from './data-types/ByteaType';
import {ArrayLsegType, LsegType} from './data-types/LsegType';
import {ArrayPointType, PointType} from './data-types/PointType';
import {ArrayCircleType, CircleType} from './data-types/CircleType';
import {ArrayBoxType, BoxType} from './data-types/BoxType';
import {ArrayNumericType, NumericType} from './data-types/NumericType';

export class DataTypeMap {
    private _items: Record<OID, DataType> = {};

    constructor(other?: DataTypeMap) {
        if (other instanceof DataTypeMap)
            Object.assign(this._items, other._items);
    }

    get(oid: OID): DataType {
        return this._items[oid];
    }

    register(...dataTypes: DataType[]): void {
        dataTypes.every(t => this._items[t.oid] = t);
    }

    determine(value: any): Maybe<OID> {
        const valueIsArray = Array.isArray(value);
        for (const t of Object.values(this._items)) {
            if (valueIsArray) {
                if (t.elementsOID && t.isType(value[0]))
                    return t.oid;
            } else if (!t.elementsOID && t.isType(value))
                return t.oid;
        }
    }

}

export const GlobalTypeMap = new DataTypeMap();


GlobalTypeMap.register(BoolType, ArrayBoolType);
GlobalTypeMap.register(Int4Type, ArrayInt4Type, Int8Type, ArrayInt8Type, Int2Type, ArrayInt2Type);
GlobalTypeMap.register(Float8Type, ArrayFloat8Type, Float4Type, ArrayFloat4Type);
GlobalTypeMap.register(NumericType, ArrayNumericType);

GlobalTypeMap.register(VarcharType, ArrayVarcharType);
GlobalTypeMap.register(CharType, ArrayCharType);

GlobalTypeMap.register(TimestamptzType, ArrayTimestamptzType);
GlobalTypeMap.register(TimestampType, ArrayTimestampType);
GlobalTypeMap.register(DateType, ArrayDateType);

GlobalTypeMap.register(OidType, ArrayOidType);
GlobalTypeMap.register(JsonType, ArrayJsonType);
GlobalTypeMap.register(ByteaType, ArrayByteaType);

GlobalTypeMap.register(PointType, ArrayPointType);
GlobalTypeMap.register(CircleType, ArrayCircleType);
GlobalTypeMap.register(LsegType, ArrayLsegType);
GlobalTypeMap.register(BoxType, ArrayBoxType);

GlobalTypeMap.register({...VarcharType, name: 'bpchar', oid: DataTypeOIDs.bpchar});
GlobalTypeMap.register({
    ...ArrayVarcharType,
    name: '_bpchar',
    oid: DataTypeOIDs._bpchar,
    elementsOID: DataTypeOIDs.bpchar
});
GlobalTypeMap.register({...VarcharType, name: 'text', oid: DataTypeOIDs.text});
GlobalTypeMap.register({
    ...ArrayVarcharType,
    name: '_text',
    oid: DataTypeOIDs._text,
    elementsOID: DataTypeOIDs.text
});
GlobalTypeMap.register({...VarcharType, name: 'xml', oid: DataTypeOIDs.xml});
GlobalTypeMap.register({
    ...ArrayVarcharType,
    name: '_xml',
    oid: DataTypeOIDs._xml,
    elementsOID: DataTypeOIDs.xml
});
