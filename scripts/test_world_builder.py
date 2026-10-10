"""
Tests for the world v2 builder (builder/world_gen.py, builder/scoring.py, builder/agent.py).

Offline and deterministic: uses the contract-shaped research fixtures (fixtures/*-research.v2.json)
and the builder's deterministic flavor, never Gemini. Also checks that the TypeScript scoring
engine (frontend/src/game/scoring.ts) gives the same scores as builder/scoring.py when node is available.

Run: python3 scripts/test_world_builder.py
"""

import json
import random
import runpy
import shutil
import subprocess
import sys
import tempfile
from collections import deque
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from builder.agent import BuilderAgent
from builder.flavor import fallback_flavor, merge_flavor
from builder.scoring import (
    ExprError, curve_score, eval_expr, parse_expr, score_converse, score_deliver, score_mix, score_numeric,
    score_sort, score_timing,
)
from builder.world_gen import BuildError, build_world, optimal_point, reveals, scoring_secrets, select_tasks, validate_world

RULES = json.loads((root / "shared/actions.json").read_text())
BRIEFS = sorted((root / "fixtures").glob("*-research.v2.json"))
# Worlds the builder generated from those briefs (example-world.v2.json is the contract sample).
BUILT_WORLDS = [p.with_name(p.name.replace("-research.v2", "-world.v2")) for p in BRIEFS]
check_world = runpy.run_path(str(root / "scripts/check_contracts.py"))["check_world"]


def build(brief):
    picked = select_tasks(brief["tasks"])
    world, _ = build_world(brief, fallback_flavor(brief, picked), RULES["version"])
    return world


def center(term):
    return (term["range"][0] + term["range"][1]) / 2 if "range" in term else term["target"]


def snap(v, value):
    n = round((value - v["min"]) / v["step"])
    return min(v["max"], max(v["min"], v["min"] + n * v["step"]))


# --- scoring engine ----------------------------------------------------------

def test_expressions():
    tree = parse_expr("-(a + 2) * b / 4", {"a", "b"})
    assert eval_expr(tree, {"a": 2, "b": 3}) == -3
    assert eval_expr(parse_expr("a - b - 1"), {"a": 5, "b": 1}) == 3  # left associative
    assert eval_expr(parse_expr("2 + 3 * 4"), {}) == 14
    assert eval_expr(parse_expr("a / (b - b)"), {"a": 1, "b": 2}) is None  # division by zero
    assert eval_expr(parse_expr("x"), {}) is None  # missing variable
    for bad in ("a ** 2", "__import__", "a; b", "a +", "(a", "A + 1", "a.b"):
        try:
            parse_expr(bad, {"a", "b"})
        except ExprError:
            continue
        raise AssertionError(f"accepted {bad!r}")
    try:
        parse_expr("a + c", {"a", "b"})
        raise AssertionError("accepted an unknown variable")
    except ExprError:
        pass


def test_curves_and_feedback():
    g = {"target": 10, "tolerance": 2, "weight": 1, "curve": "gaussian", "feedback": {"too_low": "L", "too_high": "H"}}
    assert curve_score(g, 0) == 1 and abs(curve_score(g, 2) - 0.60653) < 1e-4
    assert curve_score(dict(g, curve="linear"), 4) == 0 and curve_score(dict(g, curve="linear"), 2) == 0.5
    assert curve_score(dict(g, curve="step"), 2) == 1 and curve_score(dict(g, curve="step"), 2.01) == 0
    scoring = {
        "pass_threshold": 70,
        "variables": {
            "a": g,
            "b": {"range": [5, 6], "tolerance": 1, "weight": 3, "curve": "linear", "feedback": {"too_low": "b low", "too_high": "b high"}},
            "c": dict(g, feedback={"too_low": "c low", "too_high": "c high"}),
            "d": dict(g, weight=0.5, feedback={"too_low": "d low", "too_high": "d high"}),
        },
        "derived": [{"id": "r", "label": "Ratio", "expr": "a / b", **dict(g, target=2, tolerance=0.5, feedback={"too_low": "r low", "too_high": "r high"})}],
    }
    res = score_numeric(scoring, {"a": 14, "b": 9, "c": 4, "d": 30}, {}, "ok")
    assert len(res["feedback"]) == 3 and res["feedback"][0] == "b high"  # weight * (1 - s) ordering, max 3
    assert res["breakdown"]["b"]["score"] == 0 and not res["passed"]
    perfect = score_numeric(scoring, {"a": 10, "b": 5, "c": 10, "d": 10}, {}, "ok")
    assert perfect["score"] == 100 and perfect["feedback"] == ["ok"] and perfect["passed"]


# --- builder -------------------------------------------------------------------

def reachable(world):
    m = world["map"]
    blocked = set()
    for s in m["solids"]:
        for y in range(s["y"], s["y"] + s["h"]):
            for x in range(s["x"], s["x"] + s["w"]):
                blocked.add((x, y))
    for n in world["npcs"]:
        blocked.add(tuple(n["tile"]))
    start = tuple(m["spawn"])
    seen = {start}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if 0 <= n[0] < m["cols"] and 0 <= n[1] < m["rows"] and n not in blocked and n not in seen:
                seen.add(n)
                q.append(n)
    return seen


def next_to(seen, x, y, w, h):
    return any((xx, yy) in seen for yy in range(y - 1, y + h + 1) for xx in range(x - 1, x + w + 1))


def test_worlds():
    assert len(BRIEFS) >= 2, "need contract-shaped research fixtures"
    for path in BRIEFS:
        brief = json.loads(path.read_text())
        world = build(brief)
        name = path.name
        assert validate_world(world, RULES) == [], (name, validate_world(world, RULES))
        check_world(world)
        assert json.dumps(world) == json.dumps(build(brief)), f"{name}: build is not deterministic"
        assert len({l["task_id"] for l in world["levels"]}) == 4
        assert world["branch"] == f"game/{world['slug']}" and all(l["id"].startswith(world["slug"] + "-") for l in world["levels"])
        seen = reachable(world)
        locs = {l["id"]: l for l in world["map"]["locations"]}
        for n in world["npcs"]:
            assert next_to(seen, n["tile"][0], n["tile"][1], 1, 1), f"{name}: npc {n['id']} unreachable"
        for lvl in world["levels"]:
            loc = locs[lvl["quest"]["location_id"]]
            assert next_to(seen, loc["tile"][0], loc["tile"][1], loc["w"], loc["h"]), f"{name}: {loc['id']} unreachable"
            check_level(name, world, lvl, locs, seen)


def test_every_mechanic():
    """Dropping one task type from each brief makes the builder use the remaining mechanics, converse included."""
    seen_mechs = set()
    for path in BRIEFS:
        brief = json.loads(path.read_text())
        for drop in {t["mechanic"] for t in brief["tasks"]}:
            variant = dict(brief, tasks=[t for t in brief["tasks"] if t["mechanic"] != drop])
            if len(variant["tasks"]) < 4:
                continue
            world = build(variant)
            assert validate_world(world, RULES) == [], (path.name, drop, validate_world(world, RULES))
            check_world(world)
            seen = reachable(world)
            locs = {l["id"]: l for l in world["map"]["locations"]}
            for lvl in world["levels"]:
                check_level(f"{path.name}-{drop}", world, lvl, locs, seen)
                seen_mechs.add(lvl["mechanic"])
                if lvl["mechanic"] == "converse":
                    assert lvl["params"]["npc_id"] == lvl["quest"]["npc_id"]
                    assert all(o["reply"] for t in lvl["params"]["turns"] for o in t["options"])
    assert seen_mechs == set(RULES["limits"]["mechanic_ids"]), seen_mechs


def test_fixture_worlds():
    """The committed worlds (built with Gemini flavor) follow the rules too."""
    paths = BUILT_WORLDS
    assert paths
    for path in paths:
        world = json.loads(path.read_text())
        assert validate_world(world, RULES) == [], (path.name, validate_world(world, RULES))
        check_world(world)
        seen = reachable(world)
        locs = {l["id"]: l for l in world["map"]["locations"]}
        for lvl in world["levels"]:
            check_level(path.name, world, lvl, locs, seen)


def check_level(name, world, lvl, locs, seen):
    where = f"{name}:{lvl['id']}"
    secrets = scoring_secrets(lvl["scoring"])
    assert not reveals(lvl["aim"], secrets), f"{where}: aim reveals a target"
    assert lvl["aim"] and lvl["controls_hint"] and lvl["metric"]["name"]
    assert {d["at"] for d in lvl["dialogue"]} >= {"quest", "pass", "fail"}
    mech = lvl["mechanic"]
    pt = lvl["scoring"]["pass_threshold"]
    if mech == "mix":
        variables = lvl["params"]["variables"]
        sc = lvl["scoring"]["variables"]
        best = optimal_point(variables, lvl["scoring"], "mix")
        defaults = {v["id"]: v["default"] for v in variables}
        assert score_mix(lvl, best)["score"] >= pt + 5, f"{where}: optimum not winnable"
        assert score_mix(lvl, defaults)["score"] < score_mix(lvl, best)["score"], f"{where}: defaults already optimal"
        assert score_mix(lvl, best) == score_mix(lvl, dict(best)), f"{where}: scoring not deterministic"
    elif mech == "timing":
        phases = lvl["params"]["phases"]
        sc = lvl["scoring"]["variables"]
        best = optimal_point(phases, lvl["scoring"], "timing")
        assert score_timing(lvl, best)["score"] >= pt + 5, where
        assert score_timing(lvl, {})["score"] == 0, f"{where}: unfinished phases must score 0"
        for p in phases:
            assert p["mode"] in ("stop", "hold") and (p.get("period_ms") or p.get("fill_per_s")), where
    elif mech == "sort":
        correct = lvl["scoring"]["correct"]
        bins = [b["id"] for b in lvl["params"]["bins"]]
        assert score_sort(lvl, correct)["score"] == 100, where
        wrong = {k: bins[(bins.index(v) + 1) % len(bins)] for k, v in correct.items()}
        assert score_sort(lvl, wrong)["score"] == 0 and not score_sort(lvl, {})["passed"], where
    elif mech == "deliver":
        params = lvl["params"]
        assert 1 <= len(params["orders"]) <= 5 and params["capacity"] >= 1 and params["par_ms"] < lvl["time_limit_ms"], where
        for o in params["orders"]:
            for ref in (o["from"], o["to"]):
                loc = locs[ref.split(":", 1)[1]]
                assert next_to(seen, loc["tile"][0], loc["tile"][1], loc["w"], loc["h"]), f"{where}: {ref} unreachable"
        all_ok = {o["id"]: "delivered" for o in params["orders"]}
        assert score_deliver(lvl, all_ok, params["par_ms"])["score"] == 100, where
        assert not score_deliver(lvl, {}, lvl["time_limit_ms"])["passed"], where
    elif mech == "converse":
        spec = lvl["scoring"]["turns"]
        best = {t["id"]: max(spec[t["id"]], key=lambda o: spec[t["id"]][o]["points"]) for t in lvl["params"]["turns"]}
        assert score_converse(lvl, best)["passed"], where


def test_select_and_repairs():
    brief = json.loads(BRIEFS[0].read_text())
    tasks = brief["tasks"]
    picked = select_tasks(tasks)
    assert len(picked) == 4 and len({t["id"] for t, _ in picked}) == 4
    assert len({m for _, m in picked}) == min(4, len({t["mechanic"] for t in tasks}))
    try:
        select_tasks(tasks[:3])
        raise AssertionError("built a game from 3 tasks")
    except BuildError:
        pass
    # A researched aim or feedback that states the answer is replaced; bad flavor enums are dropped.
    leaky = json.loads(json.dumps(brief))
    mix = next(t for t in leaky["tasks"] if t["mechanic"] == "mix")
    var_ids = {v["id"] for v in mix["variables"]}
    opt = next(o for o in mix["optima"] if o["term"] in var_ids and (o.get("target") is not None or o.get("range")))
    secret = opt["target"] if opt.get("target") is not None else opt["range"][0]
    mix["aim"] = f"Use exactly {secret:g} to win."
    for h in mix["heuristic"]:
        h["too_low"] = f"Below {secret:g}."
    picked = select_tasks(leaky["tasks"])
    flavor = merge_flavor({"title": "T", "theme_name": "T", "levels": [dict(lf, location_kind="castle", icon="rocket") for lf in fallback_flavor(leaky, picked)["levels"]]},
                          fallback_flavor(leaky, picked))
    world, _ = build_world(leaky, flavor, RULES["version"])
    assert validate_world(world, RULES) == []
    lvl = next(l for l in world["levels"] if l["task_id"] == mix["id"])
    assert f"{secret:g}" not in lvl["aim"]


# --- TypeScript parity -----------------------------------------------------------

def parity_cases():
    rng = random.Random(7)
    cases = []
    for path in BUILT_WORLDS + [root / "fixtures/example-world.v2.json"]:  # the sample adds a converse level
        world = json.loads(path.read_text())
        for lvl in world["levels"]:
            for _ in range(12):
                mech = lvl["mechanic"]
                p = lvl["params"]
                if mech == "mix":
                    vals = {v["id"]: snap(v, rng.uniform(v["min"], v["max"])) for v in p["variables"]}
                    cases.append({"kind": "mix", "level": lvl, "values": vals, "order": []})
                elif mech == "timing":
                    res = {ph["id"]: round(rng.uniform(ph["min"], ph["max"]), 3) for ph in p["phases"] if rng.random() < 0.85}
                    cases.append({"kind": "timing", "level": lvl, "results": res})
                elif mech == "sort":
                    bins = [b["id"] for b in p["bins"]]
                    placed = {it["id"]: rng.choice(bins) for it in p["items"] if rng.random() < 0.9}
                    cases.append({"kind": "sort", "level": lvl, "placed": placed})
                elif mech == "deliver":
                    st = {o["id"]: rng.choice(["waiting", "carrying", "delivered", "delivered", "wrong"]) for o in p["orders"]}
                    cases.append({"kind": "deliver", "level": lvl, "statuses": st, "t": rng.uniform(0, lvl["time_limit_ms"])})
                else:
                    chosen = {t["id"]: rng.choice(t["options"])["id"] for t in p["turns"] if rng.random() < 0.9}
                    cases.append({"kind": "converse", "level": lvl, "chosen": chosen, "ended": rng.choice(["complete", "critical", "timeout"])})
    return cases


def py_score(c):
    lvl = c["level"]
    return {
        "mix": lambda: score_mix(lvl, c["values"], c["order"]),
        "timing": lambda: score_timing(lvl, c["results"]),
        "sort": lambda: score_sort(lvl, c["placed"]),
        "deliver": lambda: score_deliver(lvl, c["statuses"], c["t"]),
        "converse": lambda: score_converse(lvl, c["chosen"], c["ended"]),
    }[c["kind"]]()


TS_RUNNER = """
import { readFileSync } from 'node:fs'
import * as S from %s
const cases = JSON.parse(readFileSync(0, 'utf8'))
const out = cases.map((c) => {
  switch (c.kind) {
    case 'mix': return S.scoreMix(c.level, c.values, c.order)
    case 'timing': return S.scoreTiming(c.level, c.results)
    case 'sort': return S.scoreSort(c.level, c.placed)
    case 'deliver': return S.scoreDeliver(c.level, c.statuses, c.t)
    default: return S.scoreConverse(c.level, c.chosen, c.ended)
  }
})
process.stdout.write(JSON.stringify(out))
"""


def test_ts_parity():
    node = shutil.which("node")
    if not node:
        print("  (skipped TS parity: node not found)")
        return
    cases = parity_cases()
    script = TS_RUNNER % json.dumps((root / "frontend/src/game/scoring.ts").as_uri())
    proc = subprocess.run([node, "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
                          input=json.dumps(cases), capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr[-2000:]
    ts = json.loads(proc.stdout)
    for c, t in zip(cases, ts):
        p = py_score(c)
        assert abs(p["score"] - t["score"]) < 1e-9 and p["passed"] == t["passed"] and p["feedback"] == t["feedback"] \
            and p["breakdown"] == t["breakdown"], (c["kind"], c["level"]["id"], p, t)
    print(f"  TS and Python scoring agree on {len(cases)} cases")


# --- game branch ---------------------------------------------------------------------

class NoGemini:
    def is_configured(self):
        return False


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def test_game_branch():
    tmp = Path(tempfile.mkdtemp(prefix="replaceme-builder-test-"))
    try:
        (tmp / "shared").mkdir()
        shutil.copy(root / "shared/actions.json", tmp / "shared/actions.json")
        (tmp / ".gitignore").write_text("games/\n")
        git(tmp, "init", "-q", "-b", "main")
        git(tmp, "add", ".")
        git(tmp, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init")
        agent = BuilderAgent(workspace_dir=tmp, gemini_client=NoGemini())
        brief = json.loads(BRIEFS[0].read_text())
        world = agent.build_world(brief)
        slug = world["slug"]
        committed = json.loads(git(tmp, "show", f"game/{slug}:games/{slug}/world.json"))
        assert committed == world
        assert git(tmp, "rev-parse", "--abbrev-ref", "HEAD") == "main", "builder switched the main working tree"
        assert git(tmp, "status", "--porcelain") == "", "builder left changes in the main working tree"
        assert len(git(tmp, "worktree", "list").splitlines()) == 1, "temporary worktree left behind"
        assert git(tmp, "merge-base", "--is-ancestor", "main", f"game/{slug}") == ""
        agent.build_world(brief)  # rebuild: graph_check re-validates and records a fresh commit on game/<slug>
        assert json.loads(git(tmp, "show", f"game/{slug}:games/{slug}/world.json")) == world
        assert git(tmp, "rev-parse", f"game/{slug}^") == git(tmp, "rev-parse", "main"), "game branch should sit directly on main"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    for fn in (test_expressions, test_curves_and_feedback, test_worlds, test_every_mechanic, test_fixture_worlds, test_select_and_repairs, test_ts_parity, test_game_branch):
        fn()
        print(f"ok {fn.__name__}")
    print("World builder tests passed")
