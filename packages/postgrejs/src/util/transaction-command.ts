/**
 * Statements that open or close a transaction, and so manage their own
 * boundaries: an implicit BEGIN or COMMIT around one would be wrong, and
 * wrapping one in a savepoint - COMMIT, say - is nonsense.
 */
const TRANSACTION_COMMAND_PATTERN =
  /^(\bBEGIN\b|\bCOMMIT\b|\bSTART\b|\bROLLBACK|SAVEPOINT|RELEASE\b)/i;

/**
 * `SET TRANSACTION`, which configures the transaction it runs in rather
 * than opening or closing one.
 *
 * It needs an answer of its own because the two are not the same
 * question. PostgreSQL refuses two of its forms inside a subtransaction
 * - `SET TRANSACTION ISOLATION LEVEL` and `SET TRANSACTION [NOT]
 * DEFERRABLE`, both 25001 - so the savepoint `rollbackOnError` puts
 * around every statement in a transaction made them impossible to run
 * at all. But the implicit BEGIN that `autoCommit: false` adds is
 * exactly what they need, so answering "transaction command" for them
 * and suppressing both would trade one failure for another.
 */
const CONFIGURES_TRANSACTION_PATTERN = /^\bSET\s+TRANSACTION\b/i;

/** Whether `sql` opens or closes a transaction. */
export function isTransactionCommand(sql: string): boolean {
  return TRANSACTION_COMMAND_PATTERN.test(sql);
}

/**
 * Whether `sql` must not run inside a savepoint - it is a transaction
 * command, or it configures the transaction.
 */
export function refusesSavepoint(sql: string): boolean {
  return (
    TRANSACTION_COMMAND_PATTERN.test(sql) ||
    CONFIGURES_TRANSACTION_PATTERN.test(sql)
  );
}
