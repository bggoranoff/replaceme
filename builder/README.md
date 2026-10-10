# Builder Agent

The **Builder Agent** turns the Researcher's brief (`research.json` v2, `ResearchBrief` in `shared/schemas/research.py`) into one playable game: a cozy, Stardew-style village (`world.json` v2, `shared/schemas/world.schema.json`). Nothing in the builder knows about any particular job; everything comes from the brief.

## What it builds

- **One world.** A top-down tile map with paths, a pond, cottages and greenery, generated procedurally and deterministically from the job slug (`builder/world_gen.py`).
- **Exactly 4 quest levels.** It picks 4 distinct research tasks, preferring different mechanics. Each level uses one of the 5 platform mechanics in `shared/actions.json` (mix, timing, sort, deliver, converse). Each level has:
  - a quest-giver NPC and a location on the map
  - an `aim` that says what to achieve, never the answer
  - a controls hint for arrows and mouse
  - a metric and a dialogue line for quest, start (villager chatter), pass and fail
- **Declarative, deterministic scoring.** The researched variables, optima and heuristic become `levels[].scoring`: per-term target or range, tolerance, weight, curve and qualitative feedback, plus derived terms as safe arithmetic expressions. There is no randomness: the same inputs always give the same score. `builder/scoring.py` mirrors the game's TypeScript engine (`frontend/src/game/scoring.ts`).
- **Repairs.**
  - Targets are moved inside the control range.
  - Derived terms that contradict the reachable optimum are aligned.
  - Starting values are pushed away from the optimum.
  - Any aim, hint or feedback that states a target is replaced.
  - Every quest location, NPC and delivery spot is checked to be reachable.
- **Flavor.** Gemini writes the village title, NPC names, location names and dialogue (`builder/flavor.py`). It never sees the optima. Without a key it falls back to a deterministic pack built from the brief.

## Game branches (Entire)

The world is written to `games/<slug>/world.json` and committed on branch `game/<slug>` (created from `main`). The commit goes through a temporary `git worktree`, so the main working tree and its checked-out branch are never touched. `games/` is gitignored on main.

## Running

```bash
python3 -m builder.agent --brief games/<slug>/research.json      # build and commit game/<slug>
python3 -m builder.agent --brief fixtures/florist-research.v2.json --no-commit
python3 scripts/test_world_builder.py                             # offline tests, incl. TS/Python scoring parity
```

The dev server runs this for `POST /api/research` (`frontend/server/api/world.ts`) and serves the result at `GET /api/world?slug=`.
