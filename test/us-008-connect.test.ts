import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  AION_MCP_AUTH,
  AION_MCP_CONNECT_CONTEXT,
  AION_MCP_CONNECT_FLOW,
  AION_MCP_CONNECT_NOTE,
  AION_MCP_ENDPOINT,
  clientGuides
} from '../app/lib/client-guides.js'

describe('US-008 verified MCP client connection guides', () => {
  it('documents the verified client matrix and preserves the stable AION MCP contract', async () => {
    const appSource = await readFile(new URL('../app/pages/app.vue', import.meta.url), 'utf8')
    const docsSource = await readFile(new URL('../docs/client-compatibility.md', import.meta.url), 'utf8')
    const guideSource = await readFile(new URL('../app/lib/client-guides.ts', import.meta.url), 'utf8')

    expect(AION_MCP_ENDPOINT).toBe('https://aion-mcp.labsio.app/mcp')
    expect(AION_MCP_AUTH).toBe('OAuth 2.1 + PKCE')

    expect(clientGuides.map(guide => guide.name)).toEqual([
      'ChatGPT',
      'Codex',
      'Claude Code',
      'Generic MCP',
      'T3 Code'
    ])
    expect(clientGuides.find(guide => guide.id === 'chatgpt')?.status).toBe('VERIFIED')
    expect(clientGuides.find(guide => guide.id === 'codex')?.status).toBe('VERIFIED')
    expect(clientGuides.find(guide => guide.id === 'claude-code')?.status).toBe('VERIFIED')
    expect(clientGuides.find(guide => guide.id === 'generic-mcp')?.status).toBe('VERIFIED')
    expect(clientGuides.find(guide => guide.id === 't3-code')?.status).toBe('NOT VERIFIED')

    expect(AION_MCP_CONNECT_FLOW).toEqual([
      'Add AION MCP to your compatible AI client.',
      'Use https://aion-mcp.labsio.app/mcp as the remote MCP endpoint.',
      'Complete OAuth authorization in the browser.',
      'Return to the client.',
      'Verify the connection with aion_search_context.'
    ])
    expect(AION_MCP_CONNECT_NOTE).toContain('private beta access is still APPROVED')
    expect(AION_MCP_CONNECT_CONTEXT).toContain('use your Discord identity')

    expect(appSource).toContain('Verified MCP client guides.')
    expect(appSource).toContain('AION_MCP_CONNECT_NOTE')
    expect(appSource).toContain('AION_MCP_CONNECT_CONTEXT')
    expect(appSource).toContain('copyEndpoint')
    expect(appSource).toContain('ClientGuideCard')
    expect(appSource).toContain('guide-tabs')
    expect(appSource).toContain('guide-grid')
    expect(appSource).toContain('overflow-wrap: anywhere')
    expect(appSource).toContain('grid-template-columns: 1fr;')

    expect(guideSource).toContain("status: 'VERIFIED'")
    expect(guideSource).toContain("status: 'NOT VERIFIED'")
    expect(guideSource).toContain('https://developers.openai.com/api/docs/guides/developer-mode')
    expect(guideSource).toContain('https://learn.chatgpt.com/docs/extend/mcp?surface=cli')
    expect(guideSource).toContain('https://code.claude.com/docs/en/mcp')
    expect(guideSource).toContain('https://github.com/pingdotgg/t3code')
    expect(guideSource).not.toContain('sample JWT')
    expect(guideSource).not.toContain('Discord access token')
    expect(guideSource).not.toContain('refresh token')

    expect(docsSource).toContain('## ChatGPT')
    expect(docsSource).toContain('## Codex')
    expect(docsSource).toContain('## Claude Code')
    expect(docsSource).toContain('## Generic MCP')
    expect(docsSource).toContain('## T3 Code')
    expect(docsSource).toContain('Status: VERIFIED')
    expect(docsSource).toContain('Status: NOT VERIFIED')
    expect(docsSource).toContain('Verified on: 2026-09-05')
    expect(docsSource).toContain('https://aion-mcp.labsio.app/mcp')
    expect(docsSource).toContain('Private beta access must already be APPROVED')
    expect(docsSource).toContain('If AION MCP asks you to sign in during authorization, use your Discord identity.')
    expect(docsSource).toContain('https://developers.openai.com/api/docs/guides/developer-mode')
    expect(docsSource).toContain('https://learn.chatgpt.com/docs/extend/mcp')
    expect(docsSource).toContain('https://code.claude.com/docs/en/mcp')
    expect(docsSource).toContain('https://developers.openai.com/api/docs/mcp')
    expect(docsSource).toContain('https://github.com/pingdotgg/t3code')
    expect(docsSource).not.toContain('sample JWT')
    expect(docsSource).not.toContain('Discord access token')
    expect(docsSource).not.toContain('refresh token')
  })
})
