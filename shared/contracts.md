# Handoffs

skills.json: version, role, prompt, skills[], metadata
research.json: version, role, sources[], rules[], assumptions[], levels[]
level: id, goal, customerProfiles[], initialSupplies, actions[], successConditions[]
world.json: version, researchVersion, entrypoint, levels[], actionSchemas, observationSchema, scoringRules
EpisodeEvent: episodeId, levelId, seq, time, action, observation, outcome
LearnedSkill: SKILL.md with unified yaml frontmatter

A game adapter exposes reset(levelId, seed), observe(), step(action) and score().
The UI consumes episode events. Scoring rules remain outside the actor's write access.
