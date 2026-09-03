import { KnowledgeApplication } from '../core/application/KnowledgeApplication.js'
import { AcquisitionApplication } from '../core/application/AcquisitionApplication.js'
import { getPool } from './postgres/pool.js'
import { PostgresKnowledgeStore } from './postgres/PostgresKnowledgeStore.js'
import { PostgresAcquisitionQueue } from './postgres/PostgresAcquisitionQueue.js'

let container:
  | {
      knowledge: KnowledgeApplication
      acquisition: AcquisitionApplication
      queue: PostgresAcquisitionQueue
    }
  | undefined

export function getContainer() {
  if (!container) {
    const pool = getPool()
    const store = new PostgresKnowledgeStore(pool)
    const queue = new PostgresAcquisitionQueue(pool)

    container = {
      knowledge: new KnowledgeApplication(store),
      acquisition: new AcquisitionApplication(queue),
      queue
    }
  }

  return container
}
