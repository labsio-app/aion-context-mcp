import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordMcpActivity } from '../core/application/RecordMcpActivity.js'
import { ListMcpActivityForUser } from '../core/application/ListMcpActivityForUser.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  McpActivityRecord,
  McpActivityStore,
  McpCredentialRecord,
  McpCredentialStore
} from '../core/application/ports.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import { authenticateMcpRequest, sendMcpAuthChallenge, sendMcpForbidden } from '../mcp/oauth.js'
import { createAionMcpServer } from '../mcp/server.js'

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function createCredentialStore(records: McpCredentialRecord[] = []) {
  const credentials = new Map(records.map(record => [record.id, record]))
  const lookups: string[] = []

  const store: McpCredentialStore & { lookups: string[] } = {
    lookups,
    async createCredential(record) {
      credentials.set(record.id, record)
      return record
    },
    async getCredentialById(id) {
      lookups.push(id)
      return credentials.get(id) ?? null
    },
    async revokeCredential(id) {
      const current = credentials.get(id)
      if (!current) return null
      const revoked: McpCredentialRecord = {
        ...current,
        status: 'REVOKED',
        revokedAt: current.revokedAt ?? '2026-09-05T00:00:00.000Z'
      }
      credentials.set(id, revoked)
      return revoked
    }
  }

  return store
}

function createBetaAccessStore(statusByIdentityId: Record<string, BetaAccessRequestRecord['status']>) {
  return {
    async getLatestRequestByDiscordIdentityId(discordIdentityId: string) {
      const status = statusByIdentityId[discordIdentityId]
      if (!status) return null
      return {
        id: `request-${discordIdentityId}`,
        discordIdentityId,
        displayName: 'Beta User',
        motivation: 'Need access',
        intendedUsage: 'Testing',
        aionProfile: null,
        expectedClients: ['Codex'],
        status,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      }
    }
  } satisfies Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}

function createActivityStore(initial: McpActivityRecord[] = []) {
  const records = [...initial]
  let failInsert = false

  return {
    get failInsert() {
      return failInsert
    },
    set failInsert(value: boolean) {
      failInsert = value
    },
    records,
    async saveActivity(record: McpActivityRecord) {
      if (failInsert) {
        throw new Error('activity persistence failed')
      }

      records.push(record)
      return record
    },
    async listActivityForUser(userId: string, limit: number) {
      return [...records]
        .filter(record => record.userId === userId)
        .sort((left, right) => {
          if (left.createdAt !== right.createdAt) {
            return left.createdAt < right.createdAt ? 1 : -1
          }

          return left.id < right.id ? 1 : -1
        })
        .slice(0, limit)
    }
  } satisfies McpActivityStore & {
    records: McpActivityRecord[]
    failInsert: boolean
  }
}

function createMcpAuthHook(deps: {
  credentialStore: Pick<McpCredentialStore, 'getCredentialById'>
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}) {
  return async (request: any, reply: any) => {
    if (!request.url.startsWith('/mcp')) return

    const result = await authenticateMcpRequest(request, deps as any)
    if (result.kind === 'authenticated') {
      request.raw.auth = result.principal
      return
    }

    if (result.kind === 'forbidden') {
      return sendMcpForbidden(reply)
    }

    return sendMcpAuthChallenge(reply)
  }
}

function createKnowledgeApi(overrides: Record<string, any> = {}) {
  return {
    async searchContext(input: { query: string }) {
      return {
        query: input.query,
        scope: null,
        sources: [],
        knowledge: [],
        openChallenges: []
      }
    },
    async getSource(id: string) {
      return null
    },
    async recordSource(input: unknown) {
      return input
    },
    async recordKnowledge(input: unknown) {
      return input
    },
    async recordChallenge(input: unknown) {
      return input
    },
    async listChallenges(_status: string, _limit: number) {
      return []
    },
    ...overrides
  } as any
}

function createAcquisitionApi() {
  return {
    async enqueueSource(input: unknown) {
      return input
    }
  } as any
}

describe('RecordMcpActivity', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('attributes credential-backed activity from the resolved principal and ignores client override attempts', async () => {
    const store = createActivityStore()
    const activity = new RecordMcpActivity(store)
    const principal: McpPrincipal = {
      kind: 'credential_backed',
      userId: 'identity-1',
      credentialId: 'credential-1',
      authenticationMethod: 'OAUTH',
      accessStatus: 'ACTIVE'
    }

    const record = await activity.execute({
      principal,
      toolName: 'aion_search_context',
      outcome: 'SUCCESS',
      durationMs: 18,
      userId: 'evil-user',
      credentialId: 'evil-credential',
    } as any)

    expect(record.userId).toBe('identity-1')
    expect(record.credentialId).toBe('credential-1')
    expect(record.authenticationMethod).toBe('OAUTH')
    expect(record.toolName).toBe('aion_search_context')
    expect(record.outcome).toBe('SUCCESS')
    expect(record.durationMs).toBe(18)
    expect(record).not.toHaveProperty('query')
    expect(record).not.toHaveProperty('arguments')
    expect(record).not.toHaveProperty('content')
    expect(store.records).toHaveLength(1)
  })

  it('lists activity scoped to the requested user and orders it deterministically', async () => {
    const store = createActivityStore([
      {
        id: 'b',
        userId: 'user-a',
        credentialId: 'credential-a',
        authenticationMethod: 'OAUTH',
        toolName: 'aion_get_source',
        outcome: 'SUCCESS',
        durationMs: 10,
        createdAt: '2026-09-05T10:00:00.000Z'
      },
      {
        id: 'a',
        userId: 'user-a',
        credentialId: 'credential-a',
        authenticationMethod: 'OAUTH',
        toolName: 'aion_search_context',
        outcome: 'FAILURE',
        durationMs: 12,
        createdAt: '2026-09-05T10:00:00.000Z'
      },
      {
        id: 'c',
        userId: 'user-b',
        credentialId: 'credential-b',
        authenticationMethod: 'OAUTH',
        toolName: 'aion_search_context',
        outcome: 'SUCCESS',
        durationMs: 8,
        createdAt: '2026-09-05T11:00:00.000Z'
      }
    ])
    const activity = new ListMcpActivityForUser(store)

    const records = await activity.execute({ userId: 'user-a', limit: 10 })

    expect(records).toHaveLength(2)
    expect(records.map(record => record.id)).toEqual(['b', 'a'])
    expect(records.every(record => record.userId === 'user-a')).toBe(true)
  })
})

describe('MCP activity integration', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('persists activity for a successful actual /mcp tool call', async () => {
    const credentialStore = createCredentialStore([
      {
        id: 'credential-1',
        discordIdentityId: 'identity-1',
        oauthClientId: 'chatgpt',
        status: 'ACTIVE',
        issuedAt: '2026-09-05T00:00:00.000Z',
        revokedAt: null,
        lastUsedAt: null
      }
    ])
    const betaAccessStore = createBetaAccessStore({ 'identity-1': 'APPROVED' })
    const activityStore = createActivityStore()
    const activity = new RecordMcpActivity(activityStore)
    const knowledge = createKnowledgeApi()
    const acquisition = createAcquisitionApi()
    const app = Fastify()

    app.addHook('onRequest', createMcpAuthHook({ credentialStore, betaAccessStore }))

    const handler = createMcpHandler(({ authInfo }) =>
      createAionMcpServer({
        principal: authInfo as McpPrincipal | undefined,
        activity,
        knowledge,
        acquisition
      })
    )
    const nodeHandler = toNodeHandler(handler)
    app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))

    try {
      const token = signJwt(
        {
          iss: 'https://aion-mcp.labsio.app',
          sub: 'aion-owner',
          aud: 'https://aion-mcp.labsio.app',
          scope: 'mcp:access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          credentialId: 'credential-1'
        },
        'test-jwt-secret'
      )

      const response = await app.inject({
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
          method: 'tools/call',
          params: {
            name: 'aion_search_context',
            arguments: {
              query: 'combat power',
              userId: 'malicious-user',
              credentialId: 'malicious-credential',
              toolName: 'malicious-tool'
            }
          }
        }
      })

      expect(response.statusCode).toBe(200)
      expect(activityStore.records).toHaveLength(1)
      expect(activityStore.records[0]).toMatchObject({
        userId: 'identity-1',
        credentialId: 'credential-1',
        authenticationMethod: 'OAUTH',
        toolName: 'aion_search_context',
        outcome: 'SUCCESS'
      })
      expect(activityStore.records[0].durationMs).not.toBeNull()
      expect(activityStore.records[0]).not.toHaveProperty('query')
      expect(activityStore.records[0]).not.toHaveProperty('arguments')
      expect(activityStore.records[0]).not.toHaveProperty('content')
    } finally {
      await app.close()
    }
  })

  it('records FAILURE when the tool throws, while keeping the request result correct', async () => {
    const credentialStore = createCredentialStore([
      {
        id: 'credential-1',
        discordIdentityId: 'identity-1',
        oauthClientId: 'chatgpt',
        status: 'ACTIVE',
        issuedAt: '2026-09-05T00:00:00.000Z',
        revokedAt: null,
        lastUsedAt: null
      }
    ])
    const betaAccessStore = createBetaAccessStore({ 'identity-1': 'APPROVED' })
    const activityStore = createActivityStore()
    const activity = new RecordMcpActivity(activityStore)
    const knowledge = createKnowledgeApi({
      async searchContext() {
        throw new Error('boom')
      }
    })
    const acquisition = createAcquisitionApi()
    const app = Fastify()

    app.addHook('onRequest', createMcpAuthHook({ credentialStore, betaAccessStore }))

    const handler = createMcpHandler(({ authInfo }) =>
      createAionMcpServer({
        principal: authInfo as McpPrincipal | undefined,
        activity,
        knowledge,
        acquisition
      })
    )
    const nodeHandler = toNodeHandler(handler)
    app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))

    try {
      const token = signJwt(
        {
          iss: 'https://aion-mcp.labsio.app',
          sub: 'aion-owner',
          aud: 'https://aion-mcp.labsio.app',
          scope: 'mcp:access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          credentialId: 'credential-1'
        },
        'test-jwt-secret'
      )

      const response = await app.inject({
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
          method: 'tools/call',
          params: {
            name: 'aion_search_context',
            arguments: { query: 'combat power' }
          }
        }
      })

      expect(response.statusCode).toBe(200)
      expect(activityStore.records).toHaveLength(1)
      expect(activityStore.records[0]).toMatchObject({
        userId: 'identity-1',
        credentialId: 'credential-1',
        toolName: 'aion_search_context',
        outcome: 'FAILURE'
      })
    } finally {
      await app.close()
    }
  })

  it('keeps the tool response successful when activity persistence fails', async () => {
    const credentialStore = createCredentialStore([
      {
        id: 'credential-1',
        discordIdentityId: 'identity-1',
        oauthClientId: 'chatgpt',
        status: 'ACTIVE',
        issuedAt: '2026-09-05T00:00:00.000Z',
        revokedAt: null,
        lastUsedAt: null
      }
    ])
    const betaAccessStore = createBetaAccessStore({ 'identity-1': 'APPROVED' })
    const activityStore = createActivityStore()
    activityStore.failInsert = true
    const activity = new RecordMcpActivity(activityStore)
    const knowledge = createKnowledgeApi()
    const acquisition = createAcquisitionApi()
    const app = Fastify()

    app.addHook('onRequest', createMcpAuthHook({ credentialStore, betaAccessStore }))

    const handler = createMcpHandler(({ authInfo }) =>
      createAionMcpServer({
        principal: authInfo as McpPrincipal | undefined,
        activity,
        knowledge,
        acquisition
      })
    )
    const nodeHandler = toNodeHandler(handler)
    app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))

    try {
      const token = signJwt(
        {
          iss: 'https://aion-mcp.labsio.app',
          sub: 'aion-owner',
          aud: 'https://aion-mcp.labsio.app',
          scope: 'mcp:access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          credentialId: 'credential-1'
        },
        'test-jwt-secret'
      )

      const response = await app.inject({
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
          method: 'tools/call',
          params: {
            name: 'aion_search_context',
            arguments: { query: 'combat power' }
          }
        }
      })

      expect(response.statusCode).toBe(200)
      expect(activityStore.records).toHaveLength(0)
    } finally {
      await app.close()
    }
  })
})
