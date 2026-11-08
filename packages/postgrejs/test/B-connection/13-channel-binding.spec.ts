import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('SCRAM channel binding', () => {
  // Needs a SCRAM user and TLS; the environment says whether it has one.
  const user = process.env.LOGIN_SCRAM;
  const ssl = { rejectUnauthorized: false };

  async function connectAs(config: Record<string, any>) {
    const connection = new Connection({
      user,
      password: user,
      ssl,
      ...config,
    });
    try {
      await connection.connect();
      const r = await connection.query('select current_user as u');
      return r.rows?.[0][0];
    } finally {
      await connection.close(0);
    }
  }

  it('should bind to the channel when the server offers it', async function () {
    if (!user) return this.skip();
    // "require" fails unless SCRAM-SHA-256-PLUS was actually negotiated, so
    // connecting at all is the assertion.
    expect(await connectAs({ channelBinding: 'require' })).toStrictEqual(user);
  });

  it('should default to binding when it is available', async function () {
    if (!user) return this.skip();
    expect(await connectAs({})).toStrictEqual(user);
  });

  it('should authenticate without binding when disabled', async function () {
    if (!user) return this.skip();
    expect(await connectAs({ channelBinding: 'disable' })).toStrictEqual(user);
  });

  it('should refuse "require" on a connection without TLS', async function () {
    if (!user) return this.skip();
    const connection = new Connection({
      user,
      password: user,
      channelBinding: 'require',
    });
    await expect(connection.connect()).rejects.toThrow(
      /not using TLS|does not offer SCRAM-SHA-256-PLUS/,
    );
  });

  it('should refuse an unknown channel_binding value', () => {
    expect(
      () => new Connection('postgres://h/db?channel_binding=maybe'),
    ).toThrow(/is not supported/);
  });

  it('should report what the server said when authentication fails', async function () {
    if (!user) return this.skip();
    // Authentication happens before any capture is registered, so this used
    // to surface as "received message code=69 with an empty capture queue"
    // instead of the server's own message.
    const connection = new Connection({
      user,
      password: 'wrong-password',
      ssl,
    });
    let error: any;
    try {
      await connection.connect();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.code).toStrictEqual('28P01');
  });
});
