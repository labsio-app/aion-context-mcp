import Fastify from 'fastify'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { describe, expect, it } from 'vitest'
import { createAionMcpServer } from '../mcp/server.js'

describe('MCP server guidance', () => {
  it('advertises the AION reasoning playbook during initialization', async () => {
    const server = createAionMcpServer({
      knowledge: {
        searchContext: async () => [],
        getSource: async () => null,
        recordSource: async (input: any) => input,
        recordKnowledge: async (input: any) => input,
        recordChallenge: async (input: any) => input,
        listChallenges: async () => []
      } as any,
      acquisition: { enqueueSource: async (input: any) => input } as any,
      activity: { execute: async () => ({}) as any }
    })
    const app = Fastify()
    const handler = createMcpHandler(() => server)
    const nodeHandler = toNodeHandler(handler)
    app.all('/mcp', (request, reply) => nodeHandler(request.raw, reply.raw, request.body))

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json'
        },
        payload: {
          jsonrpc: '2.0',
          id: 'guidance-init',
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'guidance-test', version: '1.0.0' }
          }
        }
      })

      expect(response.statusCode).toBe(200)
      const dataLine = response.body
        .split('\n')
        .find(line => line.startsWith('data: '))
      const body = JSON.parse(dataLine?.slice(6) ?? '{}') as {
        result?: { serverInfo?: { instructions?: string } }
      }
      const instructions = (body.result as { instructions?: string } | undefined)?.instructions ?? ''
      expect(instructions).toContain('search existing context first')
      expect(instructions).toContain('Source records material and provenance; it is not truth')
      expect(instructions).toContain('GLOBAL, KR, TW and UNKNOWN')
      expect(instructions).toContain('KR/TW evidence is not automatically GLOBAL evidence')
      expect(instructions).toContain('OBSERVATION')
      expect(instructions).toContain('CLAIM')
      expect(instructions).toContain('THEORY')
      expect(instructions).toContain('RECOMMENDATION')
      expect(instructions).toContain('record a Challenge')
    } finally {
      await app.close()
    }
  })
})
