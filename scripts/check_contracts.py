from pathlib import Path
import json
root = Path(__file__).resolve().parents[1]

skills = json.loads((root / "fixtures/barista-skills.json").read_text())
assert "version" in skills
assert "skills" in skills

brief = json.loads((root / "fixtures/barista-research.json").read_text())
assert brief["role"] == "barista"
for level in brief["levels"]:
    assert all(key in level for key in ("id", "goal", "customerProfiles", "initialSupplies", "actions", "successConditions"))
    assert all(amount >= 0 for amount in level["initialSupplies"].values())
assert len({x["id"] for x in brief["levels"]}) == len(brief["levels"])

skill_md = (root / "skills/example-stockout/SKILL.md").read_text()
assert all(key in skill_md for key in ("name:", "status:", "trained_episodes:", "pass_rate:", "level_id:"))
print("Example handoff and skill layout are valid; no live agent run performed")
