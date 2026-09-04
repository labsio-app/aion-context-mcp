import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createApp, toNodeListener } from 'h3'
import { createDiscordBetaController } from '../server/lib/discord-beta.js'
import type {
  DiscordBetaStore as RealDiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../core/application/ports.js'

function extractCookie(header: string | null, name: string): string {
  if (!header) return ''
  const parts = header.split(/,\s*(?=[^;,]+=)/).map(part => part.trim())
  const match = parts.find(part => part.startsWith(`${name}=`))
  return match ? match.split(';')[0] : ''
}

async function withServer(
  handlers: ReturnType<typeof createDiscordBetaController>,
  run: (baseUrl: string) => Promise<void>
) {
  const app = createApp()
  app.use('/api/beta/discord/start', handlers.start)
  app.use('/api/beta/discord/callback', handlers.callback)
  app.use('/api/beta/session', handlers.sessionGet)
  app.use('/api/beta/session', handlers.sessionDelete)

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

function createStore(): RealDiscordBetaStore {
  const identities = new Map<string, DiscordIdentityRecord>()
  const sessions = new Map<string, DiscordBrowserSessionRecord>()

  return {
    async upsertIdentity(input) {
      const id = 'identity-1'
      const displayName = input.globalName?.trim() || input.username
      const now = new Date('2026-09-04T00:00:00.000Z').toISOString()
      const identity = {
        id,
        discordUserId: input.discordUserId,
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        displayName,
        createdAt: now,
        updatedAt: now
      }
      identities.set(id, identity)
      return identity
    },
    async createSession(input) {
      const id = 'session-1'
      const now = new Date('2026-09-04T00:00:00.000Z').toISOString()
      const session = {
        id,
        identityId: input.identityId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      }
      sessions.set(input.tokenHash, session)
      return session
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

describe('Discord beta auth', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'discord-client-id')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'discord-client-secret')
    vi.stubEnv('DISCORD_REDIRECT_URI', 'https://aion-mcp.labsio.app/api/beta/discord/callback')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('starts Discord OAuth with a CSRF-protected redirect', async () => {
    const handlers = createDiscordBetaController({
      store: createStore(),
      fetch: vi.fn(),
      config: {
        clientId: 'discord-client-id',
        clientSecret: 'discord-client-secret',
        redirectUri: 'https://aion-mcp.labsio.app/api/beta/discord/callback',
        authorizeUrl: 'https://discord.com/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        apiBaseUrl: 'https://discord.com/api'
      }
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/discord/start`, { redirect: 'manual' })

      expect(response.status).toBe(302)
      const location = response.headers.get('location')
      expect(location).toBeTruthy()

      const url = new URL(location as string)
      expect(url.origin).toBe('https://discord.com')
      expect(url.pathname).toBe('/oauth2/authorize')
      expect(url.searchParams.get('client_id')).toBe('discord-client-id')
      expect(url.searchParams.get('redirect_uri')).toBe('https://aion-mcp.labsio.app/api/beta/discord/callback')
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('scope')).toBe('identify')
      expect(url.searchParams.get('state')).toBeTruthy()

      const cookies = response.headers.get('set-cookie')
      expect(cookies).toContain('aion_discord_oauth_state=')
      expect(cookies).toContain('HttpOnly')
    })
  })

  it('rejects callback requests with an invalid state', async () => {
    const handlers = createDiscordBetaController({
      store: createStore(),
      fetch: vi.fn(),
      config: {
        clientId: 'discord-client-id',
        clientSecret: 'discord-client-secret',
        redirectUri: 'https://aion-mcp.labsio.app/api/beta/discord/callback',
        authorizeUrl: 'https://discord.com/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        apiBaseUrl: 'https://discord.com/api'
      }
    })

    await withServer(handlers, async baseUrl => {
      const response = await fetch(`${baseUrl}/api/beta/discord/callback?code=test-code&state=wrong-state`, {
        redirect: 'manual'
      })

      expect(response.status).toBe(400)
      await expect(response.text()).resolves.toContain('invalid state')
    })
  })

  it('exchanges code server-side and stores the Discord identity in a session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://discord.com/api/oauth2/token') {
        expect(init?.method).toBe('POST')
        const body = String(init?.body ?? '')
        expect(body).toContain('grant_type=authorization_code')
        expect(body).toContain('code=test-code')
        return new Response(
          JSON.stringify({
            access_token: 'discord-access-token',
            token_type: 'Bearer',
            expires_in: 604800
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }

      if (url === 'https://discord.com/api/users/@me') {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer discord-access-token'
        })
        return new Response(
          JSON.stringify({
            id: 'discord-user-123',
            username: 'aiontester',
            global_name: 'AION Tester',
            avatar: 'avatar-hash'
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })

    const handlers = createDiscordBetaController({
      store: createStore(),
      fetch: fetchMock,
      config: {
        clientId: 'discord-client-id',
        clientSecret: 'discord-client-secret',
        redirectUri: 'https://aion-mcp.labsio.app/api/beta/discord/callback',
        authorizeUrl: 'https://discord.com/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        apiBaseUrl: 'https://discord.com/api'
      }
    })

    await withServer(handlers, async baseUrl => {
      const start = await fetch(`${baseUrl}/api/beta/discord/start`, { redirect: 'manual' })
      const cookies = start.headers.get('set-cookie')
      const state = new URL(start.headers.get('location') as string).searchParams.get('state')
      expect(state).toBeTruthy()

      const callback = await fetch(
        `${baseUrl}/api/beta/discord/callback?code=test-code&state=${state}`,
        {
          redirect: 'manual',
          headers: {
            cookie: extractCookie(cookies, 'aion_discord_oauth_state')
          }
        }
      )

      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).toBe('/')

      const sessionCookie = callback.headers.get('set-cookie')
      const sessionValue = extractCookie(sessionCookie, 'aion_discord_session')
      expect(sessionValue).toContain('aion_discord_session=')

      const current = await fetch(`${baseUrl}/api/beta/session`, {
        headers: {
          cookie: sessionValue
        }
      })

      expect(current.status).toBe(200)
      await expect(current.json()).resolves.toEqual({
        authenticated: true,
        identity: {
          id: 'identity-1',
          discordUserId: 'discord-user-123',
          displayName: 'AION Tester'
        }
      })
    })
  })
})
