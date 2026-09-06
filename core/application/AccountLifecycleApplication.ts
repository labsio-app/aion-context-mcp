import type {
  AccountLifecycleStore,
  MyAccountRecord,
  MyMcpCredentialRecord
} from './ports.js'

export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = 'DELETE MY AION MCP ACCOUNT'

function normalizeIdentityId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Account identity id is required')
  }

  return trimmed
}

function normalizeCredentialId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('MCP credential id is required')
  }

  return trimmed
}

export class AccountLifecycleApplication {
  constructor(private readonly store: AccountLifecycleStore) {}

  getMyAccount(identityId: string): Promise<MyAccountRecord | null> {
    return this.store.getMyAccount(normalizeIdentityId(identityId))
  }

  listMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]> {
    return this.store.listMyMcpCredentials(normalizeIdentityId(identityId))
  }

  revokeMyMcpCredential(
    identityId: string,
    credentialId: string
  ): Promise<MyMcpCredentialRecord | null> {
    return this.store.revokeMyMcpCredential(
      normalizeIdentityId(identityId),
      normalizeCredentialId(credentialId)
    )
  }

  revokeAllMyMcpCredentials(identityId: string): Promise<MyMcpCredentialRecord[]> {
    return this.store.revokeAllMyMcpCredentials(normalizeIdentityId(identityId))
  }

  deleteMyBetaAccount(identityId: string): Promise<void> {
    return this.store.deleteMyBetaAccount(normalizeIdentityId(identityId))
  }
}
