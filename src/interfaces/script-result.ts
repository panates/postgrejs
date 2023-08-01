import type { CommandResult } from './command-result.js';

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
   * Total execution time
   */
  totalTime: number;
}
