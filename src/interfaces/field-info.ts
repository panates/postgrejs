export interface FieldInfo {
  /**
   * Name of the field
   */
  fieldName: string;
  /**
   * OID of the table
   */
  tableId?: number;
  /**
   * OID of the column
   */
  columnId?: number;
  /**
   * OID of the data type
   */
  dataTypeId: number;
  /**
   * Name of the data type
   */
  dataTypeName: string;
  /**
   * OID of the elements data type if field is an array
   */
  elementDataTypeId?: number;
  /**
   * Name of the elements data type if field is an array
   */
  elementDataTypeName?: string;
  /**
   * JS type name that data type mapped
   */
  jsType: string;
  /**
   * Data length if data type has a fixed size
   */
  fixedSize?: number;
  /**
   * Modifier of the data type
   */
  modifier?: number;
  /**
   * Whether the data type is an array
   */
  isArray?: boolean;
}
