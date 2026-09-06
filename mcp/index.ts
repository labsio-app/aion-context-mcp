import { createMcpFastifyApp } from '@modelcontextprotocol/fastify'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { McpCredentialApplication } from '../core/application/McpCredentialApplication.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import { getBuildInfo } from '../infrastructure/version.js'
import { PostgresBetaAccessStore } from '../infrastructure/postgres/PostgresBetaAccessStore.js'
import { PostgresDiscordBetaStore } from '../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { PostgresMcpCredentialStore } from '../infrastructure/postgres/PostgresMcpCredentialStore.js'
import { getPool } from '../infrastructure/postgres/pool.js'
import { createAionMcpServer } from './server.js'
import { createMcpLogger } from './logger.js'
import {
  authenticateMcpRequest,
  registerOAuthRoutes,
  sendMcpAuthChallenge,
  sendMcpForbidden
} from './oauth.js'

const host = process.env.MCP_HOST ?? '0.0.0.0'
const port = Number(process.env.MCP_PORT ?? 3001)
const logger = createMcpLogger('mcp')

const allowedHosts = (process.env.MCP_ALLOWED_HOSTS ?? 'localhost,127.0.0.1')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

const allowedOrigins = (process.env.MCP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

const app = createMcpFastifyApp({
  host,
  allowedHosts,
  ...(allowedOrigins.length ? { allowedOrigins } : {})
})

app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (request, body, done) => {
    try {
      const parsed = Object.fromEntries(
        new URLSearchParams(
          typeof body === 'string' ? body : body.toString('utf8')
        ).entries()
      )
      done(null, parsed)
    } catch (error) {
      done(error as Error)
    }
  }
)

const pool = getPool()
const discordStore = new PostgresDiscordBetaStore(pool)
const betaAccessStore = new PostgresBetaAccessStore(pool)
const mcpCredentialStore = new PostgresMcpCredentialStore(pool)
const mcpCredentialApplication = new McpCredentialApplication(
  betaAccessStore,
  mcpCredentialStore
)

await registerOAuthRoutes(app, {
  discordStore,
  betaAccessStore,
  mcpCredentialApplication
})

app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/mcp')) return

  const startedAt = performance.now()
  ;(request.raw as any).__mcpStartedAt = startedAt
  logger.debug('mcp_request_started', {
    method: request.method,
    url: request.url,
    requestId: request.id
  })

  const result = await authenticateMcpRequest(request, {
    credentialStore: mcpCredentialStore,
    betaAccessStore
  })

  if (result.kind !== 'authenticated') {
    if (result.kind === 'forbidden') {
      logger.warn('mcp_auth_forbidden', {
        method: request.method,
        url: request.url,
        requestId: request.id
      })
      return sendMcpForbidden(reply)
    }

    logger.info('mcp_auth_challenge', {
      method: request.method,
      url: request.url,
      requestId: request.id
    })
    return sendMcpAuthChallenge(reply)
  }

  logger.debug('mcp_auth_authenticated', {
    method: request.method,
    url: request.url,
    requestId: request.id,
    principal: logger.principal(result.principal)
  })
  const identity = await discordStore.getIdentityById?.(result.principal.userId)
  ;(request.raw as any).auth = {
    principal: result.principal as McpPrincipal,
    ...(identity ? { adminDiscordUserId: identity.discordUserId } : {})
  }
})

app.addHook('onResponse', async (request, reply) => {
  if (!request.url.startsWith('/mcp')) return

  const startedAt = (request.raw as any).__mcpStartedAt as number | undefined
  const durationMs =
    typeof startedAt === 'number' ? Math.max(0, Math.round(performance.now() - startedAt)) : null

  logger.info('mcp_request_completed', {
    method: request.method,
    url: request.url,
    requestId: request.id,
    statusCode: reply.statusCode,
    durationMs
  })
})

const handler = createMcpHandler(({ authInfo }) => {
  const principal =
    authInfo && typeof authInfo === 'object' && 'principal' in authInfo
      ? (authInfo as { principal?: McpPrincipal }).principal
      : (authInfo as McpPrincipal | undefined)
  const adminDiscordUserId =
    authInfo && typeof authInfo === 'object' && 'adminDiscordUserId' in authInfo
      ? String((authInfo as { adminDiscordUserId?: unknown }).adminDiscordUserId ?? '')
      : undefined

  return createAionMcpServer({
    principal,
    adminDiscordUserId: adminDiscordUserId || undefined
  })
})
const nodeHandler = toNodeHandler(handler, {
  onerror: error =>
    logger.error('mcp_adapter_error', {
      ...logger.errorDetails(error)
    })
})

const buildInfo = getBuildInfo()

app.all('/mcp', (request, reply) =>
  nodeHandler(request.raw, reply.raw, request.body)
)

app.get('/health', async () => ({
  ok: true,
  service: 'aion-context-mcp',
  version: buildInfo.version,
  releaseTag: buildInfo.releaseTag,
  commitSha: buildInfo.commitSha
}))

await app.listen({ host, port })
logger.info('mcp_server_started', {
  host,
  port,
  endpoint: `http://${host}:${port}/mcp`,
  releaseTag: buildInfo.releaseTag,
  commitSha: buildInfo.commitSha ?? 'local',
  version: buildInfo.version,
  logLevel: logger.level
})
