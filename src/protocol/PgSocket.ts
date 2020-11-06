import net from 'net';
import tls from 'tls';
import crypto from "crypto";
import {SafeEventEmitter} from '../SafeEventEmitter';
import {Backend} from './Backend';
import {Frontend} from './Frontend';
import {Protocol} from './protocol';
import {BindValue, ConnectionConfiguration, ConnectionState, DataTypeOIDs, Maybe, OID} from '../definitions';
import {DatabaseError} from './DatabaseError';
import {SASL} from './sasl';

const DEFAULT_PORT_NUMBER = 5432;
const COMMAND_RESULT_PATTERN = /^([A-Za-z]+)(?: (\d+)(?: (\d+))?)?$/;

export type CaptureCallback = (code: Protocol.BackendMessageCode, msg: any,
                               done: (err: Maybe<Error>, result?: any) => void) => void | Promise<void>;

export interface SocketError extends Error {
    code: string;
}

export class PgSocket extends SafeEventEmitter {
    private _state = ConnectionState.CLOSED;
    private _socket?: net.Socket;
    private _backend = new Backend();
    private _frontend = new Frontend();
    private _sessionParameters: any;
    private _processID?: number;
    private _secretKey?: number;
    private _saslSession?: SASL.Session;

    constructor(public options: ConnectionConfiguration) {
        super();
        this.setMaxListeners(99);
    }

    get state(): ConnectionState {
        return this._state;
    }

    connect() {
        if (this._socket)
            return;
        this._state = ConnectionState.CONNECTING;
        const options = this.options;
        const socket = this._socket = new net.Socket();

        const errorHandler = (err) => {
            this._state = ConnectionState.CLOSED;
            this._removeListeners();
            this._reset();
            socket.destroy();
            this._socket = undefined;
            this.emit('error', err);
        }

        const connectHandler = () => {
            socket.setTimeout(0);
            if (this.options.keepAlive)
                socket.setKeepAlive(true, this.options.keepAliveInitialDelayMillis);
            if (options.ssl) {
                socket.write(this._frontend.getSSLRequestMessage());
                socket.once('data', (x) => {
                    this._removeListeners();
                    if (x.toString() === 'S') {
                        const tslOptions = {...options.ssl, socket};
                        if (options.host && net.isIP(options.host) === 0)
                            tslOptions.servername = options.host;
                        const tlsSocket = this._socket = tls.connect({...options.ssl, socket});
                        tlsSocket.once('error', errorHandler);
                        tlsSocket.once('secureConnect', () => {
                            this._removeListeners();
                            this._handleConnect();
                        });
                        return;
                    }
                    if (x.toString() === 'N')
                        return errorHandler(new Error('Server does not support SSL connections'));
                    return errorHandler(new Error('There was an error establishing an SSL connection'));
                });
            } else {
                this._handleConnect();
            }
        }

        socket.setNoDelay(true);
        socket.setTimeout(options.connectTimeoutMs || 30000,
            () => errorHandler(new Error('Connection timed out')));
        socket.once('error', errorHandler);
        socket.once('connect', connectHandler);

        this.emit('connecting');
        if (options.host && options.host.startsWith('/'))
            socket.connect(options.host);
        else socket.connect(options.port || DEFAULT_PORT_NUMBER, options.host || 'localhost');
    }

    close(): void {
        if (!this._socket || this._socket.destroyed) {
            this._state = ConnectionState.CLOSED;
            this._socket = undefined;
            this._reset();
            return;
        }
        if (this._state === ConnectionState.CLOSING)
            return;
        const socket = this._socket;
        this._state = ConnectionState.CLOSING;
        this._removeListeners();
        socket.once('close', () => this._handleClose());
        socket.destroy();
    }

    cancelActiveQuery() {

    }

    sendParseMessage(args: Frontend.ParseMessageArgs): void {
        this._send(this._frontend.getParseMessage(args));
    }

    sendBindMessage(args: Frontend.BindMessageArgs): void {
        this._send(this._frontend.getBindMessage(args));
    }

    sendDescribeMessage(args: Frontend.DescribeMessageArgs): void {
        this._send(this._frontend.getDescribeMessage(args));
    }

    sendExecuteMessage(args: Frontend.ExecuteMessageArgs): void {
        this._send(this._frontend.getExecuteMessage(args));
    }

    sendCloseMessage(args: Frontend.CloseMessageArgs): void {
        this._send(this._frontend.getCloseMessage(args));
    }

    sendQueryMessage(sql: string): void {
        this._send(this._frontend.getQueryMessage(sql));
    }

    sendFlushMessage(): void {
        this._send(this._frontend.getFlushMessage());
    }

    sendTerminateMessage(): void {
        this._send(this._frontend.getTerminateMessage());
    }

    sendSyncMessage(): void {
        this._send(this._frontend.getSyncMessage());
    }

    capture(callback: CaptureCallback): Promise<any> {

        return new Promise((resolve, reject) => {
            const done = (err?: Error, result?: any) => {
                this.removeListener('error', errorHandler);
                this.removeListener('message', msgHandler);
                if (err)
                    reject(err);
                else resolve(result);
            }
            const errorHandler = (err: Error) => {
                this.removeListener('message', msgHandler);
                reject(err);
            };
            const msgHandler = (code: Protocol.BackendMessageCode, msg: any) => {
                const x = callback(code, msg, done);
                if (typeof x['catch'] === 'function')
                    x['catch'](err => done(err));
            };
            this.once('error', errorHandler);
            this.on('message', msgHandler);
        });
    }

    protected _removeListeners(): void {
        if (!this._socket)
            return;
        this._socket.removeAllListeners('error');
        this._socket.removeAllListeners('connect');
        this._socket.removeAllListeners('data');
        this._socket.removeAllListeners('close');
    }

    protected _reset(): void {
        this._backend.reset();
        this._frontend.reset();
        this._sessionParameters = {};
        this._processID = undefined;
        this._secretKey = undefined;
        this._saslSession = undefined;
    }

    protected _handleConnect(): void {
        const socket = this._socket;
        if (!socket)
            return;
        this._state = ConnectionState.AUTHORIZING;
        this._reset();
        socket.on('data', (data: Buffer) => this._handleData(data));
        socket.on('error', (err: SocketError) => this._handleError(err));
        socket.on('close', () => this._handleClose());
        this._send(this._frontend.getStartupMessage({
            user: this.options.user || '',
            database: this.options.database || ''
        }));
    }

    protected _handleClose(): void {
        this._reset();
        this._socket = undefined;
        this._state = ConnectionState.CLOSED;
        this.emit('close');
    }

    protected _handleError(err: SocketError): void {
        if (this._state != ConnectionState.READY) {
            this._socket?.end();
        }
        this.emit('error', err);
    }

    protected _handleData(data: Buffer): void {
        // console.log('< ', JSON.stringify(data));
        this._backend.parse(data, (code: Protocol.BackendMessageCode, data?: any) => {
            try {
                switch (code) {
                    case Protocol.BackendMessageCode.Authentication:
                        this._handleAuthenticationMessage(data);
                        break;
                    case Protocol.BackendMessageCode.ErrorResponse:
                        this.emit('error', new DatabaseError(data));
                        break;
                    case Protocol.BackendMessageCode.NoticeResponse:
                        this.emit('notice', data);
                        break;
                    case Protocol.BackendMessageCode.ParameterStatus:
                        this._handleParameterStatus(data as Protocol.ParameterStatusMessage)
                        break;
                    case Protocol.BackendMessageCode.BackendKeyData:
                        this._handleBackendKeyData(data as Protocol.BackendKeyDataMessage)
                        break;
                    case Protocol.BackendMessageCode.ReadyForQuery:
                        if (this._state != ConnectionState.READY) {
                            this._state = ConnectionState.READY;
                            this.emit('ready');
                        } else
                            this.emit('message', code);
                        break;
                    case Protocol.BackendMessageCode.CommandComplete: {
                        const msg = this._handleCommandComplete(data);
                        this.emit('message', code, msg);
                        break;
                    }
                    default:
                        this.emit('message', code, data);
                }
            } catch (e) {
                this._handleError(e);
            }
        });
    }

    protected _resolvePassword(cb: (password: string) => void): void {
        (async (): Promise<void> => {
            const pass = typeof this.options.password === 'function' ?
                await this.options.password() : this.options.password;
            cb(pass || '');
        })().catch(err => this._handleError(err));
    }

    protected _handleAuthenticationMessage(msg?: any): void {
        if (!msg) {
            this.emit('authenticate');
            return;
        }

        switch (msg.kind) {
            case Protocol.AuthenticationMessageKind.CleartextPassword:
                this._resolvePassword(password => {
                    this._send(this._frontend.getPasswordMessage(password));
                });
                break;
            case Protocol.AuthenticationMessageKind.MD5Password:
                this._resolvePassword((password => {
                    const md5 = (x: any) =>
                        crypto.createHash('md5').update(x, 'utf8').digest('hex');
                    const l = md5(password + this.options.user);
                    const r = md5(Buffer.concat([Buffer.from(l), msg.salt]));
                    const pass = 'md5' + r;
                    this._send(this._frontend.getPasswordMessage(pass));
                }));
                break;
            case Protocol.AuthenticationMessageKind.SASL: {
                if (!msg.mechanisms.includes('SCRAM-SHA-256'))
                    throw new Error('SASL: Only mechanism SCRAM-SHA-256 is currently supported');
                const saslSession = this._saslSession =
                    SASL.createSession(this.options.user || '', 'SCRAM-SHA-256');
                this._send(this._frontend.getSASLMessage(saslSession));
                break;
            }
            case Protocol.AuthenticationMessageKind.SASLContinue: {
                const saslSession = this._saslSession;
                if (!saslSession)
                    throw new Error('SASL: Session not started yet');
                this._resolvePassword(password => {
                    SASL.continueSession(saslSession, password, msg.data);
                    const buf = this._frontend.getSASLFinalMessage(saslSession);
                    this._send(buf);
                });
                break;
            }
            case Protocol.AuthenticationMessageKind.SASLFinal: {
                const session = this._saslSession;
                if (!session)
                    throw new Error('SASL: Session not started yet');
                SASL.finalizeSession(session, msg.data);
                this._saslSession = undefined;
                break;
            }
        }
    }

    protected _handleParameterStatus(msg: Protocol.ParameterStatusMessage): void {
        this._sessionParameters[msg.name] = msg.value;
    }

    protected _handleBackendKeyData(msg: Protocol.BackendKeyDataMessage): void {
        this._processID = msg.processID;
        this._secretKey = msg.secretKey;
    }

    protected _handleCommandComplete(msg: any): Protocol.CommandCompleteMessage {
        const m = msg.command && msg.command.match(COMMAND_RESULT_PATTERN);
        const result: Protocol.CommandCompleteMessage = {
            command: m[1]
        }
        if (m[3] != null) {
            result.oid = parseInt(m[2], 10);
            result.rowCount = parseInt(m[3], 10);
        } else if (m[2])
            result.rowCount = parseInt(m[2], 10);
        return result;
    }

    protected _send(data: Buffer): void {
        if (this._socket && this._socket.writable) {
            // console.log('>', JSON.stringify(data));
            this._socket.write(data);
        }
    }

}
