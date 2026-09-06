# SPIKE: MCP_AUTH_COMPATIBILITY
STATUS: BLOCKED

## Current implementation

- The public MCP endpoint is streamable HTTP at `/mcp`, and every request is gated by `authenticateMcpRequest()` before the tool handler runs. See [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts) and [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts).
- The server implements OAuth 2.1 authorization-code + PKCE with discovery:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`
  - `/.well-known/openid-configuration`
- The metadata advertises:
  - `authorization_response_iss_parameter_supported: true`
  - `client_id_metadata_document_supported: true`
  - `token_endpoint_auth_methods_supported: ['none']`
  - `grant_types_supported: ['authorization_code']`
  - `code_challenge_methods_supported: ['S256']`
- Access tokens are self-issued JWT bearer tokens signed with `MCP_OAUTH_JWT_SECRET`, with a 30-day expiry and no refresh-token path.
- The browser session cookie `aion_mcp_session` is only for the authorize UI. It is not used as MCP credentials.
- Discord OAuth remains human identity only. Nothing from Discord is injected into MCP tool context or MCP bearer validation.

## Compatibility matrix

| Client | Remote HTTP | OAuth MCP | Static Bearer | Write tools | Confidence |
|---|---|---|---|---|---|
| ChatGPT | Yes | Yes | No documented user-facing static bearer path | Yes, with confirmation prompts in supported plans | High |
| Codex | Yes | Yes | Yes, via CLI bearer/header configuration | Yes, with confirmation prompts | High |
| T3 Code | Partial / indirect | Not proven as a first-class public flow | Partial in adapter paths, but not a guaranteed generic MCP mode | Unknown | Low |
| Claude / Claude Code | Yes | Yes | Yes, via explicit `Authorization: Bearer ...` header | Yes, with confirmation and retry behavior | High |
| Generic MCP HTTP client | Yes, if it implements streamable HTTP | Yes, if it implements MCP/OAuth discovery | Client-dependent | Client-dependent | High |

Limitations:

- `T3 Code` is the only target whose public evidence is indirect. The official repo shows remote access and MCP URL plumbing, but the documented path is not a stable end-user MCP auth contract. Treat it as low confidence until the exact provider path is confirmed.
- Static bearer support is not a protocol guarantee. It exists only when a client exposes custom header configuration.
- ChatGPT write support is beta and web-only in the official docs.

## Findings by client

### ChatGPT

- Official OpenAI docs show remote MCP over public HTTPS streamable HTTP and OAuth 2.1 + PKCE discovery flow.
- The current server matches the expected discovery and bearer validation pattern.
- Official docs describe write/modify MCP support, but with user confirmation and plan/web restrictions.
- I did not find an official ChatGPT UI flow for configuring a raw personal bearer token on a remote MCP server.

Sources:

- https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

### Codex

- Official Codex docs support streamable HTTP remote MCP, OAuth login, and static bearer/header configuration.
- Codex explicitly documents CIMD support and fallback behavior around OAuth metadata.
- The current server is compatible with the documented OAuth path: protected resource metadata, authorization-server metadata, `none` client auth, PKCE S256, and issuer parameter support.

Sources:

- https://developers.openai.com/codex/mcp
- https://learn.chatgpt.com/docs/developer-commands
- https://learn.chatgpt.com/docs/config-file/config-reference

### T3 Code

- T3 Code is not documented as a standalone MCP auth client in a way comparable to ChatGPT, Codex, or Claude.
- The official repo shows remote access plumbing and an MCP URL being merged into agent sessions, but the visible evidence is indirect and provider-specific.
- One repo issue suggests HTTP-only MCP plugin plumbing and explicitly says there are no headers in that path, which makes bearer-based assumptions risky.
- I cannot certify first-class OAuth MCP compatibility for T3 Code from the currently available official material.

Sources:

- https://github.com/pingdotgg/t3code
- https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md
- https://github.com/pingdotgg/t3code/issues/6419

### Claude

- Official Anthropic docs show remote MCP over HTTP and support for bearer headers in the client configuration path.
- Claude Code documentation shows OAuth support, OAuth discovery handling, and automatic refresh/retry behavior on 401 in the documented flow.
- The current server should work with the documented OAuth path and with a static bearer header path if the client is configured that way.

Sources:

- https://docs.anthropic.com/en/docs/claude-code/mcp
- https://docs.anthropic.com/en/docs/agents-and-tools/remote-mcp-servers
- https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector
- https://code.claude.com/docs/ja/mcp
- https://code.claude.com/docs/zh-TW/mcp

### Generic MCP HTTP

- The MCP spec requires HTTP-based transports to use the authorization metadata and OAuth discovery model.
- The spec expects protected resource metadata, OAuth 2.1, PKCE, and either CIMD or pre-registration, with DCR only as backward compatibility.
- A generic client can send a bearer token only if it has a header injection mechanism. That is a client feature, not a separate MCP auth protocol.

Sources:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/draft/basic/authorization/client-registration
- https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

## Gaps in current implementation

- The current OAuth access token is stateless and not tied to BetaAccess status on every request. A token issued while APPROVED can remain valid until expiry even after REVOKED or delete-account unless the server adds a revocation-aware lookup.
- There is no personal MCP token issuance or revocation path yet.
- There is no refresh-token or offline-access story.
- T3 Code support is not proven well enough to treat as a release-safe first-class client without extra confirmation.
- The current design is compatible with OAuth clients, but not yet with the requirement that REVOKED must stop all MCP access immediately.

## Options

### A — OAuth only

Pros:

- Best match for the MCP authorization spec.
- Matches the documented flows for ChatGPT, Codex, Claude, and generic HTTP MCP clients.
- Minimizes credential surface area.

Cons:

- Must add revocation-aware credential handling to satisfy beta lifecycle requirements.
- Does not help if a hard target client cannot do OAuth login at all.

### B — Personal Bearer only

Pros:

- Simple for clients that can only inject static headers.
- No browser OAuth round-trip.

Cons:

- Not aligned with the documented primary flow for ChatGPT/Codex/Claude.
- Worse revocation story and higher replay risk.
- Expands secret handling without solving the revocation requirement by itself.

### C — Dual

Pros:

- Covers OAuth-capable clients and header-only clients.
- Gives an escape hatch if one target client cannot complete OAuth.

Cons:

- Two credential classes to issue, store, revoke, and audit.
- More support burden and more ambiguity around which mode a user should choose.
- Still needs a revocation model for both credential types.

## Recommendation

Primary recommendation: OAuth only, but with a revocation-aware credential adapter in front of MCP tools.

Rationale:

- The documented client set is already OAuth-compatible except for T3 Code, whose public evidence is too indirect to justify a bearer-first design.
- The beta lifecycle requirement is stricter than the current JWT implementation: `REVOKED` must invalidate access immediately.
- A single OAuth model keeps the system aligned with the MCP spec and with the major vendor docs.
- Personal bearer tokens should stay out of scope unless a real, documented client gap appears.

## Proposed target architecture

```text
Approved user
  ↓
Discord HumanIdentity
  ↓
BetaAccess gate
  ↓
Authentication adapter
  - OAuth 2.1 + PKCE for OAuth-capable clients
  - optional static bearer only if a hard client gap is proven later
  ↓
Credential registry / revocation check
  ↓
McpPrincipal
  - userId
  - credentialId
  - authenticationMethod
  - accessStatus
  ↓
MCP tools
```

Behavioral rule:

- `APPROVED` creates or activates MCP credentials.
- `REVOKED` and delete-account invalidate every credential immediately.
- Discord identity never enters tool payloads or MCP claims.

## Impact on planned US

US-005:

- Should assume OAuth-only connection UX unless a client gap is proven.

US-006:

- Must include credential revocation and deletion invalidation, not just token expiry.

US-009:

- Should use the discovery-based MCP OAuth flow, not a hardcoded bearer secret.

US-010:

- If this is the T3 Code integration story, it needs explicit owner confirmation on the exact provider path before launch.

US-007/008:

- Keep Discord identity isolated from MCP authorization and tool context.

## Decisions requiring owner arbitration

- Is T3 Code a release-blocking first-class client, or only an indirect path through underlying provider adapters?
- Do we require immediate revocation through server-side credential state, or is token expiry alone acceptable? The beta lifecycle requirement says expiry alone is not enough.
- Do we want to add a personal bearer-token mode at all, or keep the auth surface OAuth-only until a documented client gap appears?

## Sources

### Local implementation

- [README.md](/home/mco/projects/aion-context-mcp/README.md)
- [mcp/index.ts](/home/mco/projects/aion-context-mcp/mcp/index.ts)
- [mcp/oauth.ts](/home/mco/projects/aion-context-mcp/mcp/oauth.ts)
- [mcp/server.ts](/home/mco/projects/aion-context-mcp/mcp/server.ts)
- [migrations/002_oauth.sql](/home/mco/projects/aion-context-mcp/migrations/002_oauth.sql)
- [server/lib/discord-beta.ts](/home/mco/projects/aion-context-mcp/server/lib/discord-beta.ts)
- [test/oauth.test.ts](/home/mco/projects/aion-context-mcp/test/oauth.test.ts)

### Official external sources

- https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
- https://developers.openai.com/codex/mcp
- https://learn.chatgpt.com/docs/developer-commands
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://docs.anthropic.com/en/docs/claude-code/mcp
- https://docs.anthropic.com/en/docs/agents-and-tools/remote-mcp-servers
- https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector
- https://code.claude.com/docs/ja/mcp
- https://code.claude.com/docs/zh-TW/mcp
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/draft/basic/authorization/client-registration
- https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://github.com/pingdotgg/t3code
- https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md
- https://github.com/pingdotgg/t3code/issues/6419
