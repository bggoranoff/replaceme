"""
Tests for researcher reasoning traces in Entire Brain (shared/brain.py), the
researcher's C1 task normalization (researcher/normalize.py), the builder's
brain-first trace loading, and the research.json v2 example fixture.

    python3 scripts/test_brain.py          # offline (fake entire-brain CLI)
    python3 scripts/test_brain.py --live   # also round-trips through the real entire-brain CLI
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from shared import brain
from shared.schemas.research import ResearchBrief
from researcher.normalize import evaluate, expr_identifiers, playable, repair_draft, slugify, to_research_task, validate_draft

RULES = json.loads((root / "shared/actions.json").read_text())
FIXTURE = root / "fixtures/example-research.v2.json"

# A stand-in for the entire-brain CLI: remember / multi-get / recall over a JSON file.
FAKE_BRAIN = r'''
import json, os, sys
store = os.environ["FAKE_BRAIN_STORE"]
facts = json.load(open(store)) if os.path.exists(store) else []
args = sys.argv[1:]
def opt(name):
    return args[args.index(name) + 1] if name in args else None
branch = opt("--branch")
if args[0] == "remember":
    fact = {"id": f"fact:{len(facts):024x}", "text": args[1], "branch": branch, "paths": [opt("--path")], "kind": opt("--kind")}
    facts.append(fact)
    json.dump(facts, open(store, "w"))
    print(json.dumps(fact))
elif args[0] == "multi-get":
    ids = [a for a in args[1:] if a.startswith("fact:")]
    found = {f["id"]: f for f in facts if f["branch"] == branch}
    print(json.dumps({"branch": branch, "missing": [i for i in ids if i not in found],
                      "results": [{"source": "fact", "id": i, "text": found[i]["text"]} for i in ids if i in found]}))
    sys.exit(0 if all(i in found for i in ids) else 1)
elif args[0] == "recall":
    words = [w for w in args[1].split() if w.startswith("run=")]
    hits = [f for f in facts if f["branch"] == branch and all(w in f["text"] for w in words)]
    print(json.dumps({"branch": branch, "facts": hits[: int(opt("--k") or 10)]}))
'''

TRACES = [
    {"task_id": "task-a", "step": 1, "thought": "Why chosen: central to the job.", "evidence": ["https://example.org/a"]},
    {"task_id": None, "step": 2, "thought": "Assumptions: a small workshop.", "evidence": []},
    {"task_id": "task-b", "step": 3, "thought": "Caveats: watch for X.\nProblems: Y happens.", "evidence": ["search: how to do b", "https://example.org/b"]},
]


def check(cond, message):
    if not cond:
        raise AssertionError(message)


def test_fact_round_trip():
    for trace in TRACES:
        text = brain.format_fact("some-job", "some-job-1", trace)
        check(text.startswith(brain.HEADER), "fact starts with the trace header")
        run_id, parsed = brain.parse_fact(text)
        check(run_id == "some-job-1" and parsed == trace, f"round trip changed the trace: {parsed} != {trace}")
    check(brain.parse_fact("an unrelated fact") is None, "unrelated facts are ignored")


def with_fake_brain(fn):
    with tempfile.TemporaryDirectory() as tmp:
        exe = Path(tmp) / "entire-brain"
        exe.write_text(f"#!{sys.executable}\n{FAKE_BRAIN}")
        exe.chmod(0o755)
        old = {k: os.environ.get(k) for k in ("ENTIRE_BRAIN_BIN", "FAKE_BRAIN_STORE")}
        os.environ["ENTIRE_BRAIN_BIN"] = str(exe)
        os.environ["FAKE_BRAIN_STORE"] = str(Path(tmp) / "facts.json")
        try:
            fn(Path(tmp))
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


def test_push_and_load(tmp: Path):
    ref = brain.push_traces("some-job", "some-job-1", TRACES)
    check(ref["stored"] and len(ref["ids"]) == len(TRACES), f"all traces stored: {ref}")
    check(ref["query"] == brain.query_for("some-job-1"), "query names the run")
    facts = json.loads((tmp / "facts.json").read_text())
    check({f["branch"] for f in facts} == {"game/some-job"}, "traces live on brain branch game/<slug>")
    check([f["kind"] for f in facts] == ["decision", "decision", "gotcha"], "caveat traces are stored as gotchas")

    # Brain first: the research.json copy is stale here, the brain copy wins.
    brief = {"slug": "some-job", "brain": ref, "reasoning_traces": [{"task_id": None, "step": 1, "thought": "stale", "evidence": []}]}
    traces, source = brain.load_traces(brief)
    check(source == "entire-brain" and traces == TRACES, f"loaded from Entire Brain by ids: {source}")

    # Unknown ids -> falls back to the recall query, filtered to this run.
    brain.push_traces("some-job", "some-job-2", [{"task_id": None, "step": 1, "thought": "other run", "evidence": []}])
    traces, source = brain.load_traces({**brief, "brain": {**ref, "ids": ["fact:missing"]}})
    check(source == "entire-brain" and traces == TRACES, "recall query fallback returns only this run's traces")

    # Builder loads the brief through the same helper.
    from builder.agent import BuilderAgent
    path = tmp / "research.json"
    path.write_text(json.dumps(brief))
    loaded = BuilderAgent(workspace_dir=tmp).load_research_brief(path)
    check(loaded["reasoning_traces"] == TRACES, "builder sees the Entire Brain traces")
    prompt = brain.reasoning_prompt(loaded, "task-b")
    check("Caveats: watch for X." in prompt and "Assumptions" in prompt and "Why chosen" not in prompt,
          "per-task prompt holds overall + that task's traces only")

    # A fact gone from the brain (retracted, gc'd): the rest still come from the brain, the gap from research.json.
    facts = [f for f in json.loads((tmp / "facts.json").read_text()) if f["id"] != ref["ids"][1]]
    (tmp / "facts.json").write_text(json.dumps(facts))
    traces, source = brain.load_traces({**brief, "reasoning_traces": TRACES})
    check(source == "entire-brain" and traces == TRACES, f"missing brain facts filled from research.json: {traces}")


def test_fallback_without_brain():
    old = os.environ.get("ENTIRE_BRAIN_BIN")
    os.environ["ENTIRE_BRAIN_BIN"] = ""
    try:
        check(brain.brain_bin() is None, "empty ENTIRE_BRAIN_BIN disables the brain")
        ref = brain.push_traces("some-job", "some-job-1", TRACES)
        check(ref["stored"] is False and ref["ids"] == [], "nothing stored without the CLI")
        traces, source = brain.load_traces({"slug": "some-job", "brain": {"stored": True, "ids": ["fact:x"], "query": "q"},
                                            "reasoning_traces": TRACES})
        check(source == "research.json" and traces == TRACES, "falls back to research.json reasoning_traces")
        check(brain.load_traces({"slug": "x"}) == ([], "none"), "no traces anywhere")
    finally:
        if old is None:
            os.environ.pop("ENTIRE_BRAIN_BIN", None)
        else:
            os.environ["ENTIRE_BRAIN_BIN"] = old


def test_normalize():
    check(expr_identifiers("a / (b + 2)") == {"a", "b"}, "valid expr")
    check(expr_identifiers("yield / dose") == {"yield", "dose"} and evaluate("yield / dose", {"yield": 3, "dose": 2}) == 1.5,
          "ids that are Python keywords are valid grammar ids")
    check(evaluate("-a - -2 * (b + .5)", {"a": 1, "b": 1}) == 2.0, "unary minus, decimals and precedence")
    for bad in ("a ** 2", "__import__('os')", "a // b", "1e3 * a", "A + b", "a; b"):
        check(expr_identifiers(bad) is None, f"rejects {bad}")
    check(slugify("Fancy Task Name With Many Words", max_len=12) == "fancy-task", "slug cut at a word boundary")

    draft = {
        "aim": "Reach exactly 50 units of output.",
        "variables": [
            {"id": "amount", "label": "Amount", "unit": "u", "min": 0, "max": 40, "step": 1, "default": 50},
            {"id": "time_s", "label": "Time", "unit": "s", "min": 10, "max": 100, "step": 5, "default": 30},
            {"id": "extra", "label": "Unscored", "unit": "u", "min": 0, "max": 10, "step": 1, "default": 2},
        ],
        "derived": [{"id": "rate", "label": "Rate", "expr": "amount / time_s"}, {"id": "bad", "label": "Bad", "expr": "amount ** 2"}],
        "optima": [
            {"term": "amount", "target": 50, "range": None, "rationale": "r", "source_ids": [1]},
            {"term": "time_s", "target": None, "range": [25, 35], "rationale": "r", "source_ids": [2]},
            {"term": "bad", "target": 1, "range": None, "rationale": "r", "source_ids": [1]},
            {"term": "rate", "target": 10, "range": None, "rationale": "r", "source_ids": [1]},
        ],
        "heuristic": [
            {"term": "amount", "tolerance": 5, "weight": 2, "curve": "gaussian", "too_low": "Thin, use 50 next time.", "too_high": "Overflowing.", "rationale": "r"},
            {"term": "time_s", "tolerance": 5, "weight": 1, "curve": "linear", "too_low": "Rushed.", "too_high": "Burnt.", "rationale": "r"},
            {"term": "bad", "tolerance": 1, "weight": 1, "curve": "step", "too_low": "x", "too_high": "y", "rationale": "r"},
            {"term": "rate", "tolerance": 0.2, "weight": 1, "curve": "gaussian", "too_low": "Slow.", "too_high": "Fast.", "rationale": "r"},
        ],
        "sort_items": [], "sort_bins": [], "orders": [], "dialogue": [],
        "caveats": ["c"], "problems": ["p"], "source_ids": [1, 2],
    }
    issues = validate_draft(draft, "mix", n_sources=2)
    for needle in ("outside the variable", "expr", "aim reveals", "feedback reveals", "default must be inside", "disagrees",
                   "extra affects no heuristic"):
        check(any(needle in issue for issue in issues), f"validate_draft reports '{needle}': {issues}")

    fixed = repair_draft(draft, "mix")
    check(playable(fixed, "mix") and not validate_draft(fixed, "mix", 2), f"repaired draft is valid: {validate_draft(fixed, 'mix', 2)}")
    amount = next(v for v in fixed["variables"] if v["id"] == "amount")
    check(amount["min"] <= 50 <= amount["max"], "bounds widened to include the optimum")
    check(abs(amount["default"] - 50) > 5, "default moved away from the optimum")
    time_s = next(v for v in fixed["variables"] if v["id"] == "time_s")
    check(not 20 <= time_s["default"] <= 40, "default moved out of the optimal range")
    check([d["id"] for d in fixed["derived"]] == ["rate"], "invalid derived term dropped")
    check([v["id"] for v in fixed["variables"]] == ["amount", "time_s"], "unscored control dropped")
    rate = next(o for o in fixed["optima"] if o["term"] == "rate")
    check(abs(rate["target"] - 50 / 30) < 1e-6, "derived optimum aligned with the variable optima")
    check(evaluate("amount / (time_s - 30)", {"amount": 1, "time_s": 30}) is None, "division by zero evaluates to None")
    check("50" not in fixed["aim"] and "50" not in fixed["heuristic"][0]["too_low"], "leaked targets stripped")

    coarse = {**draft, "variables": [{"id": "heat", "label": "Heat", "unit": "C", "min": 0, "max": 100, "step": 0, "default": 10}],
              "derived": [], "optima": [{"term": "heat", "target": 47, "range": None, "rationale": "r", "source_ids": []}],
              "heuristic": [{"term": "heat", "tolerance": 1, "weight": 1, "curve": "linear", "too_low": "Cold.", "too_high": "Hot.", "rationale": "r"}],
              "aim": "Heat it right."}
    coarse_issues = validate_draft({**coarse, "variables": [{**coarse["variables"][0], "step": 5}]}, "mix", 2)
    check(any("step is too coarse" in i for i in coarse_issues) and any("source_ids must cite" in i for i in coarse_issues),
          f"coarse step and unsourced optimum reported: {coarse_issues}")
    heat = repair_draft(coarse, "mix")["variables"][0]
    check(heat["step"] <= 0.4 and abs(round((47 - heat["min"]) / heat["step"]) * heat["step"] + heat["min"] - 47) < 0.2,
          f"fallback step is fine enough to reach the optimum: {heat}")

    sources = [{"title": "one", "url": "https://one.example"}, {"title": "two", "url": "https://two.example"}]
    planned = {"id": "make-thing", "title": "Make thing", "summary": "s", "mechanic": "mix", "mechanic_rationale": "m"}
    task = to_research_task(planned, fixed, sources)
    check(task["optima"][0]["source_urls"] == ["https://one.example"] and "range" not in task["optima"][0], "source ids mapped to URLs")
    check(task["sources"] == sources, "task sources come from the cited list")

    sort_draft = {**draft, "sort_items": [{"label": f"i{n}", "correct_bin": "keep" if n % 2 else "nowhere", "feedback": "f"} for n in range(6)],
                  "sort_bins": ["keep", "toss"]}
    fixed_sort = repair_draft(sort_draft, "sort")
    check(fixed_sort["variables"] == [] and all(i["correct_bin"] == "keep" for i in fixed_sort["sort_items"]), "sort repair")
    check(playable(fixed_sort, "sort"), "3 valid sort items remain playable")


def test_fixture():
    brief = json.loads(FIXTURE.read_text())
    ResearchBrief.model_validate(brief)
    tasks = brief["tasks"]
    check(len(tasks) >= RULES["limits"]["levels_per_game"], "at least 4 tasks")
    check(len({t["id"] for t in tasks}) == len(tasks), "distinct task ids")
    urls = {s["url"] for s in brief["sources"]}
    check(urls and all(u.startswith("http") for u in urls), "cited source URLs")
    for task in tasks:
        tid, mech = task["id"], task["mechanic"]
        check(mech in RULES["limits"]["mechanic_ids"], f"{tid}: mechanic on the allowlist")
        check(re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", tid), f"{tid}: kebab-case id")
        check(task["sources"] and {s["url"] for s in task["sources"]} <= urls, f"{tid}: task sources are cited")
        check(task["caveats"] and task["problems"], f"{tid}: caveats and problems")
        draft = {**task, "source_ids": [1]}
        draft["optima"] = [{"target": None, "range": None, **o, "source_ids": [1] if o["source_urls"] else []} for o in task["optima"]]
        check(not validate_draft(draft, mech, n_sources=1), f"{tid}: passes C1 validation {validate_draft(draft, mech, 1)}")
        if mech in ("mix", "timing"):
            for opt in task["optima"]:
                check(set(opt["source_urls"]) <= urls, f"{tid}: optimum sources are cited")
    traces = brief["reasoning_traces"]
    check(traces and [t["step"] for t in traces] == list(range(1, len(traces) + 1)), "ordered reasoning traces")
    check({t["task_id"] for t in traces} - {None} <= {t["id"] for t in tasks}, "traces reference real tasks")
    for tid in {t["id"] for t in tasks}:
        check(any(t["task_id"] == tid and t["thought"].startswith("Why chosen") for t in traces), f"{tid}: why-chosen trace")
    check(brief["brain"]["query"] and len(brief["brain"]["ids"]) == len(traces), "brain ref covers every trace")


def test_live():
    if not brain.brain_bin():
        print("  live: entire-brain not installed, skipped")
        return
    run_id = f"brain-selftest-{os.getpid()}"
    ref = brain.push_traces("brain-selftest", run_id, TRACES)
    try:
        check(ref["stored"], f"stored in the real Entire Brain: {ref}")
        traces, source = brain.load_traces({"slug": "brain-selftest", "brain": ref, "reasoning_traces": []})
        check(source == "entire-brain" and traces == TRACES, "real Entire Brain round trip")
        print(f"  live: {len(ref['ids'])} facts on {brain.branch_for('brain-selftest')} round-tripped")
    finally:
        for fact_id in ref["ids"]:
            subprocess.run([brain.brain_bin(), "facts", "retract", fact_id, "--branch", brain.branch_for("brain-selftest")],
                           cwd=root, capture_output=True)


if __name__ == "__main__":
    test_fact_round_trip()
    with_fake_brain(test_push_and_load)
    test_fallback_without_brain()
    test_normalize()
    test_fixture()
    if "--live" in sys.argv:
        test_live()
    print("Brain traces, researcher normalization, builder loading and research v2 fixture are valid")
