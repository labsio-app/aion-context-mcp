US: US-002
VERDICT: REWORK REQUIRED

Acceptance criteria:
- Authenticated boundary: PASS
- Server validation: PASS
- Persistence: FAIL
- Duplicate invariant: FAIL
- Pending reload: PASS
- Architecture: PASS
- Security: FAIL
- Scope: PASS
- Tests: PASS
- UX proof: PASS

Findings:
- severity: HIGH
  issue: Concurrent duplicate beta submissions can still surface as an uncontrolled HTTP 500.
  evidence: `BetaAccessApplication.requestBetaAccess()` checks for an active request before insert, but `PostgresBetaAccessStore.saveBetaAccessRequest()` performs a plain insert into `beta_access_requests`, and `server/lib/beta-access.ts` only catches `ZodError`. The migration adds a unique index on active requests, so two concurrent POSTs can race past the pre-check and let a uniqueness violation bubble out as a 500 instead of a controlled duplicate response.
  required action: Catch and translate the database uniqueness violation at the application/adapter boundary, then add a regression test that forces the conflict path and asserts the controlled duplicate response.

Quality gates:
- `npm test -- --run test/beta-access.test.ts test/discord-beta.test.ts`: pass
- `npm test`: pass
- `npm run typecheck`: pass
- `npm run build`: pass
- `git diff --check`: pass

Screenshots:
- Authenticated form: [/tmp/us002-form.png](/tmp/us002-form.png)
- Pending state: [/tmp/us002-pending.png](/tmp/us002-pending.png)

Final rationale:
- The happy path, server validation, and pending reload are implemented and proven, but the active-request invariant is not race-safe. Because the database uniqueness violation is still uncaught, the feature can fail as a 500 under concurrent duplicate submissions. That blocks acceptance.
