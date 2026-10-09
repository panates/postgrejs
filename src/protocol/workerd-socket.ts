import { SafeEventEmitter } from '../safe-event-emitter.js';

/** What `cloudflare:sockets` hands back, as much of it as is used here. */
interface CfSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  closed: Promise<void>;
  close(): Promise<void>;
  startTls(options: { expectedServerHostname?: string }): CfSocket;
}

/** The one function `cloudflare:sockets` is reached for. */
export type CfConnect = (
  address: string,
  options?: { secureTransport?: 'off' | 'on' | 'starttls' },
) => CfSocket;

/* Imported where it is called rather than at the top of the file: the
   specifier does not resolve off workerd, and this module is reachable
   from a Node build through `pg-socket.ts`. Nothing awaits it unless a
   connection is actually being made on that runtime. */
const importCfConnect = async (): Promise<CfConnect> =>
  (await import(/* webpackIgnore: true */ 'cloudflare:sockets' as string))
    .connect as CfConnect;

/**
 * A `net.Socket`-shaped view of a Cloudflare socket, for the part of it
 * this client uses: `connect`, `write`, `destroy`, and `data`/`error`/
 * `close` events, plus `startTls()`, which is the one thing Node's
 * `tls.connect({ socket })` cannot do on that runtime.
 *
 * Reads are a loop over the stream rather than a `'data'` event the
 * runtime emits, so the loop is what turns one into the other.
 */
/* Written here rather than taken from `pg-cloudflare`, which does the
   same job for `pg`: the adapter is a hundred lines whose lifecycle this
   client would otherwise not control, and only the upgrade is actually
   needed - the plain path on workerd already works through `node:net`.

   The setNoDelay/setKeepAlive/setTimeout trio answers nothing because
   the runtime exposes no equivalent; they are here so the connect path
   above can treat both socket kinds the same way. */
export class WorkerdSocket extends SafeEventEmitter {
  private _cf?: CfSocket;
  private _writer?: WritableStreamDefaultWriter<Uint8Array>;
  private _reader?: ReadableStreamDefaultReader<Uint8Array>;
  /* True between startTls() and the old socket's `closed` settling: that
     promise resolves because the socket was replaced, not because the
     connection went away, and reporting it as a close would end the
     session in the middle of its handshake. */
  private _upgrading = false;
  private _destroyed = false;
  private _paused?: Promise<void>;
  private _resume?: () => void;

  constructor(
    private readonly _wantsTls: boolean,
    private readonly _connect: () => Promise<CfConnect> = importCfConnect,
  ) {
    super();
  }

  /** Whether a TLS upgrade has been asked for and completed. */
  get secure(): boolean {
    return this._secure;
  }
  private _secure = false;

  /** Whether `destroy()` has been called. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /** Whether writes are still accepted. */
  get writable(): boolean {
    return !this._destroyed && !!this._writer;
  }

  /* `cork`/`uncork` gather several small writes into one syscall on
     Node. There is no syscall to gather here - a write is a promise
     against a stream - so the pair is accepted and does nothing, which
     is what it means on this runtime. */
  cork(): void {
    /* nothing to gather */
  }
  uncork(): void {
    /* nothing to gather */
  }

  setNoDelay(): this {
    return this;
  }
  setKeepAlive(): this {
    return this;
  }
  setTimeout(): this {
    return this;
  }

  /** Stops reading, so the sender is made to wait. */
  /* Real backpressure rather than a no-op: the read loop is what pulls
     from the stream, so not pulling is the whole of it. `pause()` during
     a COPY TO is the only caller, and a stream left unread is how the
     runtime learns to stop. */
  pause(): this {
    if (!this._paused) this._paused = new Promise(r => (this._resume = r));
    return this;
  }

  /** Starts reading again. */
  resume(): this {
    const go = this._resume;
    this._paused = undefined;
    this._resume = undefined;
    go?.();
    return this;
  }

  /** Closes the connection once anything already written has gone. */
  end(): this {
    return this.destroy();
  }

  /**
   * Opens the connection and emits `connect` once it is writable.
   *
   * @param port The port to reach.
   * @param host The host to reach.
   */
  connect(port: number, host: string): void {
    void (async () => {
      try {
        const connect = await this._connect();
        this._cf = connect(`${host}:${port}`, {
          // `starttls` leaves the connection in the clear and allows a
          // later upgrade, which is what the SSLRequest exchange needs.
          secureTransport: this._wantsTls ? 'starttls' : 'off',
        });
        /* No read loop yet when a TLS upgrade is coming: `releaseLock()`
           throws on a reader with an outstanding read, and a loop parked
           in `reader.read()` is exactly that. The negotiation asks for
           the one byte it expects through `readOnce()`, and the loop
           starts on the upgraded socket. */
        this._attach(this._cf, !this._wantsTls);
        await this._writer!.ready;
        this.emit('connect');
      } catch (e: any) {
        this.emit('error', e);
      }
    })();
  }

  /**
   * Reads one chunk and hands it over, without starting the loop.
   *
   * @param cb Called with the bytes, or with nothing if the connection
   * ended first.
   */
  /* What the SSLRequest exchange needs: a single answer, read while no
     loop holds the reader, so the lock can be released for the upgrade
     that follows. */
  readOnce(cb: (data?: Buffer) => void): void {
    const reader = this._reader;
    if (!reader) return cb();
    reader.read().then(
      ({ done, value }) => cb(done || !value ? undefined : Buffer.from(value)),
      (e: any) => {
        this.emit('error', e);
        cb();
      },
    );
  }

  /**
   * Upgrades the connection in place.
   *
   * @param servername The name to check the certificate against.
   */
  /* The locks have to go back before the socket is replaced, and the new
     one needs its own reader and writer and its own read loop. */
  startTls(servername?: string): void {
    const cf = this._cf;
    if (!cf) {
      this.emit(
        'error',
        new Error('Cannot upgrade a socket that is not connected'),
      );
      return;
    }
    try {
      this._writer!.releaseLock();
      this._reader!.releaseLock();
      this._upgrading = true;
      this._cf = cf.startTls(
        servername ? { expectedServerHostname: servername } : {},
      );
      this._attach(this._cf, true);
      void this._writer!.ready.then(
        () => {
          this._secure = true;
          this.emit('secureConnect');
        },
        (e: any) => this.emit('error', e),
      );
    } catch (e: any) {
      this.emit('error', e);
    }
  }

  /**
   * Writes to the connection.
   *
   * @param data The bytes to send.
   * @param cb Called once they are written, or with the error.
   * @returns True - the runtime offers no "buffer is full" answer.
   */
  write(data: Uint8Array, cb?: (err?: Error | null) => void): boolean {
    const writer = this._writer;
    if (!writer) {
      cb?.(new Error('Socket is not connected'));
      return true;
    }
    writer.write(data).then(
      () => cb?.(),
      (e: any) => {
        cb?.(e);
        this.emit('error', e);
      },
    );
    return true;
  }

  /** Closes the connection; `close` follows once the runtime agrees. */
  destroy(): this {
    if (this._destroyed) return this;
    this._destroyed = true;
    const cf = this._cf;
    this._cf = undefined;
    cf?.close().catch(() => undefined);
    return this;
  }

  protected _attach(cf: CfSocket, readLoop: boolean): void {
    this._writer = cf.writable.getWriter();
    this._reader = cf.readable.getReader();
    if (readLoop) void this._read(this._reader);
    cf.closed.then(
      () => {
        if (this._upgrading) {
          this._upgrading = false;
          return;
        }
        this.emit('close');
      },
      (e: any) => {
        if (this._upgrading) {
          this._upgrading = false;
          return;
        }
        this.emit('error', e);
      },
    );
  }

  protected async _read(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    try {
      for (;;) {
        if (this._paused) await this._paused;
        const { done, value } = await reader.read();
        if (done) return;
        /* Asked again on the way out: a pause() during a read already in
           flight cannot un-await it, and delivering that chunk anyway
           would be data arriving after the consumer said stop. */
        if (this._paused) await this._paused;
        if (value?.length) this.emit('data', Buffer.from(value));
      }
    } catch (e: any) {
      // A read that ends because the socket was replaced is the upgrade
      // happening, not a failure to report.
      if (!this._upgrading && !this._destroyed) this.emit('error', e);
    }
  }
}
