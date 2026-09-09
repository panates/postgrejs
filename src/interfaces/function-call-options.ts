import type { DataFormat } from '../constants.js';

export interface FunctionCallOptions {
  /**
   * Format of each argument, applied positionally - omit for text (the
   * default) applied to every argument, a single entry to apply it to all
   * of them, or one entry per argument.
   */
  argFormats?: DataFormat[];
  /**
   * Format the function's return value comes back in.
   * @default DataFormat.text
   */
  resultFormat?: DataFormat;
}
