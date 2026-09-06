import { createHmac } from 'node:crypto'
import Fastify from 'fastify'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import z from 'zod/v4'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolveMcpPrincipal } from '../core/application/ResolveMcpPrincipal.js'
import { McpAuthenticationFailedError } from '../core/application/McpAuthenticationFailedError.js'
import { McpAuthorizationDeniedError } from '../core/application/McpAuthorizationDeniedError.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  McpCredentialRecord,
  McpCredentialStore
} from '../core/application/ports.js'
import {
  authenticateMcpRequest,
  sendMcpAuthChallenge,
  sendMcpForbidden
} from '../mcp/oauth.js'

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
  const lookups: string[] = []

  const store: BetaAccessStore & { lookups: string[] } = {
    lookups,
    async getLatestRequestByDiscordIdentityId(discordIdentityId) {
      lookups.push(discordIdentityId)
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
    },
    async getActiveRequestByDiscordIdentityId(discordIdentityId) {
      const request = await this.getLatestRequestByDiscordIdentityId(discordIdentityId)
      if (!request) return null
      return request.status === 'PENDING' || request.status === 'APPROVED' ? request : null
    },
    async saveBetaAccessRequest(request) {
      statusByIdentityId[request.discordIdentityId] = request.status
      return request
    }
  }

  return store
}

function createAuthHook(deps: {
  credentialStore: Pick<McpCredentialStore, 'getCredentialById'>
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}) {
  return async (request: any, reply: any) => {
    if (!request.url.startsWith('/mcp')) return

    const result = await authenticateMcpRequest(request, deps as any)
    if (result.kind === 'authenticated') {
      ;(request as any).mcpPrincipal = result.principal
      return
    }

    if (result.kind === 'forbidden') {
      return sendMcpForbidden(reply)
    }

    return sendMcpAuthChallenge(reply)
  }
}

describe('ResolveMcpPrincipal', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves a credential-backed principal when the credential is ACTIVE and beta access is APPROVED', async () => {
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
    const betaAccessStore = createBetaAccessStore({
      'identity-1': 'APPROVED'
    })
    const resolver = new ResolveMcpPrincipal(credentialStore, betaAccessStore)

    const principal = await resolver.execute({
      claims: {
        sub: 'aion-owner',
        credentialId: 'credential-1'
      }
    })

    expect(principal).toEqual({
      kind: 'credential_backed',
      userId: 'identity-1',
      credentialId: 'credential-1',
      authenticationMethod: 'OAUTH',
      accessStatus: 'ACTIVE'
    })
    expect(credentialStore.lookups).toEqual(['credential-1'])
    expect(betaAccessStore.lookups).toEqual(['identity-1'])
  })

  it.each(['REVOKED', 'PENDING', 'REJECTED'] as const)(
    'denies a credential-backed principal when beta access is %s',
    async status => {
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
      const betaAccessStore = createBetaAccessStore({
        'identity-1': status
      })
      const resolver = new ResolveMcpPrincipal(credentialStore, betaAccessStore)

      await expect(
        resolver.execute({
          claims: {
            sub: 'aion-owner',
            credentialId: 'credential-1'
          }
        })
      ).rejects.toBeInstanceOf(McpAuthorizationDeniedError)
    }
  )

  it('denies a credential-backed principal when the credential does not exist', async () => {
    const credentialStore = createCredentialStore()
    const betaAccessStore = createBetaAccessStore({
      'identity-1': 'APPROVED'
    })
    const resolver = new ResolveMcpPrincipal(credentialStore, betaAccessStore)

    await expect(
      resolver.execute({
        claims: {
          sub: 'aion-owner',
          credentialId: 'missing-credential'
        }
      })
    ).rejects.toBeInstanceOf(McpAuthenticationFailedError)
    expect(credentialStore.lookups).toEqual(['missing-credential'])
    expect(betaAccessStore.lookups).toEqual([])
  })
})

describe('MCP boundary enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a revoked credential before the MCP handler or tools can run', async () => {
    const credentialStore = createCredentialStore([
      {
        id: 'credential-revoked',
        discordIdentityId: 'identity-1',
        oauthClientId: 'chatgpt',
        status: 'REVOKED',
        issuedAt: '2026-09-05T00:00:00.000Z',
        revokedAt: '2026-09-05T00:10:00.000Z',
        lastUsedAt: null
      }
    ])
    const betaAccessStore = createBetaAccessStore({
      'identity-1': 'APPROVED'
    })
    const app = Fastify()
    const authHook = createAuthHook({ credentialStore, betaAccessStore })
    let factoryCalls = 0

    app.addHook('onRequest', authHook)

    const handler = createMcpHandler(() => {
      factoryCalls += 1
      const server = new McpServer({
        name: 'aion-context-test',
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

    try {
      const token = signJwt(
        {
          iss: 'https://aion-mcp.labsio.app',
          sub: 'aion-owner',
          aud: 'https://aion-mcp.labsio.app',
          scope: 'mcp:access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: 'credential-revoked',
          credentialId: 'credential-revoked'
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
          method: 'tools/list',
          params: {}
        }
      })

      expect(response.statusCode).toBe(403)
      expect(factoryCalls).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('rejects a JWT without credentialId and does not execute the MCP handler', async () => {
    const credentialStore = createCredentialStore()
    const betaAccessStore = createBetaAccessStore({})
    const app = Fastify()
    const authHook = createAuthHook({ credentialStore, betaAccessStore })
    let factoryCalls = 0

    app.addHook('onRequest', authHook)

    const handler = createMcpHandler(() => {
      factoryCalls += 1
      const server = new McpServer({
        name: 'aion-context-test',
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

    try {
      const token = signJwt(
        {
          iss: 'https://aion-mcp.labsio.app',
          sub: 'aion-owner',
          aud: 'https://aion-mcp.labsio.app',
          scope: 'mcp:access',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
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
          method: 'tools/list',
          params: {}
        }
      })

      expect(response.statusCode).toBe(401)
      expect(factoryCalls).toBe(0)
    } finally {
      await app.close()
    }
  })
})
