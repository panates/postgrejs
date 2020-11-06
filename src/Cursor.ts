import {SafeEventEmitter} from './SafeEventEmitter';
import {Protocol} from './protocol/protocol';
import RowDescription = Protocol.RowDescription;
import {Portal} from './Portal';
import {AnyParseFunction} from './definitions';

export class Cursor extends SafeEventEmitter {

    private readonly _fetchCount: number;
    private readonly _objectRows: boolean;
    private readonly _parsers: AnyParseFunction[];

    constructor(private readonly _portal: Portal,
                public readonly fields: RowDescription[],
                parsers: AnyParseFunction[],
                fetchCount?: number,
                objectRows?: boolean) {
        super();
        this._parsers = parsers;
        this._fetchCount = fetchCount || 100;
        this._objectRows = !!objectRows;
    }

    async next(): Promise<any> {

    }

    private async _fetchMore(): Promise<any> {

    }

}
