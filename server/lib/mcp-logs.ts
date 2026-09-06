import { createReadStream } from 'node:fs'
import {
  createError,
  defineEventHandler,
  getRouterParam,
  sendStream,
  setHeader
} from 'h3'
import type { DiscordBetaStore } from '../../core/application/ports.js'
import { requireBetaAdminIdentity } from './admin-identity.js'
import { listMcpLogFiles, readMcpLogFile } from '../../infrastructure/mcp-log-files.js'

export interface AdminMcpLogsControllerDeps {
  discordStore: DiscordBetaStore
}

function mapAdminIdentity(identity: { id: string; discordUserId: string; displayName: string }) {
  return {
    id: identity.id,
    discordUserId: identity.discordUserId,
    displayName: identity.displayName
  }
}

export function createAdminMcpLogsController(deps: AdminMcpLogsControllerDeps) {
  const list = defineEventHandler(async event => {
    const admin = await requireBetaAdminIdentity(event, deps.discordStore)
    const files = await listMcpLogFiles('/api/admin/mcp-logs')

    return {
      admin: mapAdminIdentity(admin),
      files
    }
  })

  const download = defineEventHandler(async event => {
    await requireBetaAdminIdentity(event, deps.discordStore)
    const fileName = String(getRouterParam(event, 'file') ?? '').trim()
    if (!fileName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing MCP log file name'
      })
    }

    const { filePath, fileName: normalizedFileName } = await readMcpLogFile(fileName)

    setHeader(event, 'content-type', 'application/x-ndjson; charset=utf-8')
    setHeader(
      event,
      'content-disposition',
      `attachment; filename="${normalizedFileName.replace(/"/g, '')}"`
    )

    return sendStream(event, createReadStream(filePath, { encoding: 'utf8' }))
  })

  return {
    list,
    download
  }
}
