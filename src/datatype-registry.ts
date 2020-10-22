import {DataType, DataTypeOIDs, Maybe} from './definitions';
import {BoolType} from './data-types/BoolType';
import {DateType} from './data-types/DateType';
import {Int2Type} from './data-types/Int2Type';
import {Int4Type} from './data-types/Int4Type';
import {Int8Type} from './data-types/Int8Type';
import {Float4Type} from './data-types/Float4Type';
import {Float8Type} from './data-types/Float8Type';
import {TimestampType} from './data-types/TimestampType';
import {VarcharType} from './data-types/VarcharType';
import {ByteaType} from './data-types/ByteaType';
import {PointType} from './data-types/PointType';
import {CircleType} from './data-types/CircleType';
import {LsegType} from './data-types/LsegType';
import {TimestamptzType} from './data-types/TimestamptzType';

export const dataTypeRegistry: { [key: number]: DatatypeRegistry } = {};

interface DatatypeRegistry {
    oid: number;
    subOid?: number;
    type: DataType;
    isArray?: boolean;
}

export function registerDataType(oid: number, arrayOid: Maybe<number>, type: DataType): void {
    dataTypeRegistry[oid] = {
        oid,
        type
    };
    if (arrayOid)
        dataTypeRegistry[arrayOid] = {
            oid: arrayOid,
            subOid: oid,
            isArray: true,
            type
        };
}

registerDataType(DataTypeOIDs.Bool, DataTypeOIDs.ArrayBool, BoolType);
registerDataType(DataTypeOIDs.Int2, DataTypeOIDs.ArrayInt2, Int2Type);
registerDataType(DataTypeOIDs.Int4, DataTypeOIDs.ArrayInt4, Int4Type);
registerDataType(DataTypeOIDs.Int8, DataTypeOIDs.ArrayInt8, Int8Type);
registerDataType(DataTypeOIDs.Oid, DataTypeOIDs.ArrayOid, Int4Type);
registerDataType(DataTypeOIDs.Float4, DataTypeOIDs.ArrayFloat4, Float4Type);
registerDataType(DataTypeOIDs.Float8, DataTypeOIDs.ArrayFloat8, Float8Type);
registerDataType(DataTypeOIDs.Char, DataTypeOIDs.ArrayChar, VarcharType);
registerDataType(DataTypeOIDs.Bpchar, DataTypeOIDs.ArrayBpchar, VarcharType);
registerDataType(DataTypeOIDs.Varchar, DataTypeOIDs.ArrayVarchar, VarcharType);
registerDataType(DataTypeOIDs.Text, DataTypeOIDs.ArrayText, VarcharType);
registerDataType(DataTypeOIDs.Json, DataTypeOIDs.ArrayJson, VarcharType);
registerDataType(DataTypeOIDs.Xml, DataTypeOIDs.ArrayXml, VarcharType);
registerDataType(DataTypeOIDs.Date, DataTypeOIDs.ArrayDate, DateType);
registerDataType(DataTypeOIDs.Timestamp, DataTypeOIDs.ArrayTimestamp, TimestampType);
registerDataType(DataTypeOIDs.Timestamptz, DataTypeOIDs.ArrayTimestamptz, TimestamptzType);
registerDataType(DataTypeOIDs.Bytea, DataTypeOIDs.ArrayBytea, ByteaType);
registerDataType(DataTypeOIDs.Point, DataTypeOIDs.ArrayPoint, PointType);
registerDataType(DataTypeOIDs.Circle, DataTypeOIDs.ArrayCircle, CircleType);
registerDataType(DataTypeOIDs.Lseg, DataTypeOIDs.ArrayLseg, LsegType);
registerDataType(DataTypeOIDs.Box, DataTypeOIDs.ArrayBox, LsegType);
