import type { BetaAccessStore, McpCredentialStore } from './ports.js'
import { McpAuthenticationFailedError } from './McpAuthenticationFailedError.js'
import { McpAuthorizationDeniedError } from './McpAuthorizationDeniedError.js'
import type { McpPrincipal } from './McpPrincipal.js'

export interface VerifiedMcpJwtClaims {
  iss?: unknown
  aud?: unknown
  scope?: unknown
  sub?: unknown
  credentialId?: unknown
  jti?: unknown
}

export interface ResolveMcpPrincipalInput {
  claims: VerifiedMcpJwtClaims
}

function normalizeClaim(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function resolveCredentialId(claims: VerifiedMcpJwtClaims): string | null {
  const value = claims.credentialId
  if (value === undefined) return null

  const credentialId = normalizeClaim(value)
  if (!credentialId) {
    throw new McpAuthenticationFailedError('Invalid MCP credential binding')
  }

  return credentialId
}

export class ResolveMcpPrincipal {
  constructor(
    private readonly credentialStore: Pick<McpCredentialStore, 'getCredentialById'>,
    private readonly betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
  ) {}

  async execute(input: ResolveMcpPrincipalInput): Promise<McpPrincipal> {
    const credentialId = resolveCredentialId(input.claims)
    if (!credentialId) {
      throw new McpAuthenticationFailedError('Legacy MCP tokens are no longer accepted')
    }

    const credential = await this.credentialStore.getCredentialById(credentialId)
    if (!credential) {
      throw new McpAuthenticationFailedError('Unknown MCP credential')
    }

    if (credential.status !== 'ACTIVE') {
      throw new McpAuthorizationDeniedError('MCP credential is not active')
    }

    const betaAccess = await this.betaAccessStore.getLatestRequestByDiscordIdentityId(
      credential.discordIdentityId
    )
    if (!betaAccess || betaAccess.status !== 'APPROVED') {
      throw new McpAuthorizationDeniedError('MCP beta access is not approved')
    }

    return {
      kind: 'credential_backed',
      userId: credential.discordIdentityId,
      credentialId: credential.id,
      authenticationMethod: 'OAUTH',
      accessStatus: 'ACTIVE'
    }
  }
}
