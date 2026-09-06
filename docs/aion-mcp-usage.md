# AION Context MCP usage

## What it is

AION Context MCP is a contextual and revisable knowledge service for AION 2. It stores sources, structured knowledge, applicability, confidence, provenance and challenges. It does not decide what is true: the connected AI agent remains responsible for interpretation and synthesis.

## Agent workflow

### Questions

For every AION 2 question:

1. Search existing context with `aion_search_context` first.
2. Inspect relevant sources with `aion_get_source` when provenance or details matter.
3. Check `aion_list_open_challenges` before presenting a conclusion.
4. Reason over the evidence and state scope, applicability and confidence.
5. Keep observations, claims, theories and recommendations distinct.

For Global inference, use GLOBAL evidence first. If it is unavailable, KR/TW evidence may support an explicitly labelled analogy, hypothesis or conditional expectation; it must never be silently promoted to a GLOBAL fact. If neither is available, state the uncertainty.

### Source ingestion

When a user provides a URL, transcript or note:

1. Record it with `aion_record_source`, or queue a URL with `aion_enqueue_source`.
2. Preserve provenance and classify the scope as `GLOBAL`, `KR`, `TW` or `UNKNOWN`.
3. Extract durable observations or claims instead of converting the whole source into truth.
4. Search related context before recording new Knowledge.
5. Record Knowledge only when the statement, kind, applicability and confidence are clear.
6. If it conflicts with existing Knowledge, record a Challenge with `aion_record_challenge`; do not overwrite the older item.

### Epistemic vocabulary

- `OBSERVATION`: directly observed in a source, client, test or dataset.
- `CLAIM`: asserted by a source or person and not independently established.
- `THEORY`: an explanatory interpretation built from available evidence.
- `RECOMMENDATION`: contextual advice derived from evidence and assumptions.

Scopes are `GLOBAL`, `KR`, `TW` and `UNKNOWN`. Confidence is `LOW`, `MEDIUM`, `HIGH` or `UNKNOWN`; confidence should reflect evidence strength, not how plausible a sentence sounds. Applicability should retain patch, game version, class, activity, PvE/PvP and progression stage when known.

## User examples

### Ask a question

> What do we currently know about Cleric PvE for AION 2 Global? Separate confirmed Global information, KR information, TW information, theories, recommendations and open contradictions. Do not automatically transpose KR/TW mechanics to Global.

### Record a source

> Record this TW source: `https://example.com/source`. It explains the different sources of Combat Power.

### Compare new evidence

> Does this new source contradict anything we currently have about Cleric? If so, preserve the previous knowledge and record the contradiction.

### Queue a source for later acquisition

> Add this URL to the AION 2 corpus and classify it as GLOBAL: `https://example.com/source`.

## Responsibility split

The MCP persists and retrieves context, provenance, classifications and challenges. The agent decides what is relevant, weighs evidence, explains uncertainty and derives recommendations. Deterministic acquisition is handled by the worker; subjective reasoning does not move into storage infrastructure.
