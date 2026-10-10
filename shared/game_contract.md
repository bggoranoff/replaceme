# Game contract v2

The contract every v2 feature builds against. Platform rules (controls, the 5 mechanics, the observation and the scoring spec) live in `shared/actions.json` (version 2). The generated world shape is `shared/schemas/world.schema.json`, with `fixtures/example-world.v2.json` as a valid example. Python models are in `shared/schemas/` (`ResearchBrief`, `LearnedSkill`). TypeScript types are in `frontend/src/contract.ts`. `python3 scripts/check_contracts.py` validates the rules and the example world.

Nothing here may name a job. Everything is generated from the job the user types. The beekeeper fixture is only a shape example.

## Flow

1. **Prompt.** The user types a job, or speaks it (STT). `POST /api/research {prompt}` is sent and the loading screen plays a dino-runner game until the request returns.
2. **Research.** The researcher writes `games/<slug>/research.json` (section i). Its reasoning traces go to Entire Brain.
3. **Build.** The builder turns the research into `games/<slug>/world.json`. Entire Graph checks it against the rules on main, then it is committed on branch `game/<slug>` (section b).
4. **Play.** The world map shows. The human walks around, talks to the NPCs and plays the 4 quest levels. The only button on screen is **Train agent**.
5. **Train.** `POST /api/train` starts the actor: 4 levels run at once, with 10 sequential attempts each. The UI shows one run at a time; Left/Right switches runs (section d).
6. **Skills.** The UI shows one learned skill per level, plus a chat for each skill (section f).

## a. World

- A world is one top-down, cozy, Stardew-like tile map (`map`: cols, rows, tile 16, spawn, locations, solids, optional ground rows) with a `theme.palette`.
- `npcs[]` give quests. Each NPC has an id, name, role, tile and an optional TTS `voice`.
- There are exactly 4 `levels[]` (index 1-4). Each level implements a different research task (`task_id`) and uses exactly one mechanic from `actions.json`, with that mechanic's `params`.
- Every level has:
  - `quest {npc_id, location_id, title}`: the human walks to the NPC, presses interact, hears the quest, then walks to the location and presses interact again to open the level over the map.
  - `aim`: what to achieve, never the answer.
  - `controls_hint`: arrows or mouse only.
  - `metric {name, description}`
  - `scoring` (the declarative spec, with `pass_threshold`)
  - optional `time_limit_ms`, `success_line`, `dialogue[] {at: quest|start|pass|fail, npc_id, text}` and `sources`
- Level `id` = `<job-slug>-<task-id>`. It is globally unique and is also the skill id.
- When a level ends, pass or fail, a **score card** shows the score (0-100), passed or failed, up to 3 qualitative feedback lines and the per-term breakdown labels with their sub-scores. Targets are never shown. Interact or a click dismisses it. The quest's location then shows the best score so far.
- **Layout.** No buttons on top of or around the game. The single on-screen button is "Train agent". During training there are also two on-screen arrows to switch runs. Use proper margins.

## b. Builder output and game branches

- Run `python3 -m builder.agent --brief games/<slug>/research.json`. It writes `games/<slug>/world.json` (plus `games/<slug>/graph_report.json`).
- `games/` is gitignored on main. The builder commits `games/<slug>/` with `git add -f` on branch `game/<slug>`, created from main, through a temporary `git worktree`. It never checks out a branch in the main working tree.
- `world.branch` = `game/<slug>` and `world.rulesVersion` = `actions.json` version.
- **Entire Graph check** (`builder/graph_check.py`):
  - Validates the world against `git show main:shared/actions.json` and `world.schema.json`.
  - Checks:
    - mechanics and controls are on the allowlist
    - the required params for each mechanic
    - the scoring terms match the variables, phases, items or turns
    - `expr` grammar and identifiers
    - every target lies inside min/max
    - no target is revealed in `aim`, `controls_hint` or feedback
    - exactly 4 levels with distinct tasks
  - Writes `graph_report.json {ok, rules_version, rules_commit, violations: [{path, rule, message}]}` and records the rules and result in Entire Graph.
  - If the world is not ok, the builder repairs it and re-checks. It never commits a failing world.
- Scoring is deterministic and follows `actions.json` `scoring_spec`. There is no randomness: the same inputs always give the same score.

## c. Browser bridge (game page)

- The game page always exposes `window.__replaceme` (types in `contract.ts`):
  - `listActions()` returns `[{action, params, description}]`: the controls valid in the current phase.
  - `observe()` returns an Observation (`actions.json` observation). It never contains targets or answers.
  - `act({action, params})` returns `Promise<{ok, error?, observation, done, score, events}>`.
  - `onEvent(cb)` returns an unsubscribe function. Events: dialogue, level_start, level_result, pickup, handover, placed, phase_end, error.
  - `resetLevel(levelId)` returns `Promise<Observation>` and opens the level fresh in the playing phase.
- Agent mode is `/?slug=<slug>&level=<levelId>&run=<runId>&agent=1`:
  - It renders only the game, skipping the prompt and research screens. It loads the world from `GET /api/world?slug=`.
  - It opens the level directly.
  - Time is virtual: it advances only through actions, so the same actions always give the same observations and score.
- `x,y` use `observation.viewport` logical coordinates. A `target_id` resolves to the target's centre.
- Spectator mode is `<GameView mode="spectate">`, the same renderer. It replays a run's `action` events through the same engine (they are deterministic) and takes no input.

## d. Training and runs

- `POST /api/train {slug}` returns `202` with a TrainStatus. It spawns `python3 -m actor.agent --slug <slug> --training-id <id> --base-url http://127.0.0.1:<port> --attempts 10`.
- The actor runs one headless Chromium page per level, so the 4 levels run concurrently. A level's attempts are sequential, so each attempt learns from the earlier ones.
- **What the actor may do.** It acts only through `__replaceme.act` with actions from `listActions()`. It never picks random values. Exploration is systematic:
  - mix and timing: coordinate or bracketing search using the score, breakdown and feedback
  - sort and converse: change one choice at a time
  - deliver: BFS on `observation.grid`
- Each attempt is a run. Run id = `<training_id>-l<index>-a<NN>`, and training_id = `<slug>-<unix_ms>`.
- The actor POSTs events to `/api/runs/:id/events {events: RunEvent[]}`. The event types are `run_started` (which creates the run), `action` (the action plus its ActResult), `note` and `run_finished`. The game page never posts.
- Runs endpoints:
  - `GET /api/runs?training_id=` returns `{runs: RunSummary[]}` (id, training_id, level_id, level_index, level_title, attempt, status queued|running|passed|failed|error, score, started_at, finished_at).
  - `GET /api/runs/:id` returns `{run, events}`.
  - `GET /api/runs/:id/stream` is SSE. It replays the stored events, then streams live ones as `event: run_event`.
- `GET /api/train/status` returns a TrainStatus `{training_id, status idle|running|done|error, slug, levels: [{level_id, level_title, attempts_done, attempts_total, best_score, status}], skills_ready}`.
- Storage:
  - `runs/<training_id>/<run_id>.jsonl` holds the events.
  - `runs/<training_id>/status.json` holds the TrainStatus.
  - `runs/latest.json` holds `{training_id, slug}`.
  - `runs/` is gitignored.
- **Training UI.**
  - It shows one run at a time in the real renderer (spectator mode), with a "Run i/N" indicator.
  - The Left/Right arrow keys and two on-screen arrow buttons switch runs.
  - When `skills_ready` is true, it moves to the skills view.

## e. Learning record and skill export

- The actor keeps `runs/<training_id>/learning/<level_id>.json`, a list of `attempts`. Each attempt has: attempt, run_id, inputs (control values or choices), actions_taken, score, passed, feedback, breakdown, problems_found, caveats, hypothesis and what_changed.
- After 10 attempts the actor exports `skills/<level_id>/skill.json` (`LearnedSkill`, in `shared/schemas/skill.py` and `contract.ts`). It contains:
  - name, description, job, level_id, level_index, mechanic
  - trained_attempts, best_score, final_score, pass_threshold, passed
  - `learned_parameters [{variable, label, value, unit, rationale, evidence: [{attempt, value, score}]}]`
  - `control_effects [{variable, effect, evidence}]`
  - steps, caveats, `problems [{problem, attempt, fix}]`
  - `score_history [{attempt, score, passed}]`
  - attempts, sources and `user_context [{text, added_at}]`
- The actor also exports `skills/<level_id>/SKILL.md`. Its frontmatter is: name, description, status, level_id, mechanic, trained_attempts, best_score and updated_at. Its body has sections for the same fields. There is one skill per level.

## f. Skills and chat

- `GET /api/skills` returns `{skills: LearnedSkill[]}` for the latest training, ordered by level_index. `GET /api/skills/:id` returns one LearnedSkill.
- `POST /api/skills/:id/chat {message, history: [{role: user|model, text}]}` returns `{reply, citations: [{title, url}], skill_updated, skill}`.
- Answers draw on the skill and its attempt evidence and on Gemini Google Search grounding. Citations are shown.
- When the human adds local or personal context, or asks for an expansion worth keeping, the server updates `skill.json` and `SKILL.md`: it appends to `user_context` and edits steps or caveats. It then returns `skill_updated: true`.

## g. Dialogue event

- Every time an NPC speech bubble appears (quest, level dialogue, converse lines and replies, pass/fail lines), the game dispatches `window.dispatchEvent(new CustomEvent('replaceme:dialogue', {detail: {text, speaker, npcId, voice?, manual}}))`.
- `manual` is true only when a human is playing; it is false in agent and spectator modes.
- The voice module listens for this event and voices it only when `manual` is true. The game never imports the voice module.

## h. Voice

- `POST /api/stt`: the body is the audio bytes (`Content-Type: audio/webm|wav|...`). It returns `{text}`. A mic control next to the job input fills the input.
- `POST /api/tts {text, voice?}` returns audio bytes (`Content-Type: audio/*`).
- Both use Gradium on the server with `GRADIUM_API_KEY`. The key is never sent to the browser. Text input keeps working without voice.

## i. Research handoff (research.json v2 = `ResearchBrief`)

- The researcher (Gemini with Google Search grounding) writes `games/<slug>/research.json` with: version 2, job, slug, title, setting, sources, rules, assumptions and `tasks[]` (at least 4 distinct tasks; the builder uses 4).
- Each `ResearchTask` has:
  - id, title, summary, `mechanic` (one of the 5), mechanic_rationale and aim
  - `variables [{id, label, unit, min, max, step, default}]`
  - `derived [{id, label, expr}]`
  - `optima [{term, target | range, rationale, source_urls}]`
  - `heuristic [{term, tolerance, weight, curve, too_low, too_high, rationale}]`
  - sort_items and sort_bins, orders, dialogue (only for their own mechanic)
  - caveats, problems and sources
- Reasoning traces `[{task_id, step, thought, evidence}]` are stored in Entire Brain. `brain {stored, ids, query}` records where they are, and the same traces are copied into `reasoning_traces` as a fallback.
- The builder loads the traces from Entire Brain, or falls back to `reasoning_traces`, and uses them when it generates levels, dialogue and feedback.
- `POST /api/research {prompt}` returns `{brief, world, slug, branch, graph}` (graph = graph_report). `GET /api/world?slug=` returns the world: first `games/<slug>/world.json`, then `git show game/<slug>:games/<slug>/world.json`.

## j. Server

- **Today.** `/api` exists only in dev. The Vite plugin `chatApi()` (`frontend/server/chatApi.ts`, mounted in `vite.config.ts`) serves the legacy `/api/research`, `/api/world`, `/api/train` and `/api/chat` routes. It finds the repo root at `process.cwd()/..` and reads keys from the repo `.env`. In prod, `deploy.sh` builds a static nginx image (there is no `frontend/Dockerfile`), so prod has no `/api`.
- **New routes.** New routes live in `frontend/server/api/`. Each feature owns one file exporting `routes: Route[]`: `train.ts`, `runs.ts`, `skills.ts` and `voice.ts` exist as stubs, with helpers in `http.ts`. `index.ts` `dispatch()` runs before the legacy handler, and a registered route overrides the legacy route with the same path. Edit only your own file. A new file adds one import and one spread in `index.ts`.
- **Target (integration).** One Node server, `frontend/server/prod.ts`, serves `dist/` with an SPA fallback, plus `dispatch()` and the legacy handler. `frontend/Dockerfile` (node 22 with python3, the Python deps and Playwright Chromium) runs `npm ci && npm run build` and listens on `$PORT`. `deploy.sh` uses it automatically.
- **Dev ports**, each run with `cd frontend && npx vite --port <p> --strictPort`:

  | Feature | Port |
  | --- | --- |
  | loading | 5181 |
  | world | 5182 |
  | actor | 5183 |
  | voice | 5184 |
  | brain | 5185 |
  | graph | 5186 |
  | skills | 5187 |
  | integration | 5190 |
