import type { Route } from './http.ts'

// Owner: actor agent. shared/game_contract.md section d. Types in src/contract.ts.
//   POST /api/runs/:id/events  {events: RunEvent[]} -> {ok: true}   (first run_started creates the run)
//   GET  /api/runs             ?training_id= -> {runs: RunSummary[]} ordered by level_index, attempt
//   GET  /api/runs/:id         -> {run: RunSummary, events: RunEvent[]}
//   GET  /api/runs/:id/stream  SSE: replays stored events, then live; `event: run_event` data: RunEvent
export const routes: Route[] = []
