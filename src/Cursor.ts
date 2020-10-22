import {SafeEventEmitter} from './SafeEventEmitter';
import {Protocol} from './protocol/protocol';
import RowDescription = Protocol.RowDescription;
import {PgSocket} from './PgSocket';

export class Cursor extends SafeEventEmitter {

    private readonly _fetchRows: number;

    constructor(private _socket: PgSocket,
                private readonly _portal: string,
                public readonly fields: RowDescription[]) {
        super();
        this._fetchRows = 100;
    }

    async next(): Promise<any> {

    }

    private async _fetchMore(): Promise<any> {

    }

}
