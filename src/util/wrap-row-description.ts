import { DataFormat, DataTypeNames } from '../constants.js';
import { DataTypeMap } from '../data-type-map.js';
import { FieldInfo } from '../interfaces/field-info.js';
import { Protocol } from '../protocol/protocol.js';

export function wrapRowDescription(
  typeMap: DataTypeMap,
  fields: Protocol.RowDescription[],
  columnFormat: DataFormat | DataFormat[],
): FieldInfo[] {
  return fields.map((f, idx) => {
    const cf = Array.isArray(columnFormat) ? columnFormat[idx] : columnFormat;
    const x: FieldInfo = {
      fieldName: f.fieldName,
      tableId: f.tableId,
      columnId: f.columnId,
      dataTypeId: f.dataTypeId,
      dataTypeName: DataTypeNames[f.dataTypeId] || '',
      jsType: cf === DataFormat.binary ? 'Buffer' : 'string',
    };
    x.isArray = x.dataTypeName.startsWith('_');
    if (x.isArray) {
      x.elementDataTypeName = x.dataTypeName.substring(1);
      for (const oid of Object.keys(DataTypeNames)) {
        if (DataTypeNames[oid] === x.elementDataTypeName) x.elementDataTypeId = parseInt(oid, 10);
      }
    }
    if (f.fixedSize && f.fixedSize > 0) x.fixedSize = f.fixedSize;
    if (f.modifier && f.modifier > 0) x.modifier = f.modifier;
    const reg = typeMap.get(x.dataTypeId);
    if (reg) {
      x.jsType = reg.jsType;
    }
    return x;
  });
}
