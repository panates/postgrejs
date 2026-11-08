import net from 'node:net';

/**
 * What the process put on the wire and took off it, for the Network
 * columns.
 *
 * Counted at the socket rather than anywhere library-specific:
 * `Readable.push()` is what a socket calls with each incoming chunk and
 * `write()` is where everything outgoing ends up, whatever a library
 * builds on top, so all three clients are measured identically (and a
 * TLS socket inherits both, though no scenario uses TLS).
 *
 * Both directions are counted because a scenario that writes has nothing
 * to show in the other one. `COPY ... FROM STDIN` and a large array
 * parameter are made entirely of bytes going out, and the received figure
 * for them is zero - which used to be the only number those scenarios
 * had.
 *
 * The counters are process-wide and monotonic; a caller takes a reading
 * before and after the window it cares about. Installed once, before the
 * connections being measured are opened.
 */
let rxBytes = 0;
let txBytes = 0;
let installed = false;

export interface WireBytes {
  rx: number;
  tx: number;
}

export function installWireCounters(): void {
  if (installed) return;
  installed = true;

  const originalPush = net.Socket.prototype.push;
  net.Socket.prototype.push = function (chunk: any, ...rest: any[]): boolean {
    // push(null) signals EOF and carries no bytes.
    if (chunk) rxBytes += chunk.length;
    return originalPush.apply(this, [chunk, ...rest] as any);
  };

  const originalWrite = net.Socket.prototype.write;
  net.Socket.prototype.write = function (chunk: any, ...rest: any[]): boolean {
    if (chunk != null)
      txBytes +=
        typeof chunk === 'string'
          ? // The second argument is the encoding when there is one, and
            // the completion callback otherwise.
            Buffer.byteLength(
              chunk,
              typeof rest[0] === 'string'
                ? (rest[0] as BufferEncoding)
                : undefined,
            )
          : chunk.length;
    return originalWrite.apply(this, [chunk, ...rest] as any);
  };
}

export function wireBytes(): WireBytes {
  return { rx: rxBytes, tx: txBytes };
}
