import {OID} from './definitions.js';

export class BindParam {
  constructor(public oid: OID, public value: any) {
  }
}
