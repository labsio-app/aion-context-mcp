export class McpCredentialAuthorizationDeniedError extends Error {
  constructor() {
    super('MCP credential authorization requires APPROVED beta access')
    this.name = 'McpCredentialAuthorizationDeniedError'
  }
}
