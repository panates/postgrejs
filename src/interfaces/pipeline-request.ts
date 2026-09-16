import type { Maybe, OID } from '../types.js';

/**
 * One statement in a `Connection.pipeline()` call. The `sql` tag's own
 * output satisfies this shape, so a pipeline can be written straight from
 * tagged templates without any conversion.
 */
export interface PipelineRequest {
  sql: string;
  params?: any[];
  /**
   * Parameter type OIDs for this statement. Per statement rather than per
   * pipeline: the statements differ, so one shared list could only ever be
   * right for one of them.
   */
  paramTypes?: Maybe<OID>[];
}
