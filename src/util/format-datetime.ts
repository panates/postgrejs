import type { DataMappingOptions } from '../interfaces/data-mapping-options.js';

/**
 * Writes a Date as PostgreSQL's own text form, mirroring exactly what the
 * matching encodeBinary() would have sent.
 *
 * That mirroring is the whole point: `date`, `time` and `timestamp` have no
 * time zone, and their binary encoders read the JS Date's UTC components
 * when `utcDates` is set and its local ones otherwise. A text encoder that
 * chose differently would make the same statement mean two different
 * instants depending on whether it went through query() or execute().
 */
function parts(v: Date, options?: DataMappingOptions) {
  return options?.utcDates
    ? {
        year: v.getUTCFullYear(),
        month: v.getUTCMonth() + 1,
        day: v.getUTCDate(),
        hour: v.getUTCHours(),
        minute: v.getUTCMinutes(),
        second: v.getUTCSeconds(),
        ms: v.getUTCMilliseconds(),
      }
    : {
        year: v.getFullYear(),
        month: v.getMonth() + 1,
        day: v.getDate(),
        hour: v.getHours(),
        minute: v.getMinutes(),
        second: v.getSeconds(),
        ms: v.getMilliseconds(),
      };
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

function coerce(v: Date | number | string): Date | string {
  // Infinity and -Infinity are values PostgreSQL accepts verbatim.
  if (v === Infinity) return 'infinity';
  if (v === -Infinity) return '-infinity';
  return v instanceof Date ? v : new Date(v);
}

export function formatDate(
  v: Date | number | string,
  options?: DataMappingOptions,
): string {
  const d = coerce(v);
  if (typeof d === 'string') return d;
  const p = parts(d, options);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatTime(
  v: Date | number | string,
  options?: DataMappingOptions,
): string {
  const d = coerce(v);
  if (typeof d === 'string') return d;
  const p = parts(d, options);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.ms, 3)}`;
}

export function formatTimestamp(
  v: Date | number | string,
  options?: DataMappingOptions,
): string {
  const d = coerce(v);
  if (typeof d === 'string') return d;
  return `${formatDate(d, options)} ${formatTime(d, options)}`;
}

/**
 * timestamptz is an absolute instant - its binary encoder uses getTime()
 * with no time zone shift - so this writes UTC with an explicit offset and
 * ignores `utcDates`, which only governs the zone-less types.
 */
export function formatTimestamptz(v: Date | number | string): string {
  const d = coerce(v);
  if (typeof d === 'string') return d;
  return d.toISOString().replace('T', ' ').replace('Z', '+00');
}
