import { expect } from 'expect';
import { Connection, DataFormat } from 'postgrejs';

describe('callFunction() (legacy Function Call sub-protocol)', () => {
  let connection: Connection;

  before(async () => {
    connection = new Connection();
    await connection.connect();
  });

  after(async () => {
    await connection.close();
  });

  async function findOid(proname: string, pronargs: number): Promise<number> {
    const result = await connection.query(
      'select oid from pg_proc where proname = $1 and pronargs = $2',
      { params: [proname, pronargs] },
    );
    return Number((result.rows as any[])[0][0]);
  }

  it('should call a built-in function by OID with text arguments/result', async () => {
    // md5, not upper: the latter needs a collation, which the executor
    // can only resolve from a parsed SQL expression - a raw FunctionCall
    // argument has no such context, so it fails with "could not
    // determine which collation to use". md5 doesn't care about
    // collation at all, so it works the same through either protocol.
    const oid = await findOid('md5', 1);
    const result = await connection.callFunction(oid, [
      Buffer.from('hello', 'utf8'),
    ]);
    expect(result.result?.toString('utf8')).toStrictEqual(
      '5d41402abc4b2a76b9719d911017c592',
    );
  });

  it('should call a built-in function with binary arguments/result', async () => {
    const oid = await findOid('int4pl', 2);
    const a = Buffer.alloc(4);
    a.writeInt32BE(2);
    const b = Buffer.alloc(4);
    b.writeInt32BE(3);
    const result = await connection.callFunction(oid, [a, b], {
      argFormats: [DataFormat.binary],
      resultFormat: DataFormat.binary,
    });
    expect(result.result?.readInt32BE()).toStrictEqual(5);
  });

  it('should return a null result for a strict function called with a null argument', async () => {
    const oid = await findOid('md5', 1);
    const result = await connection.callFunction(oid, [null]);
    expect(result.result).toBeNull();
  });

  it('should reject with the server error for an unknown function OID', async () => {
    await expect(connection.callFunction(0, [])).rejects.toThrow();
  });
});
