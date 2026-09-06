# Review: US-008 · Verified MCP Client Connection Guides

- **Verdict**: REWORK REQUIRED
- **Diff**: working tree
- **Axes run**: code, functional, relevancy
- **Date**: 2026-09-05
- **Findings**: 0 critical, 2 warning, 0 minor

## Phases

Not run.

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | --- | --- | --- | --- | --- |
| warning | code | - | [app/pages/app.vue](/home/mco/projects/aion-context-mcp/app/pages/app.vue#L819), [app/pages/app.vue](/home/mco/projects/aion-context-mcp/app/pages/app.vue#L897), [app/components/ClientGuideCard.vue](/home/mco/projects/aion-context-mcp/app/components/ClientGuideCard.vue#L99), [app/components/ClientGuideCard.vue](/home/mco/projects/aion-context-mcp/app/components/ClientGuideCard.vue#L140), [.artifacts/us-008/06-connect-mobile.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/06-connect-mobile.png) | Connect breaks the mobile readability requirement: the guide grid stays two columns below 900px, and the cards' flow text and chips become cramped or clipped. | Add a narrow-screen breakpoint that collapses the guide grid to one column and reflows the card contents so the Connect section remains readable on mobile. |
| warning | conform | - | [app/lib/client-guides.ts](/home/mco/projects/aion-context-mcp/app/lib/client-guides.ts#L4), [app/lib/client-guides.ts](/home/mco/projects/aion-context-mcp/app/lib/client-guides.ts#L37), [app/pages/app.vue](/home/mco/projects/aion-context-mcp/app/pages/app.vue#L410) | The Connect summary mixes MCP connection steps with portal-only Discord/beta gating. That makes the section read as if Discord login is part of client connection, which is misleading relative to the verified client docs and the requested concise Connect UX. | Split portal access from client connection guidance and keep Connect focused on endpoint, auth, client steps, verification, and troubleshooting. |

## Verification

| Metric        | Value |
| ------------- | ----- |
| Verified      | 10/12 |
| Files checked | [docs/client-compatibility.md](/home/mco/projects/aion-context-mcp/docs/client-compatibility.md), [app/lib/client-guides.ts](/home/mco/projects/aion-context-mcp/app/lib/client-guides.ts), [app/pages/app.vue](/home/mco/projects/aion-context-mcp/app/pages/app.vue), [app/components/ClientGuideCard.vue](/home/mco/projects/aion-context-mcp/app/components/ClientGuideCard.vue), [test/us-008-connect.test.ts](/home/mco/projects/aion-context-mcp/test/us-008-connect.test.ts), [test/us-007-portal.test.ts](/home/mco/projects/aion-context-mcp/test/us-007-portal.test.ts), [.artifacts/us-008/01-chatgpt.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/01-chatgpt.png), [.artifacts/us-008/02-codex.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/02-codex.png), [.artifacts/us-008/03-claude-code.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/03-claude-code.png), [.artifacts/us-008/04-generic-mcp.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/04-generic-mcp.png), [.artifacts/us-008/05-t3-status.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/05-t3-status.png), [.artifacts/us-008/06-connect-mobile.png](/home/mco/projects/aion-context-mcp/.artifacts/us-008/06-connect-mobile.png) |
| Unchecked     | none |
| Unplanned     | none |
