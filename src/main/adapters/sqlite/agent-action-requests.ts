import type Database from 'better-sqlite3'
import type { AgentActionRequests } from '../../modules/agent-access/public'

export function createAgentActionRequests(db: Database.Database): AgentActionRequests {
  const get = db.prepare(
    'SELECT signature, action_id AS actionId FROM agent_action_requests WHERE id = ?'
  )
  const save = db.prepare(
    'INSERT INTO agent_action_requests(id, signature, action_id) VALUES (?, ?, ?)'
  )
  return {
    transaction: (work) => db.transaction(work).immediate(),
    get: (id) => get.get(id) as ReturnType<AgentActionRequests['get']>,
    save: (id, signature, actionId) => {
      save.run(id, signature, actionId)
    }
  }
}
