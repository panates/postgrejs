import type { Cursor } from '../connection/cursor';
import type { CommandResult } from './command-result.js';

export interface QueryResult extends CommandResult {
  /**
   * Cursor instance
   */
  cursor?: Cursor;
}
