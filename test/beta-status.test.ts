import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import { BetaAccessApplication } from '../core/application/BetaAccessApplication.js'
import { createBetaAccessController } from '../server/lib/beta-access.js'
import type {
  BetaAccessRequestRecord,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../core/application/ports.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function withServer(
  handlers: ReturnType<typeof createBetaAccessController>,
  run: (baseUrl: string) => Promise<void>
) {
  const app = createApp()
  const router = createRouter()
  router.get('/api/beta/access', handlers.get)
  router.post('/api/beta/access', handlers.post)
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

function createDiscordStore(): DiscordBetaStore {
  const identities = new Map<string, DiscordIdentityRecord>()
  const sessions = new Map<string, DiscordBrowserSessionRecord>()

  return {
    async upsertIdentity(input) {
      const now = '2026-09-05T00:00:00.000Z'
      const record: DiscordIdentityRecord = {
        id: 'identity-1',
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
        id: 'session-1',
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

function createStatusStore(initialRequest: BetaAccessRequestRecord | null = null) {
  let request = initialRequest

  return {
    async getActiveRequestByDiscordIdentityId() {
      if (!request) return null
      return request.status === 'PENDING' || request.status === 'APPROVED' ? request : null
    },
    async getLatestRequestByDiscordIdentityId() {
      return request
    },
    async saveBetaAccessRequest(next: BetaAccessRequestRecord) {
      request = next
      return next
    }
  }
}

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

function makeRequest(status: BetaAccessRequestRecord['status']): BetaAccessRequestRecord {
  return {
    id: 'request-1',
    discordIdentityId: 'identity-1',
    displayName: 'Beta Tester',
    motivation: 'I want to improve my prompt workflow.',
    intendedUsage: 'Research and note-taking',
    aionProfile: 'Former AION player',
    expectedClients: ['Codex'],
    status,
    createdAt: '2026-09-05T00:00:00.000Z',
    updatedAt: '2026-09-05T00:00:00.000Z'
  }
}

describe('Beta access status states', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'discord-client-id')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'discord-client-secret')
    vi.stubEnv('DISCORD_REDIRECT_URI', 'https://aion-mcp.labsio.app/api/beta/discord/callback')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns the form state when the authenticated user has no beta request', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-1',
      username: 'beta-tester',
      globalName: 'Beta Tester',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'identity-1',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(createStatusStore()),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/access`, {
        headers: { cookie: createSessionCookie(sessionToken) }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        canSubmit: true,
        request: null
      })
    })
  })

  for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const) {
    it(`returns the persisted ${status.toLowerCase()} state`, async () => {
      const discordStore = createDiscordStore()
      const sessionToken = 'discord-session-token'
      await discordStore.upsertIdentity({
        discordUserId: 'discord-user-1',
        username: 'beta-tester',
        globalName: 'Beta Tester',
        avatar: null
      })
      await discordStore.createSession({
        identityId: 'identity-1',
        tokenHash: sha256Hex(sessionToken),
        expiresAt: '2026-09-06T00:00:00.000Z'
      })

      const handlers = createBetaAccessController({
        application: new BetaAccessApplication(createStatusStore(makeRequest(status))),
        discordStore
      })

      await withServer(handlers, async baseUrl => {
        const response = await fetch(`${baseUrl}/api/beta/access`, {
          headers: { cookie: createSessionCookie(sessionToken) }
        })

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({
          canSubmit: false,
          request: {
            status
          }
        })
      })
    })
  }

  it('rejects a new request when an existing rejected request is already persisted', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-1',
      username: 'beta-tester',
      globalName: 'Beta Tester',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'identity-1',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(createStatusStore(makeRequest('REJECTED'))),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body: JSON.stringify({
          displayName: 'Beta Tester',
          motivation: 'I want access',
          intendedUsage: 'Research',
          status: 'APPROVED'
        })
      })

      expect(response.status).toBe(409)
    })
  })

  it('ignores any client-supplied status when creating a fresh request', async () => {
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-1',
      username: 'beta-tester',
      globalName: 'Beta Tester',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'identity-1',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(createStatusStore()),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body: JSON.stringify({
          displayName: 'Beta Tester',
          motivation: 'I want access',
          intendedUsage: 'Research',
          status: 'APPROVED'
        })
      })

      expect(response.status).toBe(201)
      await expect(response.json()).resolves.toMatchObject({
        canSubmit: false,
        request: {
          status: 'PENDING'
        }
      })
    })
  })
})
