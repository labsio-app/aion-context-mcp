import { getPool } from '../../infrastructure/postgres/pool.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { createAdminMcpLogsController } from './mcp-logs.js'

let controller: ReturnType<typeof createAdminMcpLogsController> | undefined

export function getAdminMcpLogsController() {
  if (!controller) {
    controller = createAdminMcpLogsController({
      discordStore: new PostgresDiscordBetaStore(getPool())
    })
  }

  return controller
}

