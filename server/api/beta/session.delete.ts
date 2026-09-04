import { getDiscordBetaController } from '../../lib/discord-beta-runtime.js'

export default defineEventHandler(event => getDiscordBetaController().sessionDelete(event))
