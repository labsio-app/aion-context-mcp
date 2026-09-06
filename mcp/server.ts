import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { AcquisitionApplication } from '../core/application/AcquisitionApplication.js'
import { KnowledgeApplication } from '../core/application/KnowledgeApplication.js'
import { RecordMcpActivity } from '../core/application/RecordMcpActivity.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import { getContainer } from '../infrastructure/container.js'
import {
  findMcpLogEntry,
  listMcpLogFiles,
  readMcpLogFileEntries
} from '../infrastructure/mcp-log-files.js'
import { getBuildInfo } from '../infrastructure/version.js'
import { createMcpLogger } from './logger.js'
import {
  confidenceLevels,
  gameScopes,
  knowledgeKinds,
  sourceKinds
} from '../core/domain/model.js'

const scopeSchema = z.enum(gameScopes)
const sourceKindSchema = z.enum(sourceKinds)
const knowledgeKindSchema = z.enum(knowledgeKinds)
const confidenceSchema = z.enum(confidenceLevels)
const oauthSecuritySchemes = [{ type: 'oauth2' as const, scopes: ['mcp:access'] }]

function withOAuthSecurity<T>(config: T): T & { securitySchemes: typeof oauthSecuritySchemes } {
  return {
    ...config,
    securitySchemes: oauthSecuritySchemes
  }
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  }
}

function buildInfoResult() {
  const build = getBuildInfo()
  return {
    ...build,
    nodeEnv: process.env.NODE_ENV ?? 'development'
  }
}

const serverInstructions = `
AION Context MCP is a contextual, sourced and revisable memory system for AION 2 research.
The connected AI agent remains responsible for interpretation, evidence weighing, synthesis and recommendations.

For any AION 2 question, search existing context first with aion_search_context. Inspect relevant sources and open challenges before answering.

Epistemic rules:
- A Source records material and provenance; it is not truth, a verified fact, or Knowledge by itself.
- Knowledge kinds are OBSERVATION (directly observed), CLAIM (asserted by a source or person), THEORY (an explanatory interpretation), and RECOMMENDATION (contextual advice derived from evidence and assumptions).
- Preserve applicability (game version, patch, region, class, activity, PvE/PvP and progression stage) whenever known.
- Confidence values LOW, MEDIUM, HIGH and UNKNOWN must reflect evidence strength. Do not use HIGH for plausibility alone.
- Scopes are GLOBAL, KR, TW and UNKNOWN. KR/TW evidence is not automatically GLOBAL evidence; label regional analogies, hypotheses and conditional expectations explicitly.
- When evidence conflicts with Knowledge, preserve the existing item and record a Challenge with aion_record_challenge. Never silently overwrite history.

When new material arrives, record or enqueue its Source first, preserve provenance and scope, extract only durable observations or claims, compare with existing Knowledge, then record Knowledge or a Challenge as appropriate. Do not convert an entire source into unquestioned Knowledge.

If you have admin access, a dedicated log inspection tool is available. Log entries include canonical logId values for reference; use them to inspect request flow, tool timings and failures without treating the logs as ground truth.
`.trim()

const researcherPrompt = `${serverInstructions}

Use the MCP as contextual memory, not as an oracle.
`.trim()

export interface AionMcpServerDependencies {
  principal?: McpPrincipal
  adminDiscordUserId?: string
  knowledge?: Pick<
    KnowledgeApplication,
    'searchContext' | 'getSource' | 'recordSource' | 'recordKnowledge' | 'recordChallenge' | 'listChallenges'
  >
  acquisition?: Pick<AcquisitionApplication, 'enqueueSource'>
  activity?: Pick<RecordMcpActivity, 'execute'>
}

function normalizeActivityDuration(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}

function parseAdminDiscordIds(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,]+/)
      .map(entry => entry.trim())
      .filter(Boolean)
  )
}

function isAdminMcpPrincipal(principal?: McpPrincipal, adminDiscordUserId?: string): boolean {
  if (!principal?.userId) return false
  const allowed = parseAdminDiscordIds(String(process.env.BETA_ADMIN_DISCORD_IDS ?? ''))
  if (!allowed.size) return false

  return allowed.has(adminDiscordUserId ?? principal.userId)
}

async function recordActivityBestEffort(
  activity: Pick<RecordMcpActivity, 'execute'>,
  logger: ReturnType<typeof createMcpLogger>,
  input: {
    principal: McpPrincipal
    toolName: string
    outcome: 'SUCCESS' | 'FAILURE'
    durationMs: number
  }
) {
  try {
    await activity.execute({
      principal: input.principal,
      toolName: input.toolName,
      outcome: input.outcome,
      durationMs: input.durationMs
    })
  } catch (error) {
    logger.error('mcp_activity_recording_failed', {
      toolName: input.toolName,
      outcome: input.outcome,
      ...logger.errorDetails(error)
    })
  }
}

export async function executeTrackedToolCall(
  input: {
    principal?: McpPrincipal
    activity: Pick<RecordMcpActivity, 'execute'>
    logger: ReturnType<typeof createMcpLogger>
    toolName: string
    handler: (input: any) => Promise<unknown>
    input: any
  }
): Promise<unknown> {
  const startedAt = performance.now()
  try {
    const result = await input.handler(input.input)
    if (input.principal) {
      await recordActivityBestEffort(input.activity, input.logger, {
        principal: input.principal,
        toolName: input.toolName,
        outcome: 'SUCCESS',
        durationMs: normalizeActivityDuration(startedAt)
      })
    }
    input.logger.info('mcp_tool_call_completed', {
      toolName: input.toolName,
      outcome: 'SUCCESS',
      durationMs: normalizeActivityDuration(startedAt),
      principal: input.logger.principal(input.principal)
    })
    return result
  } catch (error) {
    if (input.principal) {
      await recordActivityBestEffort(input.activity, input.logger, {
        principal: input.principal,
        toolName: input.toolName,
        outcome: 'FAILURE',
        durationMs: normalizeActivityDuration(startedAt)
      })
    }

    input.logger.warn('mcp_tool_call_failed', {
      toolName: input.toolName,
      outcome: 'FAILURE',
      durationMs: normalizeActivityDuration(startedAt),
      principal: input.logger.principal(input.principal),
      ...input.logger.errorDetails(error)
    })

    throw error
  }
}

function registerTrackedTool(
  server: McpServer,
  context: {
    principal?: McpPrincipal
    activity: Pick<RecordMcpActivity, 'execute'>
  },
  logger: ReturnType<typeof createMcpLogger>,
  name: string,
  config: any,
  handler: (input: any) => Promise<unknown>
) {
  ;(server.registerTool as any)(name, config, async (input: any) =>
    executeTrackedToolCall({
      principal: context.principal,
      activity: context.activity,
      logger,
      toolName: name,
      handler,
      input
    })
  )
}

function registerAdminOnlyTool(
  server: McpServer,
  context: {
    principal?: McpPrincipal
    adminDiscordUserId?: string
    activity: Pick<RecordMcpActivity, 'execute'>
  },
  logger: ReturnType<typeof createMcpLogger>,
  name: string,
  config: any,
  handler: (input: any) => Promise<unknown>
) {
  if (!isAdminMcpPrincipal(context.principal, context.adminDiscordUserId)) return
  registerTrackedTool(server, context, logger, name, config, handler)
}

export function createAionMcpServer(deps: AionMcpServerDependencies = {}) {
  const container = getContainer()
  const knowledge = deps.knowledge ?? container.knowledge
  const acquisition = deps.acquisition ?? container.acquisition
  const activity = deps.activity ?? container.activity
  const logger = createMcpLogger('mcp-server')
  const buildInfo = getBuildInfo()
  const server = new McpServer({
    name: 'aion-context',
    title: 'AION Context',
    version: buildInfo.version,
    description: 'Context persistence and retrieval for AION 2 research.'
  }, {
    instructions: serverInstructions
  })

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_search_context',
    withOAuthSecurity({
      title: 'Search AION context',
      description:
        'FIRST tool for an AION 2 question. Retrieves stored sources, knowledge and open challenges. The model remains responsible for interpretation.',
      inputSchema: z.object({
        query: z.string().min(1),
        scope: scopeSchema.optional(),
        limit: z.number().int().min(1).max(25).optional()
      })
    }),
    async input => jsonResult(await knowledge.searchContext(input))
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_get_source',
    withOAuthSecurity({
      title: 'Get AION source',
      description: 'Read the full stored material for one source id.',
      inputSchema: z.object({
        id: z.string().uuid()
      })
    }),
    async ({ id }) => {
      const source = await knowledge.getSource(id)
      return jsonResult(source ?? { error: 'source_not_found', id })
    }
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_record_source',
    withOAuthSecurity({
      title: 'Record AION source',
      description:
        'Persist source material or notes. This stores provenance; it does not assert that the source is correct.',
      inputSchema: z.object({
        kind: sourceKindSchema,
        url: z.string().url().nullable().optional(),
        title: z.string().min(1),
        scope: scopeSchema,
        content: z.string().optional(),
        notes: z.string().optional()
      })
    }),
    async input => jsonResult(await knowledge.recordSource(input))
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_record_knowledge',
    withOAuthSecurity({
      title: 'Record AION knowledge',
      description:
        'Persist a durable observation, claim, theory or recommendation. Link source ids whenever possible.',
      inputSchema: z.object({
        kind: knowledgeKindSchema,
        statement: z.string().min(1),
        scope: scopeSchema,
        confidence: confidenceSchema.optional(),
        applicability: z.string().optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).max(30).optional(),
        sourceIds: z.array(z.string().uuid()).max(30).optional()
      })
    }),
    async input => jsonResult(await knowledge.recordKnowledge(input))
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_record_challenge',
    withOAuthSecurity({
      title: 'Challenge AION knowledge',
      description:
        'Record contradiction, counter-evidence or a limitation against existing knowledge. Prefer this over silently replacing a conflicting item.',
      inputSchema: z.object({
        knowledgeId: z.string().uuid(),
        objection: z.string().min(1),
        sourceId: z.string().uuid().nullable().optional()
      })
    }),
    async input => jsonResult(await knowledge.recordChallenge(input))
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_list_open_challenges',
    withOAuthSecurity({
      title: 'List open AION challenges',
      description: 'List unresolved contradictions or limitations in the current knowledge base.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional()
      })
    }),
    async ({ limit }) => jsonResult(await knowledge.listChallenges('OPEN', limit ?? 50))
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_enqueue_source',
    withOAuthSecurity({
      title: 'Queue AION source acquisition',
      description:
        'Queue deterministic background acquisition of a URL. For YouTube, metadata is fetched; transcript content should be supplied separately when available.',
      inputSchema: z.object({
        url: z.string().url(),
        title: z.string().optional(),
        scope: scopeSchema,
        content: z.string().optional(),
        notes: z.string().optional()
      })
    }),
    async input => jsonResult(await acquisition.enqueueSource(input))
  )

  server.registerPrompt(
    'aion_researcher',
    {
      title: 'AION Researcher',
      description: 'Reason with the AION context store while keeping provenance and scope explicit.',
      argsSchema: z.object({
        question: z.string().min(1)
      })
    },
    ({ question }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `${researcherPrompt}\n\nQuestion:\n${question}`
          }
        }
      ]
    })
  )

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
    logger,
    'aion_get_server_info',
    withOAuthSecurity({
      title: 'Get AION server info',
      description: 'Inspect the deployed MCP version, release tag and commit metadata.',
      inputSchema: z.object({})
    }),
    async () => jsonResult(buildInfoResult())
  )

  registerAdminOnlyTool(
    server,
    { principal: deps.principal, adminDiscordUserId: deps.adminDiscordUserId, activity },
    logger,
    'aion_read_mcp_logs',
    withOAuthSecurity({
      title: 'Read MCP logs',
      description:
        'ADMIN ONLY. List daily log files, inspect one file, or look up an event by canonical logId. Use this to analyze MCP request flow, timings and failures.',
      inputSchema: z.object({
        fileName: z.string().trim().optional(),
        logId: z.string().trim().optional(),
        limit: z.number().int().min(1).max(500).optional()
      })
    }),
    async input => {
      const fileName = typeof input?.fileName === 'string' ? input.fileName.trim() : ''
      const logId = typeof input?.logId === 'string' ? input.logId.trim() : ''
      const limit = typeof input?.limit === 'number' ? Math.max(1, Math.min(500, Math.round(input.limit))) : 100

      if (logId) {
        const match = await findMcpLogEntry(logId)
        return jsonResult(
          match
            ? {
                mode: 'ENTRY',
                match,
                limit
              }
            : {
                mode: 'ENTRY',
                match: null,
                limit,
                error: 'log_entry_not_found',
                logId
              }
        )
      }

      if (fileName) {
        const entries = await readMcpLogFileEntries(fileName)
        const slice = entries.slice(Math.max(0, entries.length - limit))
        return jsonResult({
          mode: 'FILE',
          fileName,
          count: entries.length,
          returned: slice.length,
          entries: slice,
          truncated: slice.length < entries.length
        })
      }

      return jsonResult({
        mode: 'LIST',
        files: await listMcpLogFiles('/api/admin/mcp-logs')
      })
    }
  )

  return server
}
