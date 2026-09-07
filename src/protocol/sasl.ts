import crypto from 'crypto';

export namespace SASL {
  const CLIENT_KEY = 'Client Key';
  const SERVER_KEY = 'Server Key';
  /**
   * The GS2 header states what the client can do about channel binding, and
   * the server checks it against what it offered. `n` means the client does
   * not support it; `y` means it does but saw no -PLUS mechanism offered -
   * which is what lets the server notice an attacker having stripped it;
   * `p=...` means it is in use.
   */
  const GS2_NONE = 'n,,';
  const GS2_SUPPORTED_UNUSED = 'y,,';
  const GS2_BOUND = 'p=tls-server-end-point,,';

  export interface Session {
    username: string;
    mechanism: string;
    nonce: string;
    clientFirstMessage: string;
    clientFinalMessage: string;
    serverSignature: string;
    /** The GS2 header this session announced; repeated in the final message. */
    gs2Header: string;
    /** tls-server-end-point data, present only for SCRAM-SHA-256-PLUS. */
    bindingData?: Buffer;
  }

  /**
   * @param bindingData - the server certificate's hash, for
   *   SCRAM-SHA-256-PLUS. Pass undefined for the plain mechanism, and
   *   `supportsBinding` to say whether the client could have done it, which
   *   is what tells the server a stripped -PLUS offer would be an attack.
   */
  export function createSession(
    username: string,
    mechanism: string,
    bindingData?: Buffer,
    supportsBinding?: boolean,
  ): Session {
    const nonce = crypto.randomBytes(18).toString('base64');
    const gs2Header = bindingData
      ? GS2_BOUND
      : supportsBinding
        ? GS2_SUPPORTED_UNUSED
        : GS2_NONE;
    const clientFirstMessage = `${gs2Header}${firstMessageBare(username, nonce)}`;
    return {
      username,
      mechanism,
      nonce,
      gs2Header,
      bindingData,
      clientFirstMessage,
    } as Session;
  }

  export function continueSession(
    session: Session,
    password: string,
    data: string,
  ) {
    const s = data.toString();
    const items = s.split(',');
    let nonce = '';
    let salt = '';
    let iteration = 0;
    for (const i of items) {
      switch (i[0]) {
        case 'r':
          nonce = i.substring(2);
          break;
        case 's':
          salt = i.substring(2);
          break;
        case 'i':
          iteration = parseInt(i.substring(2), 10);
          break;
        default:
          break;
      }
    }
    if (!nonce)
      throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing');
    if (!salt)
      throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing');
    if (!iteration)
      throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing');

    if (!nonce.startsWith(session.nonce))
      throw new Error('SASL: Server nonce does not start with client nonce');

    const serverFirstMessage = `r=${nonce},s=${salt},i=${iteration}`;
    // c= carries the header again, with the binding data appended when the
    // channel is bound - so an attacker who relayed the exchange over a
    // different TLS connection produces a different proof.
    const cbind = session.bindingData
      ? Buffer.concat([
          Buffer.from(session.gs2Header, 'utf8'),
          session.bindingData,
        ]).toString('base64')
      : encode64(session.gs2Header);
    const clientFinalMessageWithoutProof = `c=${cbind},r=${nonce}`;
    const authMessage = `${firstMessageBare(
      session.username,
      session.nonce,
    )},${serverFirstMessage},${clientFinalMessageWithoutProof}`;

    const saltPass = hi(password, salt, iteration);
    const clientKey = hmac(saltPass, CLIENT_KEY);
    const storedKey = hash(clientKey);
    const clientSignature = hmac(storedKey, authMessage);
    const clientProofBytes = xor(clientKey, clientSignature);
    const clientProof = clientProofBytes.toString('base64');

    const serverKey = hmac(saltPass, SERVER_KEY);
    const serverSignatureBytes = hmac(serverKey, authMessage);
    session.serverSignature = serverSignatureBytes.toString('base64');
    session.clientFinalMessage =
      clientFinalMessageWithoutProof + ',p=' + clientProof;
  }

  export function finalizeSession(session: Session, data: string) {
    let serverSignature = '';

    const arr = data.split(',');
    for (const s of arr) {
      if (s[0] === 'v') serverSignature = s.substr(2);
    }

    if (serverSignature !== session.serverSignature)
      throw new Error('SASL: Server signature does not match');
  }

  const firstMessageBare = function (username: string, nonce: string): string {
    return `n=${username},r=${nonce}`;
  };

  /**
   * Hi() is, essentially, PBKDF2 [RFC2898] with HMAC() as the
   * pseudorandom function (PRF) and with dkLen == output length of
   * HMAC() == output length of H()
   */
  const hi = function (text: string, salt: string, iterations: number): Buffer {
    return crypto.pbkdf2Sync(
      text,
      Buffer.from(salt, 'base64'),
      iterations,
      32,
      'sha256',
    );
  };

  const encode64 = (str: string) => Buffer.from(str).toString('base64');

  const hmac = function (key: Buffer, msg: string): Buffer {
    return crypto.createHmac('sha256', key).update(msg).digest();
  };

  const hash = function (data: Buffer): Buffer {
    return crypto.createHash('sha256').update(data).digest();
  };

  const xor = function (a: any, b: any): Buffer {
    a = Buffer.isBuffer(a) ? a : Buffer.from(a);
    b = Buffer.isBuffer(b) ? b : Buffer.from(b);
    if (a.length !== b.length)
      throw new Error('Buffers must be of the same length');
    const l = a.length;
    const out = Buffer.allocUnsafe(l);
    for (let i = 0; i < l; i++) {
      out[i] = a[i] ^ b[i];
    }
    return out;
  };
}
