import { expect } from 'expect';
import { Connection } from 'postgrejs';

describe('Multiple hosts', () => {
  // Nothing listens here, so connecting to it fails immediately.
  const DEAD = { host: '127.0.0.1', port: 9 };

  function live(): { host: string; port?: number } {
    const cfg = new Connection().config;
    return { host: cfg.host!, port: cfg.port };
  }

  it('should fall through to the next host when the first is down', async () => {
    const connection = new Connection({ hosts: [DEAD, live()] });
    try {
      await connection.connect();
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    } finally {
      await connection.close(0);
    }
  });

  it('should report the last failure when no host can be reached', async () => {
    const connection = new Connection({
      hosts: [DEAD, { host: '127.0.0.1', port: 10 }],
    });
    // Only the final attempt is worth reporting - the earlier ones were
    // candidates, not errors the caller can act on.
    await expect(connection.connect()).rejects.toThrow(/127\.0\.0\.1:10/);
  });

  it('should accept a server that matches targetSessionAttrs', async () => {
    const connection = new Connection({
      hosts: [live()],
      targetSessionAttrs: 'read-write',
    });
    try {
      await connection.connect();
      const r = await connection.query('select 1 as one');
      expect(r.rows?.[0][0]).toStrictEqual(1);
    } finally {
      await connection.close(0);
    }
  });

  it('should reject every server when none matches targetSessionAttrs', async () => {
    // The test server is a primary, so asking for a standby matches nothing.
    const connection = new Connection({
      hosts: [live()],
      targetSessionAttrs: 'standby',
    });
    await expect(connection.connect()).rejects.toThrow(
      /No server matched target_session_attrs "standby"/,
    );
  });

  it('should skip an unreachable host before checking the rest', async () => {
    const connection = new Connection({
      hosts: [DEAD, live()],
      targetSessionAttrs: 'read-write',
    });
    try {
      await connection.connect();
      expect(connection.processID).toBeGreaterThan(0);
    } finally {
      await connection.close(0);
    }
  });
});
