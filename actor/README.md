# Actor Agent

The **Actor Agent** learns each level by doing, like a human trainee, and exports one skill per level (shared/game_contract.md sections d and e).

## Overview

- **Triggered by** the **Train agent** button: `POST /api/train {slug}` spawns
  `python3 -m actor.agent --slug <slug> --training-id <id> --base-url <server> --attempts 10`.
- **Plays in real browsers.** One headless Chromium session per level opens `/?slug=&level=&run=&agent=1`, so the 4 levels train concurrently. Attempts within a level are sequential.
- **Only allowlisted controls.** Every action comes from `shared/actions.json` and the page's `listActions()`, and is validated (and repaired or rejected) before it is sent through `window.__replaceme.act`.
- **Never random.** Each attempt is planned from the evidence so far: the score, the per-term sub-scores and the qualitative feedback. It never reads scoring targets.
  - mix and timing: a 1-D search per control on its sub-score, bracketing first, then coordinate search on derived relations, then probes either side of the best value to map the acceptable window and discover each failure message. The last attempts replay the best.
  - sort and converse: change one choice at a time, all wrong ones at once when the breakdown scores each separately.
  - deliver: BFS on `observation.grid`, comparing pickup policies (listed, nearest, batching).
- **Reflects after every attempt.** Gemini plans the next attempt and reflects on inputs, score and feedback, using the deterministic search as its suggestion. Without a key or quota the deterministic search and reflection run alone.
- **Output.**
  - Run events are streamed to `/api/runs/:id/events`.
  - Status goes to `runs/<training_id>/status.json` and the learning record to `runs/<training_id>/learning/<level_id>.json`.
  - Skills go to `skills/<level_id>/skill.json` (`LearnedSkill`) and `skills/<level_id>/SKILL.md`.

## Modules

- `agent.py`: the per-level learning loop, skill export and CLI
- `runner.py`: parallel Playwright sessions, events and status
- `rules.py`: allowlist validation
- `explore.py`: systematic search per mechanic
- `drivers.py`: plans to input actions, closed loop on the observation
- `reasoning.py`: Gemini prompts and the deterministic fallbacks
- `mock/`: a test-only game page implementing the bridge

## Usage

```bash
python3 -m actor.agent --slug <slug> --base-url http://127.0.0.1:5183 --attempts 10
```

Environment variables:

- `ACTOR_ATTEMPTS`: attempts per level (default 10)
- `ACTOR_USE_GEMINI=0`: deterministic mode
- `ACTOR_STEP_DELAY_MS`: pause between actions so spectators can follow (default 150)
- `ACTOR_GAME_URL`: game page origin, read by the server
- `ACTOR_SKILLS_DIR`: export directory

## Tests

- `python3 scripts/test_actor.py`: unit tests
- `python3 scripts/test_actor_e2e.py`: headless browsers against the mock game page and the dev server
