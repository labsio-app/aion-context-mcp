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
import {
  authenticateMcpRequest,
  registerOAuthRoutes,
  sendMcpAuthChallenge,
  sendMcpForbidden
} from './oauth.js'

const host = process.env.MCP_HOST ?? '0.0.0.0'
const port = Number(process.env.MCP_PORT ?? 3001)

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

  const result = await authenticateMcpRequest(request, {
    credentialStore: mcpCredentialStore,
    betaAccessStore
  })

  if (result.kind !== 'authenticated') {
    if (result.kind === 'forbidden') {
      return sendMcpForbidden(reply)
    }

    return sendMcpAuthChallenge(reply)
  }

  ;(request.raw as any).auth = result.principal as McpPrincipal
})

const handler = createMcpHandler(({ authInfo }) =>
  createAionMcpServer({ principal: authInfo as McpPrincipal | undefined })
)
const nodeHandler = toNodeHandler(handler, {
  onerror: error => console.error('MCP adapter error', error)
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
console.log(
  `AION MCP listening on http://${host}:${port}/mcp (${buildInfo.releaseTag} ${buildInfo.commitSha ?? 'local'})`
)
