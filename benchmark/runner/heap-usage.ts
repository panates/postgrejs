import process from 'node:process';

/**
 * What the process is holding, for the Peak Heap column.
 *
 * `heapUsed` alone was wrong for exactly the scenarios the column exists
 * to compare. A `Buffer` is not on the JS heap and neither is a large
 * string built out of one - Node hands both to V8 as external memory -
 * so a payload scenario reported a figure with no relation to what it
 * was holding. Measured, on a 25 MB value:
 *
 * ```
 * 25MB Buffer   heapUsed +0.0 MB   external +25.0 MB
 * 25MB string   heapUsed +0.0 MB   external +50.0 MB   (two bytes a char)
 * ```
 *
 * Large Blob Fetch moves 12.8 MB per op on this client and 25.6 MB on
 * `pg` - the suite counts that itself, in the Network column - and
 * reported peaks of 1.2 MB and 2.1 MB against them. That is not a memory
 * figure; it is the absence of one, and it understated whichever library
 * moved the most bytes the most.
 *
 * `arrayBuffers` is a subset of `external` and is deliberately not added
 * on top of it. Both numbers come from one `memoryUsage()` call, so the
 * sum is a state the process was actually in rather than two peaks that
 * may never have coincided.
 */
export function usedBytes(): number {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.external;
}
