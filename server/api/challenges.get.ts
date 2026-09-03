import { getContainer } from '../../infrastructure/container.js'
import { requireAdminToken } from '../utils/auth.js'

export default defineEventHandler(async event => {
  requireAdminToken(event)
  return getContainer().knowledge.listChallenges('OPEN', 100)
})
