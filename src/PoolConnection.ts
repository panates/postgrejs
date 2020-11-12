import {Connection} from './Connection';
import {ConnectionConfiguration} from './definitions';
import {Pool} from './Pool';

export class PoolConnection extends Connection {

    constructor(private _pool: Pool, config: ConnectionConfiguration | string) {
        super(config);
    }

    async release(terminateWait?: number): Promise<void> {
        this._statementQueue.clear();
        if (this._activeQuery) {
            await this.close(terminateWait);
        } else
            await this._pool.release(this);
    }

}
