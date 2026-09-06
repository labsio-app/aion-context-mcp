export interface CredentialBackedMcpPrincipal {
  kind: 'credential_backed'
  userId: string
  credentialId: string
  authenticationMethod: 'OAUTH'
  accessStatus: 'ACTIVE'
}

export type McpPrincipal = CredentialBackedMcpPrincipal
