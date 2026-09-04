import { getPool } from '../../infrastructure/postgres/pool.js'
import { PostgresDiscordBetaStore } from '../../infrastructure/postgres/PostgresDiscordBetaStore.js'
import { createDiscordBetaController, readDiscordOAuthConfig } from './discord-beta.js'

let controller: ReturnType<typeof createDiscordBetaController> | undefined

export function getDiscordBetaController() {
  if (!controller) {
    controller = createDiscordBetaController({
      config: readDiscordOAuthConfig(),
      fetch: globalThis.fetch.bind(globalThis),
      store: new PostgresDiscordBetaStore(getPool())
    })
  }

  return controller
}
