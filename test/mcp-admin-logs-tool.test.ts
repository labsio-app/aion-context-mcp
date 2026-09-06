import Fastify from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendMcpLogEntry, listMcpLogFiles, readMcpLogFileEntries } from '../infrastructure/mcp-log-files.js'
import { createAionMcpServer } from '../mcp/server.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'

function createNoopKnowledge() {
  return {
    async searchContext() {
      return { query: '', scope: null, sources: [], knowledge: [], openChallenges: [] }
    },
    async getSource() {
      return null
    },
    async recordSource(input: unknown) {
      return input
    },
    async recordKnowledge(input: unknown) {
      return input
    },
    async recordChallenge(input: unknown) {
      return input
    },
    async listChallenges() {
      return []
    }
  }
}

function createNoopAcquisition() {
  return {
    async enqueueSource(input: unknown) {
      return input
    }
  }
}

function createNoopActivity() {
  return {
    async execute(input: unknown) {
      return input
    }
  }
}

function readSseResult(body: string) {
  const dataLine = body
    .split('\n')
    .find(line => line.startsWith('data: '))
  if (!dataLine) {
    throw new Error(`missing data line in SSE body: ${body}`)
  }

  return JSON.parse(dataLine.slice(6)) as {
    result?: unknown
  }
}

async function createMcpApp(principal?: McpPrincipal) {
  const app = Fastify()
  const handler = createMcpHandler(() =>
    createAionMcpServer({
      principal,
      adminDiscordUserId: principal?.userId,
      knowledge: createNoopKnowledge() as any,
      acquisition: createNoopAcquisition() as any,
      activity: createNoopActivity() as any
    })
  )
  const nodeHandler = toNodeHandler(handler)
  app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))
  return app
}

describe('admin-only MCP log tool', () => {
  beforeEach(() => {
    vi.stubEnv('BETA_ADMIN_DISCORD_IDS', 'discord-user-admin')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is visible only to admin principals and can read logs by file or canonical logId', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'aion-mcp-admin-logs-'))
    vi.stubEnv('MCP_LOG_DIR', logDir)

    try {
      await appendMcpLogEntry({
        timestamp: '2026-09-06T12:00:00.000Z',
        level: 'info',
        scope: 'mcp',
        event: 'mcp_server_started',
        endpoint: 'http://127.0.0.1:3001/mcp'
      })
      await appendMcpLogEntry({
        timestamp: '2026-09-06T12:00:01.000Z',
        level: 'info',
        scope: 'mcp-server',
        event: 'mcp_tool_call_completed',
        toolName: 'aion_search_context',
        outcome: 'SUCCESS'
      })

      const files = await listMcpLogFiles('/api/admin/mcp-logs')
      const entries = await readMcpLogFileEntries(files[0].name)
      const firstEntry = entries[0]

      const adminPrincipal: McpPrincipal = {
        kind: 'credential_backed',
        userId: 'discord-user-admin',
        credentialId: 'credential-admin',
        authenticationMethod: 'OAUTH',
        accessStatus: 'ACTIVE'
      }
      const guestPrincipal: McpPrincipal = {
        kind: 'credential_backed',
        userId: 'discord-user-guest',
        credentialId: 'credential-guest',
        authenticationMethod: 'OAUTH',
        accessStatus: 'ACTIVE'
      }

      const adminApp = await createMcpApp(adminPrincipal)
      const guestApp = await createMcpApp(guestPrincipal)

      try {
        const adminInit = await adminApp.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json'
          },
          payload: {
            jsonrpc: '2.0',
            id: 'init-admin',
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'admin-test', version: '1.0.0' }
            }
          }
        })
        expect(adminInit.statusCode).toBe(200)

        const adminTools = readSseResult(
          (
            await adminApp.inject({
              method: 'POST',
              url: '/mcp',
              headers: {
                accept: 'application/json, text/event-stream',
                'content-type': 'application/json'
              },
              payload: {
                jsonrpc: '2.0',
                id: 'tools-admin',
                method: 'tools/list',
                params: {}
              }
            })
          ).body
        )
        const adminToolNames = ((adminTools.result as any)?.tools ?? []).map((tool: any) => tool.name)
        expect(adminToolNames).toContain('aion_read_mcp_logs')

        const guestInit = await guestApp.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json'
          },
          payload: {
            jsonrpc: '2.0',
            id: 'init-guest',
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'guest-test', version: '1.0.0' }
            }
          }
        })
        expect(guestInit.statusCode).toBe(200)

        const guestTools = readSseResult(
          (
            await guestApp.inject({
              method: 'POST',
              url: '/mcp',
              headers: {
                accept: 'application/json, text/event-stream',
                'content-type': 'application/json'
              },
              payload: {
                jsonrpc: '2.0',
                id: 'tools-guest',
                method: 'tools/list',
                params: {}
              }
            })
          ).body
        )
        const guestToolNames = ((guestTools.result as any)?.tools ?? []).map((tool: any) => tool.name)
        expect(guestToolNames).not.toContain('aion_read_mcp_logs')

        const fileResponse = readSseResult(
          (
            await adminApp.inject({
              method: 'POST',
              url: '/mcp',
              headers: {
                accept: 'application/json, text/event-stream',
                'content-type': 'application/json'
              },
              payload: {
                jsonrpc: '2.0',
                id: 'read-file',
                method: 'tools/call',
                params: {
                  name: 'aion_read_mcp_logs',
                  arguments: {
                    fileName: files[0].name,
                    limit: 10
                  }
                }
              }
            })
          ).body
        )

        const filePayload = JSON.parse(
          String((fileResponse.result as any)?.content?.[0]?.text ?? '{}')
        ) as any
        expect(filePayload.mode).toBe('FILE')
        expect(filePayload.entries[0].logId).toBe(firstEntry.logId)
        expect(filePayload.entries[0].event).toBe('mcp_server_started')

        const byIdResponse = readSseResult(
          (
            await adminApp.inject({
              method: 'POST',
              url: '/mcp',
              headers: {
                accept: 'application/json, text/event-stream',
                'content-type': 'application/json'
              },
              payload: {
                jsonrpc: '2.0',
                id: 'read-id',
                method: 'tools/call',
                params: {
                  name: 'aion_read_mcp_logs',
                  arguments: {
                    logId: firstEntry.logId
                  }
                }
              }
            })
          ).body
        )

        const byIdPayload = JSON.parse(
          String((byIdResponse.result as any)?.content?.[0]?.text ?? '{}')
        ) as any
        expect(byIdPayload.mode).toBe('ENTRY')
        expect(byIdPayload.match.entry.logId).toBe(firstEntry.logId)
        expect(byIdPayload.match.entry.event).toBe('mcp_server_started')
      } finally {
        await adminApp.close()
        await guestApp.close()
      }
    } finally {
      await rm(logDir, { recursive: true, force: true })
    }
  })
})
