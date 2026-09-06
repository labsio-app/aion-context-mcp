import { KnowledgeApplication } from '../core/application/KnowledgeApplication.js'
import { AcquisitionApplication } from '../core/application/AcquisitionApplication.js'
import { RecordMcpActivity } from '../core/application/RecordMcpActivity.js'
import { getPool } from './postgres/pool.js'
import { PostgresKnowledgeStore } from './postgres/PostgresKnowledgeStore.js'
import { PostgresAcquisitionQueue } from './postgres/PostgresAcquisitionQueue.js'
import { PostgresMcpActivityStore } from './postgres/PostgresMcpActivityStore.js'

let container:
    | {
      knowledge: KnowledgeApplication
      acquisition: AcquisitionApplication
      activity: RecordMcpActivity
      queue: PostgresAcquisitionQueue
    }
  | undefined

export function getContainer() {
  if (!container) {
    const pool = getPool()
    const store = new PostgresKnowledgeStore(pool)
    const queue = new PostgresAcquisitionQueue(pool)
    const activityStore = new PostgresMcpActivityStore(pool)

    container = {
      knowledge: new KnowledgeApplication(store),
      acquisition: new AcquisitionApplication(queue),
      activity: new RecordMcpActivity(activityStore),
      queue
    }
  }

  return container
}
