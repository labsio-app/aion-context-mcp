import type { GameScope } from '../domain/model.js'
import type { AcquisitionJob, AcquisitionQueue } from './ports.js'

export class AcquisitionApplication {
  constructor(private readonly queue: AcquisitionQueue) {}

  enqueueSource(input: {
    url: string
    title?: string
    scope: GameScope
    content?: string
    notes?: string
  }): Promise<AcquisitionJob> {
    return this.queue.enqueue({
      url: input.url.trim(),
      title: input.title?.trim() || undefined,
      scope: input.scope,
      content: input.content?.trim() || undefined,
      notes: input.notes?.trim() || undefined
    })
  }
}
