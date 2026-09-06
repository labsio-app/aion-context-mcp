import { createHash, createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import Fastify from 'fastify'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createApp, createRouter, toNodeListener } from 'h3'
import z from 'zod/v4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountLifecycleApplication
} from '../core/application/AccountLifecycleApplication.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  AccountLifecycleStore,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord,
  McpCredentialRecord,
  MyAccountRecord,
  MyMcpCredentialRecord
} from '../core/application/ports.js'
import { createAccountController } from '../server/lib/account.js'
import { PostgresAccountLifecycleStore } from '../infrastructure/postgres/PostgresAccountLifecycleStore.js'
import { authenticateMcpRequest, sendMcpAuthChallenge, sendMcpForbidden } from '../mcp/oauth.js'

const now = '2026-09-05T00:00:00.000Z'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function createIdentityRecord(overrides: Partial<DiscordIdentityRecord> & Pick<DiscordIdentityRecord, 'id'>): DiscordIdentityRecord {
  return {
    id: overrides.id,
    discordUserId: overrides.discordUserId ?? `${overrides.id}-discord`,
    username: overrides.username ?? `${overrides.id}-user`,
    globalName: overrides.globalName ?? `${overrides.id}-global`,
    avatar: overrides.avatar ?? null,
    displayName: overrides.displayName ?? overrides.globalName ?? `${overrides.id}-display`,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
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
    issuedAt: overrides.issuedAt ?? now,
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
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  }
}

type AccountState = {
  identities: Map<string, DiscordIdentityRecord>
  sessions: Map<string, DiscordBrowserSessionRecord>
  betaRequests: Map<string, BetaAccessRequestRecord>
  credentials: Map<string, McpCredentialRecord>
  sharedKnowledge: Array<{ id: string; statement: string }>
}

function createAccountState(): AccountState {
  return {
    identities: new Map(),
    sessions: new Map(),
    betaRequests: new Map(),
    credentials: new Map(),
    sharedKnowledge: [{ id: 'knowledge-1', statement: 'Shared AION knowledge survives.' }]
  }
}

function seedUser(
  state: AccountState,
  input: {
    identity: DiscordIdentityRecord
    sessionToken?: string
    betaRequest?: BetaAccessRequestRecord
    credentials?: McpCredentialRecord[]
  }
) {
  state.identities.set(input.identity.id, input.identity)

  if (input.sessionToken) {
    state.sessions.set(sha256Hex(input.sessionToken), {
      id: `session-${input.identity.id}`,
      identityId: input.identity.id,
      tokenHash: sha256Hex(input.sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z',
      createdAt: now,
      updatedAt: now
    })
  }

  if (input.betaRequest) {
    state.betaRequests.set(input.identity.id, input.betaRequest)
  }

  for (const credential of input.credentials ?? []) {
    state.credentials.set(credential.id, credential)
  }
}

function createDiscordStore(state: AccountState): DiscordBetaStore {
  return {
    async upsertIdentity(input) {
      const existing = [...state.identities.values()].find(record => record.discordUserId === input.discordUserId)
      const record: DiscordIdentityRecord = existing
        ? {
            ...existing,
            username: input.username,
            globalName: input.globalName,
            avatar: input.avatar,
            displayName: input.globalName?.trim() || input.username,
            updatedAt: now
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
        createdAt: now,
        updatedAt: now
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

function mapCredential(credential: MyMcpCredentialRecord) {
  return {
    id: credential.id,
    oauthClientId: credential.oauthClientId,
    status: credential.status,
    issuedAt: credential.issuedAt,
    revokedAt: credential.revokedAt,
    lastUsedAt: credential.lastUsedAt
  }
}

function createAccountStore(state: AccountState): AccountLifecycleStore {
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

  const store: AccountLifecycleStore = {
    async getMyAccount(identityId: string): Promise<MyAccountRecord | null> {
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
        revokedAt: credential.revokedAt ?? now
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
          revokedAt: credential.revokedAt ?? now
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
          revokedAt: credential.revokedAt ?? now
        })
      }

      const betaRequest = state.betaRequests.get(identityId)
      if (betaRequest) {
        state.betaRequests.set(identityId, {
          ...betaRequest,
          status: betaRequest.status === 'PENDING' || betaRequest.status === 'APPROVED' ? 'REVOKED' : betaRequest.status,
          displayName: 'Deleted account',
          motivation: '[deleted]',
          intendedUsage: '[deleted]',
          aionProfile: null,
          updatedAt: betaRequest.status === 'PENDING' || betaRequest.status === 'APPROVED' ? now : betaRequest.updatedAt
        })
      }

      state.identities.set(identityId, {
        ...identity,
        discordUserId: `deleted:${identity.id}`,
        username: 'deleted-user',
        globalName: null,
        avatar: null,
        displayName: 'Deleted account',
        updatedAt: now
      })
    }
  } satisfies AccountLifecycleStore

  return store
}

function createBetaAccessStore(state: AccountState): Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'> {
  return {
    async getLatestRequestByDiscordIdentityId(discordIdentityId: string) {
      return state.betaRequests.get(discordIdentityId) ?? null
    }
  }
}

function snapshotState(state: AccountState) {
  return {
    identities: [...state.identities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    sessions: [...state.sessions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    betaRequests: [...state.betaRequests.values()].sort((left, right) => left.id.localeCompare(right.id)),
    credentials: [...state.credentials.values()].sort((left, right) => left.id.localeCompare(right.id)),
    sharedKnowledge: state.sharedKnowledge.map(item => ({ ...item }))
  }
}

function createAccountControllerServer(state: AccountState) {
  const controller = createAccountController({
    application: new AccountLifecycleApplication(createAccountStore(state)),
    discordStore: createDiscordStore(state),
    betaAccessStore: createBetaAccessStore(state)
  })

  const app = createApp()
  const router = createRouter()
  router.get('/api/beta/account', controller.get)
  router.get('/api/beta/account/mcp-credentials', controller.listMcpCredentials)
  router.post('/api/beta/account/mcp-credentials/:id/revoke', controller.revokeMcpCredential)
  router.post('/api/beta/account/mcp-credentials/revoke-all', controller.revokeAllMcpCredentials)
  router.post('/api/beta/account/delete', controller.deleteMyBetaAccount)
  app.use(router.handler)

  return app
}

function createMcpServer(state: AccountState) {
  const app = Fastify()
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/mcp')) return

    const result = await authenticateMcpRequest(request, {
      credentialStore: {
        async getCredentialById(id: string) {
          return state.credentials.get(id) ?? null
        }
      },
      betaAccessStore: {
        async getLatestRequestByDiscordIdentityId(identityId: string) {
          return state.betaRequests.get(identityId) ?? null
        }
      }
    } as const)

    if (result.kind === 'authenticated') {
      ;(request as { raw: { auth?: unknown } }).raw.auth = result.principal
      return
    }

    if (result.kind === 'forbidden') {
      return sendMcpForbidden(reply)
    }

    return sendMcpAuthChallenge(reply)
  })

  let factoryCalls = 0
  const handler = createMcpHandler(() => {
    factoryCalls += 1
    const server = new McpServer({
      name: 'account-lifecycle-test',
      version: '0.1.0'
    })

    server.registerTool(
      'spy_tool',
      {
        title: 'Spy tool',
        description: 'Should never run when auth fails',
        inputSchema: z.object({})
      },
      async () => ({
        content: [
          {
            type: 'text' as const,
            text: 'executed'
          }
        ]
      })
    )

    return server
  })
  const nodeHandler = toNodeHandler(handler)
  app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))

  return {
    app,
    getFactoryCalls() {
      return factoryCalls
    }
  }
}

async function withServer(
  app: ReturnType<typeof createAccountControllerServer>,
  run: (baseUrl: string) => Promise<void>
) {
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

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

function makeToken(identityId: string, credentialId: string, secret: string) {
  return signJwt(
    {
      iss: 'https://aion-mcp.labsio.app',
      sub: 'aion-owner',
      aud: 'https://aion-mcp.labsio.app',
      scope: 'mcp:access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      credentialId,
      jti: credentialId,
      identityId
    },
    secret
  )
}

describe('Account lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects anonymous account access', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      })
    })

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account`)
      expect(response.status).toBe(401)
    })
  })

  it('returns only the authenticated user account data and credential list', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
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
      ]
    })
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-b',
        discordUserId: 'discord-b',
        displayName: 'Bravo Tester'
      }),
      sessionToken: 'session-b',
      betaRequest: createBetaRequestRecord({
        id: 'request-b',
        discordIdentityId: 'identity-b',
        status: 'PENDING',
        displayName: 'Bravo Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-b-1',
          discordIdentityId: 'identity-b',
          oauthClientId: 'chatgpt'
        })
      ]
    })

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account`, {
        headers: { cookie: createSessionCookie('session-a') }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        authenticated: true,
        identity: {
          id: 'identity-a',
          displayName: 'Alpha Tester'
        },
        betaStatus: {
          status: 'APPROVED',
          requestId: 'request-a'
        },
        mcpCredentials: [
          {
            id: 'credential-a-2',
            oauthClientId: 'codex',
            status: 'REVOKED'
          },
          {
            id: 'credential-a-1',
            oauthClientId: 'chatgpt',
            status: 'ACTIVE'
          }
        ]
      })

      const list = await fetch(`${baseUrl}/api/beta/account/mcp-credentials`, {
        headers: { cookie: createSessionCookie('session-a') }
      })

      expect(list.status).toBe(200)
      await expect(list.json()).resolves.toMatchObject({
        authenticated: true,
        identity: {
          id: 'identity-a',
          displayName: 'Alpha Tester'
        },
        mcpCredentials: [
          { id: 'credential-a-2' },
          { id: 'credential-a-1' },
        ]
      })
    })
  })

  it('rejects attempts to revoke another user credential', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
      sessionToken: 'session-a',
      betaRequest: createBetaRequestRecord({
        id: 'request-a',
        discordIdentityId: 'identity-a',
        status: 'APPROVED',
        displayName: 'Alpha Tester'
      })
    })
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-b',
        discordUserId: 'discord-b',
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

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account/mcp-credentials/credential-b-1/revoke`, {
        method: 'POST',
        headers: { cookie: createSessionCookie('session-a') }
      })

      expect(response.status).toBe(404)
      expect(state.credentials.get('credential-b-1')?.status).toBe('ACTIVE')
    })
  })

  it('revokes an owned credential and blocks the next actual /mcp request', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
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

    const token = makeToken('identity-a', 'credential-a-1', 'test-jwt-secret')
    const mcp = createMcpServer(state)

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const revoke = await fetch(`${baseUrl}/api/beta/account/mcp-credentials/credential-a-1/revoke`, {
        method: 'POST',
        headers: { cookie: createSessionCookie('session-a') }
      })

      expect(revoke.status).toBe(200)
      expect(state.credentials.get('credential-a-1')?.status).toBe('REVOKED')

      const response = await mcp.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json'
        },
        payload: {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/list',
          params: {}
        }
      })

      expect(response.statusCode).toBe(403)
      expect(mcp.getFactoryCalls()).toBe(0)
    })
  })

  it('revokes all owned credentials without touching other users', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
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
        }),
        createCredentialRecord({
          id: 'credential-a-2',
          discordIdentityId: 'identity-a',
          oauthClientId: 'codex'
        })
      ]
    })
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-b',
        discordUserId: 'discord-b',
        displayName: 'Bravo Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-b-1',
          discordIdentityId: 'identity-b',
          oauthClientId: 'chatgpt'
        })
      ]
    })

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account/mcp-credentials/revoke-all`, {
        method: 'POST',
        headers: { cookie: createSessionCookie('session-a') }
      })

      expect(response.status).toBe(200)
      expect(state.credentials.get('credential-a-1')?.status).toBe('REVOKED')
      expect(state.credentials.get('credential-a-2')?.status).toBe('REVOKED')
      expect(state.credentials.get('credential-b-1')?.status).toBe('ACTIVE')
    })
  })

  it('rejects a deletion request with the wrong confirmation phrase without mutating state', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
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

    const before = snapshotState(state)

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie('session-a')
        },
        body: JSON.stringify({
          confirmationPhrase: 'DELETE MY WRONG ACCOUNT'
        })
      })

      expect(response.status).toBe(400)
      expect(snapshotState(state)).toEqual(before)
    })
  })

  it('deletes the account atomically, preserves shared knowledge, and denies the deleted JWT', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester',
        globalName: 'Alpha Tester',
        avatar: 'avatar-a'
      }),
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
        }),
        createCredentialRecord({
          id: 'credential-a-2',
          discordIdentityId: 'identity-a',
          oauthClientId: 'codex'
        })
      ]
    })
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-b',
        discordUserId: 'discord-b',
        displayName: 'Bravo Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-b-1',
          discordIdentityId: 'identity-b',
          oauthClientId: 'chatgpt'
        })
      ]
    })

    const token = makeToken('identity-a', 'credential-a-1', 'test-jwt-secret')
    const mcp = createMcpServer(state)

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie('session-a')
        },
        body: JSON.stringify({
          confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE
        })
      })

      expect(response.status).toBe(200)
      expect(state.sessions.size).toBe(0)
      expect(state.credentials.get('credential-a-1')?.status).toBe('REVOKED')
      expect(state.credentials.get('credential-a-2')?.status).toBe('REVOKED')
      expect(state.betaRequests.get('identity-a')?.status).toBe('REVOKED')
      expect(state.betaRequests.get('identity-a')?.displayName).toBe('Deleted account')
      expect(state.betaRequests.get('identity-a')?.motivation).toBe('[deleted]')
      expect(state.betaRequests.get('identity-a')?.intendedUsage).toBe('[deleted]')
      expect(state.betaRequests.get('identity-a')?.aionProfile).toBeNull()
      expect(state.identities.get('identity-a')).toMatchObject({
        discordUserId: 'deleted:identity-a',
        username: 'deleted-user',
        globalName: null,
        avatar: null,
        displayName: 'Deleted account'
      })
      expect(state.sharedKnowledge).toEqual([
        { id: 'knowledge-1', statement: 'Shared AION knowledge survives.' }
      ])

      const accountAfterDelete = await fetch(`${baseUrl}/api/beta/account`, {
        headers: { cookie: createSessionCookie('session-a') }
      })
      expect(accountAfterDelete.status).toBe(401)

      const mcpResponse = await mcp.app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json'
        },
        payload: {
          jsonrpc: '2.0',
          id: '1',
          method: 'tools/list',
          params: {}
        }
      })

      expect(mcpResponse.statusCode).toBe(403)
      expect(mcp.getFactoryCalls()).toBe(0)
    })
  })

  it('rolls back a failed account deletion without changing the account state', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
      credentials: [
        createCredentialRecord({
          id: 'credential-a-1',
          discordIdentityId: 'identity-a',
          oauthClientId: 'chatgpt'
        })
      ],
      betaRequest: createBetaRequestRecord({
        id: 'request-a',
        discordIdentityId: 'identity-a',
        status: 'APPROVED',
        displayName: 'Alpha Tester',
        motivation: 'My personal motivation',
        intendedUsage: 'My personal usage details'
      })
    })

    const initial = snapshotState(state)
    const pool = createFailingAccountPool(initial, { failOn: 'discord_identities' })
    const store = new PostgresAccountLifecycleStore(pool as never)

    await expect(store.deleteMyBetaAccount('identity-a')).rejects.toThrowError('identity update failed')
    expect(pool.queries).toContain('BEGIN')
    expect(pool.queries).toContain('ROLLBACK')
    expect(pool.queries).toContainEqual(expect.stringMatching(/UPDATE\s+beta_access_requests/i))
    expect(pool.queries).toContainEqual(expect.stringMatching(/UPDATE\s+discord_identities/i))
    expect(snapshotFromPool(pool)).toEqual(initial)
  })

  it('deleting one account does not alter another user account or credentials', async () => {
    const state = createAccountState()
    seedUser(state, {
      identity: createIdentityRecord({
        id: 'identity-a',
        discordUserId: 'discord-a',
        displayName: 'Alpha Tester'
      }),
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
      identity: createIdentityRecord({
        id: 'identity-b',
        discordUserId: 'discord-b',
        displayName: 'Bravo Tester'
      }),
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

    await withServer(createAccountControllerServer(state), async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/account/delete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie('session-a')
        },
        body: JSON.stringify({
          confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE
        })
      })

      expect(response.status).toBe(200)
      expect(state.identities.get('identity-b')).toMatchObject({
        discordUserId: 'discord-b',
        displayName: 'Bravo Tester'
      })
      expect(state.betaRequests.get('identity-b')?.status).toBe('APPROVED')
      expect(state.credentials.get('credential-b-1')?.status).toBe('ACTIVE')
      expect(state.sessions.size).toBe(1)
    })
  })
})

type AccountStateSnapshot = ReturnType<typeof snapshotState>

function snapshotStateFromSnapshot(state: AccountStateSnapshot) {
  return {
    identities: [...state.identities].sort((left, right) => left.id.localeCompare(right.id)),
    sessions: [...state.sessions].sort((left, right) => left.id.localeCompare(right.id)),
    betaRequests: [...state.betaRequests].sort((left, right) => left.id.localeCompare(right.id)),
    credentials: [...state.credentials].sort((left, right) => left.id.localeCompare(right.id)),
    sharedKnowledge: state.sharedKnowledge.map(item => ({ ...item }))
  }
}

function createFailingAccountPool(
  initialState: AccountStateSnapshot,
  options: { failOn: 'beta_access_requests' | 'discord_identities' } = { failOn: 'beta_access_requests' }
) {
  const state = structuredClone(initialState) as AccountStateSnapshot
  const queries: string[] = []
  let snapshot: AccountStateSnapshot | null = null

  const client = {
    async query(sql: string, params?: unknown[]) {
      const text = String(sql)
      queries.push(text)

      if (text === 'BEGIN') {
        snapshot = structuredClone(state)
        return { rows: [] }
      }

      if (text === 'COMMIT') {
        snapshot = null
        return { rows: [] }
      }

      if (text === 'ROLLBACK') {
        if (snapshot) {
          restoreState(state, snapshot)
          snapshot = null
        }
        return { rows: [] }
      }

      if (/SELECT\s+id\s+FROM\s+discord_identities/i.test(text)) {
        const identityId = String(params?.[0] ?? '')
        const identity = state.identities.find(entry => entry.id === identityId)
        return { rows: identity ? [{ id: identity.id }] : [] }
      }

      if (/UPDATE\s+mcp_credentials/i.test(text)) {
        const identityId = String(params?.[0] ?? '')
        const revokedAt = String(params?.[1] ?? now)
        const rows = state.credentials
          .filter(entry => entry.discordIdentityId === identityId && entry.status === 'ACTIVE')
          .map(entry => {
            entry.status = 'REVOKED'
            entry.revokedAt = entry.revokedAt ?? revokedAt
            return {
              id: entry.id,
              oauth_client_id: entry.oauthClientId,
              status: entry.status,
              issued_at: entry.issuedAt,
              revoked_at: entry.revokedAt,
              last_used_at: entry.lastUsedAt
            }
          })
        return { rows }
      }

      if (/UPDATE\s+beta_access_requests/i.test(text)) {
        if (options.failOn === 'beta_access_requests') {
          throw new Error('beta access update failed')
        }

        const identityId = String(params?.[0] ?? '')
        const updatedAt = String(params?.[1] ?? now)
        const entry = state.betaRequests.find(record => record.discordIdentityId === identityId)
        if (entry) {
          entry.status = entry.status === 'PENDING' || entry.status === 'APPROVED' ? 'REVOKED' : entry.status
          entry.displayName = 'Deleted account'
          entry.motivation = '[deleted]'
          entry.intendedUsage = '[deleted]'
          entry.aionProfile = null
          if (entry.status === 'REVOKED') {
            entry.updatedAt = updatedAt
          }
        }
        return { rows: [] }
      }

      if (/UPDATE\s+discord_identities/i.test(text)) {
        if (options.failOn === 'discord_identities') {
          throw new Error('identity update failed')
        }
        const identityId = String(params?.[0] ?? '')
        const updatedAt = String(params?.[1] ?? now)
        const entry = state.identities.find(record => record.id === identityId)
        if (!entry) return { rows: [] }
        entry.discordUserId = `deleted:${entry.id}`
        entry.username = 'deleted-user'
        entry.globalName = null
        entry.avatar = null
        entry.displayName = 'Deleted account'
        entry.updatedAt = updatedAt
        return { rows: [] }
      }

      if (/DELETE\s+FROM\s+oauth_authorization_codes/i.test(text)) {
        return { rows: [] }
      }

      if (/DELETE\s+FROM\s+discord_browser_sessions/i.test(text)) {
        const identityId = String(params?.[0] ?? '')
        state.sessions = state.sessions.filter(entry => entry.identityId !== identityId)
        return { rows: [] }
      }

      return { rows: [] }
    },
    release() {}
  }

  return {
    state,
    queries,
    async connect() {
      return client
    }
  }
}

function snapshotFromPool(pool: { state: AccountStateSnapshot }) {
  return snapshotStateFromSnapshot(pool.state)
}

function restoreState(target: AccountStateSnapshot, snapshot: AccountStateSnapshot) {
  target.identities = snapshot.identities.map(item => ({ ...item }))
  target.sessions = snapshot.sessions.map(item => ({ ...item }))
  target.betaRequests = snapshot.betaRequests.map(item => ({ ...item }))
  target.credentials = snapshot.credentials.map(item => ({ ...item }))
  target.sharedKnowledge = snapshot.sharedKnowledge.map(item => ({ ...item }))
}
