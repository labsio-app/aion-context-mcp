import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from '../core/application/AccountLifecycleApplication.js'
import { AccountLifecycleApplication } from '../core/application/AccountLifecycleApplication.js'
import { ListMcpActivityForUser } from '../core/application/ListMcpActivityForUser.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord,
  McpActivityRecord,
  McpActivityStore,
  McpCredentialRecord,
  MyAccountRecord
} from '../core/application/ports.js'
import { createAccountController } from '../server/lib/account.js'
import { createAppActivityController } from '../server/lib/app-activity.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

function createIdentityRecord(
  overrides: Partial<DiscordIdentityRecord> & Pick<DiscordIdentityRecord, 'id'>
): DiscordIdentityRecord {
  return {
    id: overrides.id,
    discordUserId: overrides.discordUserId ?? `${overrides.id}-discord`,
    username: overrides.username ?? `${overrides.id}-user`,
    globalName: overrides.globalName ?? `${overrides.id}-global`,
    avatar: overrides.avatar ?? null,
    displayName: overrides.displayName ?? overrides.globalName ?? `${overrides.id}-display`,
    createdAt: overrides.createdAt ?? '2026-09-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-05T00:00:00.000Z'
  }
}

function createCredentialRecord(
  overrides: Partial<McpCredentialRecord> & Pick<McpCredentialRecord, 'id' | 'discordIdentityId'>
): McpCredentialRecord {
  return {
    id: overrides.id,
    discordIdentityId: overrides.discordIdentityId,
    oauthClientId: overrides.oauthClientId ?? 'chatgpt',
    status: overrides.status ?? 'ACTIVE',
    issuedAt: overrides.issuedAt ?? '2026-09-05T00:00:00.000Z',
    revokedAt: overrides.revokedAt ?? null,
    lastUsedAt: overrides.lastUsedAt ?? null
  }
}

function createBetaRequestRecord(
  overrides: Partial<BetaAccessRequestRecord> & Pick<BetaAccessRequestRecord, 'id' | 'discordIdentityId' | 'status'>
): BetaAccessRequestRecord {
  return {
    id: overrides.id,
    discordIdentityId: overrides.discordIdentityId,
    displayName: overrides.displayName ?? 'Beta Tester',
    motivation: overrides.motivation ?? 'Need access',
    intendedUsage: overrides.intendedUsage ?? 'Testing',
    aionProfile: overrides.aionProfile ?? null,
    expectedClients: overrides.expectedClients ?? ['Codex'],
    status: overrides.status,
    createdAt: overrides.createdAt ?? '2026-09-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-05T00:00:00.000Z'
  }
}

type PortalState = {
  identities: Map<string, DiscordIdentityRecord>
  sessions: Map<string, DiscordBrowserSessionRecord>
  betaRequests: Map<string, BetaAccessRequestRecord>
  credentials: Map<string, McpCredentialRecord>
  activities: McpActivityRecord[]
}

function createPortalState(): PortalState {
  return {
    identities: new Map(),
    sessions: new Map(),
    betaRequests: new Map(),
    credentials: new Map(),
    activities: []
  }
}

function seedUser(
  state: PortalState,
  input: {
    identity: DiscordIdentityRecord
    sessionToken?: string
    betaRequest?: BetaAccessRequestRecord
    credentials?: McpCredentialRecord[]
    activities?: McpActivityRecord[]
  }
) {
  state.identities.set(input.identity.id, input.identity)

  if (input.sessionToken) {
    state.sessions.set(sha256Hex(input.sessionToken), {
      id: `session-${input.identity.id}`,
      identityId: input.identity.id,
      tokenHash: sha256Hex(input.sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z',
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z'
    })
  }

  if (input.betaRequest) {
    state.betaRequests.set(input.identity.id, input.betaRequest)
  }

  for (const credential of input.credentials ?? []) {
    state.credentials.set(credential.id, credential)
  }

  state.activities.push(...(input.activities ?? []))
}

function createDiscordStore(state: PortalState): DiscordBetaStore {
  return {
    async upsertIdentity(input) {
      const existing = [...state.identities.values()].find(
        record => record.discordUserId === input.discordUserId
      )
      const record: DiscordIdentityRecord = existing
        ? {
            ...existing,
            username: input.username,
            globalName: input.globalName,
            avatar: input.avatar,
            displayName: input.globalName?.trim() || input.username,
            updatedAt: '2026-09-05T00:00:00.000Z'
          }
        : createIdentityRecord({
            id: `identity-${state.identities.size + 1}`,
            discordUserId: input.discordUserId,
            username: input.username,
            globalName: input.globalName,
            avatar: input.avatar,
            displayName: input.globalName?.trim() || input.username
          })

      state.identities.set(record.id, record)
      return record
    },
    async createSession(input) {
      const record: DiscordBrowserSessionRecord = {
        id: `session-${state.sessions.size + 1}`,
        identityId: input.identityId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      }
      state.sessions.set(input.tokenHash, record)
      return record
    },
    async getSession(tokenHash) {
      const session = state.sessions.get(tokenHash)
      if (!session) return null
      const identity = state.identities.get(session.identityId)
      if (!identity) return null
      return { session, identity }
    },
    async deleteSession(tokenHash) {
      state.sessions.delete(tokenHash)
    }
  }
}

function createBetaStore(state: PortalState): BetaAccessStore {
  return {
    async getLatestRequestByDiscordIdentityId(discordIdentityId) {
      return state.betaRequests.get(discordIdentityId) ?? null
    },
    async getActiveRequestByDiscordIdentityId(discordIdentityId) {
      const request = state.betaRequests.get(discordIdentityId) ?? null
      if (!request) return null
      return request.status === 'PENDING' || request.status === 'APPROVED' ? request : null
    },
    async saveBetaAccessRequest(request) {
      state.betaRequests.set(request.discordIdentityId, request)
      return request
    }
  }
}

function mapCredential(credential: McpCredentialRecord) {
  return {
    id: credential.id,
    oauthClientId: credential.oauthClientId,
    status: credential.status,
    issuedAt: credential.issuedAt,
    revokedAt: credential.revokedAt,
    lastUsedAt: credential.lastUsedAt
  }
}

function createAccountStore(state: PortalState) {
  function getAccount(identityId: string): MyAccountRecord | null {
    const identity = state.identities.get(identityId)
    if (!identity) return null

    const betaRequest = state.betaRequests.get(identityId) ?? null
    const credentials = [...state.credentials.values()]
      .filter(record => record.discordIdentityId === identityId)
      .sort((left, right) => {
        if (left.issuedAt !== right.issuedAt) {
          return left.issuedAt < right.issuedAt ? 1 : -1
        }

        return left.id < right.id ? 1 : -1
      })

    return {
      identity: {
        id: identity.id,
        discordUserId: identity.discordUserId,
        displayName: identity.displayName
      },
      betaStatus: betaRequest
        ? {
            status: betaRequest.status,
            requestId: betaRequest.id,
            updatedAt: betaRequest.updatedAt
          }
        : {
            status: 'NONE',
            requestId: null,
            updatedAt: null
          },
      mcpCredentials: credentials.map(mapCredential)
    }
  }

  return {
    async getMyAccount(identityId: string) {
      return getAccount(identityId)
    },
    async listMyMcpCredentials(identityId: string) {
      return getAccount(identityId)?.mcpCredentials ?? []
    },
    async revokeMyMcpCredential(identityId: string, credentialId: string) {
      const credential = state.credentials.get(credentialId)
      if (!credential || credential.discordIdentityId !== identityId || credential.status !== 'ACTIVE') {
        return null
      }

      const revoked: McpCredentialRecord = {
        ...credential,
        status: 'REVOKED',
        revokedAt: credential.revokedAt ?? '2026-09-05T00:00:00.000Z'
      }
      state.credentials.set(credentialId, revoked)
      return mapCredential(revoked)
    },
    async revokeAllMyMcpCredentials(identityId: string) {
      const revoked: McpCredentialRecord[] = []
      for (const credential of state.credentials.values()) {
        if (credential.discordIdentityId !== identityId || credential.status !== 'ACTIVE') continue
        const next: McpCredentialRecord = {
          ...credential,
          status: 'REVOKED',
          revokedAt: credential.revokedAt ?? '2026-09-05T00:00:00.000Z'
        }
        state.credentials.set(credential.id, next)
        revoked.push(next)
      }

      return revoked.map(mapCredential)
    },
    async deleteMyBetaAccount(identityId: string) {
      const identity = state.identities.get(identityId)
      if (!identity) return

      for (const [tokenHash, session] of state.sessions.entries()) {
        if (session.identityId === identityId) {
          state.sessions.delete(tokenHash)
        }
      }

      for (const credential of state.credentials.values()) {
        if (credential.discordIdentityId !== identityId || credential.status !== 'ACTIVE') continue
        state.credentials.set(credential.id, {
          ...credential,
          status: 'REVOKED',
          revokedAt: credential.revokedAt ?? '2026-09-05T00:00:00.000Z'
        })
      }

      const betaRequest = state.betaRequests.get(identityId)
      if (betaRequest) {
        state.betaRequests.set(identityId, {
          ...betaRequest,
          status:
            betaRequest.status === 'PENDING' || betaRequest.status === 'APPROVED'
              ? 'REVOKED'
              : betaRequest.status,
          displayName: 'Deleted account',
          motivation: '[deleted]',
          intendedUsage: '[deleted]',
          aionProfile: null,
          updatedAt:
            betaRequest.status === 'PENDING' || betaRequest.status === 'APPROVED'
              ? '2026-09-05T00:00:00.000Z'
              : betaRequest.updatedAt
        })
      }

      state.identities.set(identityId, {
        ...identity,
        discordUserId: `deleted:${identity.id}`,
        username: 'deleted-user',
        globalName: null,
        avatar: null,
        displayName: 'Deleted account',
        updatedAt: '2026-09-05T00:00:00.000Z'
      })
    }
  }
}

function createActivityStore(state: PortalState): McpActivityStore {
  return {
    async saveActivity(record: McpActivityRecord) {
      state.activities.push(record)
      return record
    },
    async listActivityForUser(userId: string, limit: number) {
      return [...state.activities]
        .filter(record => record.userId === userId)
        .sort((left, right) => {
          if (left.createdAt !== right.createdAt) {
            return left.createdAt < right.createdAt ? 1 : -1
          }

          return left.id < right.id ? 1 : -1
        })
        .slice(0, limit)
    }
  }
}

async function withServer(
  state: PortalState,
  run: (baseUrl: string) => Promise<void>
) {
  const app = createApp()
  const router = createRouter()

  const accountController = createAccountController({
    application: new AccountLifecycleApplication(createAccountStore(state)),
    discordStore: createDiscordStore(state),
    betaAccessStore: createBetaStore(state)
  })
  const activityController = createAppActivityController({
    application: new ListMcpActivityForUser(createActivityStore(state)),
    discordStore: createDiscordStore(state),
    betaAccessStore: createBetaStore(state)
  })

  router.get('/api/beta/account', accountController.get)
  router.get('/api/beta/account/mcp-credentials', accountController.listMcpCredentials)
  router.post('/api/beta/account/mcp-credentials/:id/revoke', accountController.revokeMcpCredential)
  router.post('/api/beta/account/mcp-credentials/revoke-all', accountController.revokeAllMcpCredentials)
  router.post('/api/beta/account/delete', accountController.deleteMyBetaAccount)
  router.get('/api/app/activity', activityController.get)

  app.use(router.handler)

  const server = createServer(toNodeListener(app))
  server.listen(0)
  await once(server, 'listening')

  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('failed to start test server')
    }

    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

describe('US-007 approved portal', () => {
  beforeEach(() => {})

  afterEach(() => {})

  it('rejects anonymous and non-approved portal capabilities', async () => {
    const state = createPortalState()
    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-a', displayName: 'Alpha Tester' })
    })

    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-pending', displayName: 'Pending Tester' }),
      sessionToken: 'session-pending',
      betaRequest: createBetaRequestRecord({
        id: 'request-pending',
        discordIdentityId: 'identity-pending',
        status: 'PENDING',
        displayName: 'Pending Tester'
      })
    })

    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-rejected', displayName: 'Rejected Tester' }),
      sessionToken: 'session-rejected',
      betaRequest: createBetaRequestRecord({
        id: 'request-rejected',
        discordIdentityId: 'identity-rejected',
        status: 'REJECTED',
        displayName: 'Rejected Tester'
      })
    })

    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-revoked', displayName: 'Revoked Tester' }),
      sessionToken: 'session-revoked',
      betaRequest: createBetaRequestRecord({
        id: 'request-revoked',
        discordIdentityId: 'identity-revoked',
        status: 'REVOKED',
        displayName: 'Revoked Tester'
      })
    })

    await withServer(state, async baseUrl => {
      const anonymous = await fetch(`${baseUrl}/api/beta/account`)
      expect(anonymous.status).toBe(401)

      for (const token of ['session-pending', 'session-rejected', 'session-revoked']) {
        const account = await fetch(`${baseUrl}/api/beta/account`, {
          headers: { cookie: createSessionCookie(token) }
        })
        expect(account.status).toBe(403)

        const activity = await fetch(`${baseUrl}/api/app/activity`, {
          headers: { cookie: createSessionCookie(token) }
        })
        expect(activity.status).toBe(403)
      }
    })
  })

  it('returns only the approved user account and activity data', async () => {
    const state = createPortalState()
    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-a', displayName: 'Alpha Tester' }),
      sessionToken: 'session-a',
      betaRequest: createBetaRequestRecord({
        id: 'request-a',
        discordIdentityId: 'identity-a',
        status: 'APPROVED',
        displayName: 'Alpha Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-a-1',
          discordIdentityId: 'identity-a',
          oauthClientId: 'chatgpt',
          lastUsedAt: '2026-09-05T00:10:00.000Z'
        }),
        createCredentialRecord({
          id: 'credential-a-2',
          discordIdentityId: 'identity-a',
          oauthClientId: 'codex',
          status: 'REVOKED',
          revokedAt: '2026-09-05T00:20:00.000Z'
        })
      ],
      activities: [
        {
          id: 'activity-a-2',
          userId: 'identity-a',
          credentialId: 'credential-a-1',
          authenticationMethod: 'OAUTH',
          toolName: 'aion_get_source',
          outcome: 'SUCCESS',
          durationMs: 120,
          createdAt: '2026-09-05T12:00:00.000Z'
        },
        {
          id: 'activity-a-1',
          userId: 'identity-a',
          credentialId: 'credential-a-1',
          authenticationMethod: 'OAUTH',
          toolName: 'aion_search_context',
          outcome: 'SUCCESS',
          durationMs: 180,
          createdAt: '2026-09-05T11:00:00.000Z'
        }
      ]
    })

    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-b', displayName: 'Bravo Tester' }),
      sessionToken: 'session-b',
      betaRequest: createBetaRequestRecord({
        id: 'request-b',
        discordIdentityId: 'identity-b',
        status: 'APPROVED',
        displayName: 'Bravo Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-b-1',
          discordIdentityId: 'identity-b',
          oauthClientId: 'claude'
        })
      ],
      activities: [
        {
          id: 'activity-b-1',
          userId: 'identity-b',
          credentialId: 'credential-b-1',
          authenticationMethod: 'OAUTH',
          toolName: 'aion_record_source',
          outcome: 'SUCCESS',
          durationMs: 42,
          createdAt: '2026-09-05T13:00:00.000Z'
        }
      ]
    })

    await withServer(state, async baseUrl => {
      const account = await fetch(`${baseUrl}/api/beta/account`, {
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(account.status).toBe(200)
      await expect(account.json()).resolves.toMatchObject({
        authenticated: true,
        identity: {
          id: 'identity-a',
          discordUserId: 'identity-a-discord',
          displayName: 'Alpha Tester'
        },
        betaStatus: {
          status: 'APPROVED',
          requestId: 'request-a'
        },
        mcpCredentials: [
          { id: 'credential-a-2', oauthClientId: 'codex', status: 'REVOKED' },
          { id: 'credential-a-1', oauthClientId: 'chatgpt', status: 'ACTIVE' }
        ]
      })

      const activity = await fetch(`${baseUrl}/api/app/activity`, {
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(activity.status).toBe(200)
      await expect(activity.json()).resolves.toMatchObject({
        authenticated: true,
        identity: {
          id: 'identity-a',
          displayName: 'Alpha Tester'
        },
        activities: [
          {
            id: 'activity-a-2',
            userId: 'identity-a',
            toolName: 'aion_get_source',
            outcome: 'SUCCESS',
            credentialId: 'credential-a-1'
          },
          {
            id: 'activity-a-1',
            userId: 'identity-a',
            toolName: 'aion_search_context',
            outcome: 'SUCCESS',
            credentialId: 'credential-a-1'
          }
        ]
      })
    })
  })

  it('lets the approved user revoke only owned credentials', async () => {
    const state = createPortalState()
    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-a', displayName: 'Alpha Tester' }),
      sessionToken: 'session-a',
      betaRequest: createBetaRequestRecord({
        id: 'request-a',
        discordIdentityId: 'identity-a',
        status: 'APPROVED',
        displayName: 'Alpha Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-a-1',
          discordIdentityId: 'identity-a',
          oauthClientId: 'chatgpt'
        })
      ]
    })

    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-b', displayName: 'Bravo Tester' }),
      sessionToken: 'session-b',
      betaRequest: createBetaRequestRecord({
        id: 'request-b',
        discordIdentityId: 'identity-b',
        status: 'APPROVED',
        displayName: 'Bravo Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-b-1',
          discordIdentityId: 'identity-b',
          oauthClientId: 'codex'
        })
      ]
    })

    await withServer(state, async baseUrl => {
      const otherUser = await fetch(`${baseUrl}/api/beta/account/mcp-credentials/credential-b-1/revoke`, {
        method: 'POST',
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(otherUser.status).toBe(404)
      expect(state.credentials.get('credential-b-1')?.status).toBe('ACTIVE')

      const owned = await fetch(`${baseUrl}/api/beta/account/mcp-credentials/credential-a-1/revoke`, {
        method: 'POST',
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(owned.status).toBe(200)
      expect(state.credentials.get('credential-a-1')?.status).toBe('REVOKED')
    })
  })

  it('rejects a wrong delete phrase and deletes the approved account with the exact phrase', async () => {
    const state = createPortalState()
    seedUser(state, {
      identity: createIdentityRecord({ id: 'identity-a', displayName: 'Alpha Tester' }),
      sessionToken: 'session-a',
      betaRequest: createBetaRequestRecord({
        id: 'request-a',
        discordIdentityId: 'identity-a',
        status: 'APPROVED',
        displayName: 'Alpha Tester',
        aionProfile: 'Former profile',
        intendedUsage: 'Testing'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-a-1',
          discordIdentityId: 'identity-a',
          oauthClientId: 'chatgpt'
        })
      ]
    })

    await withServer(state, async baseUrl => {
      const wrong = await fetch(`${baseUrl}/api/beta/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie('session-a')
        },
        body: JSON.stringify({
          confirmationPhrase: 'DELETE MY WRONG ACCOUNT'
        })
      })

      expect(wrong.status).toBe(400)
      expect(state.betaRequests.get('identity-a')?.status).toBe('APPROVED')
      expect(state.credentials.get('credential-a-1')?.status).toBe('ACTIVE')

      const correct = await fetch(`${baseUrl}/api/beta/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie('session-a')
        },
        body: JSON.stringify({
          confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE
        })
      })

      expect(correct.status).toBe(200)
      expect(state.sessions.size).toBe(0)
      expect(state.credentials.get('credential-a-1')?.status).toBe('REVOKED')
      expect(state.betaRequests.get('identity-a')?.status).toBe('REVOKED')
      expect(state.betaRequests.get('identity-a')?.displayName).toBe('Deleted account')

      const afterDelete = await fetch(`${baseUrl}/api/beta/account`, {
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(afterDelete.status).toBe(401)
    })
  })
})
