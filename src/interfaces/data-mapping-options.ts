import type { OID } from '../types.js';

export interface DataMappingOptions {
  /**
   * If true UTC time will be used for date decoding, else system time offset will be used
   * @default false
   */
  utcDates?: boolean;

  fetchAsString?: OID[];
}
