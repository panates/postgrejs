import type { BatchCommandResult } from '../interfaces/batch-result.js';
import { Protocol } from './protocol.js';

export class DatabaseError extends Error {
  /**
   * Which entry of a multi-statement submission the server rejected -
   * PreparedStatement.executeBatch()'s parameter sets, or the statements
   * given to Connection.pipeline(). Entries after this index never ran:
   * PostgreSQL discards everything between an error and the single Sync
   * that closes such a submission.
   */
  failedIndex?: number;
  /**
   * The sets that had already completed when the batch failed, in
   * submission order - only set by PreparedStatement.executeBatch(). They
   * did run, but the batch shares one implicit transaction, so unless an
   * explicit transaction was already open they are rolled back with it.
   */
  batchResults?: BatchCommandResult[];
  /**
   * The message exactly as PostgreSQL sent it.
   *
   * `message` is decorated where the server reported a position - the
   * line and column, the offending source line and a caret under it -
   * which is what makes an error readable in a terminal with no extra
   * work, and would otherwise leave nothing holding the original. A
   * consumer that parses the text needs the original: PostgreSQL does
   * not always put the interesting part in a field, so an anchored
   * pattern like `/^column (.+) does not exist$/` is how the column name
   * is read, and a suffix defeats it.
   *
   * Always set, and equal to `message` when nothing was decorated.
   */
  readonly serverMessage: string;
  severity?: string;
  code?: string;
  detail?: string;
  hint?: string;
  position?: number;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
  lineNr?: number;
  colNr?: number;
  line?: string;

  constructor(msg: Protocol.ErrorResponseMessage) {
    super(msg.message);
    Object.assign(this, {
      ...msg,
      line: undefined,
      file: undefined,
      routine: undefined,
    });
    if (msg.position) this.position = parseInt(msg.position, 10) || undefined;
    // Read off `message` rather than off `msg`, and after the assign
    // above, so the two cannot drift apart - whatever this error was
    // built to say, before anything decorates it.
    this.serverMessage = this.message;
  }
}
