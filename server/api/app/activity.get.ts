import { getAppActivityController } from '../../lib/app-runtime.js'

export default defineEventHandler(event => getAppActivityController().get(event))
