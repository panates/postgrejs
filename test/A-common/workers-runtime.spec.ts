import { expect } from 'expect';
import { PgSocket } from '../../src/protocol/pg-socket.js';
import { maxSizeFor, SmartBuffer } from '../../src/protocol/smart-buffer.js';
import { WorkerdSocket } from '../../src/protocol/workerd-socket.js';
import { isWorkerd } from '../../src/util/runtime.js';

/**
 * What this client does differently on Cloudflare's workerd: a plain
 * connection goes through `node:net` as everywhere else, and a TLS one
 * through a socket of the runtime's own, because `tls.connect({ socket })`
 * is not something it can carry out and `startTls()` is.
 *
 * The upgrade itself is driven here against a `cloudflare:sockets` of our
 * own making - the real one answers only on that runtime, and the thing
 * worth pinning is the sequence either side of it.
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

  describe('which socket a connection opens', () => {
    const socketOf = (options: any): any => {
      const pg: any = new PgSocket(options);
      pg._hosts = [{ host: 'db.example.com', port: 5432 }];
      pg._hostIndex = 0;
      try {
        pg._connectToHost();
      } catch {
        // workerd's own connect is not here; the choice is already made.
      }
      const s = pg._socket;
      s?.destroy?.();
      return s;
    };

    it('should open a WorkerdSocket when TLS is wanted on workerd', () => {
      // `secureTransport: 'starttls'` is a connect-time choice there, so
      // the kind of socket has to be decided before the negotiation.
      pretendWorkerd(true);
      expect(socketOf({ ssl: {} })).toBeInstanceOf(WorkerdSocket);
      expect(socketOf({ requireSSL: true })).toBeInstanceOf(WorkerdSocket);
    });

    it('should leave direct negotiation alone, which is refused by name', () => {
      // TLS from the first byte needs the `postgresql` ALPN protocol, and
      // the runtime's socket options have nowhere to announce it - the
      // server answers by closing, which surfaces as an internal error
      // with a reference number. There is no socket to open for it.
      pretendWorkerd(true);
      expect(
        socketOf({ ssl: {}, sslNegotiation: 'direct' }),
      ).not.toBeInstanceOf(WorkerdSocket);
    });

    it('should refuse direct negotiation with a message naming ALPN', async () => {
      pretendWorkerd(true);
      const pg: any = new PgSocket({ ssl: {}, sslNegotiation: 'direct' });
      const e = await new Promise<Error>(resolve => {
        pg._negotiateTls(
          { write: () => true, once: () => undefined } as any,
          { host: 'db.example.com', port: 5432 },
          () => resolve(new Error('upgraded, which it must not')),
          (err: Error) => resolve(err),
        );
      });
      expect(e.message).toMatch(/sslNegotiation "direct" is not available/);
      expect(e.message).toMatch(/ALPN/);
    });

    it('should leave a plain connection on node:net, which works there', () => {
      pretendWorkerd(true);
      expect(socketOf({})).not.toBeInstanceOf(WorkerdSocket);
    });

    it('should never open one off workerd', () => {
      expect(socketOf({ ssl: {} })).not.toBeInstanceOf(WorkerdSocket);
      expect(socketOf({})).not.toBeInstanceOf(WorkerdSocket);
    });
  });

  describe('WorkerdSocket', () => {
    /** A `cloudflare:sockets` of our own, so the adapter can be driven. */
    const fakeRuntime = () => {
      const made: any[] = [];
      const makeSocket = () => {
        let push!: (v: Uint8Array) => void;
        let finish!: () => void;
        let settleClosed!: () => void;
        const written: Uint8Array[] = [];
        const sock: any = {
          written,
          readable: new ReadableStream<Uint8Array>({
            start(c) {
              push = v => c.enqueue(v);
              finish = () => c.close();
            },
          }),
          writable: new WritableStream<Uint8Array>({
            write(chunk) {
              written.push(chunk);
            },
          }),
          closed: new Promise<void>(r => (settleClosed = r)),
          close: async () => settleClosed(),
          startTls: (opts: any) => {
            sock.tlsOptions = opts;
            settleClosed(); // the runtime settles the old one on upgrade
            const next = makeSocket();
            next.upgraded = true;
            return next;
          },
          push: (v: Uint8Array) => push(v),
          finish: () => finish(),
        };
        made.push(sock);
        return sock;
      };
      return {
        made,
        connect: (() => makeSocket()) as any,
      };
    };

    it('should emit connect, then the bytes it reads', async () => {
      const rt = fakeRuntime();
      const s = new WorkerdSocket(false, async () => rt.connect);
      const seen: Buffer[] = [];
      s.on('data', (b: Buffer) => seen.push(b));
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      rt.made[0].push(new Uint8Array([1, 2, 3]));
      await new Promise(r => setTimeout(r, 10));
      expect(Buffer.concat(seen)).toStrictEqual(Buffer.from([1, 2, 3]));
    });

    it('should ask for starttls only when TLS is wanted', async () => {
      const rt = fakeRuntime();
      let opts: any;
      const connect = ((_a: string, o?: any) => {
        opts = o;
        return rt.connect(_a, o);
      }) as any;
      const s = new WorkerdSocket(true, async () => connect);
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      expect(opts.secureTransport).toStrictEqual('starttls');
      const plain = new WorkerdSocket(false, async () => connect);
      plain.connect(5432, 'db.example.com');
      await new Promise<void>(r => plain.once('connect', r));
      expect(opts.secureTransport).toStrictEqual('off');
    });

    it('should upgrade in place and not report the old socket closing', async () => {
      // The runtime settles the pre-upgrade socket's `closed` because it
      // was replaced. Reporting that as a disconnect would end the
      // session in the middle of its own handshake.
      const rt = fakeRuntime();
      const s = new WorkerdSocket(true, async () => rt.connect);
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      let closed = false;
      s.on('close', () => (closed = true));
      const secure = new Promise<void>(r => s.once('secureConnect', r));
      s.startTls('db.example.com');
      await secure;
      await new Promise(r => setTimeout(r, 10));
      expect(closed).toStrictEqual(false);
      expect(s.secure).toStrictEqual(true);
      expect(rt.made[0].tlsOptions).toStrictEqual({
        expectedServerHostname: 'db.example.com',
      });
    });

    it('should read from the upgraded socket afterwards', async () => {
      const rt = fakeRuntime();
      const s = new WorkerdSocket(true, async () => rt.connect);
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      const secure = new Promise<void>(r => s.once('secureConnect', r));
      s.startTls();
      await secure;
      const seen: Buffer[] = [];
      s.on('data', (b: Buffer) => seen.push(b));
      rt.made[1].push(new Uint8Array([9]));
      await new Promise(r => setTimeout(r, 10));
      expect(Buffer.concat(seen)).toStrictEqual(Buffer.from([9]));
    });

    it('should write what it is given', async () => {
      const rt = fakeRuntime();
      const s = new WorkerdSocket(false, async () => rt.connect);
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      await new Promise<void>(r => s.write(Buffer.from('hi'), () => r()));
      expect(Buffer.from(rt.made[0].written[0])).toStrictEqual(
        Buffer.from('hi'),
      );
    });

    it('should report a connect that never happens', async () => {
      const s = new WorkerdSocket(false, async () => {
        throw new Error('no cloudflare:sockets here');
      });
      const seen = new Promise<Error>(r => s.once('error', r));
      s.connect(5432, 'db.example.com');
      const e = await seen;
      expect(e.message).toMatch(/no cloudflare:sockets/);
    });

    it('should stop reading while paused', async () => {
      const rt = fakeRuntime();
      const s = new WorkerdSocket(false, async () => rt.connect);
      s.connect(5432, 'db.example.com');
      await new Promise<void>(r => s.once('connect', r));
      const seen: Buffer[] = [];
      s.on('data', (b: Buffer) => seen.push(b));
      s.pause();
      rt.made[0].push(new Uint8Array([7]));
      await new Promise(r => setTimeout(r, 10));
      expect(seen.length).toStrictEqual(0);
      s.resume();
      await new Promise(r => setTimeout(r, 10));
      expect(Buffer.concat(seen)).toStrictEqual(Buffer.from([7]));
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
