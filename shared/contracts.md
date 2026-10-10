# Handoffs

research.json: version, role, sources[], rules[], assumptions[], levels[]
level: id, goal, customerProfiles[], initialSupplies, actions[], successConditions[]
world.json: version, researchVersion, entrypoint, levels[], actionSchemas, observationSchema, scoringRules
EpisodeEvent: episodeId, levelId, seq, time, action, observation, outcome
SkillPack: skill directories, tools.json, evaluation.json

A game adapter exposes reset(levelId, seed), observe(), step(action) and score().
The UI consumes episode events. Scoring rules remain outside the actor's write access.
