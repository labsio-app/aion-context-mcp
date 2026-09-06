import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { BetaAccessStore, DiscordBetaStore, McpCredentialStore } from '../core/application/ports.js'
import { McpCredentialApplication } from '../core/application/McpCredentialApplication.js'
import { McpCredentialAuthorizationDeniedError } from '../core/application/McpCredentialAuthorizationDeniedError.js'
import { McpAuthenticationFailedError } from '../core/application/McpAuthenticationFailedError.js'
import { McpAuthorizationDeniedError } from '../core/application/McpAuthorizationDeniedError.js'
import { ResolveMcpPrincipal } from '../core/application/ResolveMcpPrincipal.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import type { VerifiedMcpJwtClaims } from '../core/application/ResolveMcpPrincipal.js'
import { getPool } from '../infrastructure/postgres/pool.js'

const scopeName = 'mcp:access'
const browserSessionCookieName = 'aion_mcp_session'
const browserSessionLifetimeSeconds = 60 * 60 * 12

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

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function base64UrlEncode(input: Buffer | Uint8Array | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4
  return Buffer.from(padded + (pad ? '='.repeat(4 - pad) : ''), 'base64')
}

function sha256Base64Url(value: string): string {
  return base64UrlEncode(createHash('sha256').update(value).digest())
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function getCookie(request: FastifyRequest, name: string): string | null {
  const cookieHeader = request.headers.cookie ?? ''
  for (const item of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=')
    if (rawName !== name) continue
    const value = rawValue.join('=')
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}

function sessionCookie(value: string, maxAge: number): string {
  const attributes = [
    `${browserSessionCookieName}=${encodeURIComponent(value)}`,
    'Path=/oauth',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ]
  if (production()) attributes.push('Secure')
  return attributes.join('; ')
}

function nowIso(): string {
  return new Date().toISOString()
}

function randomToken(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

interface RedirectUriRule {
  mode: 'exact' | 'prefix'
  value: string
}

interface ClientMetadataDocument {
  client_id: string
  client_name: string
  redirect_uris: string[]
}

interface ResolvedClientRegistration {
  kind: 'client_metadata_document' | 'pre_registered'
  redirectUriRules: RedirectUriRule[]
}

const clientMetadataCache = new Map<string, { expiresAt: number; value: ResolvedClientRegistration }>()

export function resetOAuthClientMetadataCache(): void {
  clientMetadataCache.clear()
}

function normalizeUrlString(value: string): string | null {
  try {
    const trimmed = value.trim()
    if (!trimmed) return null

    const url = new URL(trimmed)
    if (url.username || url.password) return null
    return trimmed
  } catch {
    return null
  }
}

function normalizeClientIdentifierUrl(value: string): string | null {
  const trimmed = normalizeUrlString(value)
  if (!trimmed) return null

  const url = new URL(trimmed)
  if (url.protocol !== 'https:') return null
  if (!url.pathname || url.pathname === '/') return null
  if (url.search || url.hash) return null
  return trimmed
}

function normalizeRedirectUriRule(value: string): RedirectUriRule | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.endsWith('*')) {
    const prefix = normalizeUrlString(trimmed.slice(0, -1))
    if (!prefix) return null
    return { mode: 'prefix', value: prefix }
  }

  const exact = normalizeUrlString(trimmed)
  if (!exact) return null
  return { mode: 'exact', value: exact }
}

function parseRedirectUriRules(raw: string | undefined): RedirectUriRule[] {
  return (raw ?? '')
    .split(',')
    .map(value => normalizeRedirectUriRule(value))
    .filter((value): value is RedirectUriRule => Boolean(value))
}

function getPreRegisteredRedirectUriRules(): RedirectUriRule[] {
  return [
    { mode: 'exact', value: 'https://chatgpt.com/connector_platform_oauth_redirect' },
    { mode: 'prefix', value: 'https://chatgpt.com/connector/oauth/' },
    ...parseRedirectUriRules(process.env.MCP_OAUTH_ALLOWED_REDIRECT_URIS)
  ]
}

function matchesRedirectUriRules(redirectUri: string, rules: RedirectUriRule[]): boolean {
  const trimmed = redirectUri.trim()
  if (!trimmed) return false

  return rules.some(rule => {
    if (rule.mode === 'exact') return trimmed === rule.value
    return trimmed.startsWith(rule.value)
  })
}

function cacheTtlMsFromResponse(response: Response): number {
  const cacheControl = response.headers.get('cache-control') ?? ''
  const match = cacheControl.match(/max-age=(\d+)/i)
  if (!match) return 5 * 60 * 1000

  const maxAgeSeconds = Number(match[1])
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) return 0
  return Math.min(maxAgeSeconds * 1000, 30 * 60 * 1000)
}

async function fetchClientMetadataDocument(clientId: string): Promise<ResolvedClientRegistration | null> {
  const cached = clientMetadataCache.get(clientId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(clientId, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        accept: 'application/json'
      }
    })

    if (!response.ok) return null

    const payload: unknown = await response.json()
    const doc = parseClientMetadataDocument(payload, clientId)
    if (!doc) return null

    const registration: ResolvedClientRegistration = {
      kind: 'client_metadata_document',
      redirectUriRules: doc.redirect_uris.map(value => ({ mode: 'exact', value: value.trim() }))
    }

    const ttlMs = cacheTtlMsFromResponse(response)
    if (ttlMs > 0) {
      clientMetadataCache.set(clientId, { expiresAt: Date.now() + ttlMs, value: registration })
    }

    return registration
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseClientMetadataDocument(payload: unknown, expectedClientId: string): ClientMetadataDocument | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  const clientId = typeof record.client_id === 'string' ? record.client_id.trim() : null
  const clientName = typeof record.client_name === 'string' ? record.client_name.trim() : ''
  const redirectUris = Array.isArray(record.redirect_uris)
    ? record.redirect_uris.filter((value): value is string => typeof value === 'string').map(value => value.trim()).filter(Boolean)
    : []

  if (!clientId || clientId !== expectedClientId) return null
  if (!clientName) return null
  if (!redirectUris.length) return null

  return {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris
  }
}

async function resolveClientRegistration(clientId: string): Promise<ResolvedClientRegistration | null> {
  const clientIdentifierUrl = normalizeClientIdentifierUrl(clientId)
  if (clientIdentifierUrl) {
    return fetchClientMetadataDocument(clientIdentifierUrl)
  }

  const preRegisteredRules = getPreRegisteredRedirectUriRules()
  if (!preRegisteredRules.length) return null

  return {
    kind: 'pre_registered',
    redirectUriRules: preRegisteredRules
  }
}

async function isRedirectUriAllowedForClient(clientId: string, redirectUri: string): Promise<boolean> {
  const registration = await resolveClientRegistration(clientId)
  if (!registration) return false

  return matchesRedirectUriRules(redirectUri, registration.redirectUriRules)
}

interface AuthCodeRecord {
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
}

interface OAuthAuthorizationCodeStore {
  insert(record: AuthCodeRecord): Promise<void>
  consume(code: string): Promise<AuthCodeRecord | null>
}

export interface OAuthRouteDependencies {
  discordStore?: DiscordBetaStore
  betaAccessStore?: BetaAccessStore
  mcpCredentialApplication?: McpCredentialApplication
  authorizationCodeStore?: OAuthAuthorizationCodeStore
  issueAccessToken?: (input: {
    issuer: string
    resource: string
    scope: string
    issuedAt: number
    expiresIn: number
    credentialId: string
  }) => string | Promise<string>
}

type AuthorizationValidation =
  | {
      error: string
      description: string
    }
  | {
      value: {
        responseType: string
        clientId: string
        redirectUri: string
        codeChallenge: string
        codeChallengeMethod: 'S256'
        resource: string
        scope: string
        state?: string
      }
    }

function jwtSecret(): string {
  return requireEnv('MCP_OAUTH_JWT_SECRET', process.env.MCP_OAUTH_JWT_SECRET)
}

function loginPassword(): string {
  return requireEnv('MCP_OAUTH_PASSWORD', process.env.MCP_OAUTH_PASSWORD)
}

export function getOAuthIssuer(): string {
  const issuer = process.env.MCP_OAUTH_ISSUER?.trim()
  if (issuer) return normalizeBaseUrl(issuer)
  if (production()) {
    throw new Error('MCP_OAUTH_ISSUER is required in production')
  }
  const port = Number(process.env.MCP_PORT ?? 3001)
  return `http://localhost:${Number.isFinite(port) ? port : 3001}`
}

export function getOAuthResource(): string {
  const resource = process.env.MCP_OAUTH_RESOURCE?.trim()
  if (resource) return normalizeBaseUrl(resource)
  return getOAuthIssuer()
}

export function getOAuthMetadata() {
  const issuer = getOAuthIssuer()
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    authorization_response_iss_parameter_supported: true,
    token_endpoint_auth_methods_supported: ['none'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    client_id_metadata_document_supported: true,
    scopes_supported: [scopeName]
  }
}

export function getProtectedResourceMetadata() {
  const resource = getOAuthResource()
  return {
    resource,
    authorization_servers: [getOAuthIssuer()],
    scopes_supported: [scopeName]
  }
}

function signJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', jwtSecret()).update(signingInput).digest()
  return `${signingInput}.${base64UrlEncode(signature)}`
}

function issueCredentialBoundMcpAccessToken(input: {
  issuer: string
  resource: string
  scope: string
  issuedAt: number
  expiresIn: number
  credentialId: string
}): string {
  return signJwt({
    iss: input.issuer,
    sub: 'aion-owner',
    aud: input.resource,
    scope: input.scope,
    iat: input.issuedAt,
    exp: input.issuedAt + input.expiresIn,
    jti: input.credentialId,
    credentialId: input.credentialId
  })
}

function getBrowserSession(request: FastifyRequest): Record<string, unknown> | null {
  const token = getCookie(request, browserSessionCookieName)
  if (!token) return null

  const payload = verifyJwt(token)
  if (payload?.sub !== 'aion-owner' || payload.type !== 'browser_session') return null
  return payload
}

function setBrowserSession(reply: FastifyReply) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const token = signJwt({
    sub: 'aion-owner',
    type: 'browser_session',
    iat: issuedAt,
    exp: issuedAt + browserSessionLifetimeSeconds
  })
  reply.header('Set-Cookie', sessionCookie(token, browserSessionLifetimeSeconds))
}

function loginPasswordMatches(candidate: unknown): boolean {
  return typeof candidate === 'string' && timingSafeEqualText(candidate, loginPassword())
}

async function resolveApprovedDiscordIdentityId(
  request: FastifyRequest,
  deps: OAuthRouteDependencies | undefined
): Promise<string | null> {
  if (!deps?.discordStore) return null

  const token = getCookie(request, 'aion_discord_session')
  if (!token) return null

  const session = await deps.discordStore.getSession(sha256Hex(token))
  if (!session) return null

  if (!deps.betaAccessStore) {
    return session.identity.id
  }

  const requestRecord = await deps.betaAccessStore.getLatestRequestByDiscordIdentityId(
    session.identity.id
  )
  if (!requestRecord || requestRecord.status !== 'APPROVED') {
    return null
  }

  return session.identity.id
}

function verifyJwt(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  let header: any
  let payload: any
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'))
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'))
  } catch {
    return null
  }

  if (header?.alg !== 'HS256') return null

  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = createHmac('sha256', jwtSecret()).update(signingInput).digest()
  const providedSignature = base64UrlDecode(encodedSignature)
  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return null
  }

  if (typeof payload.exp === 'number' && Date.now() >= payload.exp * 1000) {
    return null
  }

  return payload
}

function normalizeClaim(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toVerifiedMcpJwtClaims(payload: Record<string, unknown>): VerifiedMcpJwtClaims | null {
  const iss = normalizeClaim(payload.iss)
  const scope = normalizeClaim(payload.scope)
  const aud = payload.aud

  if (!iss || !scope) return null
  if (!(typeof aud === 'string' || Array.isArray(aud))) return null

  return {
    ...payload,
    iss,
    aud,
    scope
  }
}

function verifyMcpAccessToken(token: string): VerifiedMcpJwtClaims | null {
  const payload = verifyJwt(token)
  if (!payload) return null

  const claims = toVerifiedMcpJwtClaims(payload)
  if (!claims) return null

  const resource = getOAuthResource()
  const issuer = getOAuthIssuer()
  if (claims.iss !== issuer) return null
  if (!audienceMatches(claims.aud, resource)) return null
  if (!scopeIncludes(claims.scope, scopeName)) return null

  return claims
}

function createDatabaseAuthorizationCodeStore(): OAuthAuthorizationCodeStore {
  const pool = getPool()
  return {
    async insert(record) {
      await pool.query(
        `INSERT INTO oauth_authorization_codes
         (code, client_id, redirect_uri, scope, resource, discord_identity_id, code_challenge, code_challenge_method, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          record.code,
          record.clientId,
          record.redirectUri,
          record.scope,
          record.resource,
          record.discordIdentityId,
          record.codeChallenge,
          record.codeChallengeMethod,
          record.createdAt,
          record.expiresAt
        ]
      )
    },
    async consume(code) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `SELECT code, client_id, redirect_uri, scope, resource, discord_identity_id, code_challenge, code_challenge_method, created_at, expires_at
           FROM oauth_authorization_codes
           WHERE code = $1
           FOR UPDATE`,
          [code]
        )

        const row = result.rows[0]
        if (!row) {
          await client.query('ROLLBACK')
          return null
        }

        if (new Date(row.expires_at).getTime() <= Date.now()) {
          await client.query('DELETE FROM oauth_authorization_codes WHERE code = $1', [code])
          await client.query('COMMIT')
          return null
        }

        await client.query('DELETE FROM oauth_authorization_codes WHERE code = $1', [code])
        await client.query('COMMIT')
        return {
          code: row.code,
          clientId: row.client_id,
          redirectUri: row.redirect_uri,
          scope: row.scope,
          resource: row.resource,
          discordIdentityId: row.discord_identity_id == null ? null : String(row.discord_identity_id),
          codeChallenge: row.code_challenge,
          codeChallengeMethod: row.code_challenge_method,
          createdAt: new Date(row.created_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString()
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  }
}

function oauthChallengeHeader(): string {
  return `Bearer resource_metadata="${getProtectedResourceMetadataUrl()}", scope="${scopeName}"`
}

export type McpRequestAuthenticationResult =
  | {
      kind: 'authenticated'
      principal: McpPrincipal
    }
  | {
      kind: 'unauthorized'
    }
  | {
      kind: 'forbidden'
    }

export interface McpRequestAuthenticationDependencies {
  credentialStore: Pick<McpCredentialStore, 'getCredentialById'>
  betaAccessStore: Pick<BetaAccessStore, 'getLatestRequestByDiscordIdentityId'>
}

export function getProtectedResourceMetadataUrl(): string {
  return `${getOAuthResource()}/.well-known/oauth-protected-resource`
}

function scopeIncludes(value: unknown, expected: string): boolean {
  if (typeof value !== 'string') return false
  return value.split(/\s+/).filter(Boolean).includes(expected)
}

function audienceMatches(value: unknown, expected: string): boolean {
  if (typeof value === 'string') return value === expected
  if (Array.isArray(value)) return value.some(item => item === expected)
  return false
}

function renderAuthorizeForm(params: URLSearchParams, error?: string, signedIn = false) {
  const esc = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const field = (name: string) => esc(params.get(name) ?? '')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AION MCP Authorization</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0b0d12; color: #eef0f7; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { width: min(520px, calc(100vw - 32px)); background: #111522; border: 1px solid #2a3040; border-radius: 14px; padding: 24px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    h1 { font-size: 1.4rem; margin: 0 0 12px; }
    p { color: #a9afbf; line-height: 1.5; }
    .error { color: #ffb2b2; background: #2a1515; border: 1px solid #653030; padding: 10px 12px; border-radius: 10px; }
    label { display: block; margin-top: 16px; font-size: .9rem; color: #c8cedc; }
    input { width: 100%; margin-top: 8px; padding: 12px 14px; border-radius: 10px; border: 1px solid #2c3344; background: #0b0f18; color: #eef0f7; }
    button { margin-top: 18px; width: 100%; padding: 12px 14px; border: 0; border-radius: 10px; background: #c7a462; color: #111; font-weight: 700; cursor: pointer; }
    code { word-break: break-all; }
    .meta { font-size: .85rem; color: #8d95a7; background: #0b0f18; border: 1px solid #2c3344; border-radius: 10px; padding: 12px; margin-top: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>AION MCP authorization</h1>
    <p>Authorize this MCP client to use the AION context server.</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ''}
    <div class="meta">
      <div><strong>Client</strong>: <code>${field('client_id')}</code></div>
      <div><strong>Scope</strong>: <code>${field('scope') || scopeName}</code></div>
      <div><strong>Resource</strong>: <code>${field('resource')}</code></div>
    </div>
    <form method="post">
      ${Array.from(params.entries())
        .filter(([key]) => key !== 'password')
        .map(([key, value]) => `<input type="hidden" name="${esc(key)}" value="${esc(value)}" />`)
        .join('\n')}
      ${signedIn
        ? '<p>You are signed in. Confirm access for this client.</p>'
        : `<label>
          Authorization password
          <input type="password" name="password" autocomplete="current-password" required />
        </label>`}
      <button type="submit">Authorize client</button>
    </form>
  </main>
</body>
</html>`
}

async function redirectWithError(params: URLSearchParams, error: string, description: string) {
  const redirectUri = params.get('redirect_uri') ?? ''
  const clientId = params.get('client_id') ?? ''
  if (!clientId || !(await isRedirectUriAllowedForClient(clientId, redirectUri))) {
    return null
  }

  const redirect = new URL(redirectUri)
  redirect.searchParams.set('error', error)
  redirect.searchParams.set('error_description', description)
  redirect.searchParams.set('iss', getOAuthIssuer())
  const state = params.get('state')
  if (state) redirect.searchParams.set('state', state)
  return redirect.toString()
}

function parseBodyForm(body: any): Record<string, string> {
  if (typeof body === 'string') {
    return Object.fromEntries(new URLSearchParams(body).entries())
  }
  if (!body || typeof body !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') result[key] = value
  }
  return result
}

export async function validateAuthorizationRequest(body: Record<string, string>): Promise<AuthorizationValidation> {
  const responseType = body.response_type?.trim()
  const clientId = body.client_id?.trim()
  const redirectUri = body.redirect_uri?.trim()
  const codeChallenge = body.code_challenge?.trim()
  const codeChallengeMethod = body.code_challenge_method?.trim() || 'S256'
  const resource = body.resource?.trim() || getOAuthResource()
  const scope = body.scope?.trim() || scopeName
  const state = body.state?.trim()

  if (responseType !== 'code') {
    return { error: 'unsupported_response_type', description: 'response_type must be code' }
  }
  if (!clientId) {
    return { error: 'invalid_request', description: 'client_id is required' }
  }
  if (!(await isRedirectUriAllowedForClient(clientId, redirectUri ?? ''))) {
    return { error: 'invalid_request', description: 'redirect_uri is not allowed' }
  }
  if (!codeChallenge) {
    return { error: 'invalid_request', description: 'code_challenge is required' }
  }
  if (codeChallengeMethod !== 'S256') {
    return { error: 'invalid_request', description: 'code_challenge_method must be S256' }
  }
  if (resource !== getOAuthResource()) {
    return { error: 'invalid_target', description: 'resource mismatch' }
  }
  if (scope !== scopeName) {
    return { error: 'invalid_scope', description: 'unsupported scope' }
  }

  return {
    value: {
      responseType,
      clientId,
      redirectUri: redirectUri as string,
      codeChallenge,
      codeChallengeMethod: 'S256' as const,
      resource,
      scope,
      state
    }
  }
}

async function issueAuthorizationCode(input: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  resource: string
  discordIdentityId: string | null
  scope: string
}, store: OAuthAuthorizationCodeStore) {
  const code = randomToken(32)
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await store.insert({
    code,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    resource: input.resource,
    discordIdentityId: input.discordIdentityId,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    createdAt,
    expiresAt
  })
  return code
}

export async function registerOAuthRoutes(
  app: FastifyInstance,
  deps: OAuthRouteDependencies = {}
) {
  const issuer = getOAuthIssuer()
  const resource = getOAuthResource()
  const authorizationCodeStore =
    deps.authorizationCodeStore ?? createDatabaseAuthorizationCodeStore()
  const issueAccessToken =
    deps.issueAccessToken ?? issueCredentialBoundMcpAccessToken
  const hasCredentialLifecycle =
    Boolean(deps.discordStore) &&
    Boolean(deps.betaAccessStore) &&
    Boolean(deps.mcpCredentialApplication)

  app.get('/.well-known/oauth-protected-resource', async () => getProtectedResourceMetadata())
  app.get('/.well-known/oauth-authorization-server', async () => getOAuthMetadata())
  app.get('/.well-known/openid-configuration', async () => getOAuthMetadata())

  app.get('/oauth/session', async request => ({
    authenticated: Boolean(getBrowserSession(request))
  }))

  app.post('/oauth/session', async (request, reply) => {
    const body = parseBodyForm(request.body)
    if (!loginPasswordMatches(body.password)) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    setBrowserSession(reply)
    return { authenticated: true }
  })

  app.delete('/oauth/session', async (_request, reply) => {
    reply.header('Set-Cookie', sessionCookie('', 0))
    return { authenticated: false }
  })

  app.get('/oauth/authorize', async (request, reply) => {
    const query = new URLSearchParams(request.url.split('?')[1] ?? '')
    const validation = await validateAuthorizationRequest(Object.fromEntries(query.entries()))
    if ('error' in validation) {
      const redirect = await redirectWithError(query, validation.error, validation.description)
      if (redirect) {
        return reply.redirect(redirect, 302)
      }
      return reply.status(400).type('text/html').send(renderAuthorizeForm(query, validation.description))
    }

    const approvedIdentityId = hasCredentialLifecycle
      ? await resolveApprovedDiscordIdentityId(request, deps)
      : null
    return reply
      .type('text/html')
      .send(renderAuthorizeForm(query, undefined, Boolean(getBrowserSession(request) || approvedIdentityId)))
  })

  app.post('/oauth/authorize', async (request, reply) => {
    const body = parseBodyForm(request.body)
    const query = new URLSearchParams(body)
    const validation = await validateAuthorizationRequest(body)
    if ('error' in validation) {
      const redirect = await redirectWithError(query, validation.error, validation.description)
      if (redirect) {
        return reply.redirect(redirect, 302)
      }
      return reply.status(400).type('text/html').send(renderAuthorizeForm(query, validation.description))
    }

    const approvedIdentityId = hasCredentialLifecycle
      ? await resolveApprovedDiscordIdentityId(request, deps)
      : null

    if (hasCredentialLifecycle) {
      if (!approvedIdentityId) {
        return reply
          .status(403)
          .type('text/html')
          .send(renderAuthorizeForm(query, 'Beta access is not approved.'))
      }
    } else {
      const signedIn = Boolean(getBrowserSession(request))
      if (!signedIn && !loginPasswordMatches(body.password)) {
        return reply.status(401).type('text/html').send(renderAuthorizeForm(query, 'Invalid password'))
      }

      if (!signedIn) setBrowserSession(reply)
    }

    const code = await issueAuthorizationCode({
      clientId: validation.value.clientId,
      redirectUri: validation.value.redirectUri,
      codeChallenge: validation.value.codeChallenge,
      codeChallengeMethod: validation.value.codeChallengeMethod,
      resource: resource,
      discordIdentityId: approvedIdentityId,
      scope: validation.value.scope
    }, authorizationCodeStore)

    const redirect = new URL(validation.value.redirectUri)
    redirect.searchParams.set('code', code)
    if (validation.value.state) {
      redirect.searchParams.set('state', validation.value.state)
    }
    redirect.searchParams.set('iss', issuer)
    return reply.redirect(redirect.toString(), 302)
  })

  app.post('/oauth/token', async (request, reply) => {
    const body = parseBodyForm(request.body)
    if (body.grant_type !== 'authorization_code') {
      return reply.header('Cache-Control', 'no-store').status(400).send({
        error: 'unsupported_grant_type'
      })
    }

    const code = body.code?.trim()
    const redirectUri = body.redirect_uri?.trim()
    const clientId = body.client_id?.trim()
    const codeVerifier = body.code_verifier?.trim()
    const resourceParam = body.resource?.trim() || resource

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return reply.header('Cache-Control', 'no-store').status(400).send({ error: 'invalid_request' })
    }
    if (resourceParam !== resource) {
      return reply.header('Cache-Control', 'no-store').status(400).send({ error: 'invalid_target' })
    }

    const record = await authorizationCodeStore.consume(code)
    if (
      !record ||
      record.clientId !== clientId ||
      record.redirectUri !== redirectUri ||
      record.resource !== resource ||
      record.codeChallengeMethod !== 'S256' ||
      !timingSafeEqualText(sha256Base64Url(codeVerifier), record.codeChallenge)
    ) {
      return reply.header('Cache-Control', 'no-store').status(400).send({ error: 'invalid_grant' })
    }

    if (!record.discordIdentityId) {
      return reply.header('Cache-Control', 'no-store').status(400).send({ error: 'invalid_grant' })
    }

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresIn = 60 * 60 * 24 * 30
    let credential: { id: string } | null = null
    try {
      if (!deps.mcpCredentialApplication) {
        return reply.header('Cache-Control', 'no-store').status(500).send({ error: 'server_error' })
      }

      credential = await deps.mcpCredentialApplication.authorizeMcpClient({
        discordIdentityId: record.discordIdentityId,
        clientId
      })

      const token = await issueAccessToken({
        issuer,
        resource,
        scope: scopeName,
        issuedAt,
        expiresIn,
        credentialId: credential.id
      })

      return reply.header('Cache-Control', 'no-store').send({
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: scopeName
      })
    } catch (cause) {
      let compensationFailure: unknown = null
      if (credential && deps.mcpCredentialApplication) {
        try {
          await deps.mcpCredentialApplication.revokeMcpCredential(credential.id)
        } catch (error) {
          compensationFailure = error
        }
      }

      if (compensationFailure) {
        throw compensationFailure
      }

      if (cause instanceof McpCredentialAuthorizationDeniedError) {
        return reply.header('Cache-Control', 'no-store').status(400).send({ error: 'invalid_grant' })
      }

      throw cause
    }
  })
}

export function sendMcpForbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: 'forbidden' })
}

export async function authenticateMcpRequest(
  request: FastifyRequest,
  deps: McpRequestAuthenticationDependencies
): Promise<McpRequestAuthenticationResult> {
  const authorization = request.headers.authorization ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!token) return { kind: 'unauthorized' }

  const payload = verifyMcpAccessToken(token)
  if (!payload) return { kind: 'unauthorized' }

  try {
    const principal = await new ResolveMcpPrincipal(
      deps.credentialStore,
      deps.betaAccessStore
    ).execute({
      claims: payload
    })

    return {
      kind: 'authenticated',
      principal
    }
  } catch (error) {
    if (error instanceof McpAuthenticationFailedError) {
      return { kind: 'unauthorized' }
    }

    if (error instanceof McpAuthorizationDeniedError) {
      return { kind: 'forbidden' }
    }

    throw error
  }
}

export function sendMcpAuthChallenge(reply: FastifyReply) {
  return reply
    .code(401)
    .header('WWW-Authenticate', oauthChallengeHeader())
    .send({ error: 'unauthorized' })
}
