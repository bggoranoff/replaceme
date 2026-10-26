"""
Tests for the builder's design decisions in Entire Brain (builder/brain_log.py, builder/agent.py).

Offline: uses a fake entire-brain CLI (ENTIRE_BRAIN_BIN) like scripts/test_brain.py, the built
games/florist and games/barista worlds and the builder's deterministic flavor, never Gemini.

Run: python3 scripts/test_builder_brain.py
"""

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from builder import brain_log
from builder.agent import BuilderAgent

# remember-only stand-in for the entire-brain CLI; FAKE_BRAIN_FAIL makes every call fail.
FAKE_BRAIN = r'''
import json, os, sys
if os.environ.get("FAKE_BRAIN_FAIL"):
    print("brain is down", file=sys.stderr)
    sys.exit(1)
store = os.environ["FAKE_BRAIN_STORE"]
facts = json.load(open(store)) if os.path.exists(store) else []
args = sys.argv[1:]
def opt(name):
    return args[args.index(name) + 1] if name in args else None
fact = {"id": f"fact:{len(facts):024x}", "text": args[1], "branch": opt("--branch"), "paths": [opt("--path")],
        "kind": opt("--kind"), "agent": opt("--agent")}
facts.append(fact)
json.dump(facts, open(store, "w"))
print(json.dumps(fact))
'''


def check(cond, message):
    if not cond:
        raise AssertionError(message)


def set_env(**values):
    old = {k: os.environ.get(k) for k in values}
    for k, v in values.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    return old


def stored(tmp: Path):
    path = tmp / "facts.json"
    return json.loads(path.read_text()) if path.exists() else []


def test_record_build(tmp: Path):
    for slug in ("florist", "barista"):
        world = brain_log.load_world(slug)
        before = len(stored(tmp))
        ids = brain_log.record_build(world)
        facts = stored(tmp)[before:]
        check(len(ids) == len(facts) == 1 + len(world["levels"]), f"{slug}: one world fact + one per level")
        check({f["branch"] for f in facts} == {f"game/{slug}"}, f"{slug}: facts live on brain branch game/<slug>")
        check({f["paths"][0] for f in facts} == {"project.builder.design"}, f"{slug}: path project.builder.design")
        check({f["kind"] for f in facts} == {"decision"} and {f["agent"] for f in facts} == {"none"}, f"{slug}: unclassified decisions")
        check(facts[0]["text"].startswith(f"[replaceme build decision] job={slug} level=world"), f"{slug}: world header")
        check(world["title"] in facts[0]["text"] and f"{world['map']['cols']}x{world['map']['rows']}" in facts[0]["text"],
              f"{slug}: world fact has title and map size")
        for level, fact in zip(world["levels"], facts[1:]):
            text = fact["text"]
            check(text.startswith(f"[replaceme build decision] job={slug} level={level['id']}\n"), f"{level['id']}: level header")
            check(level["title"] in text and f"mechanic: {level['mechanic']}" in text, f"{level['id']}: title and mechanic")
            check(f"pass threshold: {level['scoring']['pass_threshold']:g}" in text, f"{level['id']}: pass threshold")
            for vid in (level["scoring"].get("variables") or {}):
                check(f"- {vid}" in text, f"{level['id']}: scoring variable {vid}")
    brew = next(f["text"] for f in stored(tmp) if "level=barista-brew-coffee" in f["text"])
    check("contact_s s: good 180-210 (tol 30, weight 2) [control 60-360]" in brew, f"ranges and controls in the fact:\n{brew}")
    check("location: Coffee bar; quest giver: Juniper" in brew, "location and quest giver by name")


def test_agent_records(tmp: Path):
    work = tmp / "workspace"
    (work / "shared").mkdir(parents=True)
    shutil.copy(root / "shared/actions.json", work / "shared/actions.json")
    brief = json.loads((root / "fixtures/baker-research.v2.json").read_text())
    before = len(stored(tmp))
    world = BuilderAgent(workspace_dir=work, gemini_client=NoGemini()).build_world(brief, commit=False)
    facts = stored(tmp)[before:]
    check(len(facts) == 1 + len(world["levels"]), "a successful build records its decisions")
    check(all(f["branch"] == f"game/{world['slug']}" for f in facts), "on the game's brain branch")


def test_never_fails(tmp: Path):
    world = brain_log.load_world("florist")
    old = set_env(FAKE_BRAIN_FAIL="1")
    try:
        check(brain_log.record_build(world) == [], "a failing CLI stores nothing and does not raise")
    finally:
        set_env(**old)
    old = set_env(ENTIRE_BRAIN_BIN="")
    try:
        check(brain_log.record_build(world) == [], "no CLI -> no-op")
    finally:
        set_env(**old)


class NoGemini:
    def is_configured(self):
        return False


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        exe = tmp / "entire-brain"
        exe.write_text(f"#!{sys.executable}\n{FAKE_BRAIN}")
        exe.chmod(0o755)
        old = set_env(ENTIRE_BRAIN_BIN=str(exe), FAKE_BRAIN_STORE=str(tmp / "facts.json"), FAKE_BRAIN_FAIL=None)
        try:
            test_record_build(tmp)
            test_agent_records(tmp)
            test_never_fails(tmp)
        finally:
            set_env(**old)
    print("Builder design decisions are stored in Entire Brain")
