"""
Systematic exploration for the actor (shared/game_contract.md section d). Never random.

The actor sees only what a human sees: the observation, the score, the per-term breakdown
sub-scores and the qualitative feedback lines. It never reads scoring targets.

- mix / timing: a 1-D search per control on its breakdown sub-score (V-shaped fit of the
  sub-score curve, bracketing when there is no signal yet), coordinate search on the total score
  for controls without a sub-score and for derived relations, then one-sided probes to map the
  acceptable window and discover each control's failure feedback. The last attempt replays the best.
- sort / converse: change one choice at a time from the best assignment so far (all wrong
  choices at once when the breakdown scores each item or turn separately).
- deliver: try pickup/delivery policies (listed order, nearest first, batching), then swaps.
"""

import itertools
import math
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

GOOD = 0.97  # a sub-score at or above this is treated as optimal
FEEDBACK_S = 0.8  # terms below this emit feedback (actions.json scoring_spec.feedback_rule)
FLOOR = 0.02  # sub-scores below this carry no gradient information


def _decimals(step: float) -> int:
    return max(0, -Decimal(str(step)).normalize().as_tuple().exponent)


def snap(value: float, lo: float, hi: float, step: float) -> float:
    """Snap to the control's step grid and clamp to [lo, hi]."""
    step = step if step and step > 0 else 1.0
    n = round((float(value) - lo) / step)
    v = min(hi, max(lo, lo + n * step))
    v = round(v, _decimals(step))
    return int(v) if float(v).is_integer() and float(step).is_integer() and float(lo).is_integer() else v


def fmt(value: Any, unit: str = "") -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return f"{value} {unit}".strip() if unit else str(value)


def _tokens(text: str) -> set:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words}


def similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / math.sqrt(len(ta) * len(tb))


def term_score(result: Optional[Dict[str, Any]], term_id: str) -> Optional[float]:
    entry = ((result or {}).get("breakdown") or {}).get(term_id)
    if isinstance(entry, dict) and isinstance(entry.get("score"), (int, float)):
        return max(0.0, min(1.0, entry["score"] / 100.0))
    return None


# ---------------------------------------------------------------------------
# Numeric controls (mix variables, timing phases)
# ---------------------------------------------------------------------------

class NumericVar:
    def __init__(self, vid: str, label: str, unit: str, lo: float, hi: float, step: float, default: float):
        self.id, self.label, self.unit = vid, label, unit
        self.lo, self.hi = float(lo), float(hi)
        self.step = float(step) if step and step > 0 else max((self.hi - self.lo) / 100.0, 1e-6)
        self.default = snap(default, self.lo, self.hi, self.step)
        self.samples: List[Dict[str, Any]] = []  # {attempt, x, s, total}
        self.feedback: Dict[str, Dict[str, Any]] = {}  # side -> {text, attempt, x}

    def snap(self, x: float) -> float:
        return snap(x, self.lo, self.hi, self.step)

    def add(self, attempt: int, x: float, s: Optional[float], total: float) -> None:
        self.samples.append({"attempt": attempt, "x": float(x), "s": s, "total": total})

    @property
    def has_signal(self) -> bool:
        return any(p["s"] is not None for p in self.samples)

    def points(self) -> List[Tuple[float, float]]:
        latest: Dict[float, float] = {}
        for p in self.samples:
            if p["s"] is not None:
                latest[p["x"]] = p["s"]
        return sorted(latest.items())

    def best(self) -> Optional[Dict[str, Any]]:
        scored = [p for p in self.samples if p["s"] is not None]
        if not scored:
            return max(self.samples, key=lambda p: p["total"], default=None)
        top = max(p["s"] for p in scored)
        ties = sorted({p["x"] for p in scored if p["s"] >= top - 1e-9})
        mid = ties[len(ties) // 2]  # centre of a flat optimum is the most robust choice
        return next(p for p in scored if p["x"] == mid and p["s"] >= top - 1e-9)

    def converged(self) -> bool:
        b = self.best()
        return bool(b and b["s"] is not None and b["s"] >= GOOD)

    def tried(self, x: float) -> bool:
        return any(abs(p["x"] - x) < self.step / 2 for p in self.samples)

    # V-shaped fit: for both curve families the transformed sub-score is proportional to |x - t|.
    def fit(self) -> Optional[Dict[str, Any]]:
        pts = self.points()
        informative = [(x, s) for x, s in pts if s >= FLOOR]
        if len(informative) < 2:
            return None
        zeros = [x for x, s in pts if s < FLOOR]
        n = int(round((self.hi - self.lo) / self.step)) + 1
        count = min(n, 801)
        grid = [self.lo + (self.hi - self.lo) * i / (count - 1) for i in range(count)] if count > 1 else [self.lo]
        fits = []
        for model, tf, cap in (
            ("gaussian", lambda s: math.sqrt(-2.0 * math.log(min(max(s, 1e-4), 1.0))), math.sqrt(-2.0 * math.log(FLOOR))),
            ("linear", lambda s: 1.0 - s, 1.0 - FLOOR),
        ):
            d = [(x, tf(s)) for x, s in informative]
            scale = sum(v * v for _, v in d) + 1e-9
            for t in grid:
                num = sum(v * abs(x - t) for x, v in d)
                den = sum((x - t) ** 2 for x, _ in d)
                if den <= 1e-12:
                    continue
                a = num / den
                if a <= 0:
                    continue
                r = sum((v - a * abs(x - t)) ** 2 for x, v in d)
                r += sum(max(0.0, cap - a * abs(x - t)) ** 2 for x in zeros)
                fits.append((r / scale, t, a, model))
        if not fits:
            return None
        rmin = min(f[0] for f in fits)
        near = sorted((f for f in fits if f[0] <= rmin + 0.01), key=lambda f: f[1])
        clusters: List[List[tuple]] = []
        for f in near:
            if clusters and f[1] - clusters[-1][-1][1] <= 2 * self.step + (self.hi - self.lo) / 400:
                clusters[-1].append(f)
            else:
                clusters.append([f])
        best_x = self.best()["x"]
        others = [x for x, _ in informative if x != best_x]

        def beyond_best(c):  # candidate lies past the best sample, away from the worse ones
            t = min(c, key=lambda f: f[0])[1]
            return all((t - best_x) * (best_x - o) >= 0 for o in others)

        ranked = sorted(clusters, key=lambda c: (not beyond_best(c), min(f[0] for f in c)))
        top = min(ranked[0], key=lambda f: f[0])
        return {"t": top[1], "a": top[2], "model": top[3], "residual": top[0], "ambiguous": len(clusters) > 1,
                "alternatives": [min(c, key=lambda f: f[0])[1] for c in ranked[1:]]}

    def next(self) -> Tuple[float, str]:
        if not self.samples:
            return self.default, f"start {self.label} at its default {fmt(self.default, self.unit)}"
        b = self.best()
        if self.converged():
            return self.snap(b["x"]), f"keep {self.label} at {fmt(self.snap(b['x']), self.unit)} (sub-score {round(b['s'] * 100)})"
        f = self.fit()
        if f:
            for t in [f["t"], *f["alternatives"]]:
                x = self.snap(t)
                if not self.tried(x):
                    return x, f"{self.label}: the sub-score curve points to about {fmt(x, self.unit)}"
            # every fitted candidate was tried: refine one step around the best
            for x in (self.snap(b["x"] + self.step), self.snap(b["x"] - self.step)):
                if not self.tried(x):
                    return x, f"{self.label}: refine one step around {fmt(self.snap(b['x']), self.unit)}"
        return self._bracket()

    def _bracket(self) -> Tuple[float, str]:
        pts = self.points()
        informative = [(x, s) for x, s in pts if s >= FLOOR]
        span = self.hi - self.lo
        if len(informative) == 1:
            x1 = informative[0][0]
            delta = max(self.step, span / 8)
            centre = (self.lo + self.hi) / 2
            sides = [1 if centre >= x1 else -1]
            sides.append(-sides[0])
            for side in sides:
                for mult in (1, 2, 3):
                    x = self.snap(x1 + side * delta * mult)
                    if not self.tried(x):
                        return x, f"{self.label}: probe {'higher' if side > 0 else 'lower'} to find which side improves"
        # no gradient yet: space-filling probes over the range (halves, quarters, eighths ...)
        for depth in range(1, 8):
            denom = 2 ** depth
            for k in range(1, denom, 2):
                x = self.snap(self.lo + span * k / denom)
                if not self.tried(x):
                    return x, f"{self.label}: no signal yet, scan {fmt(x, self.unit)}"
        b = self.best()
        return self.snap(b["x"]), f"{self.label}: range exhausted, keep the best"

    def probe(self, side: int) -> Optional[float]:
        """A deliberate off-optimum value on one side, to learn the window and that side's feedback."""
        b = self.best()
        if not b:
            return None
        f = self.fit()
        if f and f["a"] > 0:
            dist = (0.85 if f["model"] == "gaussian" else 0.3) / f["a"]
        else:
            dist = max(3 * self.step, (self.hi - self.lo) / 10)
        dist = max(dist, self.step)
        x = self.snap(b["x"] + side * dist)
        if abs(x - b["x"]) < self.step / 2:
            return None
        return x

    def window(self) -> Optional[Tuple[float, float]]:
        ok = [x for x, s in self.points() if s >= FEEDBACK_S]
        return (min(ok), max(ok)) if ok else None


class NumericStrategy:
    """mix and timing."""

    def __init__(self, mechanic: str):
        self.mechanic = mechanic
        self.vars: Dict[str, NumericVar] = {}
        self.ingredients: List[str] = []
        self.order_perms: Optional[List[List[str]]] = None
        self.history: List[Dict[str, Any]] = []
        self.derived: Dict[str, Dict[str, Any]] = {}  # term id -> {label, scores: [(attempt, s)]}
        self.pattern: Dict[str, Any] = {}
        self.probes: List[Tuple[str, int]] = []
        self.pending_probe: Optional[Tuple[str, int, float]] = None
        self.attributed: List[Dict[str, Any]] = []

    # -- discovery -------------------------------------------------------
    def register(self, obs: Dict[str, Any]) -> None:
        ms = obs.get("mechanic_state") or {}
        if self.mechanic == "mix":
            for v in ms.get("variables") or []:
                if v["id"] not in self.vars:
                    self.vars[v["id"]] = NumericVar(v["id"], v.get("label", v["id"]), v.get("unit", ""), v["min"], v["max"],
                                                    v.get("step", 1), v.get("value", v.get("default", v["min"])))
            ing = [t["id"].split(":", 1)[1] for t in obs.get("targets") or [] if str(t.get("id", "")).startswith("ingredient:")]
            if ing and not self.ingredients:
                self.ingredients = ing
                if len(ing) <= 5:
                    self.order_perms = [list(p) for p in itertools.permutations(ing)]
        else:
            meter = ms.get("meter") or {}
            if meter.get("id") and meter["id"] not in self.vars:
                lo, hi = float(meter.get("min", 0)), float(meter.get("max", 100))
                step = meter.get("step") or max((hi - lo) / 100.0, 1e-6)
                self.vars[meter["id"]] = NumericVar(meter["id"], meter.get("label", meter["id"]), meter.get("unit", ""),
                                                    lo, hi, step, (lo + hi) / 2)

    def labels(self) -> Dict[str, str]:
        return {vid: v.label for vid, v in self.vars.items()}

    # -- planning --------------------------------------------------------
    def best_attempt(self) -> Optional[Dict[str, Any]]:
        return max(self.history, key=lambda h: (h["total"], -h["attempt"]), default=None)

    def best_plan(self) -> Dict[str, Any]:
        """The best attempt's inputs: what the final attempt replays and the skill records."""
        ba = self.best_attempt()
        known = (ba or {}).get("inputs", {}).get("values", {})
        plan: Dict[str, Any] = {"values": {vid: known.get(vid, v.default) for vid, v in self.vars.items()}}
        if self.order_perms:
            plan["order"] = (ba or {}).get("inputs", {}).get("order") or list(self.ingredients)
        return plan

    def _search_base(self) -> Dict[str, Any]:
        """Per-control best values while the sub-scores are separable, else the best attempt's inputs."""
        values = dict(self.best_plan()["values"])
        if not self._derived_weak():
            for vid, v in self.vars.items():
                b = v.best()
                if v.has_signal and b:
                    values[vid] = v.snap(b["x"])
        return values

    def _derived_weak(self) -> bool:
        return any(d.get("last_best", 1.0) < 0.9 for d in self.derived.values())

    def value_for(self, vid: str, plan: Dict[str, Any]) -> float:
        v = self.vars[vid]
        val = (plan.get("values") or {}).get(vid)
        return v.snap(val) if isinstance(val, (int, float)) else v.default

    def suggest(self, attempt: int, total_attempts: int) -> Tuple[Dict[str, Any], str]:
        self.pending_probe = None
        if not self.history:
            plan = {"values": {vid: v.default for vid, v in self.vars.items()}}
            if self.order_perms:
                plan["order"] = list(self.ingredients)
            return plan, "Baseline: start every control at its default and read the sub-scores and feedback."
        if attempt >= total_attempts:
            return self.best_plan(), "Final attempt: replay the best settings found."
        values = self._search_base()
        reasons: List[str] = []
        signal = [v for v in self.vars.values() if v.has_signal]
        unconverged = [v for v in signal if not v.converged()]
        nosignal = [v.id for v in self.vars.values() if not v.has_signal]
        if unconverged:
            for v in unconverged:
                values[v.id], why = v.next()
                reasons.append(why)
        if not reasons and nosignal and not self.pattern.get("nosignal", {}).get("finished"):
            values, why = self._pattern_step(values, nosignal, "nosignal")
            reasons += [why] if why else []
        if not reasons and self._derived_weak() and not self.pattern.get("derived", {}).get("finished"):
            values, why = self._pattern_step(values, list(self.vars), "derived")
            reasons += [why] if why else []
        if not reasons and attempt < total_attempts - 1 and self._next_probe():
            vid, side = self._next_probe()
            x = self.vars[vid].probe(side)
            values[vid] = x
            self.pending_probe = (vid, side, x)
            reasons.append(f"Probe {self.vars[vid].label} {'above' if side > 0 else 'below'} the best ({fmt(x, self.vars[vid].unit)}) "
                           "to map the acceptable window and see what goes wrong there.")
        if not reasons:
            return self.best_plan(), "Exploit: replay the best settings found so far."
        plan: Dict[str, Any] = {"values": values}
        if self.order_perms:
            plan["order"] = self._next_order()
        return plan, " ".join(reasons)

    def _next_order(self) -> List[str]:
        best = self.best_attempt()
        cur = (best or {}).get("inputs", {}).get("order") or self.ingredients
        s = term_score(best.get("result") if best else None, "order")
        if s is None or s >= 1.0:
            return list(cur)
        tried = [h["inputs"].get("order") for h in self.history]
        for p in self.order_perms:
            if p not in tried:
                return p
        return list(cur)

    def _next_probe(self) -> Optional[Tuple[str, int]]:
        done = {(p[0], p[1]) for p in self.probes}
        for vid, v in self.vars.items():
            if not v.has_signal:
                continue
            for side in (1, -1):
                if (vid, side) in done or ("too_high" if side > 0 else "too_low") in v.feedback:
                    continue
                if v.probe(side) is not None:
                    return vid, side
        return None

    def _pattern_step(self, values: Dict[str, Any], var_ids: List[str], key: str) -> Tuple[Dict[str, Any], Optional[str]]:
        """Round-robin coordinate search on the total score: one control moves per attempt."""
        st = self.pattern.setdefault(key, {"vars": {}, "cursor": 0})
        base_total = self.best_attempt()["total"]
        for i in range(len(var_ids)):
            vid = var_ids[(st["cursor"] + i) % len(var_ids)]
            v = self.vars[vid]
            vs = st["vars"].setdefault(vid, {
                "delta": max(v.step, (v.hi - v.lo) / (4 if key == "nosignal" else 20)),
                "dir": 1 if (v.lo + v.hi) / 2 >= values[vid] else -1, "fails": 0, "done": False})
            for _ in range(4):
                if vs["done"]:
                    break
                x = v.snap(values[vid] + vs["dir"] * vs["delta"])
                if x != values[vid]:
                    st["cursor"] = (var_ids.index(vid) + 1) % len(var_ids)
                    st["pending"] = {"vid": vid, "base_total": base_total}
                    out = dict(values)
                    out[vid] = x
                    what = "the total score" if key == "nosignal" else "the relation terms"
                    return out, (f"Coordinate search on {what}: move {v.label} {'up' if vs['dir'] > 0 else 'down'} "
                                 f"to {fmt(x, v.unit)}, others fixed.")
                self._pattern_fail(vs, v)
        st["finished"] = True
        return values, None

    @staticmethod
    def _pattern_fail(vs: Dict[str, Any], v: NumericVar) -> None:
        vs["dir"] = -vs["dir"]
        vs["fails"] += 1
        if vs["fails"] >= 2:
            vs["delta"] /= 2
            vs["fails"] = 0
            if vs["delta"] < v.step - 1e-9:
                vs["done"] = True

    def _pattern_feedback(self, total: float) -> None:
        for st in self.pattern.values():
            p = st.pop("pending", None)
            if not p:
                continue
            vs = st["vars"][p["vid"]]
            if total > p["base_total"] + 1e-9:
                vs["fails"] = 0
            else:
                self._pattern_fail(vs, self.vars[p["vid"]])

    # -- learning --------------------------------------------------------
    def coerce_plan(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        values = {}
        for vid, v in self.vars.items():
            val = (raw.get("values") or {}).get(vid)
            try:
                values[vid] = v.snap(float(val))
            except (TypeError, ValueError):
                return None
        plan: Dict[str, Any] = {"values": values}
        if self.order_perms:
            order = raw.get("order")
            plan["order"] = order if isinstance(order, list) and sorted(order) == sorted(self.ingredients) else self._next_order()
        return plan

    def record(self, attempt: int, inputs: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
        total = float(result.get("score") or 0.0)
        values = inputs.get("values", {})
        subs: Dict[str, Optional[float]] = {}
        for vid, x in values.items():
            if vid not in self.vars:
                continue
            s = term_score(result, vid)
            subs[vid] = s
            self.vars[vid].add(attempt, x, s, total)
        for tid, entry in (result.get("breakdown") or {}).items():
            if tid in self.vars or tid == "order":
                continue
            d = self.derived.setdefault(tid, {"label": entry.get("label", tid), "scores": []})
            s = term_score(result, tid)
            d["scores"].append((attempt, s))
        self.history.append({"attempt": attempt, "inputs": inputs, "total": total, "result": result})
        best = self.best_attempt()
        for tid, d in self.derived.items():
            d["last_best"] = next((s for a, s in d["scores"] if a == best["attempt"]), 1.0) or 0.0
        self._pattern_feedback(total)
        notes = self._attribute_feedback(attempt, values, result)
        if self.pending_probe:
            vid, side, x = self.pending_probe
            self.probes.append((vid, side, x))
            self.pending_probe = None
        return notes

    def _attribute_feedback(self, attempt: int, values: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
        """When exactly one term is below the feedback threshold, its feedback lines belong to it."""
        weak = [tid for tid, e in (result.get("breakdown") or {}).items()
                if isinstance(e, dict) and isinstance(e.get("score"), (int, float)) and e["score"] / 100 < FEEDBACK_S]
        lines = [f for f in result.get("feedback") or []]
        out: Dict[str, Any] = {"attributed": []}
        if len(weak) == 1 and lines and weak[0] in self.vars:
            v = self.vars[weak[0]]
            others = [p for p in v.samples if p["s"] is not None and p["s"] >= GOOD]
            ref = others[-1]["x"] if others else None
            x = float(values.get(v.id, v.default))
            if ref is not None and abs(x - ref) >= v.step / 2:
                side = "too_high" if x > ref else "too_low"
                if side not in v.feedback:
                    v.feedback[side] = {"text": lines[0], "attempt": attempt, "x": x}
                    out["attributed"].append({"variable": v.id, "side": side, "text": lines[0], "x": x})
        return out

    # -- export ----------------------------------------------------------
    def knowledge(self) -> Dict[str, Any]:
        best_plan = self.best_plan()["values"] if self.history else {}
        params, effects = [], []
        for vid, v in self.vars.items():
            evidence = [{"attempt": p["attempt"], "value": p["x"], "score": p["total"]} for p in v.samples]
            b = v.best()
            value = best_plan.get(vid, v.default)
            parts = []
            if b and b["s"] is not None:
                parts.append(f"Best sub-score {round(b['s'] * 100)}/100 at {fmt(v.snap(b['x']), v.unit)}.")
            pts = v.points()
            if len(pts) >= 2:
                lo_pt, hi_pt = pts[0], pts[-1]
                parts.append(f"Tried {fmt(v.snap(lo_pt[0]), v.unit)} (sub-score {round(lo_pt[1] * 100)}) to "
                             f"{fmt(v.snap(hi_pt[0]), v.unit)} (sub-score {round(hi_pt[1] * 100)}).")
            w = v.window()
            if w:
                parts.append(f"Sub-score stayed at or above {int(FEEDBACK_S * 100)} between {fmt(v.snap(w[0]), v.unit)} and {fmt(v.snap(w[1]), v.unit)}.")
            for side, info in v.feedback.items():
                parts.append(f"{'Too high' if side == 'too_high' else 'Too low'} ({fmt(v.snap(info['x']), v.unit)}): \"{info['text']}\"")
            if not v.has_signal and len(v.samples) > 1:
                totals = sorted({(p["x"], p["total"]) for p in v.samples})
                parts.append("Total score by value: " + ", ".join(f"{fmt(v.snap(x), v.unit)} -> {t}" for x, t in totals) + ".")
            effect = " ".join(parts) or "Not enough attempts to measure this control."
            params.append({"variable": vid, "label": v.label, "value": value, "unit": v.unit,
                           "rationale": effect, "evidence": evidence})
            effects.append({"variable": vid, "effect": effect, "evidence": evidence})
        for tid, d in self.derived.items():
            scores = [(a, s) for a, s in d["scores"] if s is not None]
            if scores:
                best_s = max(s for _, s in scores)
                effects.append({"variable": tid, "effect": f"Relation '{d['label']}' depends on several controls together; "
                                f"best sub-score {round(best_s * 100)}/100.",
                                "evidence": [{"attempt": a, "value": round(s * 100), "score": next(h['total'] for h in self.history if h['attempt'] == a)} for a, s in scores]})
        if self.order_perms and self.history:
            best = self.best_attempt()
            params.append({"variable": "order", "label": "Order of ingredients", "value": best["inputs"].get("order"), "unit": "",
                           "rationale": "Order with the best score.",
                           "evidence": [{"attempt": h["attempt"], "value": h["inputs"].get("order"), "score": h["total"]} for h in self.history]})
        return {"learned_parameters": params, "control_effects": effects}


# ---------------------------------------------------------------------------
# Choices (sort items into bins, converse options per turn)
# ---------------------------------------------------------------------------

class ChoiceStrategy:
    def __init__(self, mechanic: str):
        self.mechanic = mechanic
        self.binary = mechanic == "sort"  # an item is either in the right bin or not; answers are graded
        self.elements: Dict[str, Dict[str, Any]] = {}
        self.history: List[Dict[str, Any]] = []
        self.turn_ids: Dict[str, str] = {}
        self.pending: Optional[Tuple[str, str, str]] = None
        self.critical: Dict[str, set] = {}
        self.explored: set = set()

    def register(self, obs: Dict[str, Any]) -> None:
        ms = obs.get("mechanic_state") or {}
        if self.mechanic == "sort":
            item = ms.get("current_item")
            bins = ms.get("bins") or []
            if item and item.get("id") not in self.elements:
                attrs = " ".join(str(v) for v in (item.get("attributes") or {}).values())
                text = f"{item.get('label', '')} {attrs}"
                ranked = sorted(bins, key=lambda b: -similarity(text, b.get("label", "")))  # stable: ties keep bin order
                self.elements[item["id"]] = {"label": item.get("label", item["id"]), "candidates": [b["id"] for b in ranked],
                                             "names": {b["id"]: b.get("label", b["id"]) for b in bins}, "tried": {},
                                             "resolved": None, "bad": set()}
        else:
            idx = ms.get("turn_index")
            if idx is not None and ms.get("options"):
                key = str(idx)
                if key not in self.elements:
                    opts = ms["options"]
                    self.elements[key] = {"label": ms.get("line", f"Turn {int(idx) + 1}"), "candidates": [o["id"] for o in opts],
                                          "names": {o["id"]: o.get("text", o["id"]) for o in opts}, "tried": {},
                                          "resolved": None, "bad": set()}
            for i, h in enumerate(ms.get("history") or []):
                if h.get("turn_id"):
                    self.turn_ids[str(i)] = h["turn_id"]

    def labels(self) -> Dict[str, str]:
        return {k: e["label"] for k, e in self.elements.items()}

    def _prior(self, key: str) -> Optional[str]:
        e = self.elements.get(key)
        if not e:
            return None
        return next((c for c in e["candidates"] if c not in e["bad"]), e["candidates"][0])

    def best_attempt(self) -> Optional[Dict[str, Any]]:
        return max(self.history, key=lambda h: (h["total"], -h["attempt"]), default=None)

    def _element_best(self, key: str) -> Optional[str]:
        e = self.elements[key]
        if e["resolved"]:
            return e["resolved"]
        scored = [(c, max((s for _, s, _ in runs if s is not None), default=None)) for c, runs in e["tried"].items()]
        scored = [(c, s) for c, s in scored if s is not None and c not in e["bad"]]
        if scored:
            return max(scored, key=lambda cs: cs[1])[0]
        return None

    def best_plan(self) -> Dict[str, Any]:
        ba = self.best_attempt()
        choices = dict((ba or {}).get("inputs", {}).get("choices", {}))
        for key in self.elements:
            eb = self._element_best(key)
            if eb and self._signal_available():
                choices[key] = eb
            choices.setdefault(key, self._prior(key))
        return {"choices": choices}

    def value_for(self, key: str, plan: Dict[str, Any]) -> Optional[str]:
        choice = (plan.get("choices") or {}).get(key)
        e = self.elements.get(key)
        if e and choice in e["candidates"]:
            return choice
        return self._prior(key)

    def _signal_available(self) -> bool:
        return any(s is not None for e in self.elements.values() for runs in e["tried"].values() for _, s, _ in runs)

    def _untried(self, key: str) -> List[str]:
        e = self.elements[key]
        return [c for c in e["candidates"] if c not in e["tried"] and c not in e["bad"]]

    def suggest(self, attempt: int, total_attempts: int) -> Tuple[Dict[str, Any], str]:
        self.pending = None
        if not self.history:
            return {"choices": {k: self._prior(k) for k in self.elements}}, \
                "Baseline: pick the choice that best matches each item or line, then read the score and feedback."
        plan = self.best_plan()
        if attempt >= total_attempts:
            return plan, "Final attempt: replay the best choices found."
        if self._signal_available():
            changed = []
            for key, e in self.elements.items():
                s = self._last_signal(key)
                if e["resolved"] or s is None or s >= 1.0:
                    continue
                nxt = self._untried(key)
                if nxt:
                    plan["choices"][key] = nxt[0]
                    changed.append(f"{e['label']!r} -> {e['names'][nxt[0]]!r}")
            if changed:
                return plan, "The breakdown shows which choices lost points; try the next option for each: " + "; ".join(changed)
        # first unresolved choices; then, while at least two attempts remain for exploiting, learn what other options do
        for explore in (False, True) if attempt < total_attempts - 1 else (False,):
            for key, e in self.elements.items():
                if e["resolved"] and not explore:
                    continue
                if explore and self.binary and key in self.explored:  # one wrong bin shows that item's feedback
                    continue
                nxt = self._untried(key)
                if not nxt:
                    continue
                old = plan["choices"].get(key)
                plan["choices"][key] = nxt[0]
                self.pending = (key, old, nxt[0])
                if explore:
                    self.explored.add(key)
                why = "Score is already perfect; check what goes wrong with another option:" if explore else "Change one choice at a time:"
                return plan, f"{why} {e['label']!r} from {e['names'].get(old, old)!r} to {e['names'][nxt[0]]!r}, keep the rest."
        return plan, "Every option was tried; exploit the best combination."

    def _last_signal(self, key: str) -> Optional[float]:
        last = self.history[-1]
        return last.get("signals", {}).get(key)

    def coerce_plan(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        choices = {}
        for key, e in self.elements.items():
            c = (raw.get("choices") or {}).get(key)
            if c not in e["candidates"]:
                # accept the option's text or label as well as its id
                c = next((cid for cid, name in e["names"].items() if str(name).strip().lower() == str(c).strip().lower()), None)
            if c is None:
                return None
            choices[key] = c
        return {"choices": choices}

    def record(self, attempt: int, inputs: Dict[str, Any], result: Dict[str, Any], early_end: bool = False) -> Dict[str, Any]:
        total = float(result.get("score") or 0.0)
        choices = inputs.get("choices", {})
        signals: Dict[str, Optional[float]] = {}
        for key, c in choices.items():
            term = self.turn_ids.get(key, key) if self.mechanic == "converse" else key
            s = term_score(result, term)
            signals[key] = s
            e = self.elements.get(key)
            if not e:
                continue
            e["tried"].setdefault(c, []).append((attempt, s, total))
            if s is not None and s >= 1.0:
                e["resolved"] = c
        notes: Dict[str, Any] = {"critical": None}
        if self.mechanic == "converse" and early_end and choices:
            last_key = max(choices, key=lambda k: int(k))
            c = choices[last_key]
            self.elements[last_key]["bad"].add(c)
            self.critical.setdefault(last_key, set()).add(c)
            notes["critical"] = {"turn": last_key, "option": c, "text": self.elements[last_key]["names"].get(c, c)}
        prev_best = self.best_attempt()
        if self.pending and not any(s is not None for s in signals.values()) and prev_best:
            key, old, new = self.pending
            e = self.elements[key]
            if total > prev_best["total"] + 1e-9:
                if self.binary:
                    e["resolved"] = new
            elif total < prev_best["total"] - 1e-9:
                if self.binary and old:
                    e["resolved"] = old
            elif self.binary:
                e["bad"].update({c for c in (old, new) if c})
        if total >= 99.5 and not early_end:  # a perfect score means every choice in it is right
            for key, c in choices.items():
                if key in self.elements and (self.binary or not self.elements[key]["resolved"]):
                    self.elements[key]["resolved"] = c
        self.pending = None
        self.history.append({"attempt": attempt, "inputs": inputs, "total": total, "result": result, "signals": signals})
        return notes

    def knowledge(self) -> Dict[str, Any]:
        plan = self.best_plan()["choices"] if self.history else {}
        params, effects = [], []
        for key, e in self.elements.items():
            evidence = [{"attempt": h["attempt"], "value": e["names"].get(h["inputs"]["choices"].get(key), h["inputs"]["choices"].get(key)),
                         "score": h["total"]} for h in self.history if key in h["inputs"].get("choices", {})]
            best = plan.get(key)
            tried = []
            for c, runs in e["tried"].items():
                subs = [s for _, s, _ in runs if s is not None]
                tag = f"{round(max(subs) * 100)}/100" if subs else f"total {max(t for _, _, t in runs)}"
                tried.append(f"{e['names'].get(c, c)!r} ({tag})")
            crit = [e["names"].get(c, c) for c in self.critical.get(key, set())]
            effect = f"Tried: {', '.join(tried)}." if tried else "Not tried."
            if crit:
                effect += " Ends the level immediately: " + ", ".join(repr(c) for c in crit) + "."
            params.append({"variable": self.turn_ids.get(key, key), "label": e["label"], "value": e["names"].get(best, best), "unit": "",
                           "rationale": effect, "evidence": evidence})
            effects.append({"variable": self.turn_ids.get(key, key), "effect": effect, "evidence": evidence})
        return {"learned_parameters": params, "control_effects": effects}


# ---------------------------------------------------------------------------
# Deliver
# ---------------------------------------------------------------------------

class DeliverStrategy:
    POLICIES = [("listed", 1), ("nearest", 1), ("nearest", 2), ("nearest", 3), ("listed", 2)]

    def __init__(self):
        self.mechanic = "deliver"
        self.orders: Dict[str, Dict[str, Any]] = {}
        self.history: List[Dict[str, Any]] = []
        self.capacity_seen = 1
        self.dest_exclude: Dict[str, List[str]] = {}

    def register(self, obs: Dict[str, Any]) -> None:
        ms = obs.get("mechanic_state") or {}
        for o in ms.get("orders") or []:
            self.orders.setdefault(o["id"], {"label": o.get("label", o["id"]), "to_label": o.get("to_label", "")})
        self.capacity_seen = max(self.capacity_seen, len(ms.get("carrying") or []))

    def labels(self) -> Dict[str, str]:
        return {k: f"{o['label']} -> {o['to_label']}" for k, o in self.orders.items()}

    def best_attempt(self) -> Optional[Dict[str, Any]]:
        return max(self.history, key=lambda h: (h["total"], -h["attempt"]), default=None)

    def best_plan(self) -> Dict[str, Any]:
        ba = self.best_attempt()
        plan = dict(ba["inputs"]) if ba else {"policy": "listed", "batch": 1}
        plan["avoid"] = {k: list(v) for k, v in self.dest_exclude.items()}
        return plan

    def suggest(self, attempt: int, total_attempts: int) -> Tuple[Dict[str, Any], str]:
        best = self.best_attempt()
        if best and (attempt >= total_attempts or best["total"] >= 99.5):
            return self.best_plan(), "Exploit: replay the fastest correct delivery plan."
        tried = {(h["inputs"].get("policy"), h["inputs"].get("batch")) for h in self.history}
        for policy, batch in self.POLICIES:
            if batch > 1 and self.history and self.capacity_seen < batch and any(h["inputs"].get("batch", 1) >= batch - 1 for h in self.history if h["inputs"].get("batch", 1) > 1):
                continue
            if (policy, batch) not in tried:
                return ({"policy": policy, "batch": batch, "avoid": {k: list(v) for k, v in self.dest_exclude.items()}},
                        f"Try the '{policy}' route carrying up to {batch} order(s) at a time.")
        if best and best["inputs"].get("sequence") and len(best["inputs"]["sequence"]) > 1:
            seq = list(best["inputs"]["sequence"])
            seen = [h["inputs"].get("sequence") for h in self.history]
            for i in range(len(seq) - 1):
                cand = seq[:i] + [seq[i + 1], seq[i]] + seq[i + 2:]
                if cand not in seen:
                    return ({"policy": "sequence", "sequence": cand, "batch": best["inputs"].get("batch", 1),
                             "avoid": {k: list(v) for k, v in self.dest_exclude.items()}},
                            f"Swap delivery {i + 1} and {i + 2} of the best route to see if it is faster.")
        return self.best_plan(), "Exploit: replay the best delivery plan."

    def coerce_plan(self, raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        policy = raw.get("policy")
        if policy not in ("listed", "nearest", "sequence"):
            return None
        try:
            batch = max(1, int(raw.get("batch", 1)))
        except (TypeError, ValueError):
            batch = 1
        plan = {"policy": policy, "batch": batch, "avoid": {k: list(v) for k, v in self.dest_exclude.items()}}
        if policy == "sequence":
            seq = raw.get("sequence")
            if not isinstance(seq, list) or sorted(seq) != sorted(self.orders):
                return None
            plan["sequence"] = seq
        return plan

    def record(self, attempt: int, inputs: Dict[str, Any], result: Dict[str, Any], statuses: Dict[str, str] = None,
               used_dest: Dict[str, str] = None, t_ms: float = 0) -> Dict[str, Any]:
        total = float(result.get("score") or 0.0)
        wrong = [oid for oid, st in (statuses or {}).items() if st == "wrong"]
        for oid in wrong:
            if used_dest and used_dest.get(oid):
                self.dest_exclude.setdefault(oid, [])
                if used_dest[oid] not in self.dest_exclude[oid]:
                    self.dest_exclude[oid].append(used_dest[oid])
        self.history.append({"attempt": attempt, "inputs": inputs, "total": total, "result": result, "t_ms": t_ms,
                             "statuses": statuses or {}})
        return {"wrong": wrong}

    def knowledge(self) -> Dict[str, Any]:
        best = self.best_attempt()
        evidence = [{"attempt": h["attempt"], "value": f"{h['inputs'].get('policy')} x{h['inputs'].get('batch', 1)}", "score": h["total"]}
                    for h in self.history]
        timings = ", ".join(f"{h['inputs'].get('policy')} x{h['inputs'].get('batch', 1)}: {round(h['t_ms'] / 1000, 1)} s -> {h['total']}"
                            for h in self.history)
        params = []
        if best:
            params.append({"variable": "route", "label": "Route policy", "value": best["inputs"].get("sequence") or best["inputs"].get("policy"),
                           "unit": "", "rationale": f"Best score {best['total']} in {round(best['t_ms'] / 1000, 1)} s.", "evidence": evidence})
            params.append({"variable": "batch", "label": "Orders carried per trip", "value": best["inputs"].get("batch", 1),
                           "unit": "orders", "rationale": f"Capacity observed: {self.capacity_seen}.", "evidence": evidence})
        effects = [{"variable": "route", "effect": f"Time and score per plan: {timings}." if timings else "Not tried.", "evidence": evidence}]
        for oid, bad in self.dest_exclude.items():
            effects.append({"variable": oid, "effect": f"'{self.orders.get(oid, {}).get('label', oid)}' is not accepted at: {', '.join(bad)}.",
                            "evidence": []})
        return {"learned_parameters": params, "control_effects": effects}


def make_strategy(mechanic: str):
    if mechanic in ("mix", "timing"):
        return NumericStrategy(mechanic)
    if mechanic in ("sort", "converse"):
        return ChoiceStrategy(mechanic)
    if mechanic == "deliver":
        return DeliverStrategy()
    raise ValueError(f"unknown mechanic {mechanic}")
