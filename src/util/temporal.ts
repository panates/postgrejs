/**
 * Reaching the `Temporal` the application provides, without depending on
 * one.
 *
 * No runtime ships Temporal yet - Node 24.15 and Bun 1.3.10 both answer
 * `undefined`, with or without `--harmony` - so today every caller that
 * turns `temporalTypes` on has installed a polyfill. That is why this is
 * read off `globalThis` when it is needed rather than imported: this
 * package takes no dependency, a polyfill loaded after this module is
 * still seen, and the day a runtime ships Temporal nothing here changes.
 */

/**
 * The parts of `Temporal` this client calls. Deliberately untyped past
 * the names: the shape cannot be checked against a global that may not
 * exist, so the presence check below is the check.
 */
export interface TemporalApi {
  Instant: any;
  PlainDate: any;
  PlainDateTime: any;
  PlainTime: any;
  Duration: any;
  ZonedDateTime: any;
}

let _systemTimeZone: string | undefined;
const _knownZones = new Set<string>();

/**
 * The runtime's `Temporal`, or an error saying how to get one.
 *
 * Called when a type map is built - which for a connection is while it
 * is being constructed - so a missing Temporal is reported before any
 * I/O rather than in the middle of decoding a row.
 */
export function getTemporal(): TemporalApi {
  const t = (globalThis as any).Temporal;
  if (!t || !t.ZonedDateTime)
    throw new Error(
      'Temporal is not available in this runtime. postgrejs reads ' +
        'globalThis.Temporal and takes no dependency of its own: install ' +
        '`temporal-polyfill` and import it before connecting, or leave ' +
        '`temporalTypes` off.',
    );
  return t as TemporalApi;
}

/**
 * The zone a `timestamptz` is printed in when the caller named none.
 *
 * Only the printing: a timestamptz is an absolute instant and arrives as
 * one, so the zone decides what wall clock the ZonedDateTime shows and
 * nothing about which moment it is.
 */
export function systemTimeZone(): string {
  if (_systemTimeZone === undefined)
    _systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return _systemTimeZone;
}

/**
 * Checks a zone name before it is handed to Temporal, so the complaint
 * names the setting it came from instead of surfacing from inside a
 * decode. `Intl` accepts exactly what Temporal does and is here whether
 * Temporal is or not.
 */
export function requireTimeZone(zone: string, where: string): string {
  if (_knownZones.has(zone)) return zone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    throw new Error(
      `"${zone}" (${where}) is not a time zone this runtime knows, so a ` +
        'timestamptz cannot be given one. Pass `timeZone` in the mapping ' +
        'options to name one yourself.',
    );
  }
  _knownZones.add(zone);
  return zone;
}
