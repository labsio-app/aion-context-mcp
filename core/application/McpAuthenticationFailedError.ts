export class McpAuthenticationFailedError extends Error {
  constructor(message = 'MCP authentication failed') {
    super(message)
    this.name = 'McpAuthenticationFailedError'
  }
}
