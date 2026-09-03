import { describe, expect, it } from 'vitest'
import { KnowledgeApplication } from '../core/application/KnowledgeApplication.js'
import { InMemoryKnowledgeStore } from './InMemoryKnowledgeStore.js'

describe('KnowledgeApplication', () => {
  it('records a source without adding domain ceremony', async () => {
    const store = new InMemoryKnowledgeStore()
    const app = new KnowledgeApplication(store)

    const source = await app.recordSource({
      kind: 'YOUTUBE',
      url: 'https://youtube.com/watch?v=test',
      title: 'AION 2 gearing',
      scope: 'TW',
      content: 'ILVL and CP are different signals.'
    })

    expect(source.id).toBeTruthy()
    expect(source.scope).toBe('TW')
    expect(store.sources).toHaveLength(1)
  })

  it('deduplicates tags and source links when recording knowledge', async () => {
    const store = new InMemoryKnowledgeStore()
    const app = new KnowledgeApplication(store)
    const source = await app.recordSource({
      kind: 'MANUAL',
      title: 'Notes',
      scope: 'TW'
    })

    const knowledge = await app.recordKnowledge({
      kind: 'OBSERVATION',
      statement: 'ILVL is not the same thing as CP.',
      scope: 'TW',
      tags: ['gear', 'gear', ' progression '],
      sourceIds: [source.id, source.id]
    })

    expect(knowledge.tags).toEqual(['gear', 'progression'])
    expect(knowledge.sourceIds).toEqual([source.id])
  })

  it('records a challenge instead of deleting conflicting knowledge', async () => {
    const store = new InMemoryKnowledgeStore()
    const app = new KnowledgeApplication(store)

    const knowledge = await app.recordKnowledge({
      kind: 'THEORY',
      statement: 'A theory to challenge',
      scope: 'GLOBAL'
    })

    const challenge = await app.recordChallenge({
      knowledgeId: knowledge.id,
      objection: 'A newer source contradicts this.'
    })

    expect(challenge.status).toBe('OPEN')
    expect(store.knowledge[0]?.status).toBe('CHALLENGED')
    expect(store.knowledge).toHaveLength(1)
  })

  it('returns open challenges together with retrieved context', async () => {
    const store = new InMemoryKnowledgeStore()
    const app = new KnowledgeApplication(store)

    const item = await app.recordKnowledge({
      kind: 'CLAIM',
      statement: 'Combat Power predicts every damage outcome.',
      scope: 'TW'
    })

    await app.recordChallenge({
      knowledgeId: item.id,
      objection: 'CP is an aggregate and is not equivalent to real DPS.'
    })

    const context = await app.searchContext({
      query: 'Combat Power',
      scope: 'TW'
    })

    expect(context.knowledge).toHaveLength(1)
    expect(context.openChallenges).toHaveLength(1)
  })
})
