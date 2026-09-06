export class McpAuthorizationDeniedError extends Error {
  constructor(message = 'MCP access is no longer authorized') {
    super(message)
    this.name = 'McpAuthorizationDeniedError'
  }
}
