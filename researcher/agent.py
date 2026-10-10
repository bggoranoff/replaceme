"""
ReplaceMe Researcher Agent.

Researches any job with Gemini + Google Search grounding and writes
games/<slug>/research.json (research.json v2 = ResearchBrief, see
shared/game_contract.md section i): at least 4 distinct tasks, each mapped to
one of the platform mechanics in shared/actions.json, with adjustable
variables, researched optima, a scoring heuristic, qualitative feedback,
caveats, problems and cited sources.

Its reasoning traces (Gemini thinking summaries, why each task and mechanic was
chosen, sources considered, optima rationale, assumptions, caveats) are stored
in Entire Brain (shared/brain.py) and copied into research.json as a fallback.
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from builder.gemini_client import GeminiClient
from researcher.gemini_research import GroundedResult, grounded, structured
from researcher.normalize import (
    ResearchPlan,
    TaskDraft,
    playable,
    repair_draft,
    slugify,
    to_research_task,
    unique_task_ids,
    validate_draft,
)
from shared import brain
from shared.schemas.research import ResearchBrief

MIN_TASKS = 4
PLANNED_TASKS = 5
MAX_THOUGHT_CHARS = 1500

RESEARCHER_SYSTEM_PROMPT = """
You are the RESEARCHER of ReplaceMe, a cozy village life-sim game that teaches an AI agent the real tasks of a job.
You research the job the user typed with Google Search and turn it into hands-on tasks that can each be played with exactly
one of the platform's game mechanics. Everything you write must be specific to that job and backed by the sources you cite.
Prefer authoritative sources (professional bodies, standards, manuals, training material) and give numbers with units.
"""

EXTRACTOR_SYSTEM_PROMPT = """
You convert research reports into the ReplaceMe JSON schema. Use only facts from the report. Refer to sources only by
their [n] numbers from the numbered source list. Never invent sources, numbers or facts that the report does not support.
"""

MECHANIC_RESEARCH = {
    "mix": (
        "The 2-5 quantities the worker sets for this task (each with unit, a realistic control range min..max and a sensible "
        "slider step), the researched optimal value or range of each, derived relations that matter (for example a ratio "
        "between two quantities) with their optimal value, how much deviation makes the result clearly worse, and what the "
        "worker notices in the result when each value is too low or too high."
    ),
    "timing": (
        "The 1-3 phases of this task where the worker must stop or release at the right moment. Measure each phase as one "
        "quantity with a unit (a duration, temperature, level, ...) and give its realistic range, the optimal value or range, "
        "how much deviation makes the result clearly worse, and what the worker notices when stopping too early or too late."
    ),
    "sort": (
        "6-10 realistic items the worker must route and 2-5 destinations (bins, shelves, categories, queues), the correct "
        "destination of each item and why, and what goes wrong when an item is misrouted."
    ),
    "deliver": (
        "2-4 realistic orders for this task (what is carried and who or where receives it) with their constraints "
        "(priority, handling, timing) and what goes wrong with a wrong or late delivery."
    ),
    "converse": (
        "A realistic 3-5 turn conversation the worker has in this task: per turn the other person's line and 3-4 possible "
        "worker responses, how good each response is from 0 to 1 by professional standards and why, and which responses "
        "are serious errors."
    ),
}


def load_mechanics() -> Dict[str, Dict[str, Any]]:
    """The 5 platform mechanics from the rules on this checkout (shared/actions.json)."""
    rules = json.loads((WORKSPACE_ROOT / "shared" / "actions.json").read_text(encoding="utf-8"))
    return rules["mechanics"]


def describe_mechanic(mid: str, mech: Dict[str, Any]) -> str:
    params = "; ".join(f"{k}: {v}" for k, v in mech.get("params", {}).items())
    return f"- {mid} ({mech['title']}): {mech['description']} Params: {params}. Scoring: {mech['scoring']}"


class ResearcherAgent:
    """Turns a job prompt into a sourced research.json v2 with reasoning traces in Entire Brain."""

    def __init__(self, gemini_client: Optional[GeminiClient] = None, workspace_dir: Optional[Path] = None):
        self.client = gemini_client or GeminiClient()
        self.workspace_dir = workspace_dir or WORKSPACE_ROOT
        self.mechanics = load_mechanics()
        self._started = time.monotonic()

    def _log(self, message: str) -> None:
        print(f"[ResearcherAgent +{time.monotonic() - self._started:.0f}s] {message}", flush=True)

    # ------------------------------------------------------------------ pipeline

    def research(self, prompt: str) -> Dict[str, Any]:
        job = prompt.strip()
        if not job:
            raise ValueError("Empty job prompt")
        if not self.client.is_configured():
            raise RuntimeError("Gemini API key not found (GEMINI_API_KEY or GOOGLE_API_KEY); research needs Google Search grounding")
        slug = slugify(job, fallback="job")
        run_id = f"{slug}-{int(time.time() * 1000)}"
        self._started = time.monotonic()

        plan, plan_report = self._plan(job)
        planned = [t.model_dump() for t in plan.tasks[:PLANNED_TASKS]]
        unique_task_ids(planned)
        self._log(f"planned {len(planned)} tasks: {', '.join(t['id'] for t in planned)}")
        with ThreadPoolExecutor(max_workers=len(planned)) as pool:
            results = list(pool.map(lambda t: self._research_task(job, t), planned))

        kept = [(p, r) for p, r in zip(planned, results) if r is not None]
        if len(kept) < MIN_TASKS:
            raise RuntimeError(f"Only {len(kept)} of {len(planned)} researched tasks were playable; need {MIN_TASKS}")

        tasks = [task for _, (task, _) in kept]
        traces = self._traces(plan, plan_report, kept)
        self._log(f"researched {len(tasks)} tasks; storing {len(traces)} reasoning traces")
        brief = {
            "version": 2,
            "job": job,
            "slug": slug,
            "title": plan.title,
            "setting": plan.setting,
            "sources": self._all_sources(plan_report, tasks),
            "rules": plan.rules,
            "assumptions": plan.assumptions,
            "tasks": tasks,
            "reasoning_traces": traces,
            "brain": brain.push_traces(slug, run_id, traces),
        }
        brief = ResearchBrief.model_validate(brief).model_dump(mode="json")
        for task in brief["tasks"]:
            task["optima"] = [{k: v for k, v in opt.items() if v is not None} for opt in task["optima"]]
        self._save_brief(brief)
        return brief

    def _plan(self, job: str) -> Tuple[ResearchPlan, GroundedResult]:
        mechanics = "\n".join(describe_mechanic(mid, m) for mid, m in self.mechanics.items())
        report = self._grounded((
            f'Job: "{job}"\n\n'
            f"The game platform supports exactly these {len(self.mechanics)} mechanics:\n{mechanics}\n\n"
            f"Research what a {job} actually does day to day. Then choose {PLANNED_TASKS} distinct, concrete, hands-on tasks of "
            f"this job to turn into game levels, in priority order (the game uses the first {MIN_TASKS}):\n"
            f"- Each task is one focused activity with one result, and all of its quantities or choices belong to that "
            f"activity. Each task maps to exactly one mechanic above.\n"
            f"- The first {MIN_TASKS} tasks use at least 3 different mechanics, and at least 2 of them are mix or timing tasks "
            f"with real, measurable quantities whose good values are documented in sources.\n"
            f"- For each task explain what the worker does, why the task is central to the job, why the mechanic fits, and "
            f"which quantities or choices decide the quality of the result and what sources recommend.\n"
            f"Also describe a cozy village setting where this job happens (the places on the map), the core rules of the job, "
            f"and the assumptions you made. Cite your sources."
        ), "job research")
        self._log(f"grounded job research done ({len(report.sources)} sources, {len(report.queries)} searches)")
        plan = structured(self.client, (
            f'Job: "{job}"\nConvert this research report into the plan JSON with exactly {PLANNED_TASKS} tasks in the '
            f"report's priority order. Task ids are 1-3 word kebab-case slugs. Titles are 2-4 plain everyday words, verb first, "
            f"saying exactly what the worker does (e.g. 'Restock shelves', 'Greet a customer'); no jargon, no catchy names. "
            f"mechanic is one of: {', '.join(self.mechanics)}.\n\n"
            f"REPORT:\n{report.text}\n\nNUMBERED SOURCES:\n{report.numbered_sources()}"
        ), ResearchPlan, EXTRACTOR_SYSTEM_PROMPT)
        if len(plan.tasks) < MIN_TASKS:
            raise RuntimeError(f"Research plan has only {len(plan.tasks)} tasks")
        return plan, report

    def _research_task(self, job: str, planned: Dict[str, Any]) -> Optional[Tuple[Dict[str, Any], GroundedResult]]:
        mechanic = planned["mechanic"]
        try:
            report = self._grounded((
                f'Job: "{job}". Task: "{planned["title"]}": {planned["summary"]}\n'
                f"Focus: {planned['research_focus']}\n"
                f"This task is played with this game mechanic:\n{describe_mechanic(mechanic, self.mechanics[mechanic])}\n\n"
                f"Research this task with Google Search and write a practitioner's report covering:\n"
                f"{MECHANIC_RESEARCH[mechanic]}\n"
                f"Then list the caveats a practitioner must know and the problems that commonly appear (how they show up and "
                f"how to fix them). Give numbers with units and cite a source for every number and rule."
            ), f"task {planned['id']}")
            self._log(f"task {planned['id']}: grounded research done ({len(report.sources)} sources)")
            if not report.sources:
                print(f"[ResearcherAgent] Dropping task '{planned['id']}': grounded research cited no sources")
                return None
            prompt = self._extraction_prompt(job, planned, report)
            draft = structured(self.client, prompt, TaskDraft, EXTRACTOR_SYSTEM_PROMPT).model_dump()
            issues = validate_draft(draft, mechanic, len(report.sources))
            if issues:
                self._log(f"task {planned['id']}: repairing {len(issues)} issues")
                retry = (f"{prompt}\n\nYOUR PREVIOUS JSON:\n{json.dumps(draft)}\n\nIT HAD THESE PROBLEMS, FIX ALL OF THEM:\n- "
                         + "\n- ".join(issues))
                fixed = structured(self.client, retry, TaskDraft, EXTRACTOR_SYSTEM_PROMPT).model_dump()
                if len(validate_draft(fixed, mechanic, len(report.sources))) <= len(issues):
                    draft = fixed
            draft = repair_draft(draft, mechanic)
            if not playable(draft, mechanic):
                print(f"[ResearcherAgent] Dropping task '{planned['id']}': not playable as {mechanic}")
                return None
            return to_research_task(planned, draft, report.sources), report
        except Exception as exc:
            print(f"[ResearcherAgent] Task '{planned['id']}' failed: {exc}")
            return None

    def _grounded(self, prompt: str, what: str) -> GroundedResult:
        """Grounded call; asked again once when the model answered without searching (no citations to keep)."""
        report = grounded(self.client, prompt, RESEARCHER_SYSTEM_PROMPT)
        if not report.sources:
            self._log(f"{what}: no cited sources, searching again")
            retry = grounded(self.client, f"{prompt}\n\nUse Google Search for every fact and cite the pages you used.",
                             RESEARCHER_SYSTEM_PROMPT)
            if retry.sources:
                report = retry
        return report

    def _extraction_prompt(self, job: str, planned: Dict[str, Any], report: GroundedResult) -> str:
        mechanic = planned["mechanic"]
        return (
            f'Job: "{job}". Task "{planned["title"]}" (mechanic: {mechanic}).\n'
            f"Mechanic: {describe_mechanic(mechanic, self.mechanics[mechanic])}\n\n"
            "Fill the task JSON from the report:\n"
            "- variables (mix: 1-6 inputs, timing: 1-3 with one per phase, otherwise empty): ids match [a-z][a-z0-9_]*, "
            "unit, min < max covering realistic values, step > 0 as slider granularity, and a default inside [min, max] that "
            "is NOT optimal (a plausible beginner value).\n"
            "- derived: relations between variables that matter (for example ratios); expr uses only variable ids, numbers "
            "and + - * / ( ).\n"
            "- optima: one per variable or derived term that matters, with target OR range [lo, hi] (inside the variable's "
            "min..max), rationale and source_ids (only the [n] cited for that value). Every variable must count towards "
            "the score, directly or through a derived term.\n"
            "- heuristic: one per optimum term: tolerance (deviation in the term's unit at which quality is clearly "
            "degraded), weight > 0 (importance), curve (gaussian: smooth, linear: proportional, step: hard limit), "
            "too_low and too_high (what the worker would notice in the result; qualitative, NEVER numbers or the optimum), "
            "rationale.\n"
            "- sort: sort_items (label, correct_bin, feedback) and sort_bins (labels); correct_bin is one of sort_bins.\n"
            "- deliver: orders. converse: dialogue turns with 2-4 options each (points 0..1, feedback, critical).\n"
            "- aim: one sentence saying what to achieve, without revealing optimal values or answers.\n"
            "- caveats and problems from the report; source_ids are the [n] numbers of all sources used.\n\n"
            f"REPORT:\n{report.text}\n\nNUMBERED SOURCES:\n{report.numbered_sources()}"
        )

    # ------------------------------------------------------------------ reasoning traces

    def _traces(self, plan: ResearchPlan, plan_report: GroundedResult,
                kept: List[Tuple[Dict[str, Any], Tuple[Dict[str, Any], GroundedResult]]]) -> List[Dict[str, Any]]:
        traces: List[Dict[str, Any]] = []

        def add(task_id: Optional[str], thought: str, evidence: List[str]) -> None:
            text = " ".join(thought.split())
            if len(text) > MAX_THOUGHT_CHARS:
                text = text[: MAX_THOUGHT_CHARS - 3].rstrip() + "..."
            traces.append({"task_id": task_id, "step": len(traces) + 1, "thought": text,
                           "evidence": list(dict.fromkeys(e for e in evidence if e))[:8]})

        def source_urls(report: GroundedResult, ids: List[int]) -> List[str]:
            return [report.sources[n - 1]["url"] for n in ids if 1 <= n <= len(report.sources)]

        def titles(sources: List[Dict[str, str]]) -> str:
            return "; ".join(dict.fromkeys(s["title"] for s in sources))

        # Decisions first (consumers that truncate still see why every task was chosen), then the supporting thinking.
        for planned, (task, _) in kept:
            add(task["id"], f"Why chosen: {planned['why_chosen']} Mechanic {task['mechanic']}: {task['mechanic_rationale']}",
                source_urls(plan_report, planned["source_ids"]))
        if plan.assumptions:
            add(None, "Assumptions: " + " ".join(plan.assumptions), [])

        for _, (task, _) in kept:
            tid = task["id"]
            labels = {v["id"]: (v["label"], v["unit"]) for v in task["variables"]}
            labels.update({d["id"]: (d["label"], "") for d in task["derived"]})
            heuristics = {h["term"]: h for h in task["heuristic"]}
            for opt in task["optima"]:
                label, unit = labels.get(opt["term"], (opt["term"], ""))
                value = f"{opt['range'][0]:g}-{opt['range'][1]:g}" if "range" in opt else f"{opt['target']:g}"
                h = heuristics.get(opt["term"])
                scoring = f" Scoring: tolerance {h['tolerance']:g}, weight {h['weight']:g}, {h['curve']} curve because {h['rationale']}" if h else ""
                add(tid, f"Optimum for {label}: {value}{' ' + unit if unit else ''}. {opt['rationale']}{scoring}", opt["source_urls"])
            if task["sort_items"]:
                add(tid, "Right destinations: " + "; ".join(f"{i['label']} -> {i['correct_bin']} ({i['feedback']})" for i in task["sort_items"]), [])
            if task["orders"]:
                add(tid, "Orders and constraints: " + "; ".join(f"{o['item']} -> {o['destination']} ({o['note']})" for o in task["orders"]), [])
            for turn in task["dialogue"]:
                best = max(turn["options"], key=lambda o: o["points"])
                critical = [o["text"] for o in turn["options"] if o["critical"]]
                add(tid, f"Conversation turn \"{turn['npc_line']}\": best response \"{best['text']}\" because {best['feedback']}"
                         + (f" Serious errors: {'; '.join(critical)}" if critical else ""), [])
            add(tid, "Caveats: " + " ".join(task["caveats"]) + " Problems: " + " ".join(task["problems"]),
                [s["url"] for s in task["sources"]])

        for thought in plan_report.thoughts:
            add(None, f"Thinking (choosing tasks): {thought.text}", [f"search: {q}" for q in thought.queries])
        add(None, "Sources considered for choosing tasks: " + titles(plan_report.sources),
            [s["url"] for s in plan_report.sources])
        for _, (task, report) in kept:
            for thought in report.thoughts:
                add(task["id"], f"Thinking: {thought.text}", [f"search: {q}" for q in thought.queries])
            add(task["id"], "Sources considered: " + titles(report.sources), [s["url"] for s in report.sources])
        return traces

    # ------------------------------------------------------------------ output

    @staticmethod
    def _all_sources(plan_report: GroundedResult, tasks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        seen: Dict[str, Dict[str, str]] = {}
        for source in plan_report.sources + [s for t in tasks for s in t["sources"]]:
            seen.setdefault(source["url"], {"title": source["title"], "url": source["url"]})
        return list(seen.values())

    def _save_brief(self, brief: Dict[str, Any]) -> Path:
        game_dir = self.workspace_dir / "games" / brief["slug"]
        game_dir.mkdir(parents=True, exist_ok=True)
        text = json.dumps(brief, indent=2, ensure_ascii=False)
        path = game_dir / "research.json"
        path.write_text(text, encoding="utf-8")
        # Legacy location still read by the dev server's /api/research route
        (self.workspace_dir / "research.json").write_text(text, encoding="utf-8")
        return path


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ReplaceMe Researcher Agent")
    parser.add_argument("prompt", type=str, help="Job the user wants to replace")
    args = parser.parse_args()

    agent = ResearcherAgent()
    print(f"Researcher Agent researching job: '{args.prompt}'...")
    try:
        result = agent.research(args.prompt)
    except Exception as exc:
        print(f"[ResearcherAgent] Research failed: {exc}", file=sys.stderr)
        sys.exit(1)
    ref = result.get("brain") or {}
    print(f"Researched {len(result['tasks'])} tasks for '{result['job']}' -> games/{result['slug']}/research.json")
    for task in result["tasks"]:
        print(f"  [{task['mechanic']}] {task['title']}: {task['aim']}")
    print(f"Reasoning traces: {len(result['reasoning_traces'])} "
          f"({'stored in Entire Brain on ' + brain.branch_for(result['slug']) if ref.get('stored') else 'research.json only'})")
