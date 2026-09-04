import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import { BetaAccessApplication } from '../core/application/BetaAccessApplication.js'
import { BetaAccessResubmissionNotAllowedError } from '../core/application/BetaAccessResubmissionNotAllowedError.js'
import { createBetaAccessController } from '../server/lib/beta-access.js'
import { ActiveBetaAccessRequestAlreadyExistsError } from '../core/application/ActiveBetaAccessRequestAlreadyExistsError.js'
import { PostgresBetaAccessStore } from '../infrastructure/postgres/PostgresBetaAccessStore.js'
import type {
  BetaAccessRequestRecord,
  BetaAccessStore as RealBetaAccessStore,
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../core/application/ports.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function extractCookie(header: string | null, name: string): string {
  if (!header) return ''
  const parts = header.split(/,\s*(?=[^;,]+=)/).map(part => part.trim())
  const match = parts.find(part => part.startsWith(`${name}=`))
  return match ? match.split(';')[0] : ''
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
      const id = 'identity-1'
      const record: DiscordIdentityRecord = {
        id,
        discordUserId: input.discordUserId,
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        displayName: input.globalName?.trim() || input.username,
        createdAt: now,
        updatedAt: now
      }
      identities.set(id, record)
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

function createBetaStore(): RealBetaAccessStore {
  const requests = new Map<string, BetaAccessRequestRecord>()

  return {
    async getLatestRequestByDiscordIdentityId(discordIdentityId) {
      return requests.get(discordIdentityId) ?? null
    },
    async getActiveRequestByDiscordIdentityId(discordIdentityId) {
      const request = requests.get(discordIdentityId) ?? null
      if (!request) return null
      return request.status === 'PENDING' || request.status === 'APPROVED' ? request : null
    },
    async saveBetaAccessRequest(request) {
      requests.set(request.discordIdentityId, request)
      return request
    }
  }
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

function createPgUniqueViolationError(constraint = 'ux_beta_access_requests_active_identity') {
  return {
    code: '23505',
    constraint,
    detail: 'duplicate key value violates unique constraint'
  }
}

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

describe('Beta access request', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'discord-client-id')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'discord-client-secret')
    vi.stubEnv('DISCORD_REDIRECT_URI', 'https://aion-mcp.labsio.app/api/beta/discord/callback')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('rejects anonymous beta request submissions', async () => {
    const { createBetaAccessController } = await import('../server/lib/beta-access.js')
    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(createBetaStore()),
      discordStore: createDiscordStore()
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: 'Anonymous',
          motivation: 'I want access',
          intendedUsage: 'Testing'
        })
      })

      expect(response.status).toBe(401)
    })
  })

  it('returns the form state for an authenticated user without an active request', async () => {
    const { createBetaAccessController } = await import('../server/lib/beta-access.js')
    const discordStore = createDiscordStore()
    const sessionToken = 'discord-session-token'
    const tokenHash = sha256Hex(sessionToken)

    await discordStore.upsertIdentity({
      discordUserId: 'discord-user-1',
      username: 'beta-tester',
      globalName: 'Beta Tester',
      avatar: null
    })
    await discordStore.createSession({
      identityId: 'identity-1',
      tokenHash,
      expiresAt: '2026-09-06T00:00:00.000Z'
    })

    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(createBetaStore()),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/access`, {
        headers: {
          cookie: createSessionCookie(sessionToken)
        }
      })

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        authenticated: true,
        identity: {
          id: 'identity-1',
          discordUserId: 'discord-user-1',
          displayName: 'Beta Tester'
        },
        canSubmit: true,
        request: null
      })
    })
  })

  it('rejects requests missing required motivation', async () => {
    const { createBetaAccessController } = await import('../server/lib/beta-access.js')
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
      application: new BetaAccessApplication(createBetaStore()),
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
          motivation: '',
          intendedUsage: 'Testing',
          aionProfile: '',
          expectedClients: ['Codex']
        })
      })

      expect(response.status).toBe(400)
    })
  })

  it('persists a pending beta request and shows it on reload', async () => {
    const { createBetaAccessController } = await import('../server/lib/beta-access.js')
    const discordStore = createDiscordStore()
    const accessStore = createBetaStore()
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
      application: new BetaAccessApplication(accessStore),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const submit = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body: JSON.stringify({
          displayName: 'Beta Tester',
          motivation: 'I want to improve my prompt workflow.',
          intendedUsage: 'Research and note-taking',
          aionProfile: 'Former AION player',
          expectedClients: ['Codex', 'ChatGPT']
        })
      })

      expect(submit.status).toBe(201)
      await expect(submit.json()).resolves.toMatchObject({
        canSubmit: false,
        request: {
          status: 'PENDING',
          displayName: 'Beta Tester',
          motivation: 'I want to improve my prompt workflow.',
          intendedUsage: 'Research and note-taking',
          aionProfile: 'Former AION player',
          expectedClients: ['Codex', 'ChatGPT']
        }
      })

      const reload = await fetch(`${baseUrl}/api/beta/access`, {
        headers: {
          cookie: createSessionCookie(sessionToken)
        }
      })

      expect(reload.status).toBe(200)
      await expect(reload.json()).resolves.toMatchObject({
        canSubmit: false,
        request: {
          status: 'PENDING'
        }
      })
    })
  })

  it('rejects duplicate active requests', async () => {
    const { createBetaAccessController } = await import('../server/lib/beta-access.js')
    const discordStore = createDiscordStore()
    const accessStore = createBetaStore()
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
      application: new BetaAccessApplication(accessStore),
      discordStore
    })

    await withServer(handlers, async baseUrl => {
      const body = JSON.stringify({
        displayName: 'Beta Tester',
        motivation: 'I want to improve my prompt workflow.',
        intendedUsage: 'Research and note-taking',
        aionProfile: 'Former AION player',
        expectedClients: ['Codex']
      })

      const first = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body
      })
      expect(first.status).toBe(201)

      const duplicate = await fetch(`${baseUrl}/api/beta/access`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: createSessionCookie(sessionToken)
        },
        body
      })

      expect(duplicate.status).toBe(409)
      const text = await duplicate.text()
      expect(text).toContain('active_request_exists')
    })
  })

  for (const status of ['REJECTED', 'REVOKED'] as const) {
    it(`rejects resubmission for ${status.toLowerCase()} requests with a dedicated conflict`, async () => {
      const { createBetaAccessController } = await import('../server/lib/beta-access.js')
      const discordStore = createDiscordStore()
      const accessStore = createBetaStore()
      await accessStore.saveBetaAccessRequest(makeRequest(status))
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
        application: new BetaAccessApplication(accessStore),
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
            motivation: 'I want to improve my prompt workflow.',
            intendedUsage: 'Research and note-taking',
            aionProfile: 'Former AION player',
            expectedClients: ['Codex']
          })
        })

        expect(response.status).toBe(409)
        const text = await response.text()
        expect(text).toContain('resubmission_not_allowed')
        expect(text).not.toContain('active_request_exists')
      })
    })
  }

  for (const status of ['REJECTED', 'REVOKED'] as const) {
    it(`raises a dedicated application error for ${status.toLowerCase()} resubmissions`, async () => {
      const store = createBetaStore()
      await store.saveBetaAccessRequest(makeRequest(status))

      await expect(
        new BetaAccessApplication(store).requestBetaAccess(
          {
            id: 'identity-1',
            discordUserId: 'discord-user-1',
            username: 'beta-tester',
            globalName: 'Beta Tester',
            avatar: null,
            displayName: 'Beta Tester',
            createdAt: '2026-09-05T00:00:00.000Z',
            updatedAt: '2026-09-05T00:00:00.000Z'
          },
          {
            displayName: 'Beta Tester',
            motivation: 'I want to improve my prompt workflow.',
            intendedUsage: 'Research and note-taking',
            aionProfile: 'Former AION player',
            expectedClients: ['Codex']
          }
        )
      ).rejects.toBeInstanceOf(BetaAccessResubmissionNotAllowedError)
    })
  }

  it('returns a controlled conflict when persistence races on the unique constraint', async () => {
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

    let calls = 0
    const pool = {
      async query() {
        calls += 1
        if (calls <= 2) {
          return { rows: [] }
        }

        throw createPgUniqueViolationError()
      }
    } as any
    const handlers = createBetaAccessController({
      application: new BetaAccessApplication(new PostgresBetaAccessStore(pool)),
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
          motivation: 'I want to improve my prompt workflow.',
          intendedUsage: 'Research and note-taking',
          aionProfile: 'Former AION player',
          expectedClients: ['Codex']
        })
      })

      expect(response.status).toBe(409)
      const text = await response.text()
      expect(text).not.toContain('23505')
      expect(text).not.toContain('ux_beta_access_requests_active_identity')
    })
  })

  it('selects the latest beta request deterministically by timestamp and id', async () => {
    let capturedQuery = ''
    const store = new PostgresBetaAccessStore({
      async query(text: string) {
        capturedQuery = text
        return {
          rows: [
            {
              id: 'request-b',
              discord_identity_id: 'identity-1',
              display_name: 'Beta Tester',
              motivation: 'I want to improve my prompt workflow.',
              intended_usage: 'Research and note-taking',
              aion_profile: 'Former AION player',
              expected_clients: ['Codex'],
              status: 'REJECTED',
              created_at: '2026-09-05T00:00:00.000Z',
              updated_at: '2026-09-05T00:00:00.000Z'
            }
          ]
        }
      }
    } as any)

    const request = await store.getLatestRequestByDiscordIdentityId('identity-1')

    expect(request).toMatchObject({
      id: 'request-b',
      status: 'REJECTED'
    })
    expect(capturedQuery).toContain('ORDER BY created_at DESC, id DESC')
  })

  it('maps the beta access unique violation to a domain conflict in the store', async () => {
    const store = new PostgresBetaAccessStore({
      async query() {
        throw createPgUniqueViolationError()
      }
    } as any)

    await expect(
      store.saveBetaAccessRequest({
        id: 'request-1',
        discordIdentityId: 'identity-1',
        displayName: 'Beta Tester',
        motivation: 'I want to improve my prompt workflow.',
        intendedUsage: 'Research and note-taking',
        aionProfile: null,
        expectedClients: ['Codex'],
        status: 'PENDING',
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      })
    ).rejects.toBeInstanceOf(ActiveBetaAccessRequestAlreadyExistsError)
  })

  it('does not swallow unrelated SQL errors', async () => {
    const store = new PostgresBetaAccessStore({
      async query() {
        throw {
          code: '23505',
          constraint: 'different_constraint',
          message: 'other unique violation'
        }
      }
    } as any)

    await expect(
      store.saveBetaAccessRequest({
        id: 'request-1',
        discordIdentityId: 'identity-1',
        displayName: 'Beta Tester',
        motivation: 'I want to improve my prompt workflow.',
        intendedUsage: 'Research and note-taking',
        aionProfile: null,
        expectedClients: ['Codex'],
        status: 'PENDING',
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z'
      })
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'different_constraint'
    })
  })
})
