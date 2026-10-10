"""
Unit tests for the actor: allowlist validation, systematic (non-random) exploration that converges
within 10 attempts, and that the actor never sees scoring targets. Fast, no browser, no network.

    python3 scripts/test_actor.py
"""

import copy
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from actor.agent import public_level, render_skill_md  # noqa: E402
from actor.explore import ChoiceStrategy, NumericStrategy  # noqa: E402
from actor.rules import ActionRejected, Allowlist  # noqa: E402

WORLD = json.loads((ROOT / "fixtures/example-world.v2.json").read_text())
RULES = Allowlist.load()


# Reference scorer for the tests only (actions.json scoring_spec); the actor never calls it.
def _curve(d, tol, kind):
    if kind == "gaussian":
        return math.exp(-0.5 * (d / tol) ** 2)
    if kind == "linear":
        return max(0.0, 1 - d / (2 * tol))
    return 1.0 if d <= tol else 0.0


def score_numeric(level, values):
    sc = level["scoring"]
    terms = [(vid, vid, values[vid], t) for vid, t in sc["variables"].items()]
    for t in sc.get("derived", []):
        try:
            x = eval(t["expr"], {"__builtins__": {}}, dict(values))
        except ZeroDivisionError:
            x = None
        terms.append((t["id"], t["label"], x, t))
    num = den = 0.0
    bd, fb = {}, []
    for tid, label, x, t in terms:
        if x is None:
            s, low = 0.0, True
        elif "range" in t:
            lo, hi = t["range"]
            s, low = _curve(0 if lo <= x <= hi else min(abs(x - lo), abs(x - hi)), t["tolerance"], t["curve"]), x < lo
        else:
            s, low = _curve(abs(x - t["target"]), t["tolerance"], t["curve"]), x < t["target"]
        num += t["weight"] * s
        den += t["weight"]
        bd[tid] = {"label": label, "score": round(100 * s)}
        if s < 0.8:
            fb.append((t["weight"] * (1 - s), t["feedback"]["too_low" if low else "too_high"]))
    total = round(100 * num / den, 1)
    return {"score": total, "passed": total >= sc["pass_threshold"], "breakdown": bd,
            "feedback": [m for _, m in sorted(fb, key=lambda z: -z[0])[:3]] or [level.get("success_line", "ok")]}


def play_mix(level, attempts=10, breakdown=True):
    st = NumericStrategy("mix")
    st.register({"mechanic_state": {"variables": [dict(v, value=v["default"]) for v in level["params"]["variables"]]}, "targets": []})
    scores, plans = [], []
    for k in range(1, attempts + 1):
        plan, why = st.suggest(k, attempts)
        assert why, "every attempt has a stated reason"
        values = {vid: st.value_for(vid, plan) for vid in st.vars}
        for v in level["params"]["variables"]:
            assert v["min"] <= values[v["id"]] <= v["max"], "values stay inside the control range"
        res = score_numeric(level, values)
        if not breakdown:
            res["breakdown"] = {}
        st.record(k, {"values": values}, res)
        scores.append(res["score"])
        plans.append(values)
    return scores, plans, st


def test_allowlist():
    obs = {"level_id": "x", "mechanic": "mix", "viewport": {"w": 512, "h": 320},
           "targets": [{"id": "slider:a", "x": 0, "y": 0, "w": 10, "h": 10, "enabled": True}]}
    assert RULES.validate({"action": "key_left", "params": {"hold_ms": 99999}}, obs)["params"]["hold_ms"] == 5000
    assert RULES.validate({"action": "key_up"}, obs)["params"] == {"hold_ms": 0}
    assert RULES.validate({"action": "mouse_click", "params": {"x": 900, "y": -4}}, obs)["params"] == {"x": 512.0, "y": 0.0}
    assert RULES.validate({"action": "mouse_click", "params": {"target_id": "slider:a", "x": 1, "y": 2}}, obs)["params"] == {"target_id": "slider:a"}
    assert RULES.validate({"action": "interact", "params": {"bogus": 1}}, obs) == {"action": "interact", "params": {}}
    for bad in ({"action": "teleport"}, {"action": "wait", "params": {"ms": 10}},  # wait is not a mix control
                {"action": "mouse_click", "params": {"target_id": "slider:zzz"}}, {"action": "mouse_click", "params": {}},
                {"action": "key_up", "params": {"hold_ms": "lots"}}):
        try:
            RULES.validate(bad, obs)
        except ActionRejected:
            continue
        raise AssertionError(f"should reject {bad}")
    try:
        RULES.validate({"action": "key_right"}, obs, offered=["interact"])
        raise AssertionError("must respect listActions()")
    except ActionRejected:
        pass
    timing = dict(obs, mechanic="timing", targets=[])
    assert RULES.validate({"action": "wait", "params": {"ms": 12.6}}, timing)["params"] == {"ms": 13}
    try:
        RULES.validate({"action": "wait", "params": {}}, timing)
        raise AssertionError("wait.ms is required")
    except ActionRejected:
        pass


def test_mix_converges_and_is_deterministic():
    level = WORLD["levels"][0]
    scores, plans, st = play_mix(level)
    assert scores[0] < 50 and max(scores) >= 95 and scores[-1] == max(scores), scores
    assert play_mix(level)[1] == plans, "same evidence -> same plans (no randomness)"
    knowledge = st.knowledge()
    lp = {p["variable"]: p for p in knowledge["learned_parameters"]}
    assert set(lp) == {"speed_rpm", "time_s", "frames"} and all(p["evidence"] for p in lp.values())
    assert lp["speed_rpm"]["unit"] == "rpm" and len(knowledge["control_effects"]) >= 3


def test_mix_other_curves_and_without_breakdown():
    level = copy.deepcopy(WORLD["levels"][0])
    level["scoring"]["variables"]["speed_rpm"].update(curve="step", tolerance=40)
    level["scoring"]["variables"]["frames"].update(curve="linear")
    scores, _, _ = play_mix(level)
    assert max(scores) >= 95 and scores[-1] == max(scores), scores
    scores, _, _ = play_mix(WORLD["levels"][0], breakdown=False)
    assert max(scores) >= 80 and scores[-1] == max(scores), scores


def test_choices_one_at_a_time():
    level = WORLD["levels"][3]  # converse
    st = ChoiceStrategy("converse")
    scores = []
    for k in range(1, 11):
        plan, _ = st.suggest(k, 10)
        history, chosen, early = [], {}, False
        for i, turn in enumerate(level["params"]["turns"]):
            st.register({"mechanic_state": {"turn_index": i, "line": turn["npc_line"], "options": turn["options"], "history": history}})
            opt = st.value_for(str(i), plan)
            chosen[str(i)] = opt
            history = history + [{"turn_id": turn["id"], "option_id": opt}]
            if level["scoring"]["turns"][turn["id"]][opt].get("critical"):
                early = True
                break
        st.register({"mechanic_state": {"history": history}})
        pts = [level["scoring"]["turns"][h["turn_id"]][h["option_id"]]["points"] for h in history]
        total = round(100 * sum(pts) / len(level["params"]["turns"]), 1)
        if early:
            total = min(total, level["scoring"]["pass_threshold"] - 1)
        st.record(k, {"choices": chosen}, {"score": total, "passed": total >= 70, "feedback": [], "breakdown": {}}, early_end=early)
        scores.append(total)
    assert scores[-1] == 100.0 and scores[0] < 100, scores
    assert any("ends the level" in e["effect"].lower() for e in st.knowledge()["control_effects"]), "critical answer recorded"


def test_actor_never_sees_targets():
    for level in WORLD["levels"]:
        pub = public_level(level)
        assert "scoring" not in pub and "params" not in pub
        assert set(pub) <= {"id", "index", "title", "task_id", "skill_name", "mechanic", "quest", "aim", "controls_hint",
                            "metric", "time_limit_ms", "sources", "pass_threshold"}
    src = "\n".join(p.read_text() for p in (ROOT / "actor").glob("*.py"))
    assert not re.search(r"^\s*import random|^\s*from random", src, re.M), "the actor never uses random"
    for name in ("drivers.py", "explore.py", "reasoning.py"):
        code = (ROOT / "actor" / name).read_text()
        assert not re.search(r"""\[["']scoring["']\]|get\(["']scoring["']""", code), f"{name} must not read level scoring"


def test_skill_md_frontmatter():
    skill = {"name": "N", "description": "D: with colon", "status": "learned", "level_id": "j-t", "mechanic": "mix",
             "trained_attempts": 10, "best_score": 97.5, "updated_at": "2026-01-01T00:00:00Z", "job": "j", "level_index": 1,
             "final_score": 97.5, "pass_threshold": 70.0, "passed": True,
             "learned_parameters": [{"variable": "a", "label": "A", "value": 3, "unit": "g", "rationale": "r",
                                     "evidence": [{"attempt": 1, "value": 2, "score": 40.0}]}],
             "control_effects": [], "steps": ["s"], "caveats": [], "problems": [], "score_history": [], "attempts": [],
             "sources": [], "user_context": []}
    md = render_skill_md(skill)
    head = md.split("---")[1]
    for key in ("name", "description", "status", "level_id", "mechanic", "trained_attempts", "best_score", "updated_at"):
        assert re.search(rf"^{key}: ", head, re.M), key
    assert '"D: with colon"' in head and "3 g" in md and "#1: 2 g -> 40.0" in md


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"ok  {name}")
    print("Actor unit tests passed")
