import { expect } from 'expect';
import { SASL } from '../../src/protocol/sasl.js';

describe('SASL (SCRAM-SHA-256)', () => {
  describe('createSession()', () => {
    it('should announce channel binding in use when bindingData is given', () => {
      const session = SASL.createSession(
        'alice',
        'SCRAM-SHA-256-PLUS',
        Buffer.from('cert-hash'),
        true,
      );
      expect(session.gs2Header).toStrictEqual('p=tls-server-end-point,,');
      expect(
        session.clientFirstMessage.startsWith(session.gs2Header),
      ).toStrictEqual(true);
    });

    it('should announce "supported but unused" when the client could bind but has no data for it', () => {
      const session = SASL.createSession(
        'alice',
        'SCRAM-SHA-256',
        undefined,
        true,
      );
      expect(session.gs2Header).toStrictEqual('y,,');
    });

    it('should announce plain "not supported" otherwise', () => {
      const session = SASL.createSession('alice', 'SCRAM-SHA-256');
      expect(session.gs2Header).toStrictEqual('n,,');
    });

    it('should write the client-first-message as n=<username>,r=<nonce>, prefixed by the header', () => {
      const session = SASL.createSession('alice', 'SCRAM-SHA-256');
      expect(session.clientFirstMessage).toStrictEqual(
        `n,,n=alice,r=${session.nonce}`,
      );
    });
  });

  describe('continueSession()', () => {
    function freshSession() {
      return SASL.createSession('alice', 'SCRAM-SHA-256');
    }

    it('should throw when the server-first-message carries no nonce', () => {
      const session = freshSession();
      expect(() =>
        SASL.continueSession(session, 'pw', 's=c2FsdA==,i=4096'),
      ).toThrow(/nonce missing/);
    });

    it('should throw when the server-first-message carries no salt', () => {
      const session = freshSession();
      expect(() =>
        SASL.continueSession(session, 'pw', `r=${session.nonce}xyz,i=4096`),
      ).toThrow(/salt missing/);
    });

    it('should throw when the server-first-message carries no iteration count', () => {
      const session = freshSession();
      expect(() =>
        SASL.continueSession(session, 'pw', `r=${session.nonce}xyz,s=c2FsdA==`),
      ).toThrow(/iteration missing/);
    });

    it("should throw when the server's nonce does not extend the client's own", () => {
      const session = freshSession();
      expect(() =>
        SASL.continueSession(
          session,
          'pw',
          'r=completely-different-nonce,s=c2FsdA==,i=4096',
        ),
      ).toThrow(/Server nonce does not start with client nonce/);
    });

    it('should ignore an unrecognized attribute in the server-first-message', () => {
      const session = freshSession();
      // 'x=' is not one of r/s/i - the switch's default case, harmlessly
      // skipped, must not stop the real fields from still being read.
      expect(() =>
        SASL.continueSession(
          session,
          'pw',
          `x=unused,r=${session.nonce}xyz,s=c2FsdA==,i=4096`,
        ),
      ).not.toThrow();
      expect(session.clientFinalMessage).toBeDefined();
    });

    it('should compute a client-final-message once nonce/salt/iteration are all present', () => {
      const session = freshSession();
      SASL.continueSession(
        session,
        'correct horse battery staple',
        `r=${session.nonce}xyz,s=c2FsdA==,i=4096`,
      );
      expect(session.clientFinalMessage).toMatch(
        /^c=biws,r=.+,p=.+$/, // c=base64("n,,"), r=<nonce>, p=<base64 proof>
      );
      expect(session.serverSignature).toBeDefined();
    });
  });

  describe('finalizeSession()', () => {
    it('should throw when the server signature does not match', () => {
      const session = SASL.createSession('alice', 'SCRAM-SHA-256');
      SASL.continueSession(
        session,
        'pw',
        `r=${session.nonce}xyz,s=c2FsdA==,i=4096`,
      );
      expect(() =>
        SASL.finalizeSession(session, 'v=not-the-real-signature'),
      ).toThrow(/Server signature does not match/);
    });

    it('should accept a matching server signature without throwing', () => {
      const session = SASL.createSession('alice', 'SCRAM-SHA-256');
      SASL.continueSession(
        session,
        'pw',
        `r=${session.nonce}xyz,s=c2FsdA==,i=4096`,
      );
      expect(() =>
        SASL.finalizeSession(session, `v=${session.serverSignature}`),
      ).not.toThrow();
    });
  });
});
