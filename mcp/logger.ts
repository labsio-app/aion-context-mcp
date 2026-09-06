import { appendMcpLogEntry } from '../infrastructure/mcp-log-files.js'

type McpLogLevel = 'error' | 'warn' | 'info' | 'debug'

const levelRank: Record<McpLogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
}

function parseLogLevel(value: string | undefined | null): McpLogLevel {
  switch ((value ?? 'info').toLowerCase()) {
    case 'error':
      return 'error'
    case 'warn':
    case 'warning':
      return 'warn'
    case 'debug':
      return 'debug'
    case 'info':
    default:
      return 'info'
  }
}

function sanitizeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    name: typeof error,
    message: String(error)
  }
}

function serializePrincipal(principal?: { userId?: string } | null) {
  if (!principal?.userId) return undefined
  return {
    userId: principal.userId
  }
}

export function createMcpLogger(scope: string) {
  const configuredLevel = parseLogLevel(process.env.MCP_LOG_LEVEL)

  function shouldLog(level: McpLogLevel) {
    return levelRank[level] <= levelRank[configuredLevel]
  }

  function emit(
    level: McpLogLevel,
    event: string,
    details: Record<string, unknown> = {}
  ) {
    if (!shouldLog(level)) return

    const record = {
      timestamp: new Date().toISOString(),
      level,
      scope,
      event,
      ...details
    }

    const line = JSON.stringify(record)

    if (level === 'error') {
      console.error(line)
    } else if (level === 'warn') {
      console.warn(line)
    } else {
      console.log(line)
    }

    void appendMcpLogEntry(record).catch(error => {
      process.stderr.write(
        `[mcp-log-write-failed] ${JSON.stringify({
          scope,
          event,
          error: error instanceof Error ? error.message : String(error)
        })}\n`
      )
    })
  }

  return {
    level: configuredLevel,
    debug: (event: string, details?: Record<string, unknown>) =>
      emit('debug', event, details),
    info: (event: string, details?: Record<string, unknown>) =>
      emit('info', event, details),
    warn: (event: string, details?: Record<string, unknown>) =>
      emit('warn', event, details),
    error: (event: string, details?: Record<string, unknown>) =>
      emit('error', event, details),
    principal: serializePrincipal,
    errorDetails: sanitizeError
  }
}
