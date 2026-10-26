"""
Entire Brain log of the builder's design decisions.

After a successful build the builder stores one fact per level and one for the
world with the `entire-brain` CLI on brain branch `game/<slug>` under path
`project.builder.design`, next to the researcher's reasoning traces
(shared/brain.py). No CLI -> nothing is stored; Brain never fails a build.

Fact text layout:

    [replaceme build decision] job=<slug> level=<id|world>
    <short plain-text summary>

Backfill the facts of an already built world:

    python3 builder/brain_log.py --backfill florist
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from shared.brain import _run, brain_bin, branch_for

FACT_PATH = "project.builder.design"
HEADER = "[replaceme build decision]"
WORLD = "world"


def _num(value: Any) -> str:
    return f"{value:g}" if isinstance(value, (int, float)) else str(value)


def _optimum(spec: Dict[str, Any]) -> str:
    if spec.get("range"):
        lo, hi = spec["range"]
        good = f"{_num(lo)}-{_num(hi)}"
    else:
        good = _num(spec.get("target"))
    return f"{good} (tol {_num(spec.get('tolerance'))}, weight {_num(spec.get('weight'))})"


def _scoring_summary(level: Dict[str, Any]) -> List[str]:
    scoring, params = level.get("scoring") or {}, level.get("params") or {}
    mechanic = level.get("mechanic")
    if mechanic in ("mix", "timing"):
        controls = {v["id"]: v for v in params.get("variables") or params.get("phases") or []}
        lines = []
        for vid, spec in (scoring.get("variables") or {}).items():
            control = controls.get(vid, {})
            unit = f" {control['unit']}" if control.get("unit") else ""
            span = f" [control {_num(control['min'])}-{_num(control['max'])}]" if "min" in control and "max" in control else ""
            lines.append(f"- {vid}{unit}: good {_optimum(spec)}{span}")
        for spec in scoring.get("derived") or []:
            lines.append(f"- {spec['id']} = {spec['expr']}: good {_optimum(spec)}")
        return lines
    if mechanic == "sort":
        correct = scoring.get("correct") or {}
        return [f"- sort {len(correct)} items into bins: {', '.join(sorted(set(correct.values())))}"]
    if mechanic == "deliver":
        weights = scoring.get("weights") or {}
        return [f"- deliver {len(params.get('orders') or [])} orders, capacity {params.get('capacity')}, par {params.get('par_ms')} ms, "
                f"weights accuracy {_num(weights.get('accuracy'))} / time {_num(weights.get('time'))}"]
    if mechanic == "converse":
        turns = scoring.get("turns") or {}
        best = [f"{tid}->{max(opts, key=lambda o: opts[o].get('points', 0))}" for tid, opts in turns.items() if opts]
        critical = sum(1 for opts in turns.values() for o in opts.values() if o.get("critical"))
        return [f"- converse {len(turns)} turns, best: {', '.join(best)}; {critical} critical options"]
    return []


def level_fact(world: Dict[str, Any], level: Dict[str, Any]) -> str:
    quest = level.get("quest") or {}
    locations = {loc["id"]: loc.get("name", loc["id"]) for loc in (world.get("map") or {}).get("locations") or []}
    npcs = {npc["id"]: npc.get("name", npc["id"]) for npc in world.get("npcs") or []}
    return "\n".join([
        f"{HEADER} job={world['slug']} level={level['id']}",
        f"title: {level.get('title')} (task {level.get('task_id')}); mechanic: {level.get('mechanic')}",
        f"location: {locations.get(quest.get('location_id'), quest.get('location_id'))}; quest giver: {npcs.get(quest.get('npc_id'), quest.get('npc_id'))}",
        "scoring:",
        *_scoring_summary(level),
        f"pass threshold: {_num((level.get('scoring') or {}).get('pass_threshold'))}",
    ])


def world_fact(world: Dict[str, Any]) -> str:
    world_map = world.get("map") or {}
    npcs = [f"{npc.get('name', npc['id'])} ({npc.get('role', '')})" for npc in world.get("npcs") or []]
    places = list(dict.fromkeys(loc.get("name", loc["id"]) for loc in world_map.get("locations") or [] if loc.get("kind") != "decor"))
    return "\n".join([
        f"{HEADER} job={world['slug']} level={WORLD}",
        f"title: {world.get('title')}; theme: {(world.get('theme') or {}).get('name')}",
        f"map: {world_map.get('cols')}x{world_map.get('rows')} tiles",
        f"npcs: {', '.join(npcs)}",
        f"locations: {', '.join(places)}",
        f"levels: {', '.join(level['id'] for level in world.get('levels') or [])}",
    ])


def record_build(world: Dict[str, Any]) -> List[str]:
    """Store the world's design decisions as Entire Brain facts. Returns the stored fact ids ([] without the CLI)."""
    exe = brain_bin()
    if not exe:
        return []
    ids: List[str] = []
    try:
        facts = [world_fact(world)] + [level_fact(world, level) for level in world.get("levels") or []]
        for text in facts:
            proc = _run(exe, [
                "remember", text,
                "--branch", branch_for(world["slug"]), "--path", FACT_PATH,
                "--kind", "decision", "--agent", "none", "--json",
            ])
            if not proc or proc.returncode != 0:
                print(f"[brain] could not store build decision: {(proc.stderr if proc else '').strip()[:200]}")
                break
            ids.append(json.loads(proc.stdout)["id"])
    except Exception as exc:  # Brain never fails a build
        print(f"[brain] build decisions not stored: {exc}")
    print(f"[brain] stored {len(ids)} build decisions on {branch_for(world.get('slug', '?'))}")
    return ids


def load_world(slug: str) -> Dict[str, Any]:
    """games/<slug>/world.json from the working tree, else from the game branch."""
    path = WORKSPACE_ROOT / "games" / slug / "world.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    proc = subprocess.run(["git", "show", f"{branch_for(slug)}:games/{slug}/world.json"],
                          cwd=WORKSPACE_ROOT, capture_output=True, text=True, check=True)
    return json.loads(proc.stdout)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Store a built world's design decisions in Entire Brain")
    parser.add_argument("--backfill", metavar="SLUG", required=True, help="Game slug whose world.json to record")
    args = parser.parse_args()
    print(json.dumps({"slug": args.backfill, "ids": record_build(load_world(args.backfill))}))
