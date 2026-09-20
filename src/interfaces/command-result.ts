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
   * True when the server stopped at the `fetchCount` limit instead of
   * running the statement to completion: the portal suspended and the rows
   * behind it were never fetched, so `rows` is a prefix rather than the
   * whole result.
   *
   * Only ever set when an explicit `fetchCount` was given - the default
   * asks for every row. Note the server does not look ahead: a statement
   * whose result is exactly `fetchCount` rows long suspends too, so this
   * means "the limit was reached", not "there are definitely more rows".
   *
   * Use a Cursor when the point is to read a large result in batches; a
   * suspended portal on this path is simply discarded by the Sync that
   * follows.
   */
  suspended?: boolean;
  /**
   * How many rows the statement changed, for INSERT/UPDATE/DELETE/MERGE
   * (MERGE reports its own total of inserted, updated and deleted rows,
   * and needs PostgreSQL 15+). Left undefined for every other command,
   * including SELECT - the count those report describes rows returned or
   * moved, not rows affected.
   */
  rowsAffected?: number;
}
