/**
 * What a function call answered with, undecoded.
 *
 * The fast-call protocol says nothing about the return type, so the
 * bytes are handed over as they arrived for the caller to read.
 */
export interface FunctionCallResult {
  /**
   * The function's return value, in the wire format requested via
   * `FunctionCallOptions.resultFormat` - `null` if it returned SQL NULL.
   */
  result: Buffer | null;
}
