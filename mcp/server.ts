import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { AcquisitionApplication } from '../core/application/AcquisitionApplication.js'
import { KnowledgeApplication } from '../core/application/KnowledgeApplication.js'
import { RecordMcpActivity } from '../core/application/RecordMcpActivity.js'
import type { McpPrincipal } from '../core/application/McpPrincipal.js'
import { getContainer } from '../infrastructure/container.js'
import { getBuildInfo } from '../infrastructure/version.js'
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

const researcherPrompt = `
You are the reasoning layer for AION 2 research.

Use the MCP as contextual memory, not as an oracle.

Rules:
- Search context first.
- Distinguish GLOBAL / TW / KR / UNKNOWN.
- Never silently generalize TW/KR information to Global.
- Separate OBSERVATION, CLAIM, THEORY and RECOMMENDATION.
- Prefer source-linked knowledge.
- If information conflicts, record a challenge instead of overwriting history.
- Persist only durable, useful knowledge.
- If evidence is insufficient, search again or state what is missing.
`.trim()

export interface AionMcpServerDependencies {
  principal?: McpPrincipal
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

async function recordActivityBestEffort(
  activity: Pick<RecordMcpActivity, 'execute'>,
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
    console.error('MCP activity recording failed', {
      toolName: input.toolName,
      outcome: input.outcome,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

function registerTrackedTool(
  server: McpServer,
  context: {
    principal?: McpPrincipal
    activity: Pick<RecordMcpActivity, 'execute'>
  },
  name: string,
  config: any,
  handler: (input: any) => Promise<unknown>
) {
  ;(server.registerTool as any)(name, config, async (input: any) => {
    const startedAt = performance.now()
    try {
      const result = await handler(input)
      if (context.principal) {
        await recordActivityBestEffort(context.activity, {
          principal: context.principal,
          toolName: name,
          outcome: 'SUCCESS',
          durationMs: normalizeActivityDuration(startedAt)
        })
      }
      return result
    } catch (error) {
      if (context.principal) {
        await recordActivityBestEffort(context.activity, {
          principal: context.principal,
          toolName: name,
          outcome: 'FAILURE',
          durationMs: normalizeActivityDuration(startedAt)
        })
      }

      throw error
    }
  })
}

export function createAionMcpServer(deps: AionMcpServerDependencies = {}) {
  const container = getContainer()
  const knowledge = deps.knowledge ?? container.knowledge
  const acquisition = deps.acquisition ?? container.acquisition
  const activity = deps.activity ?? container.activity
  const buildInfo = getBuildInfo()
  const server = new McpServer({
    name: 'aion-context',
    title: 'AION Context',
    version: buildInfo.version,
    description: 'Context persistence and retrieval for AION 2 research.'
  })

  registerTrackedTool(
    server,
    { principal: deps.principal, activity },
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
    'aion_get_server_info',
    withOAuthSecurity({
      title: 'Get AION server info',
      description: 'Inspect the deployed MCP version, release tag and commit metadata.',
      inputSchema: z.object({})
    }),
    async () => jsonResult(buildInfoResult())
  )

  return server
}
