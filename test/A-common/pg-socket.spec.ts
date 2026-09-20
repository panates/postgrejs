import * as net from 'node:net';
import * as tls from 'node:tls';
import { expect } from 'expect';
import { ConnectionState } from '../../src/constants.js';
import { ConnectionLostError } from '../../src/protocol/connection-lost-error.js';
import { PgSocket } from '../../src/protocol/pg-socket.js';

describe('PgSocket', () => {
  describe('sessionParameters', () => {
    it('should start out empty before any ParameterStatus arrives', () => {
      const socket = new PgSocket({});
      expect(socket.sessionParameters).toStrictEqual({});
    });
  });

  describe('protocolNegotiation', () => {
    it('should start out undefined before any NegotiateProtocolVersion arrives', () => {
      const socket = new PgSocket({});
      expect(socket.protocolNegotiation).toBeUndefined();
    });

    it('should store the message once _handleNegotiateProtocolVersion runs', () => {
      const socket: any = new PgSocket({});
      const msg = { supportedVersionMinor: 0, unrecognizedOptions: ['foo'] };
      socket._handleNegotiateProtocolVersion(msg);
      expect(socket.protocolNegotiation).toStrictEqual(msg);
    });
  });

  describe('_handleAuthenticationMessage()', () => {
    it('should throw on an authentication method it does not support', () => {
      const socket: any = new PgSocket({});
      expect(() =>
        socket._handleAuthenticationMessage({ kind: 'GSS' }),
      ).toThrow(/Authentication method "GSS" is not supported/);
    });

    it('should refuse channelBinding "require" when the connection is not using TLS', () => {
      const socket: any = new PgSocket({ channelBinding: 'require' });
      // No TLS socket is set up here at all - _socket stays undefined, so
      // the SASL branch's own `this._socket instanceof tls.TLSSocket`
      // check is false regardless of what the server offers.
      expect(() =>
        socket._handleAuthenticationMessage({
          kind: 'SASL',
          mechanisms: ['SCRAM-SHA-256', 'SCRAM-SHA-256-PLUS'],
        }),
      ).toThrow(
        /channelBinding is "require" but the connection is not using TLS/,
      );
    });

    it('should refuse channelBinding "require" when TLS is used but the server does not offer -PLUS', () => {
      const socket: any = new PgSocket({ channelBinding: 'require' });
      // A real TLSSocket instance (over an unconnected raw socket - no
      // handshake needed here) just to satisfy the branch's own
      // `instanceof tls.TLSSocket` check.
      socket._socket = new tls.TLSSocket(new net.Socket());
      expect(() =>
        socket._handleAuthenticationMessage({
          kind: 'SASL',
          mechanisms: ['SCRAM-SHA-256'],
        }),
      ).toThrow(
        /channelBinding is "require" but the server does not offer SCRAM-SHA-256-PLUS/,
      );
    });

    it('should refuse a mechanism list that offers neither SCRAM variant', () => {
      const socket: any = new PgSocket({});
      expect(() =>
        socket._handleAuthenticationMessage({
          kind: 'SASL',
          mechanisms: ['SOME-OTHER-MECHANISM'],
        }),
      ).toThrow(
        /Only mechanisms SCRAM-SHA-256 and SCRAM-SHA-256-PLUS are supported/,
      );
    });

    it('should send the password unmodified for CleartextPassword auth', async () => {
      const socket: any = new PgSocket({ password: 'secret123' });
      let sent: Buffer | undefined;
      socket._send = (buf: Buffer) => {
        sent = buf;
        return true;
      };
      socket._handleAuthenticationMessage({ kind: 'CleartextPassword' });
      // _resolvePassword() awaits options.password() even when it isn't a
      // function (a plain value resolves too), so the actual _send() call
      // lands on a later microtask, not synchronously within this call.
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(sent?.toString('utf8')).toContain('secret123');
    });

    it('should throw if SASLContinue arrives before SASL started a session', () => {
      const socket: any = new PgSocket({});
      expect(() =>
        socket._handleAuthenticationMessage({
          kind: 'SASLContinue',
          data: 'r=nonce',
        }),
      ).toThrow(/SASL: Session not started yet/);
    });

    it('should throw if SASLFinal arrives before SASL started a session', () => {
      const socket: any = new PgSocket({});
      expect(() =>
        socket._handleAuthenticationMessage({
          kind: 'SASLFinal',
          data: 'v=serverSignature',
        }),
      ).toThrow(/SASL: Session not started yet/);
    });

    it("should emit 'authenticate' for a bare AuthenticationOk with no payload", () => {
      const socket: any = new PgSocket({});
      let fired = false;
      socket.on('authenticate', () => {
        fired = true;
      });
      socket._handleAuthenticationMessage();
      expect(fired).toStrictEqual(true);
    });
  });

  describe('_handleError()', () => {
    // A socket error is reachable live only by breaking the network, so
    // this drives the handler directly - the close that Node always sends
    // after an 'error' is what the live tests in
    // test/B-connection/21-connection-lost.spec.ts cover.
    const capture = (socket: any) => {
      let rejected: any;
      socket._captureQueue.push({
        callback: () => undefined,
        resolve: () => undefined,
        reject: (e: any) => (rejected = e),
      });
      return () => rejected;
    };

    it('should reject what is in flight with a ConnectionLostError', () => {
      // Rather than a raw ECONNRESET, whose `code` is a Node errno where
      // a caller branching on `code` expects a SQLSTATE. The socket error
      // is kept as the cause.
      const socket: any = new PgSocket({});
      socket._state = ConnectionState.READY;
      socket._processID = 4242;
      const rejected = capture(socket);
      const cause = new Error('read ECONNRESET');
      socket._handleError(cause);
      const err = rejected();
      expect(err).toBeInstanceOf(ConnectionLostError);
      expect(err.code).toStrictEqual('08006');
      expect(err.processID).toStrictEqual(4242);
      expect((err as { cause?: unknown }).cause).toBe(cause);
    });

    it('should hand over the error itself when there was no connection yet', () => {
      // Nothing was lost before READY - the failure to connect is the
      // useful thing, and calling it a lost connection would be a lie.
      const socket: any = new PgSocket({});
      const rejected = capture(socket);
      const cause = new Error('connect ECONNREFUSED');
      socket._handleError(cause);
      expect(rejected()).toBe(cause);
    });

    it('should wrap a non-Error the same way', () => {
      const socket: any = new PgSocket({});
      const rejected = capture(socket);
      socket._handleError('something odd');
      expect(rejected()).toBeInstanceOf(Error);
      expect(rejected().message).toStrictEqual('something odd');
    });
  });

  describe('_channelBindingData()', () => {
    it('should throw when the TLS socket exposes no peer certificate', () => {
      const socket: any = new PgSocket({});
      const fakeTlsSocket = { getPeerX509Certificate: () => undefined };
      expect(() => socket._channelBindingData(fakeTlsSocket)).toThrow(
        /SCRAM-SHA-256-PLUS needs the server certificate/,
      );
    });
  });

  describe('sendQueryMessage()', () => {
    it('should reject when the underlying socket is not writable', async () => {
      const socket: any = new PgSocket({});
      // A destroyed net.Socket reports writable=false, same shape as one
      // that never got to CONNECTING at all - _send() returns false either
      // way, which is what this path exists to reject cleanly for instead
      // of hanging the caller forever.
      const raw = new net.Socket();
      raw.destroy();
      socket._socket = raw;
      await expect(
        socket.sendQueryMessage('select 1', () => undefined),
      ).rejects.toThrow(/Socket is not writable/);
    });
  });
});
