import { BufferReader } from './buffer-reader.js';

/**
 * Decoder for `pgoutput`, the logical decoding plugin PostgreSQL ships with,
 * at protocol version 1.
 *
 * The server does not repeat a table's shape with every row: a Relation
 * message describes it once and later Insert/Update/Delete messages refer to
 * it by OID, so a decoder has to remember relations as it goes. That is why
 * this is a class rather than a function.
 */

/** Microseconds since 2000-01-01, which is how this protocol tells time. */
const PG_EPOCH_MS = Date.UTC(2000, 0, 1);

export interface PgOutputColumn {
  name: string;
  dataTypeId: number;
  typeModifier: number;
  /** Part of the replica identity, so it can identify a row on its own. */
  isKey: boolean;
}

export interface PgOutputRelation {
  relationId: number;
  schema: string;
  name: string;
  replicaIdentity: string;
  columns: PgOutputColumn[];
}

export type PgOutputMessage =
  | { kind: 'begin'; finalLsn: bigint; commitTime: Date; xid: number }
  | { kind: 'commit'; commitLsn: bigint; endLsn: bigint; commitTime: Date }
  | { kind: 'relation'; relation: PgOutputRelation }
  | { kind: 'type'; dataTypeId: number; schema: string; name: string }
  | { kind: 'insert'; relation: PgOutputRelation; row: TupleValues }
  | {
      kind: 'update';
      relation: PgOutputRelation;
      row: TupleValues;
      oldRow?: TupleValues;
    }
  | { kind: 'delete'; relation: PgOutputRelation; oldRow: TupleValues }
  | { kind: 'truncate'; relations: PgOutputRelation[] }
  | { kind: 'origin'; commitLsn: bigint; name: string }
  | { kind: 'message'; prefix: string; content: Buffer; lsn: bigint }
  // A message this version does not know: reported rather than thrown, so a
  // newer server cannot stop a stream the caller may not even care about.
  | { kind: 'unknown'; code: string };

/**
 * A row as pgoutput sends it: column name to its raw text, or null. A value
 * left out because it did not change and lives in TOAST storage is absent
 * from the map entirely - which is not the same as being null.
 */
export type TupleValues = Record<string, string | null>;

export class PgOutputDecoder {
  protected readonly _relations = new Map<number, PgOutputRelation>();

  decode(data: Buffer): PgOutputMessage {
    const io = new BufferReader(data);
    const code = String.fromCharCode(io.readUInt8());
    switch (code) {
      case 'B':
        return {
          kind: 'begin',
          finalLsn: readLsn(io),
          commitTime: readTime(io),
          xid: io.readUInt32BE(),
        };
      case 'C': {
        io.readUInt8(); // flags, unused at this version
        return {
          kind: 'commit',
          commitLsn: readLsn(io),
          endLsn: readLsn(io),
          commitTime: readTime(io),
        };
      }
      case 'O':
        return {
          kind: 'origin',
          commitLsn: readLsn(io),
          name: io.readCString(),
        };
      case 'R': {
        const relation: PgOutputRelation = {
          relationId: io.readUInt32BE(),
          schema: io.readCString(),
          name: io.readCString(),
          replicaIdentity: String.fromCharCode(io.readUInt8()),
          columns: [],
        };
        const count = io.readUInt16BE();
        for (let i = 0; i < count; i++) {
          relation.columns.push({
            isKey: io.readUInt8() === 1,
            name: io.readCString(),
            dataTypeId: io.readUInt32BE(),
            typeModifier: io.readInt32BE(),
          });
        }
        this._relations.set(relation.relationId, relation);
        return { kind: 'relation', relation };
      }
      case 'Y':
        return {
          kind: 'type',
          dataTypeId: io.readUInt32BE(),
          schema: io.readCString(),
          name: io.readCString(),
        };
      case 'I': {
        const relation = this._relation(io.readUInt32BE());
        io.readUInt8(); // 'N'
        return { kind: 'insert', relation, row: this._tuple(io, relation) };
      }
      case 'U': {
        const relation = this._relation(io.readUInt32BE());
        let oldRow: TupleValues | undefined;
        // 'K' is the old row's key columns, 'O' the whole old row; either
        // appears only when the table's replica identity provides it, and
        // the 'N' tag for the new row follows in every case.
        const tag = String.fromCharCode(io.readUInt8());
        if (tag === 'K' || tag === 'O') {
          oldRow = this._tuple(io, relation);
          io.readUInt8(); // 'N'
        }
        return {
          kind: 'update',
          relation,
          row: this._tuple(io, relation),
          oldRow,
        };
      }
      case 'D': {
        const relation = this._relation(io.readUInt32BE());
        io.readUInt8(); // 'K' or 'O'
        return { kind: 'delete', relation, oldRow: this._tuple(io, relation) };
      }
      case 'T': {
        const count = io.readUInt32BE();
        io.readUInt8(); // flags: cascade / restart identity
        const relations: PgOutputRelation[] = [];
        for (let i = 0; i < count; i++)
          relations.push(this._relation(io.readUInt32BE()));
        return { kind: 'truncate', relations };
      }
      case 'M': {
        io.readUInt8(); // flags
        const lsn = readLsn(io);
        const prefix = io.readCString();
        const length = io.readUInt32BE();
        return { kind: 'message', prefix, lsn, content: io.readBytes(length) };
      }
      default:
        return { kind: 'unknown', code };
    }
  }

  protected _relation(relationId: number): PgOutputRelation {
    const relation = this._relations.get(relationId);
    if (!relation)
      throw new Error(
        `Logical replication: a change arrived for relation ${relationId} before its description did`,
      );
    return relation;
  }

  protected _tuple(io: BufferReader, relation: PgOutputRelation): TupleValues {
    const count = io.readUInt16BE();
    const out: TupleValues = {};
    for (let i = 0; i < count; i++) {
      const column = relation.columns[i];
      const kind = String.fromCharCode(io.readUInt8());
      if (kind === 'n') {
        out[column.name] = null;
      } else if (kind === 'u') {
        // Unchanged and stored out of line: the server did not send it, and
        // leaving the key out says so rather than claiming it is null.
        continue;
      } else {
        const length = io.readUInt32BE();
        out[column.name] = io.readBytes(length).toString('utf8');
      }
    }
    return out;
  }
}

function readLsn(io: BufferReader): bigint {
  const hi = BigInt(io.readUInt32BE());
  const lo = BigInt(io.readUInt32BE());
  return (hi << 32n) | lo;
}

function readTime(io: BufferReader): Date {
  const micros = (BigInt(io.readUInt32BE()) << 32n) | BigInt(io.readUInt32BE());
  return new Date(PG_EPOCH_MS + Number(micros / 1000n));
}

/** `0/16B3748`, the form PostgreSQL prints an LSN in. */
export function formatLsn(lsn: bigint): string {
  return `${(lsn >> 32n).toString(16).toUpperCase()}/${(lsn & 0xffffffffn).toString(16).toUpperCase()}`;
}
