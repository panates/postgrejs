import fs from 'fs';
import path from 'path';
import '../_support/env';
import {Connection} from '../../src';

describe('Data type encode/decode', function () {

    let connection: Connection;
    process.env.PGTZ = 'Europe/Istanbul';

    before(async () => {
        connection = new Connection();
        await connection.connect();
        await connection.execute('SET SESSION timezone TO \'Europe/Berlin\'');
    })

    after(async () => {
        process.env.TZ = '';
        await connection.close(0);
    })

    const files = fs.readdirSync(path.join(__dirname, 'tests'));
    for (const f of files) {
        if (f.endsWith('.test.ts'))
            require('./tests/' + f)
                .createTests(() => connection);
    }

});
