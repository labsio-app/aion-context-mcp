import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  createError,
  deleteCookie,
  defineEventHandler,
  getCookie,
  getQuery,
  sendRedirect,
  setCookie
} from 'h3'
import type { DiscordBetaStore, DiscordIdentityRecord } from '../../core/application/ports.js'

export interface DiscordOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  authorizeUrl: string
  tokenUrl: string
  apiBaseUrl: string
}

export interface DiscordBetaControllerDeps {
  store: DiscordBetaStore
  fetch: typeof fetch
  config: DiscordOAuthConfig
}

export interface DiscordSessionPayload {
  authenticated: boolean
  identity?: {
    id: string
    discordUserId: string
    displayName: string
  }
}

const oauthStateCookieName = 'aion_discord_oauth_state'
const sessionCookieName = 'aion_discord_session'
const oauthStateLifetimeSeconds = 10 * 60
const sessionLifetimeSeconds = 12 * 60 * 60

function production(): boolean {
  return process.env.NODE_ENV === 'production'
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed && production()) {
    throw new Error(`${name} is required in production`)
  }
  return trimmed
}

function base64UrlEncode(input: Buffer | Uint8Array | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function randomToken(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function cookieOptions(path: string, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: production(),
    path,
    maxAge
  }
}

export function readDiscordOAuthConfig(): DiscordOAuthConfig {
  return {
    clientId: requireEnv('DISCORD_CLIENT_ID', process.env.DISCORD_CLIENT_ID),
    clientSecret: requireEnv('DISCORD_CLIENT_SECRET', process.env.DISCORD_CLIENT_SECRET),
    redirectUri: requireEnv('DISCORD_REDIRECT_URI', process.env.DISCORD_REDIRECT_URI),
    authorizeUrl: process.env.DISCORD_AUTHORIZE_URL?.trim() || 'https://discord.com/oauth2/authorize',
    tokenUrl: process.env.DISCORD_TOKEN_URL?.trim() || 'https://discord.com/api/oauth2/token',
    apiBaseUrl: process.env.DISCORD_API_BASE_URL?.trim() || 'https://discord.com/api'
  }
}

export function buildDiscordAuthorizeUrl(config: DiscordOAuthConfig, state: string): URL {
  const url = new URL(config.authorizeUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', state)
  return url
}

async function exchangeDiscordCode(
  fetchImpl: typeof fetch,
  config: DiscordOAuthConfig,
  code: string
): Promise<string> {
  const response = await fetchImpl(config.tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri
    })
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord token exchange failed'
    })
  }

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord token exchange returned an invalid payload'
    })
  }

  const record = payload as Record<string, unknown>
  const accessToken = typeof record.access_token === 'string' ? record.access_token.trim() : ''
  if (!accessToken) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord token exchange returned no access token'
    })
  }

  return accessToken
}

async function fetchDiscordProfile(
  fetchImpl: typeof fetch,
  config: DiscordOAuthConfig,
  accessToken: string
): Promise<{
  discordUserId: string
  username: string
  globalName: string | null
  avatar: string | null
}> {
  const response = await fetchImpl(`${config.apiBaseUrl}/users/@me`, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord profile lookup failed'
    })
  }

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object') {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord profile lookup returned an invalid payload'
    })
  }

  const record = payload as Record<string, unknown>
  const discordUserId = typeof record.id === 'string' ? record.id.trim() : ''
  const username = typeof record.username === 'string' ? record.username.trim() : ''
  const globalName = typeof record.global_name === 'string' ? record.global_name.trim() : ''
  const avatar = typeof record.avatar === 'string' ? record.avatar.trim() : ''

  if (!discordUserId || !username) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Discord profile lookup returned incomplete identity data'
    })
  }

  return {
    discordUserId,
    username,
    globalName: globalName || null,
    avatar: avatar || null
  }
}

function getStateCookie(event: H3Event): string | null {
  return getCookie(event, oauthStateCookieName) ?? null
}

function setStateCookie(event: H3Event, state: string) {
  setCookie(event, oauthStateCookieName, state, cookieOptions('/api/beta/discord/callback', oauthStateLifetimeSeconds))
}

function clearStateCookie(event: H3Event) {
  deleteCookie(event, oauthStateCookieName, { path: '/api/beta/discord/callback' })
}

function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, sessionCookieName, token, cookieOptions('/', sessionLifetimeSeconds))
}

function clearSessionCookie(event: H3Event) {
  deleteCookie(event, sessionCookieName, { path: '/' })
}

function buildSessionResponse(identity: DiscordIdentityRecord): DiscordSessionPayload {
  return {
    authenticated: true,
    identity: {
      id: identity.id,
      discordUserId: identity.discordUserId,
      displayName: identity.displayName
    }
  }
}

export function createDiscordBetaController(deps: DiscordBetaControllerDeps) {
  const start = defineEventHandler(async event => {
    const state = randomToken(32)
    setStateCookie(event, state)

    return sendRedirect(event, buildDiscordAuthorizeUrl(deps.config, state).toString(), 302)
  })

  const callback = defineEventHandler(async event => {
    const query = getQuery(event)
    const error = String(query.error ?? '').trim()
    if (error) {
      clearStateCookie(event)
      throw createError({
        statusCode: 401,
        statusMessage: 'Discord authorization was not approved'
      })
    }

    const code = String(query.code ?? '').trim()
    const state = String(query.state ?? '').trim()
    if (!code || !state) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing Discord authorization response'
      })
    }

    const expectedState = getStateCookie(event)
    if (!expectedState || !timingSafeEqualText(expectedState, state)) {
      clearStateCookie(event)
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid state'
      })
    }

    const accessToken = await exchangeDiscordCode(deps.fetch, deps.config, code)
    const profile = await fetchDiscordProfile(deps.fetch, deps.config, accessToken)
    const identity = await deps.store.upsertIdentity(profile)
    const sessionToken = randomToken(32)
    const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString()

    await deps.store.createSession({
      identityId: identity.id,
      tokenHash: sha256Hex(sessionToken),
      expiresAt
    })

    clearStateCookie(event)
    setSessionCookie(event, sessionToken)

    return sendRedirect(event, '/', 302)
  })

  const sessionGet = defineEventHandler(async event => {
    const token = getCookie(event, sessionCookieName)
    if (!token) {
      return { authenticated: false } satisfies DiscordSessionPayload
    }

    const session = await deps.store.getSession(sha256Hex(token))
    if (!session) {
      return { authenticated: false } satisfies DiscordSessionPayload
    }

    return buildSessionResponse(session.identity)
  })

  const sessionDelete = defineEventHandler(async event => {
    const token = getCookie(event, sessionCookieName)
    if (token) {
      await deps.store.deleteSession(sha256Hex(token))
    }

    clearSessionCookie(event)
    return { authenticated: false }
  })

  return {
    start,
    callback,
    sessionGet,
    sessionDelete
  }
}

export async function resolveAuthenticatedDiscordIdentity(
  event: H3Event,
  store: DiscordBetaStore
): Promise<DiscordIdentityRecord | null> {
  const token = getCookie(event, sessionCookieName)
  if (!token) return null

  const session = await store.getSession(sha256Hex(token))
  return session?.identity ?? null
}
