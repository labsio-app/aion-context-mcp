import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getPool } from '../infrastructure/postgres/pool.js'

const scopeName = 'mcp:access'

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

function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
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
  codeChallenge: string
  codeChallengeMethod: 'S256'
  createdAt: string
  expiresAt: string
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

async function insertAuthorizationCode(record: AuthCodeRecord) {
  const pool = getPool()
  await pool.query(
    `INSERT INTO oauth_authorization_codes
     (code, client_id, redirect_uri, scope, resource, code_challenge, code_challenge_method, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      record.code,
      record.clientId,
      record.redirectUri,
      record.scope,
      record.resource,
      record.codeChallenge,
      record.codeChallengeMethod,
      record.createdAt,
      record.expiresAt
    ]
  )
}

async function consumeAuthorizationCode(code: string): Promise<AuthCodeRecord | null> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `SELECT code, client_id, redirect_uri, scope, resource, code_challenge, code_challenge_method, created_at, expires_at
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

function oauthChallengeHeader(): string {
  return `Bearer resource_metadata="${getProtectedResourceMetadataUrl()}", scope="${scopeName}"`
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

function renderAuthorizeForm(params: URLSearchParams, error?: string) {
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
      <label>
        Authorization password
        <input type="password" name="password" autocomplete="current-password" required />
      </label>
      <button type="submit">Authorize</button>
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
  scope: string
}) {
  const code = randomToken(32)
  const createdAt = nowIso()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await insertAuthorizationCode({
    code,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    resource: input.resource,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    createdAt,
    expiresAt
  })
  return code
}

export async function registerOAuthRoutes(app: FastifyInstance) {
  const issuer = getOAuthIssuer()
  const resource = getOAuthResource()

  app.get('/.well-known/oauth-protected-resource', async () => getProtectedResourceMetadata())
  app.get('/.well-known/oauth-authorization-server', async () => getOAuthMetadata())
  app.get('/.well-known/openid-configuration', async () => getOAuthMetadata())

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

    return reply.type('text/html').send(renderAuthorizeForm(query))
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

    if (body.password !== loginPassword()) {
      return reply.status(401).type('text/html').send(renderAuthorizeForm(query, 'Invalid password'))
    }

    const code = await issueAuthorizationCode({
      clientId: validation.value.clientId,
      redirectUri: validation.value.redirectUri,
      codeChallenge: validation.value.codeChallenge,
      codeChallengeMethod: validation.value.codeChallengeMethod,
      resource: resource,
      scope: validation.value.scope
    })

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

    const record = await consumeAuthorizationCode(code)
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

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresIn = 60 * 60 * 24 * 30
    const token = signJwt({
      iss: issuer,
      sub: 'aion-owner',
      aud: resource,
      scope: scopeName,
      iat: issuedAt,
      exp: issuedAt + expiresIn
    })

    return reply.header('Cache-Control', 'no-store').send({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: scopeName
    })
  })
}

export function authenticateMcpRequest(request: FastifyRequest) {
  const authorization = request.headers.authorization ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : ''
  if (!token) return false
  const payload = verifyJwt(token)
  if (!payload) return false
  const resource = getOAuthResource()
  const issuer = getOAuthIssuer()
  if (!audienceMatches(payload.aud, resource)) return false
  if (!scopeIncludes(payload.scope, scopeName)) return false
  if (payload.iss !== issuer) return false
  return true
}

export function sendMcpAuthChallenge(reply: FastifyReply) {
  return reply
    .code(401)
    .header('WWW-Authenticate', oauthChallengeHeader())
    .send({ error: 'unauthorized' })
}
