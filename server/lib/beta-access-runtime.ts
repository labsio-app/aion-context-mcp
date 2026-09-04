import { getPool } from '../../infrastructure/postgres/pool.js'
import { BetaAccessApplication } from '../../core/application/BetaAccessApplication.js'
import { PostgresBetaAccessStore } from '../../infrastructure/postgres/PostgresBetaAccessStore.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { createBetaAccessController } from './beta-access.js'

let controller: ReturnType<typeof createBetaAccessController> | undefined

export function getBetaAccessController() {
  if (!controller) {
    const pool = getPool()
    controller = createBetaAccessController({
      application: new BetaAccessApplication(new PostgresBetaAccessStore(pool)),
      discordStore: new PostgresDiscordBetaStore(pool)
    })
  }

  return controller
}
