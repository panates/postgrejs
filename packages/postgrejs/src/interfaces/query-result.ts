import type { Cursor } from '../connection/cursor.js';
import type { CommandResult } from './command-result.js';

/**
 * What `query()` answered with - a `CommandResult`, plus the cursor when
 * one was asked for.
 *
 * With `cursor: true` the rows are read through `cursor` instead of
 * `rows`, which stays empty.
 */
export interface QueryResult extends CommandResult {
  /**
   * Cursor instance
   */
  cursor?: Cursor;
}
