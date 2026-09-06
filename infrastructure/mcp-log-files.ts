import { randomUUID } from 'node:crypto'
import { mkdir, appendFile, readdir, stat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const logFilePattern = /^mcp-\d{4}-\d{2}-\d{2}\.jsonl$/

let ensuredDirectory: Promise<void> | null = null

export interface McpLogFileRecord {
  name: string
  sizeBytes: number
  modifiedAt: string
  downloadUrl: string
}

export interface McpLogEntryRecord {
  logId: string
  timestamp: string
  level: string
  scope: string
  event: string
  [key: string]: unknown
}

function resolveMcpLogDirectory(): string {
  const configured = process.env.MCP_LOG_DIR?.trim()
  if (configured) return resolve(configured)
  return resolve(process.cwd(), '.data', 'mcp-logs')
}

function currentUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentLogFilePath(): string {
  return join(resolveMcpLogDirectory(), `mcp-${currentUtcDateKey()}.jsonl`)
}

function assertValidLogFileName(fileName: string): string {
  const normalized = fileName.trim()
  if (!logFilePattern.test(normalized)) {
    throw new Error('Invalid MCP log file name')
  }

  return normalized
}

async function ensureLogDirectory() {
  if (!ensuredDirectory) {
    ensuredDirectory = mkdir(resolveMcpLogDirectory(), { recursive: true }).then(() => undefined)
  }

  await ensuredDirectory
}

export async function appendMcpLogEntry(entry: Record<string, unknown>) {
  await ensureLogDirectory()
  const line = `${JSON.stringify({
    logId: randomUUID(),
    ...entry
  })}\n`
  await appendFile(getCurrentLogFilePath(), line, 'utf8')
}

export async function listMcpLogFiles(baseUrl = '/api/admin/mcp-logs'): Promise<McpLogFileRecord[]> {
  await ensureLogDirectory()
  const directory = resolveMcpLogDirectory()
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile() && logFilePattern.test(entry.name))
      .map(async entry => {
        const filePath = join(directory, entry.name)
        const info = await stat(filePath)
        return {
          name: entry.name,
          sizeBytes: info.size,
          modifiedAt: info.mtime.toISOString(),
          downloadUrl: `${baseUrl}/${encodeURIComponent(entry.name)}`
        }
      })
  )

  return files.sort((left, right) => right.name.localeCompare(left.name))
}

export async function readMcpLogFile(fileName: string) {
  const normalized = assertValidLogFileName(fileName)
  await ensureLogDirectory()
  const filePath = join(resolveMcpLogDirectory(), normalized)
  return { filePath, fileName: normalized }
}

export function isValidMcpLogFileName(fileName: string): boolean {
  return logFilePattern.test(fileName.trim())
}

function parseJsonlLine(line: string): McpLogEntryRecord | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const logId = typeof parsed.logId === 'string' ? parsed.logId : null
    const timestamp = typeof parsed.timestamp === 'string' ? parsed.timestamp : null
    const level = typeof parsed.level === 'string' ? parsed.level : null
    const scope = typeof parsed.scope === 'string' ? parsed.scope : null
    const event = typeof parsed.event === 'string' ? parsed.event : null
    if (!logId || !timestamp || !level || !scope || !event) return null

    return {
      logId,
      timestamp,
      level,
      scope,
      event,
      ...parsed
    }
  } catch {
    return null
  }
}

export async function readMcpLogFileEntries(fileName: string): Promise<McpLogEntryRecord[]> {
  const normalized = assertValidLogFileName(fileName)
  await ensureLogDirectory()
  const filePath = join(resolveMcpLogDirectory(), normalized)
  const content = await readFile(filePath, 'utf8')
  return content
    .split('\n')
    .map(parseJsonlLine)
    .filter((entry): entry is McpLogEntryRecord => entry !== null)
}

export async function findMcpLogEntry(logId: string): Promise<
  | {
      fileName: string
      entry: McpLogEntryRecord
      lineNumber: number
    }
  | null
> {
  const id = logId.trim()
  if (!id) return null

  await ensureLogDirectory()
  const directory = resolveMcpLogDirectory()
  const entries = await readdir(directory, { withFileTypes: true })
  const files = entries.filter(entry => entry.isFile() && logFilePattern.test(entry.name))

  for (const file of files) {
    const filePath = join(directory, file.name)
    const content = await readFile(filePath, 'utf8')
    const lines = content.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (typeof line !== 'string') continue

      const entry = parseJsonlLine(line)
      if (entry?.logId === id) {
        return {
          fileName: file.name,
          entry,
          lineNumber: index + 1
        }
      }
    }
  }

  return null
}
