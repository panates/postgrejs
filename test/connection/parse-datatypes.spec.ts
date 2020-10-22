import assert from 'assert';
import '../_support/env';
import {Connection, DataTypeOIDs} from '../../src';
import {escapeLiteral} from '../../src/helpers';

describe('Parse string representations of data types', function () {

    let connection: Connection;

    before(async () => {
        connection = new Connection(process.env.DB_URL);
        await connection.connect();
    })

    after(async () => {
        await connection.close(true);
    })

    async function testDataType(typeName: string, dataTypeId: number | number[],
                                input: string | string[], output: any, escape?: boolean) {
        let inp = '';
        if (Array.isArray(input)) {
            const a = (escape === undefined || escape) ?
                input.map(escapeLiteral) : input;
            inp = 'ARRAY[' + a.toString() + ']'
        } else inp = (typeof input === 'string' && (escape === undefined || escape))
            ? escapeLiteral(input) : input;

        const resp = await connection.execute(`select ${inp}::${typeName} as field1`);
        assert.ok(resp && resp.results && resp.results[0]);
        const fields = resp.results[0].fields;
        const rows = resp.results[0].rows;
        assert.ok(fields && fields.length, 'No fields info');
        assert.ok(rows && rows.length, 'No rows');
        if (Array.isArray(dataTypeId))
            assert.ok(dataTypeId.includes(fields[0].dataTypeId), 'dataTypeId does not match');
        else
            assert.strictEqual(fields[0].dataTypeId, dataTypeId, 'dataTypeId does not match');
        assert.deepStrictEqual(rows[0][0], output, 'output value does not match');
    }

    it('should parse bool', async function () {
        await testDataType('bool', DataTypeOIDs.Bool, 'true', true);
    });

    it('should parse bool array', async function () {
        await testDataType('_bool', DataTypeOIDs.ArrayBool, ['true', 'false'], [true, false]);
    });

    it('should parse int2', async function () {
        await testDataType('int2', DataTypeOIDs.Int2, '1', 1);
    });

    it('should parse int2 array', async function () {
        await testDataType('_int2', DataTypeOIDs.ArrayInt2, ['1', '2'], [1, 2]);
    });

    it('should parse int4', async function () {
        await testDataType('int4', DataTypeOIDs.Int4, '1', 1);
    });

    it('should parse int4 array', async function () {
        await testDataType('_int4', DataTypeOIDs.ArrayInt4, ['1', '2'], [1, 2]);
    });

    it('should parse int8', async function () {
        await testDataType('int8', DataTypeOIDs.Int8, '1', BigInt(1));
    });

    it('should parse int8 array', async function () {
        await testDataType('_int8', DataTypeOIDs.ArrayInt8, ['1', '2'], [BigInt(1), BigInt(2)]);
    });

    it('should parse float4', async function () {
        await testDataType('float4', DataTypeOIDs.Float4, '1.2', 1.2);
    });

    it('should parse float4 array', async function () {
        await testDataType('_float4', DataTypeOIDs.ArrayFloat4, ['1.2', '2.5'], [1.2, 2.5]);
    });

    it('should parse float8', async function () {
        await testDataType('float8', DataTypeOIDs.Float8, '1.2345678', 1.2345678);
    });

    it('should parse float8 array', async function () {
        await testDataType('_float8', DataTypeOIDs.ArrayFloat8, ['1.2', '2.5'], [1.2, 2.5]);
    });

    it('should parse oid', async function () {
        await testDataType('oid', DataTypeOIDs.Oid, '1', 1);
    });

    it('should parse oid array', async function () {
        await testDataType('_oid', DataTypeOIDs.ArrayOid, ['1', '2'], [1, 2]);
    });

    it('should parse char', async function () {
        await testDataType('char', [DataTypeOIDs.Char, DataTypeOIDs.Bpchar], 'abc', 'a');
    });

    it('should parse char array', async function () {
        await testDataType('_char', DataTypeOIDs.ArrayChar, ['abc', 'def'], ['a', 'd']);
    });

    it('should parse bpchar', async function () {
        await testDataType('bpchar', DataTypeOIDs.Bpchar, 'abc ', 'abc ');
    });

    it('should parse bpchar array', async function () {
        await testDataType('_bpchar', DataTypeOIDs.ArrayBpchar, ['abc', 'def'], ['abc', 'def']);
    });

    it('should parse varchar', async function () {
        await testDataType('varchar', DataTypeOIDs.Varchar, 'abc ', 'abc ');
    });

    it('should parse varchar array', async function () {
        await testDataType('_varchar', DataTypeOIDs.ArrayVarchar, ['abc', 'def'], ['abc', 'def']);
    });

    it('should parse text', async function () {
        await testDataType('text', DataTypeOIDs.Text, 'abc ', 'abc ');
    });

    it('should parse text array', async function () {
        await testDataType('_text', DataTypeOIDs.ArrayText, ['abc', 'def'], ['abc', 'def']);
    });

    it('should parse json', async function () {
        await testDataType('json', DataTypeOIDs.Json, '{"a": 1}', '{"a": 1}');
    });

    it('should parse json array', async function () {
        await testDataType('_json', DataTypeOIDs.ArrayJson, ['{"a": 1}', '{"a": 2}'],
            ['{"a": 1}', '{"a": 2}']);
    });

    it('should parse xml', async function () {
        await testDataType('xml', DataTypeOIDs.Xml, '<tag>1</tag>', '<tag>1</tag>');
    });

    it('should parse xml array', async function () {
        await testDataType('_xml', DataTypeOIDs.ArrayXml, ['<tag>1</tag>', '<tag>2</tag>'],
            ['<tag>1</tag>', '<tag>2</tag>']);
    });

    it('should parse date', async function () {
        await testDataType('date', DataTypeOIDs.Date, '2020-10-22',
            new Date('2020-10-22T00:00:00Z'));
        await testDataType('date', DataTypeOIDs.Date, '2020-10-22 10:30:09',
            new Date('2020-10-22T00:00:00Z'));
        await testDataType('date', DataTypeOIDs.Date, 'infinity', Infinity);
        await testDataType('date', DataTypeOIDs.Date, '-infinity', -Infinity);
        await testDataType('date', DataTypeOIDs.Date, 'epoch',
            new Date(Date.UTC(1970, 0, 1)));
    });

    it('should parse date array', async function () {
        await testDataType('_date', DataTypeOIDs.ArrayDate, ['2020-10-22', '2020-10-22 10:30:09'],
            [new Date('2020-10-22T00:00:00Z'), new Date('2020-10-22T00:00:00Z')]);
    });

    it('should parse timestamp', async function () {
        await testDataType('timestamp', DataTypeOIDs.Timestamp, '2020-10-22',
            new Date('2020-10-22T00:00:00Z'));
        await testDataType('timestamp', DataTypeOIDs.Timestamp, '2020-10-22 10:30:09',
            new Date('2020-10-22T10:30:09Z'));
        await testDataType('timestamp', DataTypeOIDs.Timestamp, '2020-10-22 10:30:09.123',
            new Date('2020-10-22T10:30:09.123Z'));
        await testDataType('timestamp', DataTypeOIDs.Timestamp, 'infinity', Infinity);
        await testDataType('timestamp', DataTypeOIDs.Timestamp, '-infinity', -Infinity);
        await testDataType('timestamp', DataTypeOIDs.Timestamp, 'epoch',
            new Date(Date.UTC(1970, 0, 1)));
    });

    it('should parse timestamp array', async function () {
        await testDataType('_timestamp', DataTypeOIDs.ArrayTimestamp,
            ['2020-10-22 10:30:09', '2020-10-22 10:30:09.123'],
            [new Date('2020-10-22T10:30:09Z'), new Date('2020-10-22T10:30:09.123Z')]);
    });

    it('should parse timestamptz', async function () {
        await testDataType('timestamptz', DataTypeOIDs.Timestamptz, '2020-10-22 10:30:09+01:32',
            new Date('2020-10-22T10:30:09+01:32'));
        await testDataType('timestamptz', DataTypeOIDs.Timestamptz, 'infinity', Infinity);
        await testDataType('timestamptz', DataTypeOIDs.Timestamptz, '-infinity', -Infinity);
        await testDataType('timestamptz', DataTypeOIDs.Timestamptz, 'epoch',
            new Date(Date.UTC(1970, 0, 1)));
    });

    it('should parse timestamptz array', async function () {
        await testDataType('_timestamptz', DataTypeOIDs.ArrayTimestamptz,
            ['2020-10-22 10:30:09+01:32', '2020-10-22 10:30:09+00:00'],
            [new Date('2020-10-22T10:30:09+01:32'), new Date('2020-10-22T10:30:09+00:00')]);
    });

    it('should parse bytea', async function () {
        await testDataType('bytea', DataTypeOIDs.Bytea, "E'\\\xDEADBEEF'",
            Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]), false);
    });

    it('should parse bytea array', async function () {
        const buf = Buffer.from([195, 158, 65, 68, 66, 69, 69, 70]);
        await testDataType('_bytea', DataTypeOIDs.ArrayBytea, ["E'\\\xDEADBEEF'", "E'\\\xDEADBEEF'"],
            [buf, buf], false);
    });

    it('should parse point', async function () {
        const point1 = {x: 1.2, y: 3.5};
        await testDataType('point', DataTypeOIDs.Point, '(1.2, 3.5)', point1);
        await testDataType('point', DataTypeOIDs.Point, '1.2, 3.5', point1);
    });

    it('should parse point array', async function () {
        const point1 = {x: 1.2, y: 3.5};
        const point2 = {x: 2.1, y: 6.3};
        await testDataType('_point', DataTypeOIDs.ArrayPoint,
            ['(1.2, 3.5)', '(2.1, 6.3)'],
            [point1, point2]);
    });

    it('should parse circle', async function () {
        await testDataType('circle', DataTypeOIDs.Circle, '<(1.2, 3.5), 4.6>', {x: 1.2, y: 3.5, r: 4.6});
        await testDataType('circle', DataTypeOIDs.Circle, '((1.2, 3.5), 4.6)', {x: 1.2, y: 3.5, r: 4.6});
        await testDataType('circle', DataTypeOIDs.Circle, '(1.2, 3.5), 4.6', {x: 1.2, y: 3.5, r: 4.6});
        await testDataType('circle', DataTypeOIDs.Circle, '1.2, 3.5, 4.6', {x: 1.2, y: 3.5, r: 4.6});
    });

    it('should parse circle array', async function () {
        const circle1 = {x: 1.2, y: 3.5, r: 50};
        const circle2 = {x: 2.1, y: 6.3, r: 7};
        await testDataType('_circle', DataTypeOIDs.ArrayCircle,
            ['<(1.2, 3.5), 50>', '<(2.1, 6.3), 7>'],
            [circle1, circle2]);
    });

    it('should parse lseg', async function () {
        const line1 = {x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2};
        await testDataType('lseg', DataTypeOIDs.Lseg, '[(1.2, 3.5), (4.6, 5.2)]', line1);
        await testDataType('lseg', DataTypeOIDs.Lseg, '((1.2, 3.5), (4.6, 5.2))', line1);
        await testDataType('lseg', DataTypeOIDs.Lseg, '(1.2, 3.5), (4.6, 5.2)', line1);
        await testDataType('lseg', DataTypeOIDs.Lseg, '1.2, 3.5, 4.6, 5.2', line1);
    });

    it('should parse lseg array', async function () {
        const line1 = {x1: 1.2, y1: 3.5, x2: 4.6, y2: 5.2};
        const line2 = {x1: 1.3, y1: 3.6, x2: 4.7, y2: 5.3};
        await testDataType('_lseg', DataTypeOIDs.ArrayLseg,
            ['[(1.2, 3.5), (4.6, 5.2)]', '[(1.3, 3.6), (4.7, 5.3)]'],
            [line1, line2]);
    });

    it('should parse box', async function () {
        const box1 = {x1: 4.6, y1: 5.2, x2: 1.2, y2: 3.5};
        await testDataType('box', DataTypeOIDs.Box, '((4.6,5.2),(1.2,3.5))', box1);
        await testDataType('box', DataTypeOIDs.Box, '(4.6,5.2),(1.2,3.5)', box1);
        await testDataType('box', DataTypeOIDs.Box, '(4.6,5.2),(1.2,3.5)', box1);
    });

    it('should parse box array', async function () {
        const box1 = {x1: 4.6, y1: 5.2, x2: 1.2, y2: 3.5};
        const box2 = {x1: 4.5, y1: 5.1, x2: 1.1, y2: 3.4};
        await testDataType('_box', DataTypeOIDs.ArrayBox,
            ['((4.6,5.2),(1.2,3.5))', '((4.5,5.1),(1.1,3.4))'],
            [box1, box2]);
    });

});
