import diagnosticsChannel from 'node:diagnostics_channel';
import { expect } from 'expect';
import { tracingChannels } from 'postgrejs';
import { isTraced } from '../../src/tracing.js';

/**
 * isTraced() decides whether the driver builds a trace context at all, so
 * it has to see a subscriber on any one of the five events. It reads each
 * event channel rather than TracingChannel.hasSubscribers because Bun 1.4
 * leaves the latter undefined.
 */
describe('tracing channels', () => {
  it('should use the published channel names', () => {
    expect(tracingChannels.query.start.name).toStrictEqual(
      'tracing:postgrejs:query:start',
    );
    expect(tracingChannels.execute.start.name).toStrictEqual(
      'tracing:postgrejs:execute:start',
    );
    expect(tracingChannels.poolAcquire.start.name).toStrictEqual(
      'tracing:postgrejs:pool:acquire:start',
    );
    expect(tracingChannels.connect.start.name).toStrictEqual(
      'tracing:postgrejs:connect:start',
    );
  });

  it('should be the channels anyone gets by name', () => {
    // A subscriber in another package, e.g. postgrejs-otel or an APM agent,
    // looks the channel up by name and must reach the same one.
    const byName = diagnosticsChannel.tracingChannel('postgrejs:query');
    const seen: string[] = [];
    const handlers = { start: (ctx: any) => seen.push(ctx.sql) };
    byName.subscribe(handlers as any);
    try {
      tracingChannels.query.start.publish({ sql: 'select 1' } as any);
    } finally {
      byName.unsubscribe(handlers as any);
    }
    expect(seen).toStrictEqual(['select 1']);
  });

  describe('isTraced()', () => {
    const channel = diagnosticsChannel.tracingChannel(
      'postgrejs:test:is-traced',
    );

    it('should be false with no subscriber', () => {
      expect(isTraced(channel)).toStrictEqual(false);
    });

    for (const event of [
      'start',
      'end',
      'asyncStart',
      'asyncEnd',
      'error',
    ] as const) {
      it(`should be true with only a ${event} subscriber`, () => {
        const handler = () => undefined;
        channel[event].subscribe(handler);
        try {
          expect(isTraced(channel)).toStrictEqual(true);
        } finally {
          channel[event].unsubscribe(handler);
        }
        expect(isTraced(channel)).toStrictEqual(false);
      });
    }
  });
});
