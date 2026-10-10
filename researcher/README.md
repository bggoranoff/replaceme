# Researcher Agent

The **Researcher Agent** researches any job with Gemini and Google Search grounding and writes the research handoff for the builder (`research.json` v2 = `ResearchBrief`, see `shared/game_contract.md` section i). Nothing in it is specific to a job: everything comes from the job the user typed and the sources Gemini finds.

## Pipeline

1. **Plan** (grounded): researches what the worker does and picks 5 focused tasks in priority order, each mapped to one of the mechanics in `shared/actions.json` (the builder uses the first 4). A JSON pass turns the report into the plan (title, setting, rules, assumptions, why each task and mechanic were chosen).
2. **Tasks** (grounded, in parallel): one practitioner report per task with cited numbers: variables (unit, min, max, step), optimal values or ranges, derived relations such as ratios, how deviation lowers quality, qualitative feedback when too low or too high, sort routes, orders or dialogue for the other mechanics, caveats and problems.
3. **C1 task schema**: a JSON pass fills each task. `researcher/normalize.py` validates it (variable bounds, optima inside bounds, expression grammar, derived optima consistent with the variable optima, every variable scored, no optimum leaked in the aim or feedback, mechanic limits), asks Gemini once to fix any issues, then repairs what is left deterministically (widens bounds, moves defaults off the optimum, aligns derived optima, drops invalid terms and unscored controls). Sources are referenced by number and mapped back to the cited URLs (grounding redirect links are resolved to the real pages), so no URL is invented. Tasks that are still not playable are dropped; fewer than 4 is an error.
4. **Reasoning traces**: why each task and mechanic was chosen, assumptions, each optimum with its scoring rationale, sort routes, best dialogue responses, caveats and problems, Gemini's thinking summaries with the searches they ran, and the sources considered. They are stored in **Entire Brain** and copied into `reasoning_traces`.

## Entire Brain

Each trace is one durable fact written with the `entire-brain` CLI (`shared/brain.py`):

- brain branch `game/<slug>` (the game's git branch name), taxonomy path `project.research.reasoning`
- fact text: a header line `[replaceme research trace] job=<slug> run=<run_id> task=<task_id|overall> step=<n>`, the thought, and an `evidence:` line
- `research.json` `brain {stored, ids, query}` records the fact ids and the recall query for the run

The builder loads the traces with `shared.brain.attach_reasoning` (inside `BuilderAgent.load_research_brief`): `multi-get` of the ids first, then `recall` of the query, then the `reasoning_traces` copy when the CLI is missing (for example in a container). `shared.brain.reasoning_prompt(brief, task_id)` formats them for a generation prompt.

Inspect them by hand:

```bash
entire-brain recall "[replaceme research trace] run=<run_id>" --branch game/<slug> --k 128 --no-semantic
entire-brain multi-get <fact ids from research.json brain.ids> --branch game/<slug>
```

## Usage

```bash
# GEMINI_API_KEY (or GOOGLE_API_KEY) must be in the environment
python3 -m researcher.agent "<job>"
```

It writes `games/<slug>/research.json` (and the legacy `research.json` that the dev server's `/api/research` route still reads), prints the tasks, and exits non-zero if research fails. A run makes about 12 Gemini calls and takes 2-4 minutes.

`python3 scripts/test_brain.py` tests the trace storage, the normalization and the example fixture `fixtures/example-research.v2.json` offline; add `--live` to round-trip through the real `entire-brain` CLI.
