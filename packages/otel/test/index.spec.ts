import { expect } from 'expect';

describe('postgrejs-otel', () => {
  it('resolves through the workspace alias', async () => {
    const mod = await import('postgrejs-otel');
    expect(Object.keys(mod)).toEqual([]);
  });
});
