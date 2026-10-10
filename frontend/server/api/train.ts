import type { Route } from './http.ts'

// Owner: actor agent. shared/game_contract.md section d.
//   POST /api/train          {slug?} -> 202 TrainStatus (starts actor/agent.py; 4 levels concurrent, 10 sequential attempts each)
//   GET  /api/train/status   -> TrainStatus
// Until this file registers POST /api/train, the legacy handler in ../chatApi.ts answers it.
export const routes: Route[] = []
