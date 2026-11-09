import { expect } from 'expect';
import { normalizeChannelName } from '../../src/util/channel-name.js';

describe('normalizeChannelName()', () => {
  it('should accept the names the old pattern refused', () => {
    // `/^[A-Z]\w+$/i` needed at least two characters and never allowed a
    // leading underscore, both of which PostgreSQL accepts.
    expect(normalizeChannelName('a')).toStrictEqual('a');
    expect(normalizeChannelName('_private')).toStrictEqual('_private');
    expect(normalizeChannelName('_')).toStrictEqual('_');
  });

  it('should fold a name that could have been written unquoted', () => {
    // What `LISTEN Foo` itself does, so the registration key matches the
    // name the server reports back.
    expect(normalizeChannelName('Foo')).toStrictEqual('foo');
    expect(normalizeChannelName('MY_CHANNEL')).toStrictEqual('my_channel');
    expect(normalizeChannelName('foo')).toStrictEqual('foo');
  });

  it('should leave a name that needs quoting as it is', () => {
    // It could never have been written unquoted, so there is no folding
    // to reproduce.
    expect(normalizeChannelName('my chan')).toStrictEqual('my chan');
    expect(normalizeChannelName('a-b')).toStrictEqual('a-b');
    expect(normalizeChannelName('Ünlü')).toStrictEqual('Ünlü');
    expect(normalizeChannelName('1st')).toStrictEqual('1st');
  });

  it('should refuse an empty name', () => {
    expect(() => normalizeChannelName('')).toThrow('non-empty');
    expect(() => normalizeChannelName(undefined as any)).toThrow('non-empty');
  });

  it('should refuse a NUL byte', () => {
    expect(() => normalizeChannelName('a\0b')).toThrow('NUL');
  });

  it('should refuse a name the server would truncate', () => {
    // 63 bytes is NAMEDATALEN - 1; the server cuts a longer identifier
    // instead of refusing it, so every notification would come back under
    // a name that never matches what was registered.
    expect(normalizeChannelName('c'.repeat(63))).toStrictEqual('c'.repeat(63));
    expect(() => normalizeChannelName('c'.repeat(64))).toThrow('63 bytes');
    // Counted in bytes, not characters.
    expect(() => normalizeChannelName('ü'.repeat(32))).toThrow('63 bytes');
  });
});
