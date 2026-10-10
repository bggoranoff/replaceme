"""
Gemini reasoning for the actor: plan each attempt from the evidence so far, reflect on the last
attempt (inputs -> score -> feedback), and write the final skill. Every call has a deterministic
fallback, so training never depends on a key or quota. Model output is validated by the strategy
before use; it can never produce a non-allowlisted action (drivers build the actions).
"""

import json
import os
import sys
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from actor.explore import fmt


class EffectNote(BaseModel):
    variable: str = Field(..., description="Control id, item id, turn number or relation id")
    effect: str = Field(..., description="What changing it did to the score and feedback, citing attempts")


class Assignment(BaseModel):
    key: str = Field(..., description="Control id, item id, turn number, or 'policy' / 'batch' / 'sequence' / 'order'")
    value: str = Field(..., description="Number for a control; option or bin id for a choice; comma-separated ids for a sequence")


class AttemptDecision(BaseModel):
    reflection: str = Field(..., description="What the most recent attempt taught (empty before the first attempt)")
    control_effects: List[EffectNote] = Field(..., description="Updated belief about each control's effect")
    problems_found: List[str] = Field(..., description="New problems seen in the most recent attempt")
    caveats: List[str] = Field(..., description="Caveats worth remembering")
    hypothesis: str = Field(..., description="What you believe now and expect the next attempt to show")
    what_changed: str = Field(..., description="What the next attempt changes compared with the previous one, and why")
    assignments: List[Assignment] = Field(..., description="The full plan for the next attempt")


class ParamRationale(BaseModel):
    variable: str
    rationale: str = Field(..., description="Why this value, citing attempts (value -> score) and sources")


class ProblemFix(BaseModel):
    problem: str
    fix: str


class SkillWriteup(BaseModel):
    description: str = Field(..., description="Two sentences: what the skill achieves and the key learned values")
    steps: List[str] = Field(..., description="Concrete procedure with the exact learned values and units")
    caveats: List[str]
    parameter_rationales: List[ParamRationale]
    control_effects: List[EffectNote]
    problem_fixes: List[ProblemFix]


SYSTEM = (
    "You are the ReplaceMe actor agent. You learn a real job skill by playing a game level, like a human trainee. "
    "You only see what a human sees: the aim, the controls, the score, the per-term sub-scores and qualitative feedback. "
    "You never guess randomly: every change must follow from the evidence (sub-scores, feedback meaning, earlier attempts). "
    "Explore systematically (bracket, vary one thing at a time when the effect is unclear), then exploit what works."
)


class Reasoner:
    def __init__(self, enabled: Optional[bool] = None):
        self.client = None
        self.failures = 0
        want = os.getenv("ACTOR_USE_GEMINI", "1") != "0" if enabled is None else enabled
        if want:
            try:
                from builder.gemini_client import GeminiClient

                client = GeminiClient()
                if client.is_configured():
                    _ = client.client  # create the SDK client now, on this thread, not lazily inside worker threads
                    self.client = client
            except Exception as exc:  # SDK missing: deterministic mode
                print(f"[actor] Gemini unavailable: {exc}", file=sys.stderr)

    @property
    def enabled(self) -> bool:
        return self.client is not None and self.failures < 3

    def _call(self, prompt: str, schema: type) -> Optional[BaseModel]:
        if not self.enabled:
            return None
        try:
            text = self.client.generate_structured(prompt, schema, system_instruction=SYSTEM, temperature=0.2)
            out = schema.model_validate_json(text)
            self.failures = 0
            return out
        except Exception as exc:
            self.failures += 1
            print(f"[actor] Gemini call failed ({self.failures}/3), using the deterministic fallback: {str(exc)[:200]}", file=sys.stderr)
            return None

    def decide(self, ctx: Dict[str, Any]) -> Optional[AttemptDecision]:
        return self._call(decision_prompt(ctx), AttemptDecision)

    def write_skill(self, ctx: Dict[str, Any]) -> Optional[SkillWriteup]:
        return self._call(skill_prompt(ctx), SkillWriteup)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

def _level_block(ctx: Dict[str, Any]) -> str:
    lvl = ctx["level"]
    mech = ctx["mechanic_rules"]
    lines = [
        f"Job: {ctx['job']}",
        f"Level {lvl.get('index')}: {lvl.get('title')} (skill: {lvl.get('skill_name')})",
        f"Aim: {lvl.get('aim')}",
        f"Metric: {(lvl.get('metric') or {}).get('name')}: {(lvl.get('metric') or {}).get('description')}",
        f"Mechanic: {ctx['mechanic']}: {mech.get('description')}",
        f"Controls hint: {lvl.get('controls_hint')}",
    ]
    return "\n".join(lines)


def _controls_block(ctx: Dict[str, Any]) -> str:
    mech, controls = ctx["mechanic"], ctx["controls"]
    if mech in ("mix", "timing"):
        rows = [f"- {c['id']}: {c['label']} [{c['unit']}] min {c['min']}, max {c['max']}, step {c['step']}" for c in controls]
        extra = "\nAssign a number to every control id." + (
            " Also assign 'order' = comma-separated ingredient ids." if ctx.get("ingredients") else "")
        return "Controls:\n" + "\n".join(rows) + extra
    if mech in ("sort", "converse"):
        rows = []
        for c in controls:
            opts = "; ".join(f"{oid} = {text!r}" for oid, text in c["options"].items())
            rows.append(f"- key {c['id']}: {c['label']!r} -> options: {opts}")
        what = "item id" if mech == "sort" else "turn number"
        return f"Choices (assign one option id per {what}):\n" + "\n".join(rows)
    rows = [f"- {c['id']}: {c['label']}" for c in controls]
    return ("Orders:\n" + "\n".join(rows) +
            "\nAssign 'policy' = listed | nearest | sequence, 'batch' = orders carried per trip, and if policy is sequence, "
            "'sequence' = comma-separated order ids.")


def _history_block(ctx: Dict[str, Any]) -> str:
    if not ctx["attempts"]:
        return "No attempts yet."
    out = []
    for a in ctx["attempts"]:
        subs = ", ".join(f"{v.get('label', k)} {v.get('score')}" for k, v in (a.get("breakdown") or {}).items())
        out.append(f"#{a['attempt']} inputs {json.dumps(a['inputs'], ensure_ascii=False)} -> score {a['score']} "
                   f"({'passed' if a['passed'] else 'failed'}). Sub-scores: {subs or 'n/a'}. "
                   f"Feedback: {' | '.join(a.get('feedback') or []) or 'none'}")
    return "\n".join(out)


def _memory_block(ctx: Dict[str, Any]) -> str:
    mem = ctx["memory"]
    effects = "\n".join(f"- {k}: {v}" for k, v in mem.get("control_effects", {}).items()) or "- none yet"
    problems = "\n".join(f"- (attempt {p['attempt']}) {p['problem']}" for p in mem.get("problems", [])) or "- none yet"
    caveats = "\n".join(f"- {c}" for c in mem.get("caveats", [])) or "- none yet"
    return f"Control effects so far:\n{effects}\nProblems seen:\n{problems}\nCaveats:\n{caveats}"


def decision_prompt(ctx: Dict[str, Any]) -> str:
    final = ctx["attempt"] >= ctx["attempts_total"]
    return "\n\n".join([
        _level_block(ctx),
        _controls_block(ctx),
        f"Next: attempt {ctx['attempt']} of {ctx['attempts_total']}." + (" This is the final attempt: use the best plan found." if final else ""),
        "History (inputs -> score -> sub-scores -> feedback):\n" + _history_block(ctx),
        _memory_block(ctx),
        "Systematic search suggestion (from fitting the sub-score curves; follow it unless the feedback clearly points "
        f"elsewhere):\n{json.dumps(ctx['suggestion'], ensure_ascii=False)}\nWhy: {ctx['suggestion_why']}",
        "First reflect on the most recent attempt: what each control did, new problems, caveats. Then give the full plan "
        "for the next attempt. Stay inside min/max, use multiples of step, and use only the listed ids.",
    ])


def skill_prompt(ctx: Dict[str, Any]) -> str:
    knowledge = json.dumps(ctx["knowledge"], ensure_ascii=False)[:12000]
    sources = "\n".join(f"- {s.get('title', '')} {s['url']}" for s in ctx.get("sources") or []) or "- none"
    return "\n\n".join([
        _level_block(ctx),
        "All attempts:\n" + _history_block(ctx),
        _memory_block(ctx),
        f"Measured knowledge (learned values, control effects with evidence):\n{knowledge}",
        f"Best score {ctx['best_score']} with inputs {json.dumps(ctx['best_inputs'], ensure_ascii=False)}.",
        f"Level sources:\n{sources}",
        "Write the learned skill for a human worker doing this job for real. Use the exact learned values with units in the "
        "steps. Explain each learned value with the attempt evidence (value -> score). Give a fix for every problem.",
    ])


# ---------------------------------------------------------------------------
# Deterministic fallbacks
# ---------------------------------------------------------------------------

def deterministic_reflection(attempt: Dict[str, Any], prev: Optional[Dict[str, Any]], notes: Dict[str, Any],
                             labels: Dict[str, str], driver_problems: List[str]) -> Dict[str, Any]:
    weak = [(k, v) for k, v in (attempt.get("breakdown") or {}).items() if isinstance(v, dict) and (v.get("score") or 0) < 80]
    problems: List[str] = []
    if weak or not attempt["passed"]:
        problems += [f for f in attempt.get("feedback") or []]
    for a in notes.get("attributed", []):
        problems.append(f"{labels.get(a['variable'], a['variable'])} {'too high' if a['side'] == 'too_high' else 'too low'} "
                        f"({a['x']}): \"{a['text']}\"")
    crit = notes.get("critical")
    if crit:
        problems.append(f"Answering {crit['text']!r} ended the conversation at once.")
    for oid in notes.get("wrong", []):
        problems.append(f"Order {labels.get(oid, oid)} was handed to the wrong place.")
    if notes.get("timed_out"):
        problems.append("Time ran out before the task was finished.")
    problems += driver_problems
    caveats: List[str] = []
    for a in notes.get("attributed", []):
        direction = "lower" if a["side"] == "too_high" else "raise"
        caveats.append(f"If you see \"{a['text']}\", {direction} {labels.get(a['variable'], a['variable'])}.")
    if crit:
        caveats.append(f"Never answer {crit['text']!r}.")
    for k, v in weak:
        if k in notes.get("relations", ()):
            caveats.append(f"'{v.get('label', k)}' depends on several controls together, not one alone.")
    reflection = f"Attempt {attempt['attempt']} scored {attempt['score']}"
    if prev:
        delta = round(attempt["score"] - prev["score"], 1)
        reflection += f" ({'+' if delta >= 0 else ''}{delta} vs attempt {prev['attempt']})"
    if weak:
        reflection += "; weakest terms: " + ", ".join(f"{v.get('label', k)} {v.get('score')}" for k, v in weak[:3])
    return {"reflection": reflection + ".", "problems_found": problems, "caveats": caveats}


def describe_change(prev_inputs: Optional[Dict[str, Any]], plan: Dict[str, Any], labels: Dict[str, str]) -> str:
    if not prev_inputs:
        return "First attempt."
    changes = []
    for group in ("values", "choices"):
        for k, v in (plan.get(group) or {}).items():
            old = (prev_inputs.get(group) or {}).get(k)
            if old != v:
                changes.append(f"{labels.get(k, k)}: {old} -> {v}")
    for k in ("policy", "batch", "sequence", "order"):
        if k in plan and plan.get(k) != prev_inputs.get(k):
            changes.append(f"{k}: {prev_inputs.get(k)} -> {plan.get(k)}")
    return "; ".join(changes) or "No change: replay the same plan."


def deterministic_skill(ctx: Dict[str, Any]) -> Dict[str, Any]:
    lvl, mech = ctx["level"], ctx["mechanic"]
    params = ctx["knowledge"]["learned_parameters"]
    steps: List[str] = []
    if mech == "mix":
        steps += [f"Set {p['label']} to {fmt(p['value'], p['unit'])}." for p in params if p["variable"] != "order"]
        order = next((p for p in params if p["variable"] == "order"), None)
        if order:
            steps.append(f"Add ingredients in this order: {', '.join(order['value'] or [])}.")
        steps.append("Submit and read the feedback; adjust the control named in any warning.")
    elif mech == "timing":
        steps += [f"Stop or release {p['label']} at {fmt(p['value'], p['unit'])}." for p in params]
    elif mech == "sort":
        steps += [f"Put {p['label']} in {p['value']}." for p in params]
    elif mech == "converse":
        steps += [f"When asked {p['label']!r}, answer {p['value']!r}." for p in params]
    else:
        steps += [f"{p['label']}: {p['value']}." for p in params]
        steps.append("Walk the shortest path; hand each order to the place on its ticket.")
    best = ctx["best_score"]
    description = (f"{lvl.get('skill_name') or lvl.get('title')}: {lvl.get('aim')} "
                   f"Learned by playing {len(ctx['attempts'])} attempts; best score {best}.")
    fixes = []
    for p in ctx["memory"].get("problems", []):
        fixes.append({"problem": p["problem"], "fix": p.get("fix") or "Apply the learned values above."})
    return {"description": description, "steps": steps, "caveats": list(ctx["memory"].get("caveats", [])),
            "parameter_rationales": [], "control_effects": [], "problem_fixes": fixes}
