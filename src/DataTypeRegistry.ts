import {
    DataType,
    DataTypeOIDs,
    Maybe,
    OID
} from './definitions';

import {BoolType} from './data-types/BoolType';
import {Int2Type} from './data-types/Int2Type';
import {Int4Type} from './data-types/Int4Type';
import {Int8Type} from './data-types/Int8Type';
import {Float4Type} from './data-types/Float4Type';
import {Float8Type} from './data-types/Float8Type';
import {OidType} from './data-types/OidType';
import {DateType} from './data-types/DateType';
import {TimestampType} from './data-types/TimestampType';
import {TimestamptzType} from './data-types/TimestamptzType';
import {CharType} from './data-types/CharType';
import {VarcharType} from './data-types/VarcharType';
import {JsonType} from './data-types/JsonType';
import {ByteaType} from './data-types/ByteaType';
import {LsegType} from './data-types/LsegType';
import {PointType} from './data-types/PointType';
import {CircleType} from './data-types/CircleType';
import {BoxType} from './data-types/BoxType';

const items: Record<OID, DatatypeRegistryItem> = {};

export const DataTypeRegistry = {
    get items(): Record<OID, DatatypeRegistryItem> {
        return items;
    },

    register(name: string,
             oid: number,
             arrayOid: Maybe<number>, type: DataType): void {
        items[oid] = {
            name,
            oid,
            arrayOid,
            type
        };
        if (arrayOid)
            items[arrayOid] = {
                name: '_' + name,
                oid: arrayOid,
                elementsOid: oid,
                isArray: true,
                type
            };
    },

    determine(value: any): Maybe<OID> {
        const valueIsArray = Array.isArray(value);
        for (const t of Object.values(items)) {
            if (valueIsArray) {
                if (t.isArray && t.type.isType(value[0]))
                    return t.oid;
            } else if (!t.isArray && t.type.isType(value))
                return t.oid;
        }
    }

}

interface DatatypeRegistryItem {
    name: string;
    oid: number;
    arrayOid?: number,
    elementsOid?: number;
    type: DataType;
    isArray?: boolean;
}

// Warning: Do not change order below!
DataTypeRegistry.register('bool', DataTypeOIDs.Bool, DataTypeOIDs.ArrayBool, BoolType);
DataTypeRegistry.register('int4', DataTypeOIDs.Int4, DataTypeOIDs.ArrayInt4, Int4Type);
DataTypeRegistry.register('int8', DataTypeOIDs.Int8, DataTypeOIDs.ArrayInt8, Int8Type);
DataTypeRegistry.register('float8', DataTypeOIDs.Float8, DataTypeOIDs.ArrayFloat8, Float8Type);
DataTypeRegistry.register('varchar', DataTypeOIDs.Varchar, DataTypeOIDs.ArrayVarchar, VarcharType);
DataTypeRegistry.register('char', DataTypeOIDs.Char, DataTypeOIDs.ArrayChar, CharType);
DataTypeRegistry.register('json', DataTypeOIDs.Json, DataTypeOIDs.ArrayJson, JsonType);
DataTypeRegistry.register('timestamptz', DataTypeOIDs.Timestamptz, DataTypeOIDs.ArrayTimestamptz, TimestamptzType);
DataTypeRegistry.register('bytea', DataTypeOIDs.Bytea, DataTypeOIDs.ArrayBytea, ByteaType);
DataTypeRegistry.register('point', DataTypeOIDs.Point, DataTypeOIDs.ArrayPoint, PointType);
DataTypeRegistry.register('circle', DataTypeOIDs.Circle, DataTypeOIDs.ArrayCircle, CircleType);
DataTypeRegistry.register('lseg', DataTypeOIDs.Lseg, DataTypeOIDs.ArrayLseg, LsegType);
DataTypeRegistry.register('box', DataTypeOIDs.Box, DataTypeOIDs.ArrayBox, BoxType);

DataTypeRegistry.register('int2', DataTypeOIDs.Int2, DataTypeOIDs.ArrayInt2, Int2Type);
DataTypeRegistry.register('float4', DataTypeOIDs.Float4, DataTypeOIDs.ArrayFloat4, Float4Type);
DataTypeRegistry.register('oid', DataTypeOIDs.Oid, DataTypeOIDs.ArrayOid, OidType);
DataTypeRegistry.register('bpchar', DataTypeOIDs.Bpchar, DataTypeOIDs.ArrayBpchar, VarcharType);
DataTypeRegistry.register('text', DataTypeOIDs.Text, DataTypeOIDs.ArrayText, VarcharType);
DataTypeRegistry.register('xml', DataTypeOIDs.Xml, DataTypeOIDs.ArrayXml, VarcharType);
DataTypeRegistry.register('timestamp', DataTypeOIDs.Timestamp, DataTypeOIDs.ArrayTimestamp, TimestampType);
DataTypeRegistry.register('date', DataTypeOIDs.Date, DataTypeOIDs.ArrayDate, DateType);

