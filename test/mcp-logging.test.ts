import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordMcpActivity } from '../core/application/RecordMcpActivity.js'
import type { McpActivityRecord, McpActivityStore } from '../core/application/ports.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import { createMcpLogger } from '../mcp/logger.js'
import { executeTrackedToolCall } from '../mcp/server.js'

function createActivityStore() {
  const records: McpActivityRecord[] = []

  return {
    records,
    async saveActivity(record: McpActivityRecord) {
      records.push(record)
      return record
    },
    async listActivityForUser(_userId: string, _limit: number) {
      return [...records]
    }
  } satisfies McpActivityStore & { records: McpActivityRecord[] }
}

describe('MCP logging', () => {
  beforeEach(() => {
    process.env.MCP_LOG_LEVEL = 'debug'
  })

  afterEach(() => {
    delete process.env.MCP_LOG_LEVEL
    vi.restoreAllMocks()
  })

  it('emits tool timing logs without leaking payload content', async () => {
    const logLines: string[] = []
    const warnLines: string[] = []
    const errorLines: string[] = []

    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logLines.push(args.map(value => String(value)).join(' '))
    })
    vi.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
      warnLines.push(args.map(value => String(value)).join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation((...args: any[]) => {
      errorLines.push(args.map(value => String(value)).join(' '))
    })

    const activityStore = createActivityStore()
    const activity = new RecordMcpActivity(activityStore)
    const logger = createMcpLogger('mcp-server')
    const principal: McpPrincipal = {
      kind: 'credential_backed',
      userId: 'identity-1',
      credentialId: 'credential-1',
      authenticationMethod: 'OAUTH',
      accessStatus: 'ACTIVE'
    }

    const result = await executeTrackedToolCall({
      principal,
      activity,
      logger,
      toolName: 'aion_search_context',
      input: {
        query: 'combat power',
        scope: 'GLOBAL'
      },
      handler: async input => ({
        ok: true,
        query: input.query
      })
    })

    expect(result).toEqual({
      ok: true,
      query: 'combat power'
    })
    expect(activityStore.records).toHaveLength(1)

    const records = [...logLines, ...warnLines, ...errorLines]
      .map(line => JSON.parse(line) as Record<string, unknown>)
      .filter(record => typeof record.event === 'string')

    expect(
      records.some(
        record =>
          record.event === 'mcp_tool_call_completed' &&
          record.toolName === 'aion_search_context' &&
          record.outcome === 'SUCCESS' &&
          typeof record.durationMs === 'number'
      )
    ).toBe(true)

    expect(JSON.stringify(records)).not.toContain('combat power')
    expect(JSON.stringify(records)).not.toContain('"query":"combat power"')
    expect(JSON.stringify(records)).not.toContain('"scope":"GLOBAL"')
  })
})
