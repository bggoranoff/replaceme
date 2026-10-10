"""
ReplaceMe Actor Agent (shared/game_contract.md sections d and e).

Learns each level by doing: plays it attempt after attempt in a real browser through
`window.__replaceme`, using only allowlisted controls from shared/actions.json. Never random:
each attempt is planned from the evidence so far (Gemini, with a deterministic systematic search
as fallback and as the suggestion it starts from), then reflected on. Exports one skill per level:
skills/<level_id>/skill.json (LearnedSkill) and skills/<level_id>/SKILL.md.

    python3 -m actor.agent --slug <slug> --training-id <id> --base-url http://127.0.0.1:<port> --attempts 10
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from actor.drivers import make_driver  # noqa: E402
from actor.explore import fmt, make_strategy, similarity  # noqa: E402
from actor.reasoning import (Reasoner, describe_change, deterministic_reflection,  # noqa: E402
                             deterministic_skill)
from actor.rules import ActionRejected, Allowlist  # noqa: E402

MAX_STEPS = int(os.getenv("ACTOR_MAX_STEPS", "400"))
PUBLIC_LEVEL_KEYS = ("id", "index", "title", "task_id", "skill_name", "mechanic", "quest", "aim", "controls_hint",
                     "metric", "time_limit_ms", "sources")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def public_level(level: Dict[str, Any]) -> Dict[str, Any]:
    """What a human can see about a level. Scoring (targets, tolerances, correct answers) is dropped."""
    out = {k: level[k] for k in PUBLIC_LEVEL_KEYS if k in level}
    out["pass_threshold"] = float((level.get("scoring") or {}).get("pass_threshold", 70))
    return out


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _state_key(obs: Dict[str, Any]) -> str:
    keep = {k: obs.get(k) for k in ("phase", "mechanic_state", "avatar", "focus", "last_result", "done")}
    return json.dumps(keep, sort_keys=True, default=str)


class LevelLearner:
    """Plays one level `attempts_total` times in sequence, learning between attempts."""

    def __init__(self, agent: "ActorAgent", level: Dict[str, Any], job: str, training_id: str, attempts_total: int,
                 bridge, emit: Callable, on_progress: Callable, step_delay_s: float = 0.0):
        self.agent = agent
        self.level = level
        self.job = job
        self.training_id = training_id
        self.attempts_total = attempts_total
        self.bridge = bridge
        self.emit = emit
        self.on_progress = on_progress
        self.step_delay_s = step_delay_s
        self.mechanic = level["mechanic"]
        self.strategy = make_strategy(self.mechanic)
        self.reasoner = agent.reasoner_factory()
        self.attempts: List[Dict[str, Any]] = []
        self.memory: Dict[str, Any] = {"control_effects": {}, "problems": [], "caveats": []}
        self.seen_problems: set = set()

    def run_id(self, attempt: int) -> str:
        return f"{self.training_id}-l{self.level['index']}-a{attempt:02d}"

    # -- context for reasoning -------------------------------------------
    def _controls(self) -> List[Dict[str, Any]]:
        s = self.strategy
        if self.mechanic in ("mix", "timing"):
            return [{"id": v.id, "label": v.label, "unit": v.unit, "min": v.lo, "max": v.hi, "step": v.step} for v in s.vars.values()]
        if self.mechanic in ("sort", "converse"):
            return [{"id": k, "label": e["label"], "options": e["names"]} for k, e in s.elements.items()]
        return [{"id": k, "label": lbl} for k, lbl in s.labels().items()]

    def context(self, attempt: int, suggestion: Dict[str, Any], why: str) -> Dict[str, Any]:
        return {"job": self.job, "level": self.level, "mechanic": self.mechanic,
                "mechanic_rules": self.agent.allowlist.mechanics[self.mechanic], "controls": self._controls(),
                "ingredients": getattr(self.strategy, "ingredients", []), "attempt": attempt,
                "attempts_total": self.attempts_total, "attempts": self.attempts, "memory": self.memory,
                "suggestion": suggestion, "suggestion_why": why}

    @staticmethod
    def _raw_plan(mechanic: str, assignments) -> Dict[str, Any]:
        kv = {a.key.strip(): a.value.strip() for a in assignments}
        if mechanic in ("mix", "timing"):
            values = {}
            for k, v in kv.items():
                if k == "order":
                    continue
                try:
                    values[k] = float(v)
                except ValueError:
                    pass
            raw: Dict[str, Any] = {"values": values}
            if "order" in kv:
                raw["order"] = [x.strip() for x in kv["order"].split(",") if x.strip()]
            return raw
        if mechanic in ("sort", "converse"):
            return {"choices": kv}
        raw = {"policy": kv.get("policy"), "batch": kv.get("batch", "1")}
        if kv.get("sequence"):
            raw["sequence"] = [x.strip() for x in kv["sequence"].split(",") if x.strip()]
        return raw

    def plan_attempt(self, attempt: int) -> Dict[str, Any]:
        suggestion, why = self.strategy.suggest(attempt, self.attempts_total)
        prev = self.attempts[-1] if self.attempts else None
        plan, hypothesis, what_changed, source = suggestion, why, None, "search"
        decision = self.reasoner.decide(self.context(attempt, suggestion, why)) if self.reasoner.enabled else None
        if decision:
            if prev:  # merge the model's reflection on the previous attempt into memory and that attempt's record
                prev["reflection"] = decision.reflection
                for p in decision.problems_found:
                    self._add_problem(p, prev["attempt"], prev)
                for c in decision.caveats:
                    self._add_caveat(c, prev)
                for e in decision.control_effects:
                    self.memory["control_effects"][e.variable] = e.effect
            candidate = self.strategy.coerce_plan(self._raw_plan(self.mechanic, decision.assignments))
            tried = [a["inputs_plan"] for a in self.attempts]
            if candidate and attempt < self.attempts_total and (candidate not in tried or candidate == suggestion) \
                    and not self._model_stalled():
                plan, source = candidate, "gemini"
                hypothesis = decision.hypothesis or why
                what_changed = decision.what_changed
        if source == "search" and self.mechanic in ("mix", "timing"):
            plan = self.strategy.coerce_plan(plan) or plan
        what_changed = what_changed or describe_change(prev["inputs"] if prev else None, plan, self.strategy.labels())
        return {"plan": plan, "hypothesis": hypothesis, "what_changed": what_changed, "source": source,
                "suggestion": suggestion}

    def _model_stalled(self) -> bool:
        """The last two model-planned attempts did not beat the best score before them: follow the search instead."""
        if len(self.attempts) < 3:
            return False
        last = self.attempts[-2:]
        best_before = max(a["score"] for a in self.attempts[:-2])
        return all(a["plan_source"] == "gemini" for a in last) and max(a["score"] for a in last) <= best_before

    def _add_problem(self, text: str, attempt: int, record: Optional[Dict[str, Any]] = None, fix: str = "") -> bool:
        key = text.strip().lower()
        if not key or key in self.seen_problems or any(similarity(key, p) >= 0.8 for p in self.seen_problems):
            return False  # the same problem reworded
        self.seen_problems.add(key)
        self.memory["problems"].append({"problem": text.strip(), "attempt": attempt, "fix": fix})
        if record is not None and text not in record["problems_found"]:
            record["problems_found"].append(text)
        return True

    def _add_caveat(self, text: str, record: Optional[Dict[str, Any]] = None) -> None:
        if text and not any(similarity(text, c) >= 0.8 for c in self.memory["caveats"]):
            self.memory["caveats"].append(text)
        if record is not None and text and text not in record["caveats"]:
            record["caveats"].append(text)

    # -- playing -----------------------------------------------------------
    async def play(self) -> Dict[str, Any]:
        for attempt in range(1, self.attempts_total + 1):
            await self.play_attempt(attempt)
            self.on_progress(self, attempt)
        return await asyncio.to_thread(self.agent.export_skill, self)

    async def play_attempt(self, attempt: int) -> Dict[str, Any]:
        run_id = self.run_id(attempt)
        obs = await self.bridge.reset_level(self.level["id"])
        self.strategy.register(obs)
        decided = await asyncio.to_thread(self.plan_attempt, attempt)
        plan = decided["plan"]
        seq = self.emit_factory(run_id)
        await seq("run_started", run={"id": run_id, "training_id": self.training_id, "level_id": self.level["id"],
                                      "level_index": self.level["index"], "level_title": self.level.get("title", ""),
                                      "attempt": attempt},
                  inputs_plan=plan, hypothesis=decided["hypothesis"])
        await seq("note", text=f"Plan ({decided['source']}): {decided['what_changed']}")

        driver = make_driver(self.mechanic, self.strategy, plan)
        actions_taken: List[Dict[str, Any]] = []
        rejected: List[str] = []
        result_obs = obs
        done = bool(obs.get("done"))
        last_score = None
        steps = 0
        while not done and steps < MAX_STEPS:
            steps += 1
            offered = await self.bridge.list_actions()
            proposal = driver.next_action(obs)
            if proposal is None:
                proposal = {"action": "wait", "params": {"ms": 500}}
            try:
                action = self.agent.allowlist.validate(proposal, obs, offered)
            except ActionRejected as exc:
                rejected.append(f"{proposal.get('action')}: {exc}")
                await seq("note", text=f"Rejected action {json.dumps(proposal)}: {exc}")
                if len(rejected) >= 8:
                    break
                driver.no_effect(proposal, obs, obs)
                continue
            res = await self.bridge.act(action)
            await seq("action", action=action, result=res)
            actions_taken.append(action)
            new_obs = res.get("observation") or obs
            if not res.get("ok", True) or (action["action"] != "wait" and _state_key(new_obs) == _state_key(obs)):
                driver.no_effect(action, obs, new_obs)
            if hasattr(driver, "after"):
                driver.after(action, obs, new_obs)
            obs = result_obs = new_obs
            last_score = res.get("score", last_score)
            done = bool(res.get("done") or new_obs.get("done") or new_obs.get("phase") == "result")
            if self.step_delay_s:
                await asyncio.sleep(self.step_delay_s)

        result = result_obs.get("last_result")
        status = "error"
        if result:
            status = "passed" if result.get("passed") else "failed"
        else:
            result = {"score": float(last_score or 0.0), "passed": False,
                      "feedback": ["The attempt did not finish."], "breakdown": {}}
        self.strategy.register(result_obs)  # the final observation names the last converse turn
        inputs = driver.inputs(result_obs)
        notes = self._record_strategy(attempt, inputs, result, driver, result_obs)
        prev = self.attempts[-1] if self.attempts else None
        record = {"attempt": attempt, "run_id": run_id, "inputs": inputs, "inputs_plan": plan,
                  "actions_taken": actions_taken, "score": float(result.get("score") or 0.0),
                  "passed": bool(result.get("passed")), "feedback": list(result.get("feedback") or []),
                  "breakdown": result.get("breakdown") or {}, "problems_found": [], "caveats": [],
                  "hypothesis": decided["hypothesis"], "what_changed": decided["what_changed"], "plan_source": decided["source"]}
        if status == "error":
            notes["stuck"] = True
        refl = deterministic_reflection(record, prev, notes, self.strategy.labels(),
                                        driver.problems + [f"Action rejected: {r}" for r in rejected[:3]])
        record["reflection"] = refl["reflection"]
        for p in refl["problems_found"]:
            self._add_problem(p, attempt, record, fix=self._fix_for(p, notes))
        for c in refl["caveats"]:
            self._add_caveat(c, record)
        for e in self.strategy.knowledge()["control_effects"]:
            self.memory["control_effects"].setdefault(e["variable"], e["effect"])
            if not self.reasoner.enabled:
                self.memory["control_effects"][e["variable"]] = e["effect"]
        self.attempts.append(record)
        await seq("note", text=refl["reflection"] + (" New problems: " + "; ".join(record["problems_found"]) if record["problems_found"] else ""))
        await seq("run_finished", status=status, score=record["score"], result=result, inputs=inputs)
        self.agent.save_learning(self)
        return record

    def _record_strategy(self, attempt, inputs, result, driver, obs) -> Dict[str, Any]:
        if self.mechanic == "converse":
            notes = self.strategy.record(attempt, inputs, result, early_end=driver.ended_early(obs))
        elif self.mechanic == "deliver":
            notes = self.strategy.record(attempt, inputs, result, statuses=driver.statuses, used_dest=driver.used_dest,
                                         t_ms=float(obs.get("t_ms") or 0))
        else:
            notes = self.strategy.record(attempt, inputs, result)
        if obs.get("time_limit_ms") and (obs.get("time_left_ms") is not None) and obs["time_left_ms"] <= 0:
            notes["timed_out"] = True
        return notes

    def _fix_for(self, problem: str, notes: Dict[str, Any]) -> str:
        labels = self.strategy.labels()
        for a in notes.get("attributed", []):
            if a["text"] in problem:
                best = self.strategy.best_plan().get("values", {}).get(a["variable"])
                direction = "Lower" if a["side"] == "too_high" else "Raise"
                unit = getattr(self.strategy.vars.get(a["variable"]), "unit", "")
                return f"{direction} {labels.get(a['variable'], a['variable'])} towards {fmt(best, unit)}."
        crit = notes.get("critical")
        if crit and crit["text"] in problem:
            return "Pick another answer for that line."
        return ""

    def emit_factory(self, run_id: str):
        counter = {"seq": 0}

        async def emit(kind: str, **fields):
            counter["seq"] += 1
            await self.emit(run_id, {"seq": counter["seq"], "type": kind, "at": now_iso(), **fields})

        return emit


class ActorAgent:
    def __init__(self, workspace_dir: Optional[Path] = None, skills_dir: Optional[Path] = None,
                 runs_dir: Optional[Path] = None, reasoner_factory: Optional[Callable[[], Reasoner]] = None):
        self.workspace_dir = workspace_dir or WORKSPACE_ROOT
        self.skills_dir = skills_dir or Path(os.getenv("ACTOR_SKILLS_DIR") or self.workspace_dir / "skills")
        self.runs_dir = runs_dir or self.workspace_dir / "runs"
        self.allowlist = Allowlist.load()
        self.reasoner_factory = reasoner_factory or Reasoner  # one per level: SDK clients are not shared across threads
        self.training_id = ""

    def save_learning(self, learner: LevelLearner) -> None:
        path = self.runs_dir / learner.training_id / "learning" / f"{learner.level['id']}.json"
        write_json(path, {"level_id": learner.level["id"], "job": learner.job, "mechanic": learner.mechanic,
                          "attempts": learner.attempts, "memory": learner.memory})

    # -- skill export (section e) -----------------------------------------
    def export_skill(self, learner: LevelLearner) -> Dict[str, Any]:
        lvl = learner.level
        attempts = learner.attempts
        best = max(attempts, key=lambda a: (a["score"], -a["attempt"]))
        knowledge = learner.strategy.knowledge()
        ctx = learner.context(len(attempts), {}, "")
        ctx.update(knowledge=knowledge, best_score=best["score"], best_inputs=best["inputs"], sources=lvl.get("sources") or [])
        writeup = learner.reasoner.write_skill(ctx) if learner.reasoner.enabled else None
        fallback = deterministic_skill(ctx)
        w = writeup.model_dump() if writeup else fallback
        rationales = {r["variable"]: r["rationale"] for r in w.get("parameter_rationales") or []}
        effects_text = {e["variable"]: e["effect"] for e in w.get("control_effects") or []}
        learned = []
        for p in knowledge["learned_parameters"]:
            measured = p["rationale"]
            why = rationales.get(p["variable"])
            learned.append({**p, "rationale": f"{why} Measured: {measured}" if why else measured})
        effects = []
        for e in knowledge["control_effects"]:
            said = effects_text.get(e["variable"]) or learner.memory["control_effects"].get(e["variable"])
            effects.append({**e, "effect": f"{said} Measured: {e['effect']}" if said and said != e["effect"] else e["effect"]})
        fixes = [(f["problem"], f["fix"]) for f in w.get("problem_fixes") or [] if f.get("fix")]

        def fix_for(problem: str) -> Optional[str]:  # the write-up may reword the problem it fixes
            scored = [(similarity(problem, text), fix) for text, fix in fixes]
            best = max(scored, key=lambda sf: sf[0], default=(0.0, None))
            return best[1] if best[0] >= 0.6 else None

        problems = [{"problem": p["problem"], "attempt": p["attempt"],
                     "fix": fix_for(p["problem"]) or p.get("fix") or "Apply the learned values."}
                    for p in learner.memory["problems"]]
        caveats: List[str] = []
        for c in [*(w.get("caveats") or []), *learner.memory["caveats"]]:
            if c and not any(similarity(c, k) >= 0.8 for k in caveats):
                caveats.append(c)
        final = attempts[-1]
        skill_dir = self.skills_dir / lvl["id"]
        existing = {}
        if (skill_dir / "skill.json").exists():
            try:
                existing = json.loads((skill_dir / "skill.json").read_text(encoding="utf-8"))
            except ValueError:
                existing = {}
        skill = {
            "version": 2, "id": lvl["id"], "name": lvl.get("skill_name") or lvl.get("title") or lvl["id"],
            "description": w.get("description") or fallback["description"], "job": learner.job, "level_id": lvl["id"],
            "level_index": int(lvl["index"]), "mechanic": learner.mechanic, "status": "learned",
            "trained_attempts": len(attempts), "best_score": best["score"], "final_score": final["score"],
            "pass_threshold": lvl.get("pass_threshold", 70.0), "passed": bool(final["passed"]),
            "learned_parameters": learned, "control_effects": effects,
            "steps": w.get("steps") or fallback["steps"], "caveats": caveats, "problems": problems,
            "score_history": [{"attempt": a["attempt"], "score": a["score"], "passed": a["passed"]} for a in attempts],
            "attempts": [{k: a[k] for k in ("attempt", "run_id", "inputs", "actions_taken", "score", "passed", "feedback",
                                            "breakdown", "problems_found", "caveats", "hypothesis", "what_changed")}
                         for a in attempts],
            "sources": [{"title": s.get("title", ""), "url": s["url"]} for s in lvl.get("sources") or [] if s.get("url")],
            "user_context": existing.get("user_context") or [],
            "updated_at": now_iso(),
        }
        try:
            from shared.schemas.skill import LearnedSkill

            skill = LearnedSkill.model_validate(skill).model_dump()
        except ImportError:
            pass
        write_json(skill_dir / "skill.json", skill)
        (skill_dir / "SKILL.md").write_text(render_skill_md(skill), encoding="utf-8")
        return skill


def _yaml(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_skill_md(s: Dict[str, Any]) -> str:
    lines = ["---"]
    for key in ("name", "description", "status", "level_id", "mechanic", "trained_attempts", "best_score", "updated_at"):
        lines.append(f"{key}: {_yaml(s[key])}")
    lines += ["---", "", f"# {s['name']}", "", s["description"], "",
              f"Job: {s['job']} · Level {s['level_index']} ({s['mechanic']}) · {s['trained_attempts']} attempts · "
              f"best {s['best_score']} · final {s['final_score']} · pass at {s['pass_threshold']} · "
              f"{'passed' if s['passed'] else 'not passed'}", "", "## Learned parameters", ""]
    for p in s["learned_parameters"]:
        ev = ", ".join(f"#{e['attempt']}: {fmt(e['value'], p['unit']) if not isinstance(e['value'], (list, dict)) else e['value']} -> {e['score']}"
                       for e in p["evidence"])
        val = p["value"] if isinstance(p["value"], (list, dict)) else fmt(p["value"], p["unit"])
        lines += [f"- **{p['label']}** (`{p['variable']}`): {val}", f"  - Why: {p['rationale']}"]
        if ev:
            lines.append(f"  - Evidence: {ev}")
    lines += ["", "## Control effects", ""]
    lines += [f"- `{e['variable']}`: {e['effect']}" for e in s["control_effects"]]
    lines += ["", "## Steps", ""]
    lines += [f"{i}. {step}" for i, step in enumerate(s["steps"], 1)]
    lines += ["", "## Caveats", ""]
    lines += [f"- {c}" for c in s["caveats"]] or ["- None recorded."]
    lines += ["", "## Problems", ""]
    lines += [f"- Attempt {p['attempt']}: {p['problem']} Fix: {p['fix']}" for p in s["problems"]] or ["- None recorded."]
    lines += ["", "## Score history", "", "| Attempt | Score | Passed |", "| --- | --- | --- |"]
    lines += [f"| {h['attempt']} | {h['score']} | {'yes' if h['passed'] else 'no'} |" for h in s["score_history"]]
    lines += ["", "## Attempts", ""]
    for a in s["attempts"]:
        lines.append(f"- #{a['attempt']} `{a['run_id']}` inputs {json.dumps(a['inputs'], ensure_ascii=False)} -> {a['score']}"
                     f"{' (passed)' if a['passed'] else ''}. Feedback: {' | '.join(a['feedback']) or 'none'}. "
                     f"Changed: {a['what_changed']}")
    lines += ["", "## Sources", ""]
    lines += [f"- [{src.get('title') or src['url']}]({src['url']})" for src in s["sources"]] or ["- None."]
    lines += ["", "## User context", ""]
    lines += [f"- {u['text']} ({u['added_at']})" for u in s["user_context"]] or ["- None yet."]
    return "\n".join(lines) + "\n"


def main(argv: Optional[List[str]] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="ReplaceMe actor: learn each level by playing it in parallel browsers")
    parser.add_argument("--slug", required=True, help="game slug (games/<slug>/world.json)")
    parser.add_argument("--training-id", default=None, help="defaults to <slug>-<unix_ms>")
    parser.add_argument("--base-url", default="http://127.0.0.1:5183", help="server for /api/world and /api/runs")
    parser.add_argument("--game-url", default=None, help="origin of the game page (defaults to --base-url)")
    parser.add_argument("--attempts", "--episodes", type=int, default=int(os.getenv("ACTOR_ATTEMPTS", "10")),
                        help="attempts per level (env ACTOR_ATTEMPTS, default 10)")
    parser.add_argument("--world", default=None, help="explicit world.json path")
    parser.add_argument("--levels", default=None, help="comma-separated level ids to train (default: all 4)")
    args = parser.parse_args(argv)

    from actor.runner import train

    training_id = args.training_id or f"{args.slug}-{int(time.time() * 1000)}"
    result = asyncio.run(train(slug=args.slug, training_id=training_id, base_url=args.base_url.rstrip("/"),
                               game_url=(args.game_url or args.base_url).rstrip("/"), attempts=args.attempts,
                               world_path=args.world, level_ids=args.levels.split(",") if args.levels else None))
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("status") == "done" else 1


if __name__ == "__main__":
    sys.exit(main())
