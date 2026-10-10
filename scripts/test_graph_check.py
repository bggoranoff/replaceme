"""
Tests for builder/graph_check.py: the Entire Graph + local rules check every generated
game must pass before it is committed on game/<slug> (shared/game_contract.md section b).

Run: python3 scripts/test_graph_check.py
Graph-dependent assertions run when the `entire graph` plugin is installed and are
reported as skipped otherwise; the local validator is always tested.
"""

import atexit
import copy
import json
import math
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from builder import graph_check as gc  # noqa: E402

EXAMPLE = json.loads((root / "fixtures/example-world.v2.json").read_text())
RULES = gc.load_rules(root)


def _graph_ready() -> bool:
    try:
        gc.graph_version()
        return True
    except Exception:
        return False


GRAPH = _graph_ready()


def world():
    return copy.deepcopy(EXAMPLE)


def rules_of(violations):
    return {v["rule"] for v in violations}


def check(w, repair=False, use_graph=False):
    return gc.check_world(w, root, repair=repair, use_graph=use_graph, rules=RULES)


def run(*args, cwd):
    return subprocess.run(list(args), cwd=cwd, check=True, capture_output=True, text=True).stdout


TEMP_DIRS = []
atexit.register(lambda: [shutil.rmtree(d, ignore_errors=True) for d in TEMP_DIRS])


def temp_dir() -> Path:
    path = Path(tempfile.mkdtemp(prefix="graph-check-test-"))
    TEMP_DIRS.append(path)
    return path


def temp_repo() -> Path:
    """A throwaway repo whose main holds the real rules from this repo's main."""
    repo = temp_dir()
    run("git", "init", "-q", "-b", "main", cwd=repo)
    for rel, text in RULES["raw"].items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    (repo / ".gitignore").write_text("games/\n")
    run("git", "add", ".", cwd=repo)
    run("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "rules", cwd=repo)
    return repo


# --- rules from main ---------------------------------------------------------

def test_rules_come_from_main():
    assert RULES["source"] == "git show main:shared/actions.json", RULES["source"]
    assert RULES["commit"] == run("git", "rev-parse", "main", cwd=root).strip()
    assert RULES["raw"]["shared/actions.json"] == run("git", "show", "main:shared/actions.json", cwd=root)
    assert set(RULES["actions"]["mechanics"]) == set(RULES["actions"]["limits"]["mechanic_ids"])


def test_param_specs_parse_from_rules():
    mech = RULES["actions"]["mechanics"]
    variables = gc.param_spec(mech["mix"]["params"]["variables"], "variables")
    assert variables["bounds"][None] == (1, 6) and not variables["fields"]["default"]["optional"]
    phases = gc.param_spec(mech["timing"]["params"]["phases"], "phases")
    assert phases["fields"]["mode"]["enum"] == ["stop", "hold"] and phases["fields"]["period_ms"]["optional"]
    turns = gc.param_spec(mech["converse"]["params"]["turns"], "turns")
    assert turns["bounds"] == {None: (2, 6), "options": (2, 4)} and "reply" in turns["fields"]["options"]["fields"]
    assert gc.param_spec(mech["mix"]["params"]["ingredients"], "ingredients")["optional"]
    assert gc.param_spec(mech["deliver"]["params"]["capacity"], "capacity")["integer_min"] == 1


# --- valid world ---------------------------------------------------------------

def test_example_world_passes_local():
    report = check(world())
    assert report["ok"], report["violations"]
    assert report["rules_version"] == RULES["actions"]["version"] and report["rules_commit"] == RULES["commit"]


def test_example_world_passes_entire_graph():
    if not GRAPH:
        return "skipped: entire graph plugin not installed"
    report = check(world(), use_graph=True)
    assert report["ok"], report["violations"]
    g = report["graph"]
    assert g["status"] == "pass" and g["provider"] == "entire-graph", g
    found = {(e["kind"], e["name"]) for e in g["evidence"]}
    assert {("mechanic", lvl["mechanic"]) for lvl in EXAMPLE["levels"]} <= found
    # evidence lines point at main's actions.json
    lines = RULES["raw"]["shared/actions.json"].splitlines()
    for e in g["evidence"]:
        line = int(e["at"].rsplit(":", 1)[1])
        assert f'"{e["name"]}"' in lines[line - 1], e


def test_deterministic():
    a, b = check(world()), check(world())
    assert a["violations"] == b["violations"] and a["repairs"] == b["repairs"]
    lvl = EXAMPLE["levels"][0]
    values = {v["id"]: v["default"] for v in lvl["params"]["variables"]}
    assert gc.numeric_score(lvl["scoring"], values) == gc.numeric_score(lvl["scoring"], values)


# --- invalid worlds ------------------------------------------------------------

def test_unknown_mechanic_rejected():
    w = world()
    w["levels"][0]["mechanic"] = "juggle"
    report = check(w, repair=True)
    assert not report["ok"] and "mechanic.allowlist" in rules_of(report["violations"])
    if GRAPH:
        report = check(w, use_graph=True)
        assert "graph.mechanic" in rules_of(report["violations"]), report["violations"]


def test_level_count():
    w = world()
    w["levels"] = w["levels"][:3]
    assert "levels.count" in rules_of(check(w)["violations"])
    w = world()
    extra = copy.deepcopy(w["levels"][0])
    extra.update(id="beekeeper-extra", task_id="extra", index=5)
    w["levels"].append(extra)
    assert "levels.count" in rules_of(check(copy.deepcopy(w))["violations"])
    report = check(w, repair=True)
    assert len(w["levels"]) == 4 and "levels.count" in rules_of(report["repairs"])
    assert check(w)["ok"]


def test_duplicate_tasks_rejected():
    w = world()
    w["levels"][1]["task_id"] = w["levels"][0]["task_id"]
    assert "levels.distinct_tasks" in rules_of(check(w, repair=True)["violations"])


def test_missing_aim_and_metric_repaired():
    w = world()
    del w["levels"][0]["aim"]
    w["levels"][1]["metric"] = {"name": ""}
    report = check(copy.deepcopy(w))
    assert {"level.aim", "level.metric"} <= rules_of(report["violations"])
    report = check(w, repair=True)
    assert {"level.aim", "level.metric"} <= rules_of(report["repairs"])
    assert w["levels"][0]["aim"] == RULES["actions"]["mechanics"]["mix"]["aim"]
    assert w["levels"][1]["metric"]["name"] and w["levels"][1]["metric"]["description"]
    assert check(w)["ok"]


def test_unknown_controls_rejected_and_repaired():
    w = world()
    w["levels"][0]["controls_hint"] = "Press Space to spin, Shift to go faster"
    w["levels"][1]["controls"] = ["key_up", "key_space"]
    w["levels"][2]["controls_hint"] = "Press Q to place a jar"
    w["levels"][3]["controls_hint"] = "Up/Down choose, hold 2 seconds, then press Enter"  # a duration, not a key
    report = check(copy.deepcopy(w))
    paths = {v["path"] for v in report["violations"] if v["rule"] == "controls.allowlist"}
    assert paths == {"levels[0].controls_hint", "levels[1].controls", "levels[2].controls_hint"}, report["violations"]
    if GRAPH:
        assert "graph.control" in rules_of(check(copy.deepcopy(w), use_graph=True)["violations"])
    check(w, repair=True)
    assert w["levels"][1]["controls"] == ["key_up"]
    assert "Space" not in w["levels"][0]["controls_hint"] and "arrows" in w["levels"][0]["controls_hint"]
    assert check(w, use_graph=GRAPH)["ok"]


def test_bad_params():
    w = world()
    mix = w["levels"][0]["params"]
    mix["variables"][0]["default"] = 9999
    mix["buttons"] = ["Spin", "Reset"]
    timing = w["levels"][1]["params"]
    timing["phases"][0]["mode"] = "spin"
    w["levels"][2]["params"]["station_id"] = "nowhere"
    del w["levels"][3]["params"]["turns"][0]["options"][0]["reply"]
    report = check(copy.deepcopy(w))
    got = {(v["path"], v["rule"]) for v in report["violations"]}
    assert ("levels[0].params.variables[0].default", "params.range") in got
    assert ("levels[0].params.buttons", "params.unknown") in got
    assert ("levels[1].params.phases[0].mode", "params.value") in got
    assert ("levels[2].params.station_id", "params.ref") in got
    assert ("levels[3].params.turns[0].options[0].reply", "params.required") in got
    report = check(w, repair=True)
    assert mix["variables"][0]["default"] == mix["variables"][0]["max"] and "buttons" not in mix
    assert not report["ok"]  # mode, station and reply cannot be repaired safely


def test_param_counts():
    w = world()
    base = w["levels"][0]["params"]["variables"][0]
    w["levels"][0]["params"]["variables"] += [dict(base, id=f"extra_{i}") for i in range(4)]
    w["levels"][2]["params"]["items"] = w["levels"][2]["params"]["items"][:2]
    got = {(v["path"], v["rule"]) for v in check(w)["violations"]}
    assert ("levels[0].params.variables", "params.count") in got and ("levels[2].params.items", "params.count") in got


def test_scoring_terms_must_match_controls():
    w = world()
    scoring, variables = w["levels"][0]["scoring"], w["levels"][0]["params"]["variables"]
    scoring["variables"]["ghost"] = copy.deepcopy(scoring["variables"]["frames"])
    variables.append(dict(variables[0], id="unused"))
    del scoring["variables"]["frames"]  # still scored through the derived term
    report = check(copy.deepcopy(w))
    got = {(v["path"], v["rule"]) for v in report["violations"] if v["rule"] == "scoring.terms"}
    assert got == {("levels[0].scoring.variables.ghost", "scoring.terms"), ("levels[0].params.variables.unused", "scoring.terms")}, got
    check(w, repair=True)
    ids = [v["id"] for v in w["levels"][0]["params"]["variables"]]
    assert "ghost" not in scoring["variables"] and "unused" not in ids and "frames" in ids
    assert check(w)["ok"]


def test_expr_grammar_and_identifiers():
    w = world()
    w["levels"][0]["scoring"]["derived"][0]["expr"] = "speed_rpm ** 2"
    w["levels"][0]["scoring"]["derived"].append(dict(w["levels"][0]["scoring"]["derived"][0], id="w2", expr="speed_rpm * mystery"))
    report = check(w, repair=True)
    bad = [v for v in report["violations"] if v["rule"] == "scoring.expr"]
    assert len(bad) == 2 and "mystery" in bad[1]["message"], bad
    ast, err, ids = gc.parse_expr("-(a + 2) * b / c")
    assert err is None and ids == ["a", "b", "c"]
    assert gc.eval_expr(ast, {"a": 1, "b": 2, "c": 3}) == -2.0
    assert gc.eval_expr(gc.parse_expr("a / (b - b)")[0], {"a": 1, "b": 2}) is None
    for bad_expr in ("a +", "(a", "a ^ 2", "A + 1", "a b"):
        assert gc.parse_expr(bad_expr)[1], bad_expr


def test_target_outside_range_repaired():
    w = world()
    w["levels"][0]["scoring"]["variables"]["speed_rpm"]["target"] = 900
    report = check(copy.deepcopy(w))
    assert ("levels[0].scoring.variables.speed_rpm", "scoring.target_in_range") in {(v["path"], v["rule"]) for v in report["violations"]}
    check(w, repair=True)
    assert w["levels"][0]["params"]["variables"][0]["max"] == 900


def test_unreachable_pass_threshold():
    w = world()
    scoring = w["levels"][0]["scoring"]
    scoring["derived"][0].update(target=100000, weight=50, curve="step")
    scoring["pass_threshold"] = 90
    assert "scoring.reachable" in rules_of(check(copy.deepcopy(w))["violations"])
    report = check(w, repair=True)  # lowered to the best reachable score instead of rejecting the game
    assert "scoring.reachable" in rules_of(report["repairs"]) and 1 <= scoring["pass_threshold"] < 90, scoring["pass_threshold"]
    assert check(w)["ok"]
    w = world()
    for opt in w["levels"][3]["scoring"]["turns"]["baby"].values():
        opt["points"] = 0
    assert "scoring.reachable" in rules_of(check(copy.deepcopy(w))["violations"])
    check(w, repair=True)
    assert check(w)["ok"]
    # a critical option ends the level, so it never counts as the best answer
    w = world()
    for opt in w["levels"][3]["scoring"]["turns"]["baby"].values():
        opt["critical"] = True
    report = check(w, repair=True)
    assert ("levels[3].scoring.turns.baby", "scoring.reachable") in {(v["path"], v["rule"]) for v in report["violations"]}, report["violations"]
    # a flat zero cannot be learned from: rejected, not repaired
    w = world()
    for turn in w["levels"][3]["scoring"]["turns"].values():
        for opt in turn.values():
            opt["points"] = 0
    assert "scoring.reachable" in rules_of(check(w, repair=True)["violations"])


def test_hidden_targets():
    w = world()
    w["levels"][0]["aim"] = "Spin the frames at 300 rpm for the best honey."
    w["levels"][0]["scoring"]["variables"]["frames"]["feedback"]["too_low"] = "Load 8 frames next time."
    report = check(copy.deepcopy(w))
    leaks = {v["path"] for v in report["violations"] if v["rule"] == "hidden_target"}
    assert leaks == {"levels[0].aim", "levels[0].scoring.variables.frames.feedback.too_low"}, report["violations"]
    check(w, repair=True)
    assert "300" not in w["levels"][0]["aim"] and gc.REDACTED in w["levels"][0]["aim"]
    assert check(w)["ok"]
    secrets = [(16.0, None), (8.0, "frames"), (93.0, "°C")]
    assert gc.find_leaks("Aim for a 1:16 ratio", secrets)
    assert gc.find_leaks("Heat to 93°C", secrets)
    assert not gc.find_leaks("Do it in 8 steps", secrets)
    assert not gc.find_leaks("Keep it gentle", secrets)
    assert not gc.find_leaks("Scored 0-100 from how close you get", [(100.0, None)])
    # success_line (feedback when nothing is off), metric and NPC dialogue are shown to the player too
    w = world()
    lvl = w["levels"][0]
    lvl["success_line"] = "Perfect, 300 rpm every time."
    lvl["metric"]["description"] = "0-100: best at 300 rpm"
    lvl["dialogue"][0]["text"] = "Spin them at 300 rpm, dear."
    leaks = {v["path"] for v in check(copy.deepcopy(w))["violations"] if v["rule"] == "hidden_target"}
    assert leaks == {"levels[0].success_line", "levels[0].metric.description", "levels[0].dialogue[0].text"}, leaks
    check(w, repair=True)
    assert "300" not in lvl["dialogue"][0]["text"] and lvl["metric"]["description"].startswith("0-100") and check(w)["ok"]


def test_other_mechanics_scoring():
    w = world()
    del w["levels"][2]["scoring"]["correct"]["jar-3"]
    w["levels"][3]["scoring"]["turns"]["extra"] = {}
    got = {(v["path"], v["rule"]) for v in check(w)["violations"]}
    assert ("levels[2].scoring.correct", "scoring.terms") in got and ("levels[3].scoring.turns", "scoring.terms") in got
    w = world()
    w["levels"][3] = {
        **w["levels"][3], "mechanic": "deliver", "time_limit_ms": None,
        "params": {"start_tile": [15, 12], "orders": [{"id": "o1", "item": "jar", "label": "Jar", "from": "location:jar-shelf", "to": "npc:rosa"}], "capacity": 1, "par_ms": 20000},
        "scoring": {"pass_threshold": 70, "weights": {"accuracy": 2, "time": 1}, "feedback": {"wrong_target": "Wrong person.", "late": "Too slow.", "missed": "Missed one."}},
    }
    report = check(copy.deepcopy(w))
    assert "level.time_limit" in rules_of(report["violations"]), report["violations"]
    check(w, repair=True)
    assert w["levels"][3]["time_limit_ms"] == 40000 and check(w)["ok"]
    w["levels"][3]["params"]["orders"][0]["to"] = "npc:nobody"
    assert "params.ref" in rules_of(check(w)["violations"])


def test_quest_refs_and_reachability():
    w = world()
    w["levels"][0]["quest"]["npc_id"] = "ghost"
    assert "level.quest" in rules_of(check(w)["violations"])
    w = world()
    x, y = next(n["tile"] for n in w["npcs"] if n["id"] == w["levels"][1]["quest"]["npc_id"])
    w["map"]["solids"].append({"x": x - 1, "y": y - 1, "w": 3, "h": 3})
    w["npcs"] = [dict(n, tile=[x, y]) if n["id"] == w["levels"][1]["quest"]["npc_id"] else n for n in w["npcs"]]
    report = check(w)
    assert ("levels[1].quest.npc_id", "level.reachable") in {(v["path"], v["rule"]) for v in report["violations"]}, report["violations"]


def test_scoring_formulas_follow_spec():
    term = {"target": 10, "tolerance": 2, "weight": 1, "curve": "gaussian"}
    assert gc.term_score(10, term) == 1.0 and math.isclose(gc.term_score(12, term), math.exp(-0.5))
    assert gc.term_score(12, dict(term, curve="linear")) == 0.5 and gc.term_score(14, dict(term, curve="linear")) == 0.0
    assert gc.term_score(12, dict(term, curve="step")) == 1.0 and gc.term_score(12.5, dict(term, curve="step")) == 0.0
    ranged = {"range": [5, 8], "tolerance": 1, "weight": 1, "curve": "linear"}
    assert gc.term_score(6, ranged) == 1.0 and gc.term_score(9, ranged) == 0.5


# --- Entire Graph publish, commit on game branch, branch scope -----------------

def test_publish_rules_into_entire_graph():
    if not GRAPH:
        return "skipped: entire graph plugin not installed"
    first = gc.publish_rules(root, rules=RULES)
    again = gc.publish_rules(root, rules=RULES)
    assert Path(first["snapshot"]).exists() and first["counts"]["symbols"] > 0
    assert first["rules_commit"] == RULES["commit"] and first["files"][0] == "shared/actions.json"
    assert again["cache_hit"] and again["snapshot"] == first["snapshot"]


def test_finalize_commits_valid_world_on_game_branch():
    repo = temp_repo()
    w = world()
    w["levels"][0]["aim"] = ""  # repaired before commit
    out = gc.finalize_world(w, repo)
    assert out["levels"][0]["aim"] and run("git", "rev-parse", "--abbrev-ref", "HEAD", cwd=repo).strip() == "main"
    files = run("git", "ls-tree", "-r", "--name-only", "game/beekeeper", cwd=repo).split()
    assert {"games/beekeeper/world.json", "games/beekeeper/graph_report.json", "shared/actions.json"} <= set(files), files
    msg = run("git", "log", "-1", "--format=%B", "game/beekeeper", cwd=repo)
    assert "Rules-Check: ok" in msg and "Rules-Version: 2" in msg and "Entire-Graph:" in msg, msg
    report = json.loads(run("git", "show", "game/beekeeper:games/beekeeper/graph_report.json", cwd=repo))
    assert report["ok"] and report["repairs"] and report["violations"] == []
    assert run("git", "merge-base", "main", "game/beekeeper", cwd=repo).strip() == run("git", "rev-parse", "main", cwd=repo).strip()
    assert run("git", "worktree", "list", cwd=repo).count("\n") == 1
    if GRAPH:
        assert "Entire-Graph: pass" in msg
        assert gc.check_branch("game/beekeeper", repo)["ok"]


def test_finalize_never_commits_failing_world():
    repo = temp_repo()
    w = world()
    w["levels"][2]["mechanic"] = "juggle"
    try:
        gc.finalize_world(w, repo)
        raise AssertionError("expected GraphCheckError")
    except gc.GraphCheckError as exc:
        assert not exc.report["ok"]
    report = json.loads((repo / "games/beekeeper/graph_report.json").read_text())
    assert not report["ok"] and report["violations"]
    assert not (repo / "games/beekeeper/world.json").exists()  # never served by GET /api/world
    assert subprocess.run(["git", "rev-parse", "--verify", "-q", "game/beekeeper"], cwd=repo, capture_output=True).returncode != 0


def test_branch_scope_flags_rule_changes():
    if not GRAPH:
        return "skipped: entire graph plugin not installed"
    repo = temp_repo()
    gc.finalize_world(world(), repo)
    tmp = temp_dir() / "wt"
    run("git", "worktree", "add", "-q", str(tmp), "game/beekeeper", cwd=repo)
    rules = json.loads((tmp / "shared/actions.json").read_text())
    rules["controls"]["key_space"] = {"input": "Space", "params": {}}
    (tmp / "shared/actions.json").write_text(json.dumps(rules, indent=2))
    run("git", "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "sneak a control in", cwd=tmp)
    run("git", "worktree", "remove", "--force", str(tmp), cwd=repo)
    report = gc.check_branch("game/beekeeper", repo)
    scope = [v for v in report["violations"] if v["rule"] == "graph.branch_scope"]
    assert not report["ok"] and scope and scope[0]["path"] == "shared/actions.json", report["violations"]


def test_missing_slug_rejected_without_writing():
    w = world()
    del w["slug"]
    try:
        gc.finalize_world(w, temp_repo(), commit=False)
        raise AssertionError("expected GraphCheckError")
    except gc.GraphCheckError as exc:
        assert any(v["path"] == "slug" for v in exc.report["violations"]), exc.report["violations"]


def test_malformed_worlds_reported_not_crashing():
    """The builder is LLM-driven: wrong types anywhere must become violations, never exceptions."""
    import random
    junk = [None, "x", 0, -1, 1.5, [], {}, [1, 2], {"a": 1}, True, "", [{}], [None]]

    def paths(node, p=()):
        if p:
            yield p
        items = node.items() if isinstance(node, dict) else enumerate(node) if isinstance(node, list) else []
        for k, v in items:
            yield from paths(v, p + (k,))

    rng = random.Random(7)
    for _ in range(400):
        w = world()
        for _ in range(rng.randint(1, 3)):
            target = rng.choice(list(paths(w)))
            node = w
            for k in target[:-1]:
                node = node[k]
            if rng.random() < 0.3:
                node.pop(target[-1])
            else:
                node[target[-1]] = copy.deepcopy(rng.choice(junk))
        for repair in (False, True):
            report = check(copy.deepcopy(w), repair=repair)
            assert not any(v["message"].startswith("malformed level") for v in report["violations"]), report["violations"]
    w = world()
    w["levels"][0]["params"] = ["not", "an", "object"]
    w["levels"][1]["scoring"]["variables"] = [1, 2]
    w["levels"][2]["quest"]["npc_id"] = ["theo"]
    w["levels"][3]["params"]["turns"] = {"baby": {}}
    w["map"]["solids"] = [{"x": "a"}, 5]
    report = check(w, repair=True, use_graph=GRAPH)
    assert not report["ok"] and {"levels[0].params", "levels[2].quest.npc_id"} <= {v["path"] for v in report["violations"]}


def test_finalize_without_git_keeps_checked_world():
    """The deploy image has no .git: rules come from the working tree and the world is kept, not committed."""
    plain = temp_dir()
    for rel, text in RULES["raw"].items():
        (plain / rel).parent.mkdir(parents=True, exist_ok=True)
        (plain / rel).write_text(text)
    out = gc.finalize_world(world(), plain)
    assert out["slug"] == "beekeeper" and (plain / "games/beekeeper/world.json").exists()
    report = json.loads((plain / "games/beekeeper/graph_report.json").read_text())
    assert report["ok"] and report["rules_commit"] is None and report["rules_source"].startswith("working tree")


def test_legacy_v1_world_passes_through():
    legacy = {"version": 1, "role": "x", "levels": []}
    assert gc.finalize_world(legacy, root, commit=False) is legacy


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in sorted(globals().items(), key=lambda kv: kv[1].__code__.co_firstlineno if callable(kv[1]) and hasattr(kv[1], "__code__") else 0) if name.startswith("test_") and callable(fn)]
    failed = 0
    for name, fn in tests:
        try:
            note = fn()
            print(f"ok   {name}" + (f" ({note})" if note else ""))
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed}/{len(tests)} passed; entire graph {'available' if GRAPH else 'NOT available (graph assertions skipped)'}")
    sys.exit(1 if failed else 0)
