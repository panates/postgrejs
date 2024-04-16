import { OID } from '../types.js';

export class BindParam {
  constructor(
    public oid: OID,
    public value: any,
  ) {}
}
