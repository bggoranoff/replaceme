# actor
Input: the builder's game and level descriptions.
Output: skills/<skill-name>/SKILL.md, tool mappings and evaluation evidence.
Play, inspect failures, update procedures, retest and export within this component. There is no separate exporter agent.
Keep episode logs for frontend replay. Evaluate on unseen customer mixes. Start small before scaling toward 100 rounds per level.
Transfer requires mapping simulated actions to real tools and validating the skill in the destination environment.
