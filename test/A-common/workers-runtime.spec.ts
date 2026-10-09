import { expect } from 'expect';
import { PgSocket } from '../../src/protocol/pg-socket.js';
import { maxSizeFor, SmartBuffer } from '../../src/protocol/smart-buffer.js';
import { isWorkerd } from '../../src/util/runtime.js';

/**
 * What this client does differently on Cloudflare's workerd, where a
 * plain connection works unchanged but TLS cannot: the runtime's whole
 * TLS surface is `{ expectedServerHostname?: string }`, so there is no
 * way to say which certificate to trust, and `tls.connect()` there
 * cannot upgrade an already-connected socket at all.
 */
describe('Cloudflare Workers', () => {
  const realNavigator = (globalThis as any).navigator;
  const pretendWorkerd = (on: boolean) => {
    if (on)
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Cloudflare-Workers' },
        configurable: true,
        writable: true,
      });
    else
      Object.defineProperty(globalThis, 'navigator', {
        value: realNavigator,
        configurable: true,
        writable: true,
      });
  };
  afterEach(() => pretendWorkerd(false));

  describe('isWorkerd()', () => {
    it('should answer no on the runtime the tests run in', () => {
      expect(isWorkerd()).toStrictEqual(false);
    });

    it('should answer yes for workerd s own userAgent, and only that', () => {
      pretendWorkerd(true);
      expect(isWorkerd()).toStrictEqual(true);
      // Node and Bun define `navigator` too - a substring search would
      // claim anything that merely mentions it.
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Cloudflare-Workers/2' },
        configurable: true,
        writable: true,
      });
      expect(isWorkerd()).toStrictEqual(false);
    });
  });

  describe('TLS is refused rather than attempted', () => {
    const negotiate = (options: any): Promise<Error> =>
      new Promise(resolve => {
        const socket: any = new PgSocket(options);
        socket._negotiateTls(
          { write: () => true, once: () => undefined } as any,
          { host: 'db.example.com', port: 5432 },
          () => resolve(new Error('connected, which it must not')),
          (e: Error) => resolve(e),
        );
      });

    for (const [label, options] of [
      ['ssl options given', { ssl: {} }],
      ['requireSSL', { requireSSL: true }],
      ['sslNegotiation: direct', { ssl: {}, sslNegotiation: 'direct' }],
    ] as [string, any][]) {
      it(`should refuse ${label} with a message that says why`, async () => {
        pretendWorkerd(true);
        const e = await negotiate(options);
        // Measured on workerd, these three answer "Network connection
        // lost.", "option is not implemented", and nothing at all until
        // the connect timeout - none of which a caller can act on.
        expect(e.message).toMatch(/not available on Cloudflare Workers/);
        expect(e.message).toMatch(/Hyperdrive/);
      });
    }

    it('should let a plain connection through untouched', async () => {
      pretendWorkerd(true);
      const ready = await new Promise<string>(resolve => {
        const socket: any = new PgSocket({});
        socket._negotiateTls(
          'the-socket' as any,
          { host: 'db.example.com', port: 5432 },
          (s: any) => resolve(s),
          (e: Error) => resolve('error: ' + e.message),
        );
      });
      expect(ready).toStrictEqual('the-socket');
    });
  });

  describe('maxSizeFor()', () => {
    it('should answer the cap when the machine cannot be measured', () => {
      // workerd's `os.totalmem()` answers 0 rather than throwing.
      expect(maxSizeFor(0)).toStrictEqual(1024 * 1024 * 1024 * 2);
      expect(maxSizeFor(-1)).toStrictEqual(1024 * 1024 * 1024 * 2);
    });

    it('should answer half the memory below the cap', () => {
      expect(maxSizeFor(1024)).toStrictEqual(512);
      expect(maxSizeFor(8 * 1024 * 1024 * 1024)).toStrictEqual(
        1024 * 1024 * 1024 * 2,
      );
    });

    it('should never hand a buffer a size of zero', () => {
      // The whole point: a falsy maxLength reads as "use the default" in
      // flexy-buffer, so a zero here would have been invisible until
      // that default changed.
      expect(SmartBuffer.DEFAULT_MAX_SIZE).toBeGreaterThan(0);
    });
  });
});
