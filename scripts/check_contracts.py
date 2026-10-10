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

# v2 platform rules (shared/actions.json) and generated-world shape (shared/game_contract.md)
import re

rules = json.loads((root / "shared/actions.json").read_text())
json.loads((root / "shared/schemas/world.schema.json").read_text())
assert isinstance(rules["version"], int)
assert set(rules["controls"]) == {"key_up", "key_down", "key_left", "key_right", "mouse_click", "mouse_down", "mouse_up", "mouse_drag", "interact", "wait"}
assert set(rules["mechanics"]) == set(rules["limits"]["mechanic_ids"]) and len(rules["mechanics"]) == 5
for mid, mech in rules["mechanics"].items():
    assert all(key in mech for key in ("controls", "params", "observation", "aim", "scoring", "fail_conditions")), mid
    assert set(mech["controls"]) <= set(rules["controls"]), mid

EXPR = re.compile(r"^[a-z0-9_+\-*/(). ]+$")
REQUIRED_PARAMS = {"mix": ("station_id", "variables", "submit_label"), "timing": ("station_id", "phases"), "sort": ("station_id", "items", "bins"), "deliver": ("start_tile", "orders", "capacity", "par_ms"), "converse": ("npc_id", "turns")}


def check_term(term, where):
    assert ("target" in term) != ("range" in term), f"{where}: needs exactly one of target/range"
    assert term["tolerance"] > 0 and term["weight"] > 0 and term["curve"] in ("gaussian", "linear", "step"), where
    assert {"too_low", "too_high"} <= set(term["feedback"]), where


def check_world(world):
    assert world["version"] == 2 and world["rulesVersion"] == rules["version"]
    assert world["branch"] == f"game/{world['slug']}"
    assert len(world["levels"]) == rules["limits"]["levels_per_game"]
    npc_ids = {n["id"] for n in world["npcs"]}
    loc_ids = {loc["id"] for loc in world["map"]["locations"]}
    assert len({lvl["id"] for lvl in world["levels"]}) == 4 and [lvl["index"] for lvl in world["levels"]] == [1, 2, 3, 4]
    for lvl in world["levels"]:
        mech, scoring, params = lvl["mechanic"], lvl["scoring"], lvl["params"]
        assert mech in rules["mechanics"], lvl["id"]
        assert lvl["quest"]["npc_id"] in npc_ids and lvl["quest"]["location_id"] in loc_ids, lvl["id"]
        assert all(key in params for key in REQUIRED_PARAMS[mech]), lvl["id"]
        assert 0 <= scoring["pass_threshold"] <= 100
        if mech in ("mix", "timing"):
            var_ids = {v["id"] for v in params["variables" if mech == "mix" else "phases"]}
            assert set(scoring["variables"]) <= var_ids, lvl["id"]
            for vid, term in scoring["variables"].items():
                check_term(term, f"{lvl['id']}.{vid}")
            for term in scoring.get("derived", []):
                check_term(term, f"{lvl['id']}.{term['id']}")
                assert EXPR.match(term["expr"]), term["expr"]
                assert set(re.findall(r"[a-z][a-z0-9_]*", term["expr"])) <= var_ids, term["expr"]
        if mech == "sort":
            assert set(scoring["correct"]) == {i["id"] for i in params["items"]}
            assert set(scoring["correct"].values()) <= {b["id"] for b in params["bins"]}
        if mech == "converse":
            assert set(scoring["turns"]) == {t["id"] for t in params["turns"]}
        if mech == "deliver":
            assert lvl.get("time_limit_ms") and {"accuracy", "time"} <= set(scoring["weights"])


check_world(json.loads((root / "fixtures/example-world.v2.json").read_text()))
print("Platform rules v2 and example world v2 are valid")
