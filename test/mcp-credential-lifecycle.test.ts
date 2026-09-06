import { createHash } from 'node:crypto'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  authenticateMcpRequest,
  registerOAuthRoutes,
  resetOAuthClientMetadataCache
} from '../mcp/oauth.js'
import { McpCredentialApplication } from '../core/application/McpCredentialApplication.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord,
  McpCredentialRecord,
  McpCredentialStore
} from '../core/application/ports.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sha256Base64Url(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('invalid JWT')
  }

  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
}

function createIdentity(overrides: Partial<DiscordIdentityRecord> = {}): DiscordIdentityRecord {
  return {
    id: overrides.id ?? 'identity-approved',
    discordUserId: overrides.discordUserId ?? 'discord-user-approved',
    username: overrides.username ?? 'beta-user',
    globalName: overrides.globalName ?? 'Beta User',
    avatar: overrides.avatar ?? null,
    displayName: overrides.displayName ?? overrides.globalName ?? 'Beta User',
    createdAt: overrides.createdAt ?? '2026-09-05T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-09-05T00:00:00.000Z'
  }
}

function createDiscordStore(
  identities: DiscordIdentityRecord[],
  sessions: Array<{ tokenHash: string; identityId: string }>
): DiscordBetaStore {
  const identityMap = new Map(identities.map(identity => [identity.id, identity]))
  const sessionMap = new Map(sessions.map(session => [session.tokenHash, session]))

  return {
    async upsertIdentity(input) {
      const identity = createIdentity({
        id: input.discordUserId,
        discordUserId: input.discordUserId,
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        displayName: input.globalName?.trim() || input.username
      })
      identityMap.set(identity.id, identity)
      return identity
    },
    async createSession(input) {
      const record: DiscordBrowserSessionRecord = {
        id: `session-${input.identityId}`,
        identityId: input.identityId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      }
      sessionMap.set(input.tokenHash, { tokenHash: input.tokenHash, identityId: input.identityId })
      return record
    },
    async getSession(tokenHash) {
      const session = sessionMap.get(tokenHash)
      if (!session) return null
      const identity = identityMap.get(session.identityId)
      if (!identity) return null
      return {
        session: {
          id: `session-${session.identityId}`,
          identityId: session.identityId,
          tokenHash: session.tokenHash,
          expiresAt: '2026-09-06T00:00:00.000Z',
          createdAt: '2026-09-05T00:00:00.000Z',
          updatedAt: '2026-09-05T00:00:00.000Z'
        },
        identity
      }
    },
    async deleteSession(tokenHash) {
      sessionMap.delete(tokenHash)
    }
  }
}

function createBetaStore(statusByIdentityId: Record<string, BetaAccessRequestRecord['status']>): BetaAccessStore {
  return {
    async getLatestRequestByDiscordIdentityId(discordIdentityId) {
      const status = statusByIdentityId[discordIdentityId]
      if (!status) return null
      return {
        id: `request-${discordIdentityId}`,
        discordIdentityId,
        displayName: 'Beta User',
        motivation: 'I want to use MCP.',
        intendedUsage: 'Research',
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
}

function createAuthorizationCodeStore() {
  const records = new Map<string, {
    code: string
    clientId: string
    redirectUri: string
    scope: string
    resource: string
    discordIdentityId: string | null
    codeChallenge: string
    codeChallengeMethod: 'S256'
    createdAt: string
    expiresAt: string
  }>()
  let lastInserted: null | {
    code: string
    clientId: string
    redirectUri: string
    scope: string
    resource: string
    discordIdentityId: string | null
    codeChallenge: string
    codeChallengeMethod: 'S256'
    createdAt: string
    expiresAt: string
  } = null

  return {
    get lastInserted() {
      return lastInserted
    },
    async insert(record: {
      code: string
      clientId: string
      redirectUri: string
      scope: string
      resource: string
      discordIdentityId: string | null
      codeChallenge: string
      codeChallengeMethod: 'S256'
      createdAt: string
      expiresAt: string
    }) {
      lastInserted = record
      records.set(record.code, record)
    },
    async consume(code: string) {
      const record = records.get(code)
      if (!record) return null
      records.delete(code)
      return record
    }
  }
}

function createCredentialStore() {
  const credentials = new Map<string, McpCredentialRecord>()
  const revokeCalls: string[] = []

  const store: McpCredentialStore & { revokeCalls: string[]; credentials: Map<string, McpCredentialRecord> } = {
    revokeCalls,
    credentials,
    async createCredential(record) {
      credentials.set(record.id, record)
      return record
    },
    async getCredentialById(id) {
      return credentials.get(id) ?? null
    },
    async revokeCredential(id) {
      revokeCalls.push(id)
      const current = credentials.get(id)
      if (!current) return null
      if (current.status === 'REVOKED') return current
      const next: McpCredentialRecord = {
        ...current,
        status: 'REVOKED',
        revokedAt: '2026-09-05T00:00:01.000Z'
      }
      credentials.set(id, next)
      return next
    }
  }

  return store
}

describe('MCP credential lifecycle', () => {
  beforeEach(() => {
    resetOAuthClientMetadataCache()
    vi.stubEnv('MCP_OAUTH_ISSUER', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_RESOURCE', 'https://aion-mcp.labsio.app')
    vi.stubEnv('MCP_OAUTH_JWT_SECRET', 'test-jwt-secret')
    vi.stubEnv('MCP_OAUTH_ALLOWED_REDIRECT_URIS', 'https://chatgpt.com/connector_platform_oauth_redirect')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('registers an ACTIVE credential only for an approved beta identity', async () => {
    const credentialStore = createCredentialStore()
    const application = new McpCredentialApplication(
      createBetaStore({ 'identity-approved': 'APPROVED' }),
      credentialStore
    )

    const credential = await application.authorizeMcpClient({
      discordIdentityId: 'identity-approved',
      clientId: 'chatgpt'
    })

    expect(credential.status).toBe('ACTIVE')
    expect(credential.revokedAt).toBeNull()
    expect(credential.discordIdentityId).toBe('identity-approved')
    expect(credential.oauthClientId).toBe('chatgpt')
    expect(credentialStore.credentials.get(credential.id)).toEqual(credential)
  })

  it.each(['PENDING', 'REJECTED', 'REVOKED'] as const)(
    'denies credential registration for %s beta identities',
    async status => {
      const credentialStore = createCredentialStore()
      const application = new McpCredentialApplication(
        createBetaStore({ 'identity-blocked': status }),
        credentialStore
      )

      await expect(
        application.authorizeMcpClient({
          discordIdentityId: 'identity-blocked',
          clientId: 'chatgpt'
        })
      ).rejects.toThrowError(/approved/i)
      expect(credentialStore.credentials.size).toBe(0)
    }
  )

  it('revokes active credentials idempotently', async () => {
    const credentialStore = createCredentialStore()
    const application = new McpCredentialApplication(
      createBetaStore({ 'identity-approved': 'APPROVED' }),
      credentialStore
    )

    const credential = await application.authorizeMcpClient({
      discordIdentityId: 'identity-approved',
      clientId: 'chatgpt'
    })

    const revoked = await application.revokeMcpCredential(credential.id)
    expect(revoked?.changed).toBe(true)
    expect(revoked?.credential.status).toBe('REVOKED')
    expect(revoked?.credential.revokedAt).not.toBeNull()

    const revokedAgain = await application.revokeMcpCredential(credential.id)
    expect(revokedAgain?.changed).toBe(false)
    expect(revokedAgain?.credential.status).toBe('REVOKED')
  })

  it('does not let the client choose a different beta identity during OAuth authorization', async () => {
    const app = Fastify()
    const credentialStore = createCredentialStore()
    const approvedIdentity = createIdentity({
      id: 'identity-approved',
      discordUserId: 'discord-user-approved'
    })
    const blockedIdentity = createIdentity({
      id: 'identity-blocked',
      discordUserId: 'discord-user-blocked'
    })
    const discordStore = createDiscordStore(
      [approvedIdentity, blockedIdentity],
      [{ tokenHash: sha256Hex('approved-session-token'), identityId: approvedIdentity.id }]
    )
    const betaStore = createBetaStore({ [approvedIdentity.id]: 'APPROVED', [blockedIdentity.id]: 'PENDING' })
    const mcpCredentialApplication = new McpCredentialApplication(betaStore, credentialStore)
    const authorizationCodeStore = createAuthorizationCodeStore()

    await registerOAuthRoutes(app, {
      discordStore,
      betaAccessStore: betaStore,
      mcpCredentialApplication,
      authorizationCodeStore
    })

    try {
      const authorize = await app.inject({
        method: 'POST',
        url: '/oauth/authorize',
        headers: {
          cookie: `aion_discord_session=${encodeURIComponent('approved-session-token')}`
        },
        payload: {
          response_type: 'code',
          client_id: 'chatgpt',
          redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
          code_challenge: sha256Base64Url('verifier-123'),
          code_challenge_method: 'S256',
          state: 'test-state',
          discordIdentityId: blockedIdentity.id,
          betaStatus: 'REVOKED'
        }
      })

      expect(authorize.statusCode).toBe(302)
      const location = authorize.headers.location
      expect(location).toContain('code=')
      expect(authorizationCodeStore.lastInserted?.discordIdentityId).toBe(approvedIdentity.id)
      expect(authorizationCodeStore.lastInserted?.discordIdentityId).not.toBe(blockedIdentity.id)

      const code = new URL(String(location)).searchParams.get('code')
      expect(code).toBeTruthy()

      const token = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        payload: {
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
          client_id: 'chatgpt',
          code_verifier: 'verifier-123',
          resource: 'https://aion-mcp.labsio.app'
        }
      })

      expect(token.statusCode).toBe(200)
      const body = token.json() as { access_token: string }
      const payload = decodeJwtPayload(body.access_token)
      expect(payload.credentialId).toBeTruthy()
      expect(payload.jti).toBe(payload.credentialId)

      const created = [...credentialStore.credentials.values()][0]
      expect(created.discordIdentityId).toBe(approvedIdentity.id)
      expect(created.status).toBe('ACTIVE')
      expect(created).not.toHaveProperty('accessToken')
    } finally {
      await app.close()
    }
  })

  it('fails closed when an authorization code has no server-side identity binding', async () => {
    const app = Fastify()
    const credentialStore = createCredentialStore()
    const betaStore = createBetaStore({ 'identity-approved': 'APPROVED' })
    const authorizationCodeStore = createAuthorizationCodeStore()
    const mcpCredentialApplication = new McpCredentialApplication(betaStore, credentialStore)

    await registerOAuthRoutes(app, {
      betaAccessStore: betaStore,
      mcpCredentialApplication,
      authorizationCodeStore
    })

    try {
      await authorizationCodeStore.insert({
        code: 'post-cutover-code',
        clientId: 'chatgpt',
        redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        scope: 'mcp:access',
        resource: 'https://aion-mcp.labsio.app',
        discordIdentityId: null,
        codeChallenge: sha256Base64Url('verifier-123'),
        codeChallengeMethod: 'S256',
        createdAt: '2026-09-05T00:00:00.000Z',
        expiresAt: '2026-09-05T01:00:00.000Z'
      })

      const token = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        payload: {
          grant_type: 'authorization_code',
          code: 'post-cutover-code',
          redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
          client_id: 'chatgpt',
          code_verifier: 'verifier-123',
          resource: 'https://aion-mcp.labsio.app'
        }
      })

      expect(token.statusCode).toBe(400)
      expect(token.json()).toEqual({ error: 'invalid_grant' })
      expect(credentialStore.credentials.size).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('revokes the credential if token issuance fails after credential creation', async () => {
    const app = Fastify()
    const credentialStore = createCredentialStore()
    const approvedIdentity = createIdentity({
      id: 'identity-approved',
      discordUserId: 'discord-user-approved'
    })
    const discordStore = createDiscordStore(
      [approvedIdentity],
      [{ tokenHash: sha256Hex('approved-session-token'), identityId: approvedIdentity.id }]
    )
    const betaStore = createBetaStore({ [approvedIdentity.id]: 'APPROVED' })
    const mcpCredentialApplication = new McpCredentialApplication(betaStore, credentialStore)
    const authorizationCodeStore = createAuthorizationCodeStore()

    await registerOAuthRoutes(app, {
      discordStore,
      betaAccessStore: betaStore,
      mcpCredentialApplication,
      authorizationCodeStore,
      issueAccessToken: async () => {
        throw new Error('token signing failed')
      }
    } as any)

    try {
      await authorizationCodeStore.insert({
        code: 'exchange-code',
        clientId: 'chatgpt',
        redirectUri: 'https://chatgpt.com/connector_platform_oauth_redirect',
        scope: 'mcp:access',
        resource: 'https://aion-mcp.labsio.app',
        discordIdentityId: approvedIdentity.id,
        codeChallenge: sha256Base64Url('verifier-456'),
        codeChallengeMethod: 'S256',
        createdAt: '2026-09-05T00:00:00.000Z',
        expiresAt: '2026-09-05T01:00:00.000Z'
      })

      const token = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        payload: {
          grant_type: 'authorization_code',
          code: 'exchange-code',
          redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
          client_id: 'chatgpt',
          code_verifier: 'verifier-456',
          resource: 'https://aion-mcp.labsio.app'
        }
      })

      expect(token.statusCode).toBe(500)
      expect(credentialStore.credentials.size).toBe(1)
      expect([...credentialStore.credentials.values()][0].status).toBe('REVOKED')
      expect([...credentialStore.credentials.values()][0].revokedAt).not.toBeNull()
    } finally {
      await app.close()
    }
  })
})
