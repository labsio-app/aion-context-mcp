import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, toNodeListener } from 'h3'
import { appendMcpLogEntry, listMcpLogFiles } from '../infrastructure/mcp-log-files.js'
import { createAdminMcpLogsController } from '../server/lib/mcp-logs.js'
import type {
  DiscordBetaStore,
  DiscordBrowserSessionRecord,
  DiscordIdentityRecord
} from '../core/application/ports.js'

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function createSessionCookie(token: string): string {
  return `aion_discord_session=${encodeURIComponent(token)}`
}

function createDiscordStore(): DiscordBetaStore {
  const identities = new Map<string, DiscordIdentityRecord>()
  const sessions = new Map<string, DiscordBrowserSessionRecord>()

  return {
    async upsertIdentity(input) {
      const now = '2026-09-06T00:00:00.000Z'
      const record: DiscordIdentityRecord = {
        id: input.discordUserId,
        discordUserId: input.discordUserId,
        username: input.username,
        globalName: input.globalName,
        avatar: input.avatar,
        displayName: input.globalName?.trim() || input.username,
        createdAt: now,
        updatedAt: now
      }
      identities.set(record.id, record)
      return record
    },
    async createSession(input) {
      const now = '2026-09-06T00:00:00.000Z'
      const record: DiscordBrowserSessionRecord = {
        id: `session-${input.identityId}`,
        identityId: input.identityId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now
      }
      sessions.set(input.tokenHash, record)
      return record
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
  } satisfies DiscordBetaStore
}

describe('MCP log files', () => {
  beforeEach(() => {
    vi.stubEnv('BETA_ADMIN_DISCORD_IDS', 'discord-user-admin')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('writes JSONL files on disk and exposes them to the admin download route', async () => {
    const logDir = await mkdtemp(join(tmpdir(), 'aion-mcp-logs-'))
    vi.stubEnv('MCP_LOG_DIR', logDir)

    const store = createDiscordStore()
    const sessionToken = 'discord-session-token'
    await store.upsertIdentity({
      discordUserId: 'discord-user-admin',
      username: 'admin',
      globalName: 'Beta Admin',
      avatar: null
    })
    await store.createSession({
      identityId: 'discord-user-admin',
      tokenHash: sha256Hex(sessionToken),
      expiresAt: '2026-09-07T00:00:00.000Z'
    })

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
      expect(files).toHaveLength(1)
      expect(files[0].name).toMatch(/^mcp-\d{4}-\d{2}-\d{2}\.jsonl$/)

      const controller = createAdminMcpLogsController({ discordStore: store })
      const app = createApp()
      const router = createRouter()
      router.get('/api/admin/mcp-logs', controller.list)
      router.get('/api/admin/mcp-logs/:file', controller.download)
      app.use(router.handler)

      const server = createServer(toNodeListener(app))
      server.listen(0)
      await once(server, 'listening')

      try {
        const address = server.address()
        if (!address || typeof address === 'string') {
          throw new Error('failed to start test server')
        }

        const baseUrl = `http://127.0.0.1:${address.port}`
        const listResponse = await fetch(`${baseUrl}/api/admin/mcp-logs`, {
          headers: { cookie: createSessionCookie(sessionToken) }
        })

        expect(listResponse.status).toBe(200)
        await expect(listResponse.json()).resolves.toMatchObject({
          files: [
            {
              name: files[0].name,
              downloadUrl: `/api/admin/mcp-logs/${encodeURIComponent(files[0].name)}`
            }
          ]
        })

        const downloadResponse = await fetch(
          `${baseUrl}/api/admin/mcp-logs/${encodeURIComponent(files[0].name)}`,
          {
            headers: { cookie: createSessionCookie(sessionToken) }
          }
        )

        expect(downloadResponse.status).toBe(200)
        expect(downloadResponse.headers.get('content-disposition')).toContain(files[0].name)
        const content = await downloadResponse.text()
        expect(content).toContain('mcp_server_started')
        expect(content).toContain('mcp_tool_call_completed')
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
    } finally {
      await rm(logDir, { recursive: true, force: true })
    }
  })
})

