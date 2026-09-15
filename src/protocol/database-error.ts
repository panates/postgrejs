import type { BatchCommandResult } from '../interfaces/batch-result.js';
import { Protocol } from './protocol.js';

export class DatabaseError extends Error {
  /**
   * Which parameter set PreparedStatement.executeBatch() was on when the
   * server rejected the batch - only set by that path. Sets after this
   * index never ran: PostgreSQL discards everything between an error and
   * the batch's single Sync.
   */
  batchIndex?: number;
  /**
   * The sets that had already completed when the batch failed, in
   * submission order - only set by PreparedStatement.executeBatch(). They
   * did run, but the batch shares one implicit transaction, so unless an
   * explicit transaction was already open they are rolled back with it.
   */
  batchResults?: BatchCommandResult[];
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
  }
}
