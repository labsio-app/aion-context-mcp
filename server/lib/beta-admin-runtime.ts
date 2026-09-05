import { getPool } from '../../infrastructure/postgres/pool.js'
import { BetaAdminApplication } from '../../core/application/BetaAdminApplication.js'
import { PostgresBetaAdminStore } from '../../infrastructure/postgres/PostgresBetaAdminStore.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { createBetaAdminController } from './beta-admin.js'

let controller: ReturnType<typeof createBetaAdminController> | undefined

export function getBetaAdminController() {
  if (!controller) {
    const pool = getPool()
    controller = createBetaAdminController({
      application: new BetaAdminApplication(new PostgresBetaAdminStore(pool)),
      discordStore: new PostgresDiscordBetaStore(pool)
    })
  }

  return controller
}
