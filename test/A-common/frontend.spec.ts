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

    it('should wrap a scalar value into a single-element array for a binary array type', () => {
      const typeMap = new DataTypeMap();
      const elemOid = 90004;
      const arrayOid = 90005;
      const elementType: DataType = {
        oid: elemOid,
        name: 'sentinel_num',
        jsType: 'number',
        isType: () => false,
        decodeBinary: () => undefined,
        decodeText: () => undefined,
        encodeBinary: (io, v: number) => io.writeInt16BE(v),
      };
      const arrayType: DataType = {
        ...elementType,
        oid: arrayOid,
        name: '_sentinel_num',
        elementsOID: elemOid,
      };
      typeMap.register([elementType, arrayType]);

      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [arrayOid],
        // A bare scalar, not an array - the array-typed param still has to
        // wrap it into a one-element array rather than throwing.
        params: [42],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readInt16BE(); // param count
      io.readInt16BE(); // format code slot
      io.readUInt16BE(); // value count
      io.readInt32BE(); // data length
      const ndims = io.readInt32BE();
      io.readInt32BE(); // has-null flag
      io.readInt32BE(); // element oid
      const dim0 = io.readInt32BE();
      expect(ndims).toStrictEqual(1);
      expect(dim0).toStrictEqual(1);
    });

    it('should write a scalar text type with no elementsOID via encodeText() directly', () => {
      const typeMap = new DataTypeMap();
      const oid = 90006;
      const scalarType: DataType = {
        oid,
        name: 'sentinel_scalar',
        jsType: 'string',
        isType: () => false,
        decodeBinary: () => undefined,
        decodeText: () => undefined,
        encodeText: v => 'X' + v,
      };
      typeMap.register(scalarType);

      const frontend = new Frontend({});
      const buf = frontend.getBindMessage({
        typeMap,
        paramTypes: [oid],
        params: ['hi'],
        queryOptions: {},
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      io.readInt16BE();
      io.readInt16BE();
      io.readUInt16BE();
      const len = io.readInt32BE();
      expect(io.readBuffer(len).toString('utf8')).toStrictEqual('Xhi');
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

    it('getCloseMessage() should default a missing name to the empty string, skipping the length check entirely', () => {
      const frontend = new Frontend({});
      const buf = frontend.getCloseMessage({ type: 'S' });
      const io = reader(buf);
      io.readUInt8(); // type
      expect(io.readCString()).toStrictEqual('');
    });
  });

  describe('getParseMessage()', () => {
    it('should default a missing statement name to the empty string', () => {
      const frontend = new Frontend({});
      const buf = frontend.getParseMessage({ sql: 'select 1' });
      const io = reader(buf);
      expect(io.readCString()).toStrictEqual('');
      expect(io.readCString()).toStrictEqual('select 1');
      expect(io.readUInt16BE()).toStrictEqual(0);
    });

    it('should refuse a statement name longer than 63 characters', () => {
      const frontend = new Frontend({});
      expect(() =>
        frontend.getParseMessage({
          sql: 'select 1',
          statement: 's'.repeat(64),
        }),
      ).toThrow(/Query name length/);
    });

    it('should write each given param type oid, defaulting a falsy one to 0', () => {
      const frontend = new Frontend({});
      const buf = frontend.getParseMessage({
        sql: 'select $1, $2',
        paramTypes: [23, 0],
      });
      const io = reader(buf);
      io.readCString();
      io.readCString();
      expect(io.readUInt16BE()).toStrictEqual(2);
      expect(io.readUInt32BE()).toStrictEqual(23);
      expect(io.readUInt32BE()).toStrictEqual(0);
    });
  });

  describe('getExecuteMessage()', () => {
    it('should default a missing portal name and fetchCount to empty string/0', () => {
      const frontend = new Frontend({});
      const buf = frontend.getExecuteMessage({});
      const io = reader(buf);
      expect(io.readCString()).toStrictEqual('');
      expect(io.readUInt32BE()).toStrictEqual(0);
    });
  });

  describe('getQueryMessage()', () => {
    it('should default a falsy sql to the empty string', () => {
      const frontend = new Frontend({});
      const buf = frontend.getQueryMessage('');
      const io = reader(buf);
      expect(io.readCString()).toStrictEqual('');
    });
  });

  describe('getFunctionCallMessage()', () => {
    it('should write function id, arg formats, each arg (or -1 for null), and the result format', () => {
      const frontend = new Frontend({});
      const arg0 = Buffer.from([0x01, 0x02]);
      const buf = frontend.getFunctionCallMessage({
        functionId: 1234,
        argFormats: [DataFormat.binary],
        args: [arg0, null],
        resultFormat: DataFormat.binary,
      });
      const io = reader(buf);
      expect(io.readInt32BE()).toStrictEqual(1234);
      expect(io.readInt16BE()).toStrictEqual(1); // argFormats.length
      expect(io.readInt16BE()).toStrictEqual(DataFormat.binary);
      expect(io.readInt16BE()).toStrictEqual(2); // args.length
      expect(io.readInt32BE()).toStrictEqual(arg0.length);
      expect(io.readBuffer(arg0.length)).toStrictEqual(arg0);
      expect(io.readInt32BE()).toStrictEqual(-1); // null arg
      expect(io.readInt16BE()).toStrictEqual(DataFormat.binary); // result format
    });

    it('should default to an empty argFormats and text result format', () => {
      const frontend = new Frontend({});
      const buf = frontend.getFunctionCallMessage({
        functionId: 1,
        args: [],
      });
      const io = reader(buf);
      expect(io.readInt32BE()).toStrictEqual(1);
      expect(io.readInt16BE()).toStrictEqual(0); // argFormats.length
      expect(io.readInt16BE()).toStrictEqual(0); // args.length
      expect(io.readInt16BE()).toStrictEqual(DataFormat.text);
    });
  });

  describe('getCopyFailMessage()', () => {
    it('should default a falsy message to the empty string', () => {
      const frontend = new Frontend({});
      const buf = frontend.getCopyFailMessage('');
      const io = reader(buf);
      expect(io.readCString()).toStrictEqual('');
    });
  });
});
