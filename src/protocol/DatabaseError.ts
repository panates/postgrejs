import {Protocol} from './protocol';

export class DatabaseError extends Error implements Protocol.ErrorResponseMessage {

    constructor(msg: Protocol.ErrorResponseMessage) {
        super(msg.message);
        Object.assign(this, msg);
    }
}
