import * as fs from 'fs';
import * as path from 'path';
import {Connection} from '../../src';
import {stringifyValueForSQL} from '../../src/helpers/stringify-for-sql';

let testDbCreated = false;
let testDbFilled = false;
const structureScript = fs.readFileSync(path.join(__dirname, 'createdb.sql'), 'utf8');
const dataFiles: any[] = [
    JSON.parse(fs.readFileSync(path.join(__dirname, 'test-data', 'regions.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(__dirname, 'test-data', 'airports.json'), 'utf8'))
];

export async function createTestSchema(connection: Connection) {
    if (testDbCreated)
        return;
    await connection.execute(structureScript);
    testDbCreated = true;
}

export async function fillTestSchema(connection: Connection) {
    if (testDbFilled)
        return;

    /* Create tables */
    for (const table of dataFiles) {
        /* Insert rows */
        const keys = Object.keys(table.rows[0]);
        const fields = keys.map(f => f.toLowerCase());
        let sql = '';
        for (const row of table.rows) {
            const values = keys.map(x => stringifyValueForSQL(row[x]));
            const insertSql = 'insert into test.' + table.name +
                ' (' + fields.join(',') + ') values (' + values.join(',') + ');\n';
            sql += insertSql;
        }
        await connection.execute(sql);
    }
    testDbFilled = true;
}
