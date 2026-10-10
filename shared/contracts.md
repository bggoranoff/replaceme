# Handoffs

skills.json: version, role, prompt, skills[], metadata
research.json: version, role, sources[], rules[], assumptions[], levels[]
level: id, goal, customerProfiles[], initialSupplies, actions[], successConditions[]
world.json: version, researchVersion, entrypoint, levels[], actionSchemas, observationSchema, scoringRules
EpisodeEvent: episodeId, levelId, seq, time, action, observation, outcome
LearnedSkill: SKILL.md with unified yaml frontmatter

A game adapter exposes reset(levelId, seed), observe(), step(action) and score().
The UI consumes episode events. Scoring rules remain outside the actor's write access.

v2 (current): see shared/game_contract.md, shared/actions.json, shared/schemas/world.schema.json, frontend/src/contract.ts

Research reasoning traces (v2): one Entire Brain fact per ReasoningTrace on brain branch `game/<slug>`, path `project.research.reasoning`, text `[replaceme research trace] job=<slug> run=<run_id> task=<task_id|overall> step=<n>` + thought + `evidence: a | b`. research.json `brain {stored, ids, query}` points at them; `reasoning_traces` is the fallback copy. Read them with `shared/brain.py` (`attach_reasoning`, `reasoning_prompt`). Example: fixtures/example-research.v2.json
