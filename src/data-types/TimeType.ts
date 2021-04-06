import {DataType, DataTypeOIDs, DataMappingOptions} from '../definitions';
import {SmartBuffer} from '../protocol/SmartBuffer';
// noinspection ES6PreferShortImport
import {parseTime, TIME_PATTERN} from '../util/parse-time';

const timeMul = 4294967296;

export const TimeType: DataType = {

    name: 'time',
    oid: DataTypeOIDs.time,
    jsType: 'string',

    parseBinary(v: Buffer, options: DataMappingOptions): Date | number | string {
        const fetchAsString = options.fetchAsString &&
            options.fetchAsString.includes(DataTypeOIDs.time);
        const hi = v.readInt32BE();
        const lo = v.readUInt32BE(4);

        let d = new Date((lo + hi * timeMul) / 1000);
        if (fetchAsString || !options.utcDates)
            d = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
                d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
        return fetchAsString ? dateToTimeString(d) : d;
    },

    encodeBinary(buf: SmartBuffer, v: Date | number | string, options: DataMappingOptions): void {
        if (typeof v === 'string')
            v = parseTime(v, false, options.utcDates);
        if (!(v instanceof Date))
            v = new Date(v);
        // Postgresql ignores timezone data so we are
        let n = options.utcDates ? v.getTime() :
            v.getTime() - (v.getTimezoneOffset() * 60 * 1000)
        n = n * 1000;
        const hi = Math.floor(n / timeMul);
        const lo = n - hi * timeMul;
        buf.writeInt32BE(hi);
        buf.writeUInt32BE(lo);
    },

    parseText(v: string, options: DataMappingOptions): Date | number | string {
        if (options.fetchAsString && options.fetchAsString.includes(DataTypeOIDs.time))
            return v;
        return parseTime(v, false, options.utcDates);
    },

    isType(v: any): boolean {
        return (typeof v === 'string') && TIME_PATTERN.test(v);
    }

}

function padZero(v: number): string {
    return v < 9 ? '0' + v : '' + v;
}

function dateToTimeString(d: Date): string {
    return padZero(d.getHours()) + ':' + padZero(d.getMinutes()) + ':' + padZero(d.getSeconds());
}

export const ArrayTimeType: DataType = {
    ...TimeType,
    name: '_time',
    oid: DataTypeOIDs._time,
    elementsOID: DataTypeOIDs.time
}
