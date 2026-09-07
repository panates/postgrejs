import { expect } from 'expect';
import { Backend } from '../../src/protocol/backend.js';
import { Protocol } from '../../src/protocol/protocol.js';

/** Builds one wire message: 1-byte code, 4-byte length (includes itself), body. */
function message(code: number, body: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(code, 0);
  header.writeUInt32BE(4 + body.length, 1);
  return Buffer.concat([header, body]);
}

function parseOne(buf: Buffer): { code: number; msg: any } {
  const backend = new Backend();
  let result: { code: number; msg: any } | undefined;
  backend.parse(buf, (code, msg) => {
    result = { code, msg };
  });
  expect(result).toBeDefined();
  return result!;
}

function authMessage(kind: number, extra: Buffer = Buffer.alloc(0)): Buffer {
  const body = Buffer.alloc(4 + extra.length);
  body.writeUInt32BE(kind, 0);
  extra.copy(body, 4);
  return message(Protocol.BackendMessageCode.Authentication, body);
}

describe('Backend (wire message parsing)', () => {
  describe('Authentication', () => {
    it('should parse AuthenticationOk (kind 0) as undefined', () => {
      const { msg } = parseOne(authMessage(0));
      expect(msg).toBeUndefined();
    });

    it('should parse AuthenticationKerberosV5 (kind 2)', () => {
      const { msg } = parseOne(authMessage(2));
      expect(msg).toStrictEqual({ kind: 'KerberosV5' });
    });

    it('should parse AuthenticationCleartextPassword (kind 3)', () => {
      const { msg } = parseOne(authMessage(3));
      expect(msg).toStrictEqual({ kind: 'CleartextPassword' });
    });

    it('should parse AuthenticationMD5Password (kind 5), including its 4-byte salt', () => {
      const salt = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const { msg } = parseOne(authMessage(5, salt));
      expect(msg.kind).toStrictEqual('MD5Password');
      expect(msg.salt).toStrictEqual(salt);
    });

    it('should parse AuthenticationSCMCredential (kind 6)', () => {
      const { msg } = parseOne(authMessage(6));
      expect(msg).toStrictEqual({ kind: 'SCMCredential' });
    });

    it('should parse AuthenticationGSS (kind 7)', () => {
      const { msg } = parseOne(authMessage(7));
      expect(msg).toStrictEqual({ kind: 'GSS' });
    });

    it('should parse AuthenticationSSPI (kind 9)', () => {
      const { msg } = parseOne(authMessage(9));
      expect(msg).toStrictEqual({ kind: 'SSPI' });
    });

    it('should parse AuthenticationGSSContinue (kind 8), including its data', () => {
      const data = Buffer.from('gss-token-bytes');
      const { msg } = parseOne(authMessage(8, data));
      expect(msg.kind).toStrictEqual('GSSContinue');
      expect(msg.data).toStrictEqual(data);
    });

    it('should parse AuthenticationSASL (kind 10) as a list of mechanism names', () => {
      const mechanisms = Buffer.concat([
        Buffer.from('SCRAM-SHA-256\0', 'utf8'),
        Buffer.from('SCRAM-SHA-256-PLUS\0', 'utf8'),
        Buffer.from('\0', 'utf8'), // terminating empty C-string ends the list
      ]);
      const { msg } = parseOne(authMessage(10, mechanisms));
      expect(msg.kind).toStrictEqual('SASL');
      expect(msg.mechanisms).toStrictEqual([
        'SCRAM-SHA-256',
        'SCRAM-SHA-256-PLUS',
      ]);
    });

    it('should parse AuthenticationSASLContinue (kind 11)', () => {
      const data = Buffer.from('r=nonce,s=salt,i=4096', 'utf8');
      const { msg } = parseOne(authMessage(11, data));
      expect(msg.kind).toStrictEqual('SASLContinue');
      expect(msg.data).toStrictEqual('r=nonce,s=salt,i=4096');
    });

    it('should parse AuthenticationSASLFinal (kind 12)', () => {
      const data = Buffer.from('v=serverSignature', 'utf8');
      const { msg } = parseOne(authMessage(12, data));
      expect(msg.kind).toStrictEqual('SASLFinal');
      expect(msg.data).toStrictEqual('v=serverSignature');
    });

    it('should throw on an unrecognized authentication kind', () => {
      const backend = new Backend();
      expect(() => backend.parse(authMessage(999), () => undefined)).toThrow(
        /Unknown authentication kind \(999\)/,
      );
    });
  });

  describe('FunctionCallResponse', () => {
    it('should read the result as a raw buffer', () => {
      const result = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      const { code, msg } = parseOne(
        message(Protocol.BackendMessageCode.FunctionCallResponse, result),
      );
      expect(code).toStrictEqual(
        Protocol.BackendMessageCode.FunctionCallResponse,
      );
      expect(msg.result).toStrictEqual(result);
    });
  });

  describe('NegotiateProtocolVersion', () => {
    it('should read the minor version, unsupported-option count and name', () => {
      const body = Buffer.alloc(12);
      body.writeUInt32BE(2, 0); // supportedVersionMinor
      body.writeUInt32BE(1, 4); // numberOfNotSupportedVersions
      body.write('foo\0', 8, 'utf8'); // option
      const { msg } = parseOne(
        message(Protocol.BackendMessageCode.NegotiateProtocolVersion, body),
      );
      expect(msg).toStrictEqual({
        supportedVersionMinor: 2,
        numberOfNotSupportedVersions: 1,
        option: 'foo',
      });
    });
  });
});
