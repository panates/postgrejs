import { DataFormat, DataTypeNames } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { FieldInfo } from '../interfaces/field-info.js';
import type { Protocol } from '../protocol/protocol.js';

// DataTypeNames (oid -> name) is a static, never-mutated map, so its
// reverse (name -> oid) can be precomputed once here instead of rebuilding
// Object.keys(DataTypeNames) and linearly rescanning it (with no early
// exit) for every array-typed column in every query. Duplicate names would
// resolve to the same "last one wins" oid either way, matching the old
// loop's behavior exactly.
const DataTypeOIDByName: Record<string, number> = {};
for (const oid of Object.keys(DataTypeNames)) {
  DataTypeOIDByName[DataTypeNames[oid]] = Number(oid);
}

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
      const elementOid = DataTypeOIDByName[x.elementDataTypeName];
      if (elementOid !== undefined) x.elementDataTypeId = elementOid;
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
