export * from './datatype-registry';
export * from './definitions';
export * from './Connection';

import {ConnectionConfiguration} from './definitions';
import {Connection} from './Connection';

export async function createConnection(options: ConnectionConfiguration): Promise<Connection> {
    const connection = new Connection(options);
    await connection.connect();
    return connection;
}
