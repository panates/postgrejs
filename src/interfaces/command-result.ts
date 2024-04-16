import { Row } from '../types.js';
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
   * Contains row type
   */
  rowType?: 'array' | 'object';
  /**
   * Time elapsed to execute command
   */
  executeTime?: number;
  /**
   * How many rows affected
   */
  rowsAffected?: number;
}
