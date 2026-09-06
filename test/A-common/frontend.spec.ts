import { expect } from 'expect';
import { DataTypeMap } from '../../src/data-type-map.js';
import type { DataType } from '../../src/interfaces/data-type.js';
import { BufferReader } from '../../src/protocol/buffer-reader.js';
import { Frontend } from '../../src/protocol/frontend.js';
import { Protocol } from '../../src/protocol/protocol.js';

const DataFormat = Protocol.DataFormat;

function reader(buf: Buffer): BufferReader {
  // Skip the 1-byte message code + 4-byte length header this test isn't
  // interested in - everything past it is the Bind message body.
  return new BufferReader(buf.subarray(5));
}

describe('Frontend', () => {
  describe('getBindMessage()', () => {
    it("should write -1 (null) for a value a custom type's encodeAsNull() claims", () => {
      // encodeAsNull() is an extension point no built-in DataType uses -
      // only custom, user-registered ones - so it needs its own type here
      // to exercise at all.
      const typeMap = new DataTypeMap();
      const oid = 90001;
      const sentinelType: DataType = {
        oid,
        name: 'sentinel',
        jsType: 'string',
        isType: () => false,
        decodeBinary: () => undefined,
        decodeText: () => undefined,
        encodeAsNull: v => v === 'NULL_SENTINEL',
        encodeText: v => v,
      };
      typeMap.register(sentinelType);

      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [oid],
        params: ['NULL_SENTINEL'],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString(); // portal
      io.readCString(); // statement
      const paramCount = io.readInt16BE();
      expect(paramCount).toStrictEqual(1);
      io.readInt16BE(); // format code slot (preserved as 0/text - never reached)
      io.readUInt16BE(); // param value count
      expect(io.readInt32BE()).toStrictEqual(-1); // the null marker itself
    });

    it('should stringify an array parameter as an ARRAY literal when the type has no encodeBinary', () => {
      const typeMap = new DataTypeMap();
      const elementOid = 90002;
      const arrayOid = 90003;
      const elementType: DataType = {
        oid: elementOid,
        name: 'sentinel_elem',
        jsType: 'string',
        isType: () => false,
        decodeBinary: () => undefined,
        decodeText: () => undefined,
        encodeText: v => String(v),
      };
      const arrayType: DataType = {
        ...elementType,
        oid: arrayOid,
        name: '_sentinel_elem',
        elementsOID: elementOid,
      };
      typeMap.register([elementType, arrayType]);

      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [arrayOid],
        params: [['a', 'b']],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readInt16BE(); // param count
      io.readInt16BE(); // format code slot
      io.readUInt16BE(); // value count
      const len = io.readInt32BE();
      const text = io.readBuffer(len).toString('utf8');
      // stringifyArrayLiteral() quotes every leaf value once an encode
      // function is supplied - see stringify-arrayliteral.spec.ts.
      expect(text).toStrictEqual('{"a","b"}');
    });

    it('should bind a raw Buffer as binary when no DataType is registered for its OID', () => {
      const typeMap = new DataTypeMap();
      const raw = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [123456], // not registered in this empty typeMap
        params: [raw],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readInt16BE();
      const formatCode = io.readInt16BE();
      expect(formatCode).toStrictEqual(DataFormat.binary);
      io.readUInt16BE();
      const len = io.readInt32BE();
      expect(io.readBuffer(len)).toStrictEqual(raw);
    });

    it('should stringify anything else with no matching type as plain text', () => {
      const typeMap = new DataTypeMap();
      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [123456],
        params: [12345],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readInt16BE();
      io.readInt16BE();
      io.readUInt16BE();
      const len = io.readInt32BE();
      expect(io.readBuffer(len).toString('utf8')).toStrictEqual('12345');
    });

    it('should write a per-column format array when columnFormat is an array', () => {
      const typeMap = new DataTypeMap();
      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        params: [],
        queryOptions: {
          columnFormat: [DataFormat.text, DataFormat.binary, DataFormat.text],
        },
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readUInt16BE(); // 0 params (no params array supplied)
      io.readUInt16BE(); // 0 param values
      const formatCount = io.readUInt16BE();
      expect(formatCount).toStrictEqual(3);
      expect([
        io.readUInt16BE(),
        io.readUInt16BE(),
        io.readUInt16BE(),
      ]).toStrictEqual([DataFormat.text, DataFormat.binary, DataFormat.text]);
    });

    it('should refuse a portal name longer than 63 characters', () => {
      const typeMap = new DataTypeMap();
      const frontend = new Frontend({});
      expect(() =>
        frontend.getBindMessage({
          typeMap,
          portal: 'p'.repeat(64),
          queryOptions: {},
        }),
      ).toThrow(/Portal name length/);
    });

    it('should refuse a statement name longer than 63 characters', () => {
      const typeMap = new DataTypeMap();
      const frontend = new Frontend({});
      expect(() =>
        frontend.getBindMessage({
          typeMap,
          statement: 's'.repeat(64),
          queryOptions: {},
        }),
      ).toThrow(/Query name length/);
    });
  });

  describe('getDescribeMessage()/getCloseMessage()', () => {
    it("getDescribeMessage() should refuse a portal name over 63 characters, naming 'Portal'", () => {
      const frontend = new Frontend({});
      expect(() =>
        frontend.getDescribeMessage({ type: 'P', name: 'p'.repeat(64) }),
      ).toThrow(/^Portal$/);
    });

    it("getDescribeMessage() should refuse a statement name over 63 characters, naming 'Statement'", () => {
      const frontend = new Frontend({});
      expect(() =>
        frontend.getDescribeMessage({ type: 'S', name: 's'.repeat(64) }),
      ).toThrow(/Statement name length/);
    });

    it("getCloseMessage() should refuse a portal name over 63 characters, naming 'Portal'", () => {
      const frontend = new Frontend({});
      expect(() =>
        frontend.getCloseMessage({ type: 'P', name: 'p'.repeat(64) }),
      ).toThrow(/^Portal$/);
    });

    it("getCloseMessage() should refuse a statement name over 63 characters, naming 'Statement'", () => {
      const frontend = new Frontend({});
      expect(() =>
        frontend.getCloseMessage({ type: 'S', name: 's'.repeat(64) }),
      ).toThrow(/Statement name length/);
    });
  });
});
