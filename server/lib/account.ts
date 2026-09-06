import {
  createError,
  defineEventHandler,
  deleteCookie,
  getRouterParam,
  readBody
} from 'h3'
import { ZodError, z } from 'zod'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountLifecycleApplication
} from '../../core/application/AccountLifecycleApplication.js'
import type {
  BetaAccessStore,
  DiscordBetaStore,
  DiscordIdentityRecord,
  MyAccountRecord,
  MyMcpCredentialRecord
} from '../../core/application/ports.js'
import { requireApprovedPortalIdentity } from './portal-access.js'

export interface AccountControllerDeps {
  application: AccountLifecycleApplication
  discordStore: DiscordBetaStore
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}

export interface AccountCredentialPayload {
  id: string
  oauthClientId: string
  status: MyMcpCredentialRecord['status']
  issuedAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

export interface MyAccountPayload {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  betaStatus: MyAccountRecord['betaStatus']
  mcpCredentials: AccountCredentialPayload[]
}

export interface MyCredentialListPayload {
  authenticated: true
  identity: {
    id: string
    discordUserId: string
    displayName: string
  }
  mcpCredentials: AccountCredentialPayload[]
}

function mapIdentity(identity: Pick<DiscordIdentityRecord, 'id' | 'discordUserId' | 'displayName'>) {
  return {
    id: identity.id,
    discordUserId: identity.discordUserId,
    displayName: identity.displayName
  }
}

function mapCredential(credential: MyMcpCredentialRecord): AccountCredentialPayload {
  return {
    id: credential.id,
    oauthClientId: credential.oauthClientId,
    status: credential.status,
    issuedAt: credential.issuedAt,
    revokedAt: credential.revokedAt,
    lastUsedAt: credential.lastUsedAt
  }
}

function mapAccount(account: MyAccountRecord): MyAccountPayload {
  return {
    authenticated: true,
    identity: mapIdentity(account.identity),
    betaStatus: account.betaStatus,
    mcpCredentials: account.mcpCredentials.map(mapCredential)
  }
}

const deleteAccountSchema = z.object({
  confirmationPhrase: z.literal(ACCOUNT_DELETION_CONFIRMATION_PHRASE)
})

const credentialIdSchema = z.string().trim().min(1)

export function createAccountController(deps: AccountControllerDeps) {
  const get = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)

    const account = await deps.application.getMyAccount(identity.id)
    if (!account) {
      throw createError({
        statusCode: 404,
        statusMessage: 'account_not_found'
      })
    }

    return mapAccount(account)
  })

  const listMcpCredentials = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)

    const mcpCredentials = await deps.application.listMyMcpCredentials(identity.id)
    return {
      authenticated: true,
      identity: mapIdentity(identity),
      mcpCredentials: mcpCredentials.map(mapCredential)
    } satisfies MyCredentialListPayload
  })

  const revokeMcpCredential = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)

    const credentialId = credentialIdSchema.parse(String(getRouterParam(event, 'id') ?? ''))
    const credential = await deps.application.revokeMyMcpCredential(identity.id, credentialId)
    if (!credential) {
      throw createError({
        statusCode: 404,
        statusMessage: 'mcp_credential_not_found'
      })
    }

    return {
      authenticated: true,
      identity: mapIdentity(identity),
      credential: mapCredential(credential)
    }
  })

  const revokeAllMcpCredentials = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)

    const credentials = await deps.application.revokeAllMyMcpCredentials(identity.id)
    return {
      authenticated: true,
      identity: mapIdentity(identity),
      revokedCount: credentials.length
    }
  })

  const deleteMyBetaAccount = defineEventHandler(async event => {
    const identity = await requireApprovedPortalIdentity(event, deps)

    try {
      deleteAccountSchema.parse(await readBody(event))
      await deps.application.deleteMyBetaAccount(identity.id)
      deleteCookie(event, 'aion_discord_session', { path: '/' })
      return { deleted: true }
    } catch (cause) {
      if (cause instanceof ZodError) {
        throw createError({
          statusCode: 400,
          statusMessage: 'invalid_account_deletion_confirmation'
        })
      }

      throw cause
    }
  })

  return {
    get,
    listMcpCredentials,
    revokeMcpCredential,
    revokeAllMcpCredentials,
    deleteMyBetaAccount
  }
}
