export interface FunctionCallResult {
  /**
   * The function's return value, in the wire format requested via
   * `FunctionCallOptions.resultFormat` - `null` if it returned SQL NULL.
   */
  result: Buffer | null;
}
