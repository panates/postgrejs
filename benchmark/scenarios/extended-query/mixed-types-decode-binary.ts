import type { ScenarioMeta } from '../../types.js';
import { MIXED_TYPES_DECODE_ROW_TARGET } from './mixed-types-decode.js';

export const MIXED_TYPES_DECODE_BINARY_SCENARIO: ScenarioMeta = {
  name: 'mixed-types-decode-binary',
  title: 'Mixed-Type Decode (Binary Protocol)',
  description: `The same fetch as Mixed-Type Decode (Text Protocol) above - same
${MIXED_TYPES_DECODE_ROW_TARGET} rows, same columns, same bind-parameter
row count - but requesting binary result format instead of text. That is
PostgreJS's own Extended Query default (\`DEFAULT_COLUMN_FORMAT\`), so this
measures its binary decode path on its own terms rather than forcing it
onto text.

postgres.js has no binary protocol support at all: its \`Bind\` message
hardcodes text format codes for every column, with no option to request
binary (verified in its own source). It isn't benchmarked here.

pg's binary parser table (\`pg-types\`) is missing exactly the column types
this scenario decodes - \`varchar\`/\`json\`/\`jsonb\`/\`bytea\` are unregistered
for binary, only a handful of numeric/date/bool types are. Requesting
binary from pg would return those columns unparsed or corrupted rather
than a comparable value, so it's excluded rather than reported as a
misleading number.

Only PostgreJS's own result is shown.`,
  unsupportedLibs: {
    pg: 'Not Fully Supported',
    postgres: 'Not Supported',
  },
  bench: {
    time: 500,
    iterations: 30,
    warmupTime: 100,
    warmupIterations: 5,
  },
};
