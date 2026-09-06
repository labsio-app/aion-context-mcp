import { getAdminMcpLogsController } from '../../../lib/mcp-logs-runtime.js'

export default defineEventHandler(event => getAdminMcpLogsController().download(event))
