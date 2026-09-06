import { AccountLifecycleApplication } from '../../core/application/AccountLifecycleApplication.js'
import { getPool } from '../../infrastructure/postgres/pool.js'
import { PostgresAccountLifecycleStore } from '../../infrastructure/postgres/PostgresAccountLifecycleStore.js'
import { PostgresBetaAccessStore } from '../../infrastructure/postgres/PostgresBetaAccessStore.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { createAccountController } from './account.js'

let controller: ReturnType<typeof createAccountController> | undefined

export function getAccountController() {
  if (!controller) {
    const pool = getPool()
    controller = createAccountController({
      application: new AccountLifecycleApplication(new PostgresAccountLifecycleStore(pool)),
      discordStore: new PostgresDiscordBetaStore(pool),
      betaAccessStore: new PostgresBetaAccessStore(pool)
    })
  }

  return controller
}
