"""
Entire Brain storage for the researcher's reasoning traces and what the actor learns.

The researcher stores every reasoning trace as one durable fact with the
`entire-brain` CLI (Entire's brain plugin) on brain branch `game/<slug>`, the
same name as the game's git branch, and keeps a copy in research.json
`reasoning_traces`. The builder reads them back with `load_traces` /
`attach_reasoning`: Entire Brain first, research.json as the fallback.

Fact text layout (one fact per ReasoningTrace):

    [replaceme research trace] job=<slug> run=<run_id> task=<task_id|overall> step=<n>
    <thought>
    evidence: <url or query> | <url or query>

The actor stores each exported skill on the same branch (`actor_facts` / `push_actor_skill`):
one `project.actor.skills` fact for the skill, one `project.actor.lessons` gotcha per distinct
problem it hit, and one short `project.actor.attempts` fact per attempt that tried new inputs:

    [replaceme actor skill] job=<slug> training=<training_id> level=<level_id> index=<n>
    <name> (<mechanic>): best <score>, final <score>, pass at <threshold>, passed after <n> attempts
    learned: <label> = <value> <unit>; ...
    procedure: 1. <step> 2. <step> ...

    [replaceme actor lesson] job=<slug> training=<training_id> level=<level_id> attempt=<n>
    <problem>
    fix: <fix>

    [replaceme actor attempt] job=<slug> training=<training_id> level=<level_id> attempt=<n> score=<score> passed|failed
    tried: <input>=<value>; ...
    feedback: <feedback> | <feedback>

Set ENTIRE_BRAIN_BIN to point at another binary ("" disables the brain).
"""

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
FACT_PATH = "project.research.reasoning"
HEADER = "[replaceme research trace]"
EVIDENCE_PREFIX = "evidence:"
OVERALL = "overall"
_HEADER_RE = re.compile(r"^\[replaceme research trace\] job=(\S+) run=(\S+) task=(\S+) step=(\d+)\s*$")
_QUERY_RUN_RE = re.compile(r"run=(\S+)")
ACTOR_SKILL_PATH = "project.actor.skills"
ACTOR_LESSON_PATH = "project.actor.lessons"
ACTOR_ATTEMPT_PATH = "project.actor.attempts"
ACTOR_HEADER = "[replaceme actor {}]"
MAX_LESSONS = 5
MAX_ATTEMPT_CHARS = 400
MAX_LINE_CHARS = 700
DEFAULT_FIXES = ("Apply the learned values.", "Pick another answer for that line.")


def brain_bin() -> Optional[str]:
    """Path of the entire-brain CLI, or None when it is not installed (e.g. in a container)."""
    configured = os.getenv("ENTIRE_BRAIN_BIN")
    if configured is not None:
        if not configured:
            return None
        return configured if Path(configured).exists() else shutil.which(configured)
    found = shutil.which("entire-brain")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "entire-brain"
    return str(local) if local.exists() else None


def branch_for(slug: str) -> str:
    return f"game/{slug}"


def query_for(run_id: str) -> str:
    return f"{HEADER} run={run_id}"


def format_fact(slug: str, run_id: str, trace: Dict[str, Any]) -> str:
    task = trace.get("task_id") or OVERALL
    lines = [f"{HEADER} job={slug} run={run_id} task={task} step={int(trace['step'])}", str(trace["thought"]).strip()]
    evidence = [str(e).strip() for e in trace.get("evidence") or [] if str(e).strip()]
    lines.append(f"{EVIDENCE_PREFIX} {' | '.join(evidence)}".rstrip())
    return "\n".join(lines)


def parse_fact(text: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Inverse of format_fact: returns (run_id, trace) or None for other facts."""
    lines = text.strip().split("\n")
    match = _HEADER_RE.match(lines[0]) if lines else None
    if not match:
        return None
    _, run_id, task, step = match.groups()
    body = lines[1:]
    evidence: List[str] = []
    if body and body[-1].startswith(EVIDENCE_PREFIX):
        evidence = [e.strip() for e in body.pop()[len(EVIDENCE_PREFIX):].split(" | ") if e.strip()]
    trace = {
        "task_id": None if task == OVERALL else task,
        "step": int(step),
        "thought": "\n".join(body).strip(),
        "evidence": evidence,
    }
    return run_id, trace


def _run(exe: str, args: List[str], timeout: float = 30) -> Optional[subprocess.CompletedProcess]:
    try:
        return subprocess.run([exe, *args], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"[brain] entire-brain {args[0]} failed: {exc}")
        return None


def push_traces(slug: str, run_id: str, traces: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Store each trace as an Entire Brain fact. Returns a research.json BrainRef."""
    ref: Dict[str, Any] = {"stored": False, "ids": [], "query": query_for(run_id)}
    exe = brain_bin()
    if not exe or not traces:
        return ref
    for trace in traces:
        thought = str(trace.get("thought", "")).lower()
        kind = "gotcha" if thought.startswith(("caveat", "problem")) else "decision"
        proc = _run(exe, [
            "remember", format_fact(slug, run_id, trace),
            "--branch", branch_for(slug), "--path", FACT_PATH,
            "--kind", kind, "--agent", "none", "--json",
        ])
        if not proc or proc.returncode != 0:
            print(f"[brain] could not store trace {trace.get('step')}: {(proc.stderr if proc else '').strip()[:200]}")
            return ref
        ref["ids"].append(json.loads(proc.stdout)["id"])
    ref["stored"] = True
    return ref


def push_facts(slug: str, path: str, items: List[Dict[str, str]]) -> List[str]:
    """Store {"text", "kind"} items as facts on game/<slug> under taxonomy `path`. Returns the stored ids (stops at the first failure)."""
    ids: List[str] = []
    exe = brain_bin()
    if not exe:
        return ids
    for item in items:
        proc = _run(exe, [
            "remember", item["text"],
            "--branch", branch_for(slug), "--path", path,
            "--kind", item.get("kind") or "decision", "--agent", "none", "--json",
        ])
        try:
            ids.append(json.loads(proc.stdout)["id"] if proc and proc.returncode == 0 else "")
        except (ValueError, KeyError):
            ids.append("")
        if not ids[-1]:
            print(f"[brain] could not store {path} fact: {(proc.stderr if proc else '').strip()[:200]}")
            return ids[:-1]
    return ids


def _clip(text: str, limit: int = MAX_LINE_CHARS) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."


def _value(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(_value(v) for v in value)
    if isinstance(value, dict):
        return ", ".join(f"{k}={_value(v)}" for k, v in value.items())
    return str(value)


def _inputs(inputs: Dict[str, Any]) -> str:
    parts = []
    for key, value in (inputs or {}).items():
        if isinstance(value, dict):
            parts += [f"{k}={_value(v)}" for k, v in value.items()]
        else:
            parts.append(f"{key}={_value(value)}")
    return "; ".join(parts)


def actor_facts(slug: str, training_id: str, skill: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
    """Facts for one exported skill (skills/<id>/skill.json), keyed by taxonomy path."""
    tag = f"job={slug} training={training_id} level={skill['level_id']}"
    learned = "; ".join(f"{p.get('label') or p['variable']} = {_value(p['value'])} {p.get('unit') or ''}".rstrip()
                        for p in skill.get("learned_parameters") or [])
    steps = " ".join(f"{n}. {step}" for n, step in enumerate(skill.get("steps") or [], 1))
    verdict = "passed" if skill.get("passed") else "not passed"
    lines = [
        f"{ACTOR_HEADER.format('skill')} {tag} index={skill.get('level_index')}",
        f"{skill['name']} ({skill['mechanic']}): best {skill['best_score']}, final {skill['final_score']}, "
        f"pass at {skill.get('pass_threshold', 70.0)}, {verdict} after {skill['trained_attempts']} attempts",
    ]
    if learned:
        lines.append(f"learned: {_clip(learned)}")
    if steps:
        lines.append(f"procedure: {_clip(steps)}")
    facts = {ACTOR_SKILL_PATH: [{"text": "\n".join(lines), "kind": "convention"}]}

    # Lessons: distinct problems, the ones with a real fix first.
    seen, problems = set(), []
    for p in sorted(skill.get("problems") or [], key=lambda p: p.get("fix") in DEFAULT_FIXES):
        key = " ".join(p["problem"].lower().split())
        if key not in seen:
            seen.add(key)
            problems.append(p)
    facts[ACTOR_LESSON_PATH] = [
        {"text": f"{ACTOR_HEADER.format('lesson')} {tag} attempt={p['attempt']}\n{_clip(p['problem'])}"
                 + (f"\nfix: {_clip(p['fix'])}" if p.get("fix") and p["fix"] not in DEFAULT_FIXES else ""),
         "kind": "gotcha"}
        for p in sorted(problems[:MAX_LESSONS], key=lambda p: p["attempt"])
    ]

    # Attempts: only those that tried new inputs and fit in a short fact.
    tried, attempts = set(), []
    for a in skill.get("attempts") or []:
        inputs = _inputs(a.get("inputs") or {})
        if inputs in tried:
            continue
        tried.add(inputs)
        text = "\n".join([
            f"{ACTOR_HEADER.format('attempt')} {tag} attempt={a['attempt']} score={a['score']} {'passed' if a['passed'] else 'failed'}",
            f"tried: {inputs}",
            f"feedback: {' | '.join(a.get('feedback') or [])}".rstrip(),
        ])
        if len(text) <= MAX_ATTEMPT_CHARS:
            attempts.append({"text": text, "kind": "decision"})
    facts[ACTOR_ATTEMPT_PATH] = attempts
    return facts


def push_actor_skill(slug: str, training_id: str, skill: Dict[str, Any]) -> Dict[str, List[str]]:
    """Store what the actor learned on one level in Entire Brain. Returns the stored ids per taxonomy path."""
    if not brain_bin():
        return {}
    try:
        facts = actor_facts(slug, training_id, skill)
    except (KeyError, TypeError) as exc:
        print(f"[brain] could not build actor facts for {skill.get('level_id')}: {exc}")
        return {}
    stored = {path: push_facts(slug, path, items) for path, items in facts.items()}
    print(f"[brain] stored {sum(len(v) for v in stored.values())} actor facts for {skill['level_id']} on {branch_for(slug)}")
    return stored


def _fetch_by_ids(exe: str, branch: str, ids: List[str], run_id: Optional[str]) -> List[Dict[str, Any]]:
    proc = _run(exe, ["multi-get", *ids, "--branch", branch, "--json"])
    if not proc or not proc.stdout.strip():
        return []
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return []
    if data.get("missing"):
        return []
    traces = []
    for item in data.get("results", []):
        parsed = parse_fact(item.get("text", ""))
        if parsed and (run_id is None or parsed[0] == run_id):
            traces.append(parsed[1])
    return traces if len(traces) == len(ids) else []


def _fetch_by_query(exe: str, branch: str, query: str, run_id: Optional[str]) -> List[Dict[str, Any]]:
    proc = _run(exe, ["recall", query, "--branch", branch, "--json", "--k", "128", "--no-semantic"])
    if not proc or proc.returncode != 0:
        return []
    try:
        facts = json.loads(proc.stdout).get("facts") or []
    except json.JSONDecodeError:
        return []
    traces = []
    for fact in facts:
        parsed = parse_fact(fact.get("text", ""))
        if parsed and run_id and parsed[0] == run_id:
            traces.append(parsed[1])
    return traces


def load_traces(brief: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str]:
    """Reasoning traces for a research brief: Entire Brain first, then research.json reasoning_traces.

    Returns (traces sorted by step, source) where source is "entire-brain", "research.json" or "none".
    """
    ref = brief.get("brain") or {}
    slug = brief.get("slug")
    fallback = sorted([dict(t) for t in brief.get("reasoning_traces") or []], key=lambda t: t.get("step", 0))
    exe = brain_bin()
    if ref.get("stored") and slug and exe:
        query = ref.get("query") or ""
        run_match = _QUERY_RUN_RE.search(query)
        run_id = run_match.group(1) if run_match else None
        ids = list(ref.get("ids") or [])
        traces = []
        if ids:
            traces = _fetch_by_ids(exe, branch_for(slug), ids, run_id)
        if not traces and query:
            traces = _fetch_by_query(exe, branch_for(slug), query, run_id)
        if traces:
            if len(traces) < len(ids):
                # Some facts are gone from the brain (retracted, gc'd, cut off by recall --k): fill those steps from the copy.
                have = {t["step"] for t in traces}
                traces += [t for t in fallback if t.get("step") not in have]
            return sorted(traces, key=lambda t: t["step"]), "entire-brain"
    return fallback, ("research.json" if fallback else "none")


def attach_reasoning(brief: Dict[str, Any]) -> Dict[str, Any]:
    """Copy of the brief whose reasoning_traces were (re)loaded Entire Brain first, ready for generation prompts."""
    traces, source = load_traces(brief)
    print(f"[brain] loaded {len(traces)} research reasoning traces from {source}")
    return {**brief, "reasoning_traces": traces}


def reasoning_prompt(brief: Dict[str, Any], task_id: Optional[str] = None, max_chars: int = 12000) -> str:
    """Prompt section with the researcher's reasoning: overall traces plus those of task_id (all when None)."""
    traces = brief.get("reasoning_traces") or []
    if task_id is not None:
        traces = [t for t in traces if t.get("task_id") in (None, task_id)]
    if not traces:
        return ""
    lines = [
        "RESEARCHER REASONING TRACES (why these tasks, mechanics, values, feedback and caveats were chosen). "
        "Follow this reasoning when you write levels, dialogue and feedback:"
    ]
    for trace in sorted(traces, key=lambda t: t.get("step", 0)):
        evidence = trace.get("evidence") or []
        suffix = f" [evidence: {'; '.join(evidence[:4])}]" if evidence else ""
        lines.append(f"- ({trace.get('task_id') or OVERALL}, step {trace.get('step')}) {trace.get('thought', '').strip()}{suffix}")
    text = "\n".join(lines)
    return text if len(text) <= max_chars else text[: max_chars - 3].rstrip() + "..."
