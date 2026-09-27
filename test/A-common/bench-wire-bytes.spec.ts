import net from 'node:net';
import { expect } from 'expect';
import {
  installWireCounters,
  wireBytes,
} from '../../benchmark/runner/wire-bytes.js';

/**
 * The benchmark suite's Network columns.
 *
 * Only the received direction was ever counted, which left every
 * scenario that writes - each `COPY`, each large parameter - with a
 * zero in the one column its bytes belong in. This pins that both
 * directions are counted, and counted where every library passes
 * through rather than anywhere library-specific.
 */
describe('benchmark wire byte counting', () => {
  const PORT_ANY = 0;
  let server: net.Server;
  let port: number;

  before(async () => {
    installWireCounters();
    server = net.createServer(socket => {
      // Answer with a known, different size, so the two directions
      // cannot be confused for one another.
      socket.on('data', () => socket.write(Buffer.alloc(3000, 0x61)));
    });
    await new Promise<void>(resolve =>
      server.listen(PORT_ANY, '127.0.0.1', resolve),
    );
    port = (server.address() as net.AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  /** One connect, one write, one answer, and what the counters made of it. */
  async function exchange(payload: Buffer | string): Promise<{
    rx: number;
    tx: number;
  }> {
    const before = wireBytes();
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write(payload);
      });
      socket.on('data', () => {
        socket.end();
        resolve();
      });
      socket.on('error', reject);
    });
    const after = wireBytes();
    return { rx: after.rx - before.rx, tx: after.tx - before.tx };
  }

  it('should count what was sent, which nothing counted before', async () => {
    const { tx } = await exchange(Buffer.alloc(5000, 0x62));
    expect(tx).toBeGreaterThanOrEqual(5000);
    // Nothing else is writing during the exchange, so the only slack is
    // whatever the socket adds around it.
    expect(tx).toBeLessThan(5000 + 4096);
  });

  it('should count what was received', async () => {
    const { rx } = await exchange(Buffer.alloc(16, 0x62));
    expect(rx).toBeGreaterThanOrEqual(3000);
    expect(rx).toBeLessThan(3000 + 4096);
  });

  it('should count a string by its bytes, not its characters', async () => {
    // A library that writes a query as a string - which is most of them,
    // through Buffer.from() or not - must not be measured in UTF-16 code
    // units. 'é' is two bytes and one character.
    const { tx } = await exchange('é'.repeat(1000));
    expect(tx).toBeGreaterThanOrEqual(2000);
    expect(tx).toBeLessThan(2000 + 4096);
  });

  it('should be monotonic, so a window is a difference of two readings', async () => {
    const first = wireBytes();
    await exchange(Buffer.alloc(1000, 0x62));
    const second = wireBytes();
    expect(second.tx).toBeGreaterThan(first.tx);
    expect(second.rx).toBeGreaterThan(first.rx);
  });

  it('should install once, however many times it is asked', () => {
    // Patching a patched prototype would double every byte from then on.
    const before = wireBytes();
    installWireCounters();
    installWireCounters();
    const written = Buffer.alloc(100, 0x62);
    const socket = new net.Socket();
    // Not connected, so nothing leaves - but write() still runs, and
    // running it twice through a double patch would count 400.
    socket.write(written);
    socket.write(written);
    socket.destroy();
    const after = wireBytes();
    expect(after.tx - before.tx).toStrictEqual(200);
  });
});
