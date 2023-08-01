import {
  BindParam,
  Connection,
  DataFormat,
  DataMappingOptions,
  DataTypeOIDs,
  escapeLiteral,
  GlobalTypeMap,
  QueryResult,
  stringifyValueForSQL,
} from "postgresql-client";

export async function testParse(
    connection: Connection,
    dataTypeId: number,
    input: any[],
    output: any[],
    opts: { columnFormat: DataFormat },
    mappingOptions?: DataMappingOptions
): Promise<QueryResult> {
  const reg = GlobalTypeMap.get(dataTypeId);
  if (!reg) throw new Error(`Data type "${dataTypeId}" is not registered.`);
  const typeName = reg.name;
  let sql;
  if (reg.elementsOID) {
    const s = stringifyValueForSQL(input, mappingOptions);
    sql = `select ${s}::${typeName} as f1`;
  } else {
    const inp = input.map(escapeLiteral);
    sql = "select " + inp.map((x: string, i: number) => `${x}::${typeName} as f${i + 1}`).join(", ");
  }
  const resp = await connection.query(sql, {...mappingOptions, columnFormat: opts.columnFormat});
  expect(resp).toBeDefined();
  expect(resp.rows).toBeDefined();

  if (reg.elementsOID) {
    expect(resp.fields?.[0].dataTypeId).toStrictEqual(reg.oid);
    expect(resp.fields?.[0].jsType).toStrictEqual(reg.jsType);
    if (reg.oid !== DataTypeOIDs.char)
      expect(resp.fields?.[0].elementDataTypeId).toStrictEqual(reg.elementsOID);
    expect(resp.rows?.[0][0]).toStrictEqual(output);
  } else
      // eslint-disable-next-line prefer-const
    for (let [i, v] of output.entries()) {
      expect(resp.fields?.[i].jsType).toStrictEqual(reg.jsType);
      if (reg.oid !== DataTypeOIDs.char)
        expect(resp.fields?.[i].dataTypeId).toStrictEqual(reg.oid);
      let n = resp.rows?.[0][i];
      if (typeof n === "bigint") n = "" + n;
      if (typeof v === "bigint") v = "" + v;
      expect(n).toStrictEqual(v);
    }
  return resp;
}

export async function testEncode(
    connection: Connection,
    dataTypeId: number,
    input: any[],
    output?: any[],
    mappingOptions?: DataMappingOptions
): Promise<QueryResult> {
  const reg = GlobalTypeMap.get(dataTypeId);
  if (!reg) throw new Error(`Data type "0x${dataTypeId.toString(16)}" is not registered.`);
  let sql;
  let params;
  if (reg.elementsOID) {
    sql = "select $1 as f1";
    params = [new BindParam(dataTypeId, input)];
  } else {
    sql = "select " + input.map((x, i) => `\$${i + 1} as f${i + 1}`).join(", ");
    params = input.map((v) => new BindParam(dataTypeId, v));
  }
  const resp: QueryResult = await connection.query(sql, {...mappingOptions, params});
  expect(resp).toBeDefined();
  expect(resp.rows).toBeDefined();
  output = output === undefined ? input : output;
  if (reg.elementsOID) {
    expect(resp.fields?.[0].dataTypeId).toStrictEqual(reg.oid);
    expect(resp.fields?.[0].jsType).toStrictEqual(reg.jsType);
    if (reg.oid !== DataTypeOIDs.char)
      expect(resp.fields?.[0].elementDataTypeId).toStrictEqual(reg.elementsOID);
    expect(resp.rows?.[0][0]).toStrictEqual(output);
  } else
    for (const [i, v] of output.entries()) {
      expect(resp.fields?.[i].jsType).toStrictEqual(reg.jsType);
      if (reg.oid !== DataTypeOIDs.char)
        expect(resp.fields?.[i].dataTypeId).toStrictEqual(reg.oid);
      expect(resp.rows?.[0][i]).toStrictEqual(v);
    }
  return resp;
}
