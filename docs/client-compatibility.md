# AION MCP Client Compatibility

## ChatGPT
Status: VERIFIED

Verified on: 2026-09-05

Official source(s):
- ChatGPT developer mode
  - https://developers.openai.com/api/docs/guides/developer-mode
- Connect and test your plugin
  - https://developers.openai.com/plugins/deploy/connect-chatgpt
- ChatGPT apps and connectors
  - https://learn.chatgpt.com/docs/enterprise/apps-and-connectors

Transport:
- Streaming HTTP remote MCP

Authentication:
- OAuth 2.1 + PKCE
- Developer-mode apps complete OAuth during connection setup

Prerequisites:
- Private beta access must already be APPROVED to use the portal.

Notes:
- If AION MCP asks you to sign in during authorization, use your Discord identity.

Read tools:
- Supported

Write tools:
- Supported in developer mode

Plan/version restrictions:
- Web availability is documented for Pro, Plus, Business, Enterprise, and Education accounts
- Workspace controls can still narrow which tools are usable

Known limitations:
- This is a developer-mode workflow, not a local MCP server workflow
- Managed workspaces can restrict app actions

Exact connection procedure:
1. Add AION MCP to a compatible AI client.
2. Use `https://aion-mcp.labsio.app/mcp` as the remote MCP endpoint.
3. Complete OAuth authorization in the browser.
4. Return to the client.
5. Verify the connection with `aion_search_context`.

## Codex
Status: VERIFIED

Verified on: 2026-09-05

Official source(s):
- Model Context Protocol
  - https://learn.chatgpt.com/docs/extend/mcp
- Configuration Reference
  - https://learn.chatgpt.com/docs/config-file/config-reference

Transport:
- Streamable HTTP

Authentication:
- OAuth 2.1 + PKCE
- `codex mcp login <server-name>` starts the OAuth flow

Read tools:
- Supported

Write tools:
- Supported

Plan/version restrictions:
- Remote servers are configured in `~/.codex/config.toml` or `.codex/config.toml`
- OAuth servers may require explicit login even after a server entry exists

Known limitations:
- If no credential source resolves, Codex can connect without authentication only when the server allows it
- Static bearer tokens are not the recommended AION MCP path

Exact connection procedure:
1. Add the server with a remote HTTP URL in Codex config.
2. Run `codex mcp login <server-name>` if OAuth is required.
3. Confirm the server appears in `codex mcp list`.
4. Verify `aion_search_context` is available.

## Claude Code
Status: VERIFIED

Verified on: 2026-09-05

Official source(s):
- Connect Claude Code to tools via MCP
  - https://code.claude.com/docs/en/mcp
- Claude Code CLI reference
  - https://code.claude.com/docs/en/claude-code/cli-reference
- Claude Code release notes
  - https://code.claude.com/docs/en/whats-new/2026-w26

Transport:
- Remote HTTP MCP

Authentication:
- OAuth 2.1 + PKCE
- `/mcp` or `claude mcp login <name>` completes the browser OAuth flow

Read tools:
- Supported

Write tools:
- Supported

Plan/version restrictions:
- HTTP is the recommended transport for remote MCP servers
- SSE is deprecated where HTTP is available

Known limitations:
- Non-interactive sessions cannot complete the OAuth browser flow
- Manually configured `headers.Authorization` can block OAuth fallback

Notes:
- If AION MCP asks you to sign in during authorization, use your Discord identity.

Exact connection procedure:
1. Add the remote server with `claude mcp add --transport http`.
2. Open Claude Code and run `/mcp`.
3. Complete OAuth in the browser.
4. Or run `claude mcp login <name>` from the shell.
5. Verify `aion_search_context` is exposed.

## Generic MCP
Status: VERIFIED

Verified on: 2026-09-05

Official source(s):
- MCP server
  - https://developers.openai.com/api/docs/mcp
- Authentication
  - https://developers.openai.com/plugins/build/auth

Transport:
- Remote streamable HTTP

Authentication:
- OAuth 2.1 + PKCE
- Protected-resource discovery and authorization-code support are required by the client

Read tools:
- Supported when the client can discover and list tools

Write tools:
- Supported when the client can invoke authenticated tools

Plan/version restrictions:
- No universal JSON config exists across all clients
- Use the client’s own MCP settings

Known limitations:
- Clients that only support local stdio or static bearer tokens are not compatible with this portal path

Notes:
- If AION MCP asks you to sign in during authorization, use your Discord identity.

Exact connection procedure:
1. Point the client at `https://aion-mcp.labsio.app/mcp`.
2. Complete OAuth 2.1 + PKCE.
3. Verify the tool list.
4. Call `aion_search_context`.

## T3 Code
Status: NOT VERIFIED

Verified on: 2026-09-05

Official source(s):
- T3 Code
  - https://github.com/pingdotgg/t3code
- AGENTS.md
  - https://github.com/pingdotgg/t3code/blob/main/AGENTS.md

Transport:
- Not verified

Authentication:
- Not verified

Read tools:
- Not verified

Write tools:
- Not verified

Plan/version restrictions:
- Not currently verified for AION MCP

Known limitations:
- The public repository documents T3 Code as an agent control surface, but not a verified AION MCP OAuth connection path

Exact connection procedure:
- Not verified. Use a verified MCP client instead.
