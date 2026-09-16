import type { FieldInfo } from './field-info.js';

/**
 * What one parameter set in a batch produced. There is exactly one of
 * these per set handed to `PreparedStatement.executeBatch()`, in the same
 * order - the server answers each Execute with its own CommandComplete,
 * so the mapping is positional and does not depend on the statement.
 */
export interface BatchCommandResult {
  /** The command tag PostgreSQL reported for this set (INSERT/UPDATE/...). */
  command?: string;
  /** Rows affected, for INSERT/UPDATE/DELETE - as in QueryResult. */
  rowsAffected?: number;
  /**
   * Rows this set returned, decoded the same way `execute()` decodes them
   * (including any `rowDecoder` given in the options). Only present when
   * the statement actually returns rows - a plain UPDATE without RETURNING
   * leaves this undefined rather than setting it to an empty array.
   */
  rows?: any[];
}

/**
 * The result of `PreparedStatement.executeBatch()`.
 *
 * `results` is always the full set of *completed* sets. On success that is
 * every set that was submitted; when the server rejects one, the batch
 * stops there (see the class doc) and the completed prefix is attached to
 * the thrown error as `batchResults` instead.
 */
export interface BatchResult {
  /** One entry per parameter set, in submission order. */
  results: BatchCommandResult[];
  /** Sum of every set's `rowsAffected`, for the common bulk-write case. */
  totalRowsAffected: number;
  /**
   * Column descriptions, when the statement returns rows. One copy for the
   * whole batch rather than per set: every set runs the same prepared
   * statement, so the shape cannot differ between them.
   */
  fields?: FieldInfo[];
  /** Wall time for the whole batch, when `timing` is enabled. */
  executeTime?: number;
}
