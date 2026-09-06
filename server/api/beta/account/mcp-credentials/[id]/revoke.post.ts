import { getAccountController } from '../../../../../lib/account-runtime.js'

export default defineEventHandler(event => getAccountController().revokeMcpCredential(event))
