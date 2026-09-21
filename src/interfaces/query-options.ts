import type { BindParam } from '../connection/bind-param.js';
import type { DataFormat } from '../constants.js';
import type { DataTypeMap } from '../data-type-map.js';
import type { RowDecoder } from '../util/row-decoder.js';
import type { DataMappingOptions } from './data-mapping-options.js';

export interface QueryOptions extends DataMappingOptions {
  /**
   * Specifies weather execute query in auto-commit mode
   * @default true
   */
  autoCommit?: boolean;
  /**
   * Whether this statement may share a connection with statements that
   * are already in flight.
   *
   * PostgreSQL correlates responses to requests by order, so several
   * statements can be on the wire at once, each under its own Sync and
   * therefore with its own error boundary.
   *
   * **The default differs by where the statement runs, because the two
   * places are not the same question:**
   *
   * - On a `Connection`, **on**. The connection is the caller's own, and
   *   concurrent `query()` calls on one have always overlapped this way.
   * - On a `Pool`, **off**. Here it also decides *which* connection the
   *   statement runs on: sharing puts it on a connection other callers
   *   are using, where session state - `SET`, an advisory lock, a
   *   temporary table - is no longer the caller's alone. That is opt-in,
   *   per call or with `pipeline: true` on the pool.
   *
   * `false` asks for the wire to itself: the statement waits until
   * nothing else is running on the connection, and nothing else starts
   * until it finishes, whichever mode those asked for. Nothing orders
   * two pipelined statements against each other, so this is how a
   * statement that depends on what another one left behind says so.
   *
   * Some statements never share a *pooled* connection however this is
   * set, because they need one to themselves for longer than the call:
   * anything carrying an `AbortSignal`, anything with
   * `autoCommit: false`, a cursor, and SQL that opens a transaction or a
   * COPY. On a `Connection` the setting is only about the wire.
   */
  pipeline?: boolean;
  /**
   * Specifies if rows will be fetched as <FieldName, Value> pair objects or array of values
   * @deprecated Use `rowDecoder: 'object'` instead - `objectRows: true` still works exactly
   * as before, it's just the same thing `rowDecoder` now also expresses.
   * @default false
   */
  objectRows?: boolean;
  /**
   * Overrides the connection's `prepare` setting for this call - `false`
   * to keep a one-off statement out of the cache, `true` to use it on a
   * connection that has caching off.
   */
  prepare?: boolean;
  /**
   * Controls how each row's raw column data is turned into the value handed back to the
   * caller. `'array'` and `'object'` select the built-in decoders (the same output
   * `objectRows` has always produced); pass an instance of your own `RowDecoder` subclass
   * to take over decoding entirely instead - e.g. for lazy per-cell decoding. Takes
   * precedence over `objectRows` when both are set.
   * @default 'array'
   */
  rowDecoder?: 'array' | 'object' | RowDecoder;
  /**
   * Data type map instance
   * @default GlobalTypeMap
   */
  typeMap?: DataTypeMap;
  /**
   * If true, returns Cursor instance instead of rows.
   *
   * The cursor reads through a portal, and a portal lives only as long as
   * the transaction that created it. Outside an explicit transaction that
   * is the implicit one, which any other statement on the same connection
   * ends - so running another query on that connection while the cursor is
   * open destroys it. Open the cursor inside a transaction, or give it a
   * connection of its own; `Pool.query()` does the latter for you and
   * keeps the connection out of the pool until the cursor closes.
   */
  cursor?: boolean;
  /**
   * Query execution parameters
   */
  params?: (BindParam | any)[];
  /**
   * Specifies transfer format (binary or text) for each column
   * @default DataFormat.binary
   */
  columnFormat?: DataFormat | DataFormat[];
  /**
   * Maximum number of rows to fetch.
   *
   * `query()` fetches every row by default. Giving an explicit limit stops
   * the server at that many rows and leaves the rest unfetched: `rows` is
   * then a prefix and `suspended` is set on the result to say so. There is
   * no way to ask for the remainder afterwards - the portal is discarded
   * by the Sync that closes the call - so use a Cursor when the point is
   * to read a large result a piece at a time.
   *
   * For a Cursor this is the batch size instead: how many rows each fetch
   * asks for, defaulting to 100, with the cursor itself walking the whole
   * result.
   *
   * 0 means unlimited, as it does in the protocol.
   *
   * @default 0 for query(), 100 for a Cursor's batches
   */
  fetchCount?: number;
  /**
   * When on, if a statement in a transaction block generates an error,
   * the error is ignored and the transaction continues.
   * When off (the default), a statement in a transaction block that generates an error aborts the entire transaction
   * @default true
   */
  rollbackOnError?: boolean;

  /**
   * Aborts the call when the signal fires: the running statement is
   * cancelled on the server and the promise rejects with the signal's own
   * reason, with the database error attached as `cause`.
   *
   * Cancelling is a request rather than a guarantee - it travels on its own
   * connection and the statement may finish first - so the call settles when
   * the server has actually finished with it, not the moment abort() is
   * called. `AbortSignal.timeout(ms)` gives a per-call timeout.
   */
  signal?: AbortSignal;
  /**
   * Overrides the connection's own `asyncErrorHandling` for this call only -
   * see `DatabaseConnectionParams.asyncErrorHandling`.
   * @default the connection's own setting
   */
  asyncErrorHandling?: boolean;
  /**
   * Overrides the connection's own `timing` for this call only - see
   * `DatabaseConnectionParams.timing`.
   * @default the connection's own setting
   */
  timing?: boolean;
}
