/**
 * An error whose message is written for the MCP client. Tool handlers return these
 * messages as tool errors. Any other error is logged to stderr and reported generically.
 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}
