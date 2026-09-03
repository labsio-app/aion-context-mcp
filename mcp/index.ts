import { createMcpFastifyApp } from '@modelcontextprotocol/fastify'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { createAionMcpServer } from './server.js'
import {
  authenticateMcpRequest,
  registerOAuthRoutes,
  sendMcpAuthChallenge
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

await registerOAuthRoutes(app)

app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/mcp')) return

  if (!authenticateMcpRequest(request)) {
    return sendMcpAuthChallenge(reply)
  }
})

const handler = createMcpHandler(() => createAionMcpServer())
const nodeHandler = toNodeHandler(handler, {
  onerror: error => console.error('MCP adapter error', error)
})

app.all('/mcp', (request, reply) =>
  nodeHandler(request.raw, reply.raw, request.body)
)

app.get('/health', async () => ({ ok: true, service: 'aion-context-mcp' }))

await app.listen({ host, port })
console.log(`AION MCP listening on http://${host}:${port}/mcp`)
