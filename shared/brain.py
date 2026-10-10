"""
Entire Brain storage for the researcher's reasoning traces.

The researcher stores every reasoning trace as one durable fact with the
`entire-brain` CLI (Entire's brain plugin) on brain branch `game/<slug>`, the
same name as the game's git branch, and keeps a copy in research.json
`reasoning_traces`. The builder reads them back with `load_traces` /
`attach_reasoning`: Entire Brain first, research.json as the fallback.

Fact text layout (one fact per ReasoningTrace):

    [replaceme research trace] job=<slug> run=<run_id> task=<task_id|overall> step=<n>
    <thought>
    evidence: <url or query> | <url or query>

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
    exe = brain_bin()
    if ref.get("stored") and slug and exe:
        query = ref.get("query") or ""
        run_match = _QUERY_RUN_RE.search(query)
        run_id = run_match.group(1) if run_match else None
        traces = []
        if ref.get("ids"):
            traces = _fetch_by_ids(exe, branch_for(slug), list(ref["ids"]), run_id)
        if not traces and query:
            traces = _fetch_by_query(exe, branch_for(slug), query, run_id)
        if traces:
            return sorted(traces, key=lambda t: t["step"]), "entire-brain"
    fallback = [dict(t) for t in brief.get("reasoning_traces") or []]
    return sorted(fallback, key=lambda t: t.get("step", 0)), ("research.json" if fallback else "none")


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
