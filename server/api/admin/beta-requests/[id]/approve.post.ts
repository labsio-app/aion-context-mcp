import { getBetaAdminController } from '../../../../lib/beta-admin-runtime.js'

export default defineEventHandler(event => getBetaAdminController().approve(event))
