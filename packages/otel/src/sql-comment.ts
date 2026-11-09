import type { SpanContext } from '@opentelemetry/api';
import { isSpanContextValid } from '@opentelemetry/api';

/**
 * Builds the comment put in front of a statement, in the sqlcommenter
 * format: `key='value'` pairs sorted by key, keys and values URL-encoded,
 * a quote inside a value escaped with a backslash.
 *
 * @param tags Static key/value pairs, such as Datadog's `dddbs` and `dde`.
 * Keys with an empty or undefined value are left out.
 * @param spanContext When given and valid, its W3C `traceparent` is added.
 * @returns The comment followed by a space, or an empty string when there
 * is nothing to put in it.
 */
export function buildSqlComment(
  tags: Record<string, string | undefined> | undefined,
  spanContext?: SpanContext,
): string {
  const pairs: string[] = [];
  if (tags) {
    for (const key of Object.keys(tags)) {
      const value = tags[key];
      if (value) pairs.push(`${encode(key)}='${encode(value)}'`);
    }
  }
  if (spanContext && isSpanContextValid(spanContext)) {
    pairs.push(`traceparent='${traceparent(spanContext)}'`);
  }
  if (!pairs.length) return '';
  pairs.sort();
  return `/*${pairs.join(',')}*/ `;
}

/**
 * The W3C `traceparent` header value for a span context.
 *
 * @param sc The span context.
 * @returns `00-<trace id>-<span id>-<flags>`.
 */
export function traceparent(sc: SpanContext): string {
  return `00-${sc.traceId}-${sc.spanId}-${(sc.traceFlags & 0xff)
    .toString(16)
    .padStart(2, '0')}`;
}

/* encodeURIComponent leaves `'` alone, and a bare one would end the value
   early; sqlcommenter escapes it with a backslash after encoding. `*` and
   `/` are left alone too, but `*\/` cannot appear: `/` is encoded. */
function encode(s: string): string {
  return encodeURIComponent(s).replace(/'/g, "\\'");
}
