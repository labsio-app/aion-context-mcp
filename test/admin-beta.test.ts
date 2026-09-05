import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import { BetaAdminApplication } from '../core/application/BetaAdminApplication.js'
import { BetaAccessRequestNotFoundError } from '../core/application/BetaAccessRequestNotFoundError.js'
import { InvalidBetaAccessTransitionError } from '../core/application/InvalidBetaAccessTransitionError.js'
import { PostgresBetaAdminStore } from '../infrastructure/postgres/PostgresBetaAdminStore.js'
import { createBetaAdminController } from '../server/lib/beta-admin.js'
import type {
  BetaAccessReviewFilter,
  BetaAccessReviewRecord,
  BetaAccessRequestRecord,
  BetaAdminStore,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../core/application/ports.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function withServer(
  handlers: ReturnType<typeof createBetaAdminController>,
  run: (baseUrl: string) => Promise<void>
) {
  const app = createApp()
  const router = createRouter()
  router.get('/api/admin/beta-requests', handlers.list)
  router.get('/api/admin/beta-requests/:id', handlers.get)
  router.post('/api/admin/beta-requests/:id/approve', handlers.approve)
  router.post('/api/admin/beta-requests/:id/reject', handlers.reject)
  router.post('/api/admin/beta-requests/:id/revoke', handlers.revoke)
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

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

function createDiscordStore(): DiscordBetaStore {
  const identities = new Map<string, DiscordIdentityRecord>()
  const sessions = new Map<string, DiscordBrowserSessionRecord>()

  return {
    async upsertIdentity(input) {
      const now = '2026-09-05T00:00:00.000Z'
      const record: DiscordIdentityRecord = {
        id: input.discordUserId,
        discordUserId: input.discordUserId,
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        displayName: input.globalName?.trim() || input.username,
        createdAt: now,
        updatedAt: now
      }
      identities.set(record.id, record)
      return record
    },
    async createSession(input) {
      const now = '2026-09-05T00:00:00.000Z'
      const record: DiscordBrowserSessionRecord = {
        id: `session-${input.identityId}`,
        identityId: input.identityId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      }
      sessions.set(input.tokenHash, record)
      return record
    },
    async getSession(tokenHash) {
      const session = sessions.get(tokenHash)
      if (!session) return null
      const identity = identities.get(session.identityId)
      if (!identity) return null
      return { session, identity }
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash)
    }
  }
}

function makeRequest(overrides: Partial<BetaAccessRequestRecord> & Pick<BetaAccessRequestRecord, 'status'>): BetaAccessReviewRecord {
  return {
    request: {
      id: overrides.id ?? 'request-1',
      discordIdentityId: overrides.discordIdentityId ?? 'identity-1',
      displayName: overrides.displayName ?? 'Beta Tester',
      motivation: overrides.motivation ?? 'I want access to the private beta.',
      intendedUsage: overrides.intendedUsage ?? 'Research and note-taking',
      aionProfile: overrides.aionProfile ?? 'Former AION player',
      expectedClients: overrides.expectedClients ?? ['Codex'],
      status: overrides.status,
      createdAt: overrides.createdAt ?? '2026-09-05T00:00:00.000Z',
      updatedAt: overrides.updatedAt ?? '2026-09-05T00:00:00.000Z'
    },
    identity: {
      id: overrides.discordIdentityId ?? 'identity-1',
      discordUserId: overrides.discordIdentityId?.replace('identity', 'discord-user') ?? 'discord-user-1',
      username: 'beta-tester',
      globalName: 'Beta Tester',
      avatar: null,
      displayName: 'Beta Tester',
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z'
    }
  }
}

function createAdminStore(initialRequests: BetaAccessReviewRecord[] = []): BetaAdminStore {
  const requests = new Map(initialRequests.map(item => [item.request.id, item]))
  const decisions: Array<{
    id: string
    betaAccessRequestId: string
    adminDiscordIdentityId: string
    fromStatus: BetaAccessRequestRecord['status']
    toStatus: BetaAccessRequestRecord['status']
    reason: string | null
    createdAt: string
  }> = []

  return {
    async listBetaAccessRequests(filter: BetaAccessReviewFilter) {
      const values = [...requests.values()].filter(item => {
        if (filter === 'ALL') return true
        return item.request.status === filter
      })
      return values.sort((left, right) => {
        if (left.request.createdAt !== right.request.createdAt) {
          return left.request.createdAt < right.request.createdAt ? 1 : -1
        }

        return left.request.id < right.request.id ? 1 : -1
      })
    },
    async getBetaAccessRequestById(id: string) {
      return requests.get(id) ?? null
    },
    async transitionBetaAccessRequest(input) {
      const current = requests.get(input.requestId)
      if (!current) {
        throw new BetaAccessRequestNotFoundError()
      }

      if (current.request.status !== input.fromStatus) {
        throw new InvalidBetaAccessTransitionError()
      }

      const next: BetaAccessReviewRecord = {
        ...current,
        request: {
          ...current.request,
          status: input.toStatus,
          updatedAt: '2026-09-05T00:00:01.000Z'
        }
      }

      requests.set(input.requestId, next)
      const decision = {
        id: `decision-${decisions.length + 1}`,
        betaAccessRequestId: input.requestId,
        adminDiscordIdentityId: input.adminDiscordIdentityId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        createdAt: '2026-09-05T00:00:01.000Z'
      }
      decisions.push(decision)

      return {
        request: next,
        decision
      }
    }
  }
}

function createPoolMock() {
  const queries: Array<{ sql: string; params?: unknown[] }> = []
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params })
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] }
      }

      if (/UPDATE\s+beta_access_requests/i.test(String(sql))) {
        return { rows: [] }
      }

      if (/SELECT\s+status\s+FROM\s+beta_access_requests/i.test(String(sql))) {
        return { rows: [{ status: 'APPROVED' }] }
      }

      return { rows: [] }
    }),
    release: vi.fn()
  }

  const pool = {
    connect: vi.fn(async () => client)
  } as any

  return { pool, client, queries }
}

describe('Admin beta review', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'discord-client-id')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'discord-client-secret')
    vi.stubEnv('DISCORD_REDIRECT_URI', 'https://aion-mcp.labsio.app/api/beta/discord/callback')
    vi.stubEnv('BETA_ADMIN_DISCORD_IDS', 'discord-user-admin')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects anonymous admin access', async () => {
    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore()),
      discordStore: createDiscordStore()
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests`)
      expect(response.status).toBe(401)
    })
  })

  it('rejects authenticated non-admin access', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-guest',
      username: 'guest',
      globalName: 'Guest',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-guest',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore()),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests`, {
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(403)
    })
  })

  it('allows authenticated admin access and lists pending requests by default', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(
        createAdminStore([
          makeRequest({ status: 'PENDING', id: 'request-1' }),
          makeRequest({ status: 'APPROVED', id: 'request-2' }),
          makeRequest({ status: 'REJECTED', id: 'request-3' })
        ])
      ),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests`, {
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        admin: {
          discordUserId: 'discord-user-admin'
        },
        filter: 'PENDING',
        requests: [
          {
            request: {
              id: 'request-1',
              status: 'PENDING'
            }
          }
        ]
      })
    })
  })

  it('returns the detail for a specific request', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore([makeRequest({ status: 'PENDING', id: 'request-1' })])),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1`, {
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        request: {
          request: {
            id: 'request-1',
            status: 'PENDING'
          }
        }
      })
    })
  })

  it('approves a pending request and writes one audit decision', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const store = createAdminStore([makeRequest({ status: 'PENDING', id: 'request-1' })])
    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(store),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1/approve`, {
        method: 'POST',
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        request: {
          request: {
            id: 'request-1',
            status: 'APPROVED'
          }
        },
        decision: {
          fromStatus: 'PENDING',
          toStatus: 'APPROVED'
        }
      })
    })
  })

  it('rejects a pending request with a reason and audits it', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const store = createAdminStore([makeRequest({ status: 'PENDING', id: 'request-1' })])
    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(store),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1/reject`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body: JSON.stringify({ reason: 'Not a fit for the current beta.' })
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        request: {
          request: {
            id: 'request-1',
            status: 'REJECTED'
          }
        },
        decision: {
          reason: 'Not a fit for the current beta.'
        }
      })
    })
  })

  it('rejects a reject decision without a reason', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore([makeRequest({ status: 'PENDING', id: 'request-1' })])),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1/reject`, {
        method: 'POST',
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(400)
    })
  })

  it('revokes an approved request with a reason and audits it', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const store = createAdminStore([makeRequest({ status: 'APPROVED', id: 'request-1' })])
    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(store),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1/revoke`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body: JSON.stringify({ reason: 'Access no longer meets beta policy.' })
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        request: {
          request: {
            id: 'request-1',
            status: 'REVOKED'
          }
        },
        decision: {
          fromStatus: 'APPROVED',
          toStatus: 'REVOKED'
        }
      })
    })
  })

  it('returns a controlled conflict for an invalid transition', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore([makeRequest({ status: 'REJECTED', id: 'request-1' })])),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/request-1/approve`, {
        method: 'POST',
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(409)
      await expect(response.text()).resolves.toContain('invalid_beta_access_transition')
    })
  })

  it('fails cleanly when a request does not exist', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAdminController({
      application: new BetaAdminApplication(createAdminStore()),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/beta-requests/missing/approve`, {
        method: 'POST',
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(404)
    })
  })

  it('keeps the conditional transition path race-safe in persistence', async () => {
    const { pool, client, queries } = createPoolMock()
    const store = new PostgresBetaAdminStore(pool)

    await expect(
      store.transitionBetaAccessRequest({
        requestId: 'request-1',
        adminDiscordIdentityId: 'admin-identity',
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        reason: null
      })
    ).rejects.toBeInstanceOf(InvalidBetaAccessTransitionError)

    expect(client.query).toHaveBeenCalled()
    expect(queries.some(entry => entry.sql.includes('UPDATE beta_access_requests'))).toBe(true)
    expect(queries.some(entry => entry.sql.includes('INSERT INTO beta_access_decisions'))).toBe(false)
  })
})
