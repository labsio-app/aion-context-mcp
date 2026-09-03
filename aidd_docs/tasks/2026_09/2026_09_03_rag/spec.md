# AION 2 RAG Contract

## Target

Allow AION Context MCP to answer AION 2 questions from the corpus of stored references with traceable provenance, explicit scope, and no silent invention.

## Hard constraints

- Every answer must be grounded in retrievable source material from the AION 2 corpus.
- Every answer must preserve applicability explicitly as `GLOBAL`, `TW`, `KR`, or `UNKNOWN`.
- Every derived statement must remain distinguishable as `OBSERVATION`, `CLAIM`, `THEORY`, or `RECOMMENDATION`.
- When the evidence is insufficient, the system must say so instead of filling gaps with guesswork.
- When sources conflict, the system must surface the conflict instead of collapsing it into a single unsupported conclusion.
- The corpus remains the canonical source of truth; derived summaries cannot override it.

## Non-goals

- Building a full agent framework.
- Replacing human or model judgment with an automated truth engine.
- Introducing a requirement for any specific index, embedding, storage, or orchestration technology.
- Normalizing all corpus material into one synthetic answer without preserving provenance.

## Done-when

- A user can ask a question and receive an answer that names the applicable scope and points back to the supporting corpus.
- A user can inspect the answer and identify which source documents or sections support each material point.
- A question with no relevant evidence yields an explicit absence-of-evidence response instead of a fabricated answer.
- A question with contradictory evidence yields both sides of the conflict and an explicit note that the corpus disagrees.
- Updated corpus material is reflected in future answers without losing the older evidence trail.

## Stakeholders

- Decider: project owner
- Owner: AION Context MCP maintainer
- Consumer: ChatGPT or any other MCP host using the corpus

## Context

Relevant source material already exists in [`references/`](../../../../references/README.md) and the business summary lives in [`docs/metier.md`](../../../../docs/metier.md).

The corpus includes a consolidated dossier, a source registry, a Global Launch dossier, a theorycraft dossier, and a classes/PvP dossier. These are source artifacts, not derived outputs.
