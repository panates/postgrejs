import { X509Certificate } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'expect';
import { signatureHashOfCertificate } from '../../src/protocol/cert-signature.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERTS_DIR = path.join(__dirname, '../_support/certs');

function certDer(fileName: string): Buffer {
  const pem = fs.readFileSync(path.join(CERTS_DIR, fileName));
  return new X509Certificate(pem).raw;
}

describe('signatureHashOfCertificate()', () => {
  // Real, freshly-generated (throwaway) self-signed certificates, one per
  // signature algorithm family this has to recognize - generated via
  // `openssl req -x509 ...`, not hand-built DER, so the OID encoding is
  // exactly what a real CA/server certificate would carry.
  it('should read a plain RSA/SHA-256 certificate as sha256', () => {
    expect(signatureHashOfCertificate(certDer('rsa-sha256.crt'))).toStrictEqual(
      'sha256',
    );
  });

  it('should read an ECDSA/SHA-256 certificate as sha256', () => {
    expect(
      signatureHashOfCertificate(certDer('ecdsa-sha256.crt')),
    ).toStrictEqual('sha256');
  });

  it('should read an Ed25519 certificate as sha512, its fixed signature hash', () => {
    expect(signatureHashOfCertificate(certDer('ed25519.crt'))).toStrictEqual(
      'sha512',
    );
  });

  it('should read an RSASSA-PSS/SHA-256 certificate by unpacking its parameters', () => {
    // RSASSA-PSS names its hash in the AlgorithmIdentifier's own
    // parameters instead of a single fixed OID like the other RSA
    // variants - the one branch that reads a second, nested OID.
    expect(
      signatureHashOfCertificate(certDer('rsa-pss-sha256.crt')),
    ).toStrictEqual('sha256');
  });

  it('should upgrade a SHA-1-signed certificate to sha256 (RFC 5929)', () => {
    expect(signatureHashOfCertificate(certDer('rsa-sha1.crt'))).toStrictEqual(
      'sha256',
    );
  });

  it('should upgrade an MD5-signed certificate to sha256 (RFC 5929)', () => {
    expect(signatureHashOfCertificate(certDer('rsa-md5.crt'))).toStrictEqual(
      'sha256',
    );
  });

  it('should refuse an Ed448 certificate - PostgreSQL itself does not support it', () => {
    expect(() => signatureHashOfCertificate(certDer('ed448.crt'))).toThrow(
      /Ed448 certificates are not supported by PostgreSQL/,
    );
  });

  describe('malformed/unrecognized DER', () => {
    // Hand-built minimal DER, not real certificates - just enough
    // structure (Certificate ::= SEQUENCE { tbsCertificate, algorithm })
    // to drive the parser into each specific error path.
    function minimalCert(algorithmIdentifier: number[]): Buffer {
      const tbsCertificate = [0x30, 0x00]; // empty SEQUENCE
      const content = [...tbsCertificate, ...algorithmIdentifier];
      return Buffer.from([0x30, content.length, ...content]);
    }

    // id-RSASSA-PSS (1.2.840.113549.1.1.10), the well-known DER encoding of
    // that OID - shared by both PSS sub-error tests below.
    const RSASSA_PSS_OID = [
      0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0a,
    ];
    const seq = (...content: number[]): number[] => [
      0x30,
      content.length,
      ...content,
    ];

    it('should reject PSS parameters whose first field is not the [0] hash tag', () => {
      // AlgorithmIdentifier { id-RSASSA-PSS, params: SEQUENCE { 0x01 ... } }
      // - a parameters SEQUENCE, but its first element isn't the context
      // tag [0] (0xa0) the hash algorithm is expected under.
      const der = minimalCert(
        seq(...RSASSA_PSS_OID, ...seq(0x01, 0x00) /* not 0xa0 */),
      );
      expect(() => signatureHashOfCertificate(der)).toThrow(
        /expected the PSS hash tag/,
      );
    });

    it('should reject a PSS hash OID outside the known set', () => {
      // AlgorithmIdentifier { id-RSASSA-PSS, params: SEQUENCE { [0] {
      // SEQUENCE { OID 1.2.3 } } } } - the [0] tag is present and well
      // formed, but the hash algorithm inside it is not one this parser
      // recognizes.
      const oid123 = [0x06, 0x02, 0x2a, 0x03]; // OID 1.2.3
      const innerSeq = seq(...oid123);
      const zeroTag = [0xa0, innerSeq.length, ...innerSeq];
      const der = minimalCert(seq(...RSASSA_PSS_OID, ...seq(...zeroTag)));
      expect(() => signatureHashOfCertificate(der)).toThrow(
        /unknown PSS hash OID 1\.2\.3/,
      );
    });

    it('should reject an unrecognized signature algorithm OID', () => {
      // OID 1.2.3 (arbitrary, in no lookup table): tag 0x06, length 2,
      // first byte 40*1+2=0x2a, second arc 3.
      const der = minimalCert([0x30, 0x04, 0x06, 0x02, 0x2a, 0x03]);
      expect(() => signatureHashOfCertificate(der)).toThrow(
        /unknown signature algorithm OID 1\.2\.3/,
      );
    });

    it('should reject a non-SEQUENCE where the outer Certificate is expected', () => {
      // 0x02 is an INTEGER tag, not 0x30 (SEQUENCE).
      expect(() =>
        signatureHashOfCertificate(Buffer.from([0x02, 0x01, 0x00])),
      ).toThrow(/expected a SEQUENCE/);
    });

    it('should reject a non-SEQUENCE where tbsCertificate is expected', () => {
      // Outer SEQUENCE is fine, but its first inner element is an OCTET
      // STRING (0x04) instead of tbsCertificate's own SEQUENCE tag.
      const der = Buffer.from([0x30, 0x02, 0x04, 0x00]);
      expect(() => signatureHashOfCertificate(der)).toThrow(
        /expected tbsCertificate/,
      );
    });

    it('should reject a non-OID where the algorithm OID is expected', () => {
      // Same shape as the "unrecognized OID" case, but the OID's own tag
      // (0x06) is replaced with an INTEGER tag (0x02).
      const der = minimalCert([0x30, 0x04, 0x02, 0x02, 0x2a, 0x03]);
      expect(() => signatureHashOfCertificate(der)).toThrow(/expected an OID/);
    });

    it('should reject a length field wider than 4 bytes', () => {
      // 0x85 = 0x80 | 5: "5 length bytes follow", over the 4-byte cap this
      // parser accepts - real X.509 certificates never need more than 2.
      expect(() =>
        signatureHashOfCertificate(Buffer.from([0x30, 0x85])),
      ).toThrow(/length field too large/);
    });

    it("should include the certificate's byte length in every error message", () => {
      const der = Buffer.from([0x02, 0x01, 0x00]);
      expect(() => signatureHashOfCertificate(der)).toThrow(
        new RegExp(`\\(${der.length} bytes\\)`),
      );
    });
  });
});
