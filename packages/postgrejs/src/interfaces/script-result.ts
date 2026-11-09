import type { CommandResult } from './command-result.js';

/** What `execute()` answered with: one result per statement in the script. */
export interface ScriptResult {
  /**
   * Array of command result for each sql command in the script
   */
  results: CommandResult[];
  /**
   * Command count in the script
   */
  totalCommands: number;
  /**
   * Total execution time - only measured when `timing` is enabled (off by
   * default; see `DatabaseConnectionParams.timing`).
   */
  totalTime?: number;
}
