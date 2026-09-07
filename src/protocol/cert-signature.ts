/**
 * Finds the hash a certificate was signed with, which is the hash
 * `tls-server-end-point` channel binding has to use (RFC 5929).
 *
 * Node exposes a certificate's SHA-1, SHA-256 and SHA-512 fingerprints but
 * not the algorithm it was signed with, and X509Certificate.toLegacyObject()
 * does not carry it either - so the DER has to be read. Only as far as the
 * signature algorithm's OID: a Certificate is a SEQUENCE of tbsCertificate,
 * signatureAlgorithm and signatureValue, so this skips the first and reads
 * the OID out of the second.
 */

function readLength(
  data: Buffer,
  index: number,
): { length: number; index: number } {
  let length = data[index++];
  if (length < 0x80) return { length, index };
  const lengthBytes = length & 0x7f;
  if (lengthBytes > 4) throw certError('length field too large', data);
  length = 0;
  for (let i = 0; i < lengthBytes; i++) length = (length << 8) | data[index++];
  return { length, index };
}

function expectSequence(data: Buffer, index: number): { index: number } {
  if (data[index++] !== 0x30) throw certError('expected a SEQUENCE', data);
  return { index: readLength(data, index).index };
}

function readOID(data: Buffer, index: number): { oid: string; index: number } {
  if (data[index++] !== 0x06) throw certError('expected an OID', data);
  const { length, index: start } = readLength(data, index);
  index = start;
  const end = index + length;
  // The first byte packs the first two arcs as 40 * a + b.
  const first = data[index++];
  let oid = Math.floor(first / 40) + '.' + (first % 40);
  let value = 0;
  while (index < end) {
    const byte = data[index++];
    value = (value << 7) | (byte & 0x7f);
    // The high bit marks a continuation, so an arc ends when it is clear.
    if (!(byte & 0x80)) {
      oid += '.' + value;
      value = 0;
    }
  }
  return { oid, index };
}

function certError(message: string, data: Buffer): Error {
  return new Error(
    `Channel binding: ${message} while reading the server certificate (${data.length} bytes)`,
  );
}

// OID -> the Node hash name to feed createHash().
const SIGNATURE_HASHES: Record<string, string> = {
  // RSA
  '1.2.840.113549.1.1.4': 'md5',
  '1.2.840.113549.1.1.5': 'sha1',
  '1.2.840.113549.1.1.11': 'sha256',
  '1.2.840.113549.1.1.12': 'sha384',
  '1.2.840.113549.1.1.13': 'sha512',
  '1.2.840.113549.1.1.14': 'sha224',
  '1.2.840.113549.1.1.15': 'sha512-224',
  '1.2.840.113549.1.1.16': 'sha512-256',
  // ECDSA
  '1.2.840.10045.4.1': 'sha1',
  '1.2.840.10045.4.3.1': 'sha224',
  '1.2.840.10045.4.3.2': 'sha256',
  '1.2.840.10045.4.3.3': 'sha384',
  '1.2.840.10045.4.3.4': 'sha512',
  // Ed25519, whose signature hashes with SHA-512.
  '1.3.101.110': 'sha512',
  '1.3.101.112': 'sha512',
};

// RSASSA-PSS names its hash separately, in the algorithm parameters.
const PSS_HASHES: Record<string, string> = {
  '1.2.840.113549.2.5': 'md5',
  '1.3.14.3.2.26': 'sha1',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};

export function signatureHashOfCertificate(der: Buffer): string {
  let index = expectSequence(der, 0).index; // Certificate
  const tbs = readLength(der, index + 1); // tbsCertificate's own header
  if (der[index] !== 0x30) throw certError('expected tbsCertificate', der);
  index = tbs.index + tbs.length; // skip it whole
  index = expectSequence(der, index).index; // AlgorithmIdentifier
  const { oid, index: afterOID } = readOID(der, index);

  if (oid === '1.2.840.113549.1.1.10') {
    // RSASSA-PSS: parameters SEQUENCE, then [0] holding the hash algorithm.
    let i = expectSequence(der, afterOID).index;
    if (der[i++] !== 0xa0) throw certError('expected the PSS hash tag', der);
    i = readLength(der, i).index;
    i = expectSequence(der, i).index;
    const { oid: hashOID } = readOID(der, i);
    const hash = PSS_HASHES[hashOID];
    if (!hash) throw certError(`unknown PSS hash OID ${hashOID}`, der);
    return upgradeWeak(hash);
  }

  const hash = SIGNATURE_HASHES[oid];
  if (!hash) {
    if (oid === '1.3.101.111' || oid === '1.3.101.113')
      throw certError(
        'Ed448 certificates are not supported by PostgreSQL',
        der,
      );
    throw certError(`unknown signature algorithm OID ${oid}`, der);
  }
  return upgradeWeak(hash);
}

/** RFC 5929: a certificate signed with MD5 or SHA-1 binds with SHA-256. */
function upgradeWeak(hash: string): string {
  return hash === 'md5' || hash === 'sha1' ? 'sha256' : hash;
}
