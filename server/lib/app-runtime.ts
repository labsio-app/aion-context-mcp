import { ListMcpActivityForUser } from '../../core/application/ListMcpActivityForUser.js'
import { getPool } from '../../infrastructure/postgres/pool.js'
import { PostgresBetaAccessStore } from '../../infrastructure/postgres/PostgresBetaAccessStore.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { PostgresMcpActivityStore } from '../../infrastructure/postgres/PostgresMcpActivityStore.js'
import { createAppActivityController } from './app-activity.js'

let controller: ReturnType<typeof createAppActivityController> | undefined

export function getAppActivityController() {
  if (!controller) {
    const pool = getPool()
    controller = createAppActivityController({
      application: new ListMcpActivityForUser(new PostgresMcpActivityStore(pool)),
      discordStore: new PostgresDiscordBetaStore(pool),
      betaAccessStore: new PostgresBetaAccessStore(pool)
    })
  }

  return controller
}
