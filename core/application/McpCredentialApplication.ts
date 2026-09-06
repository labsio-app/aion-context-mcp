import { randomUUID } from 'node:crypto'
import type { BetaAccessStore, McpCredentialRecord, McpCredentialStore } from './ports.js'
import { McpCredentialAuthorizationDeniedError } from './McpCredentialAuthorizationDeniedError.js'

export interface AuthorizeMcpClientInput {
  discordIdentityId: string
  clientId: string
}

export interface RevokeMcpCredentialResult {
  credential: McpCredentialRecord
  changed: boolean
}

export class McpCredentialApplication {
  constructor(
    private readonly betaAccessStore: BetaAccessStore,
    private readonly credentialStore: McpCredentialStore
  ) {}

  async authorizeMcpClient(input: AuthorizeMcpClientInput): Promise<McpCredentialRecord> {
    const discordIdentityId = input.discordIdentityId.trim()
    const clientId = input.clientId.trim()

    if (!discordIdentityId || !clientId) {
      throw new McpCredentialAuthorizationDeniedError()
    }

    const request = await this.betaAccessStore.getLatestRequestByDiscordIdentityId(discordIdentityId)
    if (!request || request.status !== 'APPROVED') {
      throw new McpCredentialAuthorizationDeniedError()
    }

    const now = new Date().toISOString()
    return this.credentialStore.createCredential({
      id: randomUUID(),
      discordIdentityId,
      oauthClientId: clientId,
      status: 'ACTIVE',
      issuedAt: now,
      revokedAt: null,
      lastUsedAt: null
    })
  }

  async revokeMcpCredential(credentialId: string): Promise<RevokeMcpCredentialResult | null> {
    const existing = await this.credentialStore.getCredentialById(credentialId)
    if (!existing) {
      return null
    }

    if (existing.status === 'REVOKED') {
      return {
        credential: existing,
        changed: false
      }
    }

    const revoked = await this.credentialStore.revokeCredential(credentialId)
    if (!revoked) {
      return null
    }

    return {
      credential: revoked,
      changed: true
    }
  }
}
