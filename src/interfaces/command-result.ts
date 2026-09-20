import type { Row } from '../types.js';
import type { FieldInfo } from './field-info.js';

export interface CommandResult {
  /**
   * Name of the command (INSERT, SELECT, UPDATE, etc.)
   */
  command?: string;
  /**
   * Contains information about fields in column order
   */
  fields?: FieldInfo[];
  /**
   * Contains array of row data
   */
  rows?: Row[];
  /**
   * Contains row type - `'custom'` when a custom `RowDecoder` instance was
   * supplied via `rowDecoder` (there's no way to know what shape it returns)
   */
  rowType?: 'array' | 'object' | 'custom';
  /**
   * Time elapsed to execute command - only measured when `timing` is
   * enabled (off by default; see `DatabaseConnectionParams.timing`).
   */
  executeTime?: number;
  /**
   * How many rows the statement changed, for INSERT/UPDATE/DELETE/MERGE
   * (MERGE reports its own total of inserted, updated and deleted rows,
   * and needs PostgreSQL 15+). Left undefined for every other command,
   * including SELECT - the count those report describes rows returned or
   * moved, not rows affected.
   */
  rowsAffected?: number;
}
