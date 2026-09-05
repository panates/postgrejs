import type { ScenarioMeta, ScenarioName } from '../types.js';
import { CONNECT_SCENARIO } from './connect/connect.js';
import { CURSOR_STREAM_SCENARIO } from './cursor/cursor-stream.js';
import { EXTENDED_QUERY_EXECUTE_SCENARIO } from './extended-query/extended-query-execute.js';
import { EXTENDED_QUERY_EXECUTE_CONCURRENT_SCENARIO } from './extended-query/extended-query-execute-concurrent.js';
import { LARGE_ARRAY_FETCH_SCENARIO } from './extended-query/large-array-fetch.js';
import { LARGE_BLOB_FETCH_SCENARIO } from './extended-query/large-blob-fetch.js';
import { MIXED_TYPES_DECODE_SCENARIO } from './extended-query/mixed-types-decode.js';
import { MIXED_TYPES_DECODE_BINARY_SCENARIO } from './extended-query/mixed-types-decode-binary.js';
import { POOL_EXTENDED_QUERY_EXECUTE_SCENARIO } from './pool/pool-extended-query-execute.js';
import { POOL_SIMPLE_QUERY_EXECUTE_SCENARIO } from './pool/pool-simple-query-execute.js';
import { PREPARED_STATEMENT_REUSE_SCENARIO } from './prepared-statement/prepared-statement-reuse.js';
import { PREPARED_STATEMENT_REUSE_CONCURRENT_SCENARIO } from './prepared-statement/prepared-statement-reuse-concurrent.js';
import { SIMPLE_QUERY_EXECUTE_SCENARIO } from './simple-query/simple-query-execute.js';
import { SIMPLE_QUERY_EXECUTE_CONCURRENT_SCENARIO } from './simple-query/simple-query-execute-concurrent.js';
import { SIMPLE_QUERY_FETCH_SCENARIO } from './simple-query/simple-query-fetch.js';

export const SCENARIOS: Record<ScenarioName, ScenarioMeta> = {
  connect: CONNECT_SCENARIO,
  'simple-query-execute': SIMPLE_QUERY_EXECUTE_SCENARIO,
  'simple-query-execute-concurrent': SIMPLE_QUERY_EXECUTE_CONCURRENT_SCENARIO,
  'simple-query-fetch': SIMPLE_QUERY_FETCH_SCENARIO,
  'extended-query-execute': EXTENDED_QUERY_EXECUTE_SCENARIO,
  'extended-query-execute-concurrent':
    EXTENDED_QUERY_EXECUTE_CONCURRENT_SCENARIO,
  'mixed-types-decode': MIXED_TYPES_DECODE_SCENARIO,
  'mixed-types-decode-binary': MIXED_TYPES_DECODE_BINARY_SCENARIO,
  'large-blob-fetch': LARGE_BLOB_FETCH_SCENARIO,
  'large-array-fetch': LARGE_ARRAY_FETCH_SCENARIO,
  'cursor-stream': CURSOR_STREAM_SCENARIO,
  'pool-simple-query-execute': POOL_SIMPLE_QUERY_EXECUTE_SCENARIO,
  'pool-extended-query-execute': POOL_EXTENDED_QUERY_EXECUTE_SCENARIO,
  'prepared-statement-reuse': PREPARED_STATEMENT_REUSE_SCENARIO,
  'prepared-statement-reuse-concurrent':
    PREPARED_STATEMENT_REUSE_CONCURRENT_SCENARIO,
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];

export function isScenarioName(value: string): value is ScenarioName {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, value);
}

export * from './connect/connect.js';
export * from './cursor/cursor-stream.js';
export * from './extended-query/extended-query-execute.js';
export * from './extended-query/extended-query-execute-concurrent.js';
export * from './extended-query/large-array-fetch.js';
export * from './extended-query/large-blob-fetch.js';
export * from './extended-query/mixed-types-decode.js';
export * from './extended-query/mixed-types-decode-binary.js';
export * from './pool/pool-extended-query-execute.js';
export * from './pool/pool-simple-query-execute.js';
export * from './prepared-statement/prepared-statement-reuse.js';
export * from './prepared-statement/prepared-statement-reuse-concurrent.js';
export * from './simple-query/simple-query-execute.js';
export * from './simple-query/simple-query-execute-concurrent.js';
export * from './simple-query/simple-query-fetch.js';
