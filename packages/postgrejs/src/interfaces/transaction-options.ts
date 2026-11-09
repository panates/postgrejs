/**
 * The modes PostgreSQL takes on the `BEGIN` itself.
 *
 * Setting them this way is one round trip where `BEGIN` followed by
 * `SET TRANSACTION` is two - measured at 0.500ms against 0.740ms for
 * opening and closing one isolated transaction, which is most of what a
 * short transaction costs.
 *
 * `SET TRANSACTION SNAPSHOT` is deliberately absent: PostgreSQL does not
 * accept it on `BEGIN`, so it still needs a statement of its own.
 */
export interface TransactionOptions {
  /**
   * What this transaction may see of the ones running beside it.
   * Defaults to the server's `default_transaction_isolation`, which is
   * `read committed` unless the server says otherwise.
   */
  isolationLevel?:
    'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted';
  /** Refuses anything that would write, at the server. */
  readOnly?: boolean;
  /**
   * Lets a `serializable` `readOnly` transaction wait until it can run
   * without the serialization failures that level otherwise risks -
   * ignored by the server for any other combination.
   */
  deferrable?: boolean;
}
