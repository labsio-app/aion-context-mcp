import { getBetaAccessController } from '../../lib/beta-access-runtime.js'

export default defineEventHandler(event => getBetaAccessController().post(event))
