import { expect } from 'expect';
import { usedBytes } from '../../benchmark/runner/heap-usage.js';

/**
 * The benchmark suite's Peak Heap column, which used to read
 * `heapUsed` alone and therefore reported nothing for exactly the
 * scenarios it exists to compare: a `Buffer` is not on the JS heap, and
 * neither is a large string built out of one.
 *
 * This pins the accounting rather than the sampling - what is counted is
 * what was wrong.
 */
describe('benchmark heap accounting', () => {
  const MB = 1024 * 1024;
  const SIZE = 24 * MB;
  // A tenth of the allocation: enough to prove the bytes were counted,
  // loose enough that ordinary noise between two samples cannot fail it.
  const NEAR = SIZE / 10;

  /** What `usedBytes()` and `heapUsed` each make of holding `alloc()`. */
  function growth(alloc: () => { length: number }) {
    const beforeUsed = usedBytes();
    const beforeHeap = process.memoryUsage().heapUsed;
    const value = alloc();
    const used = usedBytes() - beforeUsed;
    const heap = process.memoryUsage().heapUsed - beforeHeap;
    // Read it, so nothing can be collected before the samples are taken.
    expect(value.length).toBeGreaterThan(0);
    return { used, heap };
  }

  it('should count a Buffer, which the heap figure alone never saw', () => {
    const { used, heap } = growth(() => Buffer.alloc(SIZE, 1));
    expect(used).toBeGreaterThan(SIZE - NEAR);
    // The old reading, kept here as the reason this test exists.
    expect(heap).toBeLessThan(NEAR);
  });

  it('should count a large string, which is off-heap too', () => {
    // `Buffer.toString()` on a large buffer hands V8 an external string,
    // which is how `pg` holds a bytea column - as `\x`-prefixed hex,
    // twice the bytes on the wire.
    const { used, heap } = growth(() =>
      Buffer.alloc(SIZE, 65).toString('latin1'),
    );
    expect(used).toBeGreaterThan(SIZE - NEAR);
    expect(heap).toBeLessThan(NEAR);
  });

  it('should not double-count array buffers, which external already holds', () => {
    // No deltas here: a GC between two samples can free more elsewhere
    // than this allocates, and the relation being pinned does not need
    // them - `arrayBuffers` is a part of `external`, so adding it on top
    // would count the same bytes twice.
    const buf = Buffer.alloc(SIZE, 1);
    const usage = process.memoryUsage();
    expect(buf.length).toStrictEqual(SIZE);
    expect(usage.arrayBuffers).toBeGreaterThan(SIZE - NEAR);
    expect(usage.arrayBuffers).toBeLessThanOrEqual(usage.external);
    expect(usedBytes()).toBeGreaterThan(SIZE - NEAR);
  });
});
