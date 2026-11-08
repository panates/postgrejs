/**
 * PostgreSQL folds an unquoted identifier to lower case and takes a quoted
 * one literally. A LISTEN channel name is an identifier, so this is the
 * shape that would have been folded had it been written unquoted.
 */
const UNQUOTED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** NAMEDATALEN - 1. */
const MAX_CHANNEL_BYTES = 63;

/**
 * Checks a LISTEN/NOTIFY channel name and answers with the name the server
 * will actually use for it.
 *
 * The name is written into LISTEN/UNLISTEN as an identifier, and an
 * identifier can never be a parameter - so it goes through
 * escapeIdentifier() at the call site rather than being restricted to a
 * pattern. Any name PostgreSQL accepts then works, one-character and
 * underscore-leading names included, which the old `/^[A-Z]\w+$/i` guard
 * refused.
 *
 * Quoting alone would change what a name means, though, which is what this
 * function is for: `LISTEN Foo` unquoted subscribes to `foo`, and every
 * notification for it comes back as `foo`. Callers were registering their
 * callback under the name they passed and never hearing from it - any
 * channel name that was not already lower case was silently dead. Folding
 * the same way the server would keeps the registration key and the name
 * the server reports the same string, and keeps `NOTIFY Foo` written by
 * hand on the other side reaching a `listen('Foo')` here.
 *
 * A name that could not have been written unquoted (a space, a dash) has
 * no folding question to answer and is passed through as it is.
 */
export function normalizeChannelName(channel: string): string {
  if (typeof channel !== 'string' || !channel.length)
    throw new TypeError('Channel name must be a non-empty string');
  if (channel.indexOf('\0') >= 0)
    throw new TypeError('Channel name cannot contain NUL (\\0) bytes');
  // Refused rather than passed on: the server truncates a longer
  // identifier instead of rejecting it, so LISTEN would subscribe to a
  // name the caller never asked for and every notification would arrive
  // under that one - the same silent mismatch as the case folding above.
  if (Buffer.byteLength(channel, 'utf8') > MAX_CHANNEL_BYTES)
    throw new TypeError(
      `Channel name cannot be longer than ${MAX_CHANNEL_BYTES} bytes`,
    );
  return UNQUOTED_IDENTIFIER.test(channel) ? channel.toLowerCase() : channel;
}
