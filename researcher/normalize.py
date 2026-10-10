"""
Draft models the researcher asks Gemini to fill, plus validation and
deterministic repair into the contract's ResearchTask (shared/game_contract.md
section i, C1). Sources are referenced by number ([n] from the grounded report)
and mapped back to the cited URLs here, so no URL is ever invented.
"""

import math
import re
import unicodedata
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

from shared.schemas.research import (
    DeliveryOrder,
    DerivedTerm,
    DialogueTurn,
    HeuristicTerm,
    MechanicId,
    ResearchTask,
    SortItem,
    TaskVariable,
)

VAR_ID = re.compile(r"^[a-z][a-z0-9_]*$")
TASK_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
EXPR_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?|\.\d+)|([a-z][a-z0-9_]*)|(.))")
NUMBER = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])")
NUMERIC = ("mix", "timing")
VARIABLE_LIMITS = {"mix": (1, 6), "timing": (1, 3)}
TASK_ID_MAX = 24
GRID_REACH = 0.9  # a control's best slider position must score at least this on its own term


# ---------------------------------------------------------------------------
# Draft models (what Gemini fills)
# ---------------------------------------------------------------------------

class PlannedTask(BaseModel):
    id: str = Field(..., description="Short kebab-case task slug")
    title: str = Field(..., description="Short task title")
    summary: str = Field(..., description="What the worker does in this task")
    mechanic: MechanicId = Field(..., description="The one platform mechanic that models this task")
    why_chosen: str = Field(..., description="Why this task is central to the job, from the research")
    mechanic_rationale: str = Field(..., description="Why this mechanic models the task")
    research_focus: str = Field(..., description="Which quantities or choices decide quality and what to look up")
    source_ids: List[int] = Field(..., description="[n] numbers of the sources supporting this choice")


class ResearchPlan(BaseModel):
    title: str = Field(..., description="Cozy world title for a game about this job")
    setting: str = Field(..., description="The real workplace of the job (indoors when the work is done indoors) and the places in it where the job happens")
    rules: List[str] = Field(..., description="Core domain rules of the job")
    assumptions: List[str] = Field(..., description="Assumptions you made about the job and its context")
    tasks: List[PlannedTask] = Field(..., description="5 distinct tasks in priority order")


class DraftOptimum(BaseModel):
    term: str = Field(..., description="Variable id or derived term id")
    target: Optional[float] = Field(None, description="Researched optimal value (or use range)")
    range: Optional[List[float]] = Field(None, description="Researched optimal [lo, hi] (or use target)")
    rationale: str = Field(..., description="Why this is optimal")
    source_ids: List[int] = Field(..., description="[n] numbers of the supporting sources")


class TaskDraft(BaseModel):
    aim: str = Field(..., description="What to achieve, without revealing optimal values or answers")
    variables: List[TaskVariable] = Field(..., description="mix: 1-6 inputs; timing: 1-3, one per phase; else empty")
    derived: List[DerivedTerm] = Field(..., description="Relations between variables, e.g. ratios; else empty")
    optima: List[DraftOptimum] = Field(..., description="Researched optimum per variable or derived term")
    heuristic: List[HeuristicTerm] = Field(..., description="One per optimum term: how deviation lowers quality")
    sort_items: List[SortItem] = Field(..., description="sort only, else empty")
    sort_bins: List[str] = Field(..., description="sort only, else empty")
    orders: List[DeliveryOrder] = Field(..., description="deliver only, else empty")
    dialogue: List[DialogueTurn] = Field(..., description="converse only, else empty")
    caveats: List[str] = Field(..., description="Caveats a practitioner must know")
    problems: List[str] = Field(..., description="Problems that commonly appear and how they show up")
    source_ids: List[int] = Field(..., description="[n] numbers of all sources used for this task")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(text: str, fallback: str = "task", max_len: int = 40) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    if len(slug) > max_len:
        cut = slug[: max_len + 1].rfind("-")
        slug = slug[: cut if cut > 0 else max_len].strip("-")
    return slug or fallback


def parse_expr(expr: str) -> Optional[Any]:
    """Parse a scoring expression exactly per actions.json expr_grammar (so ids like `yield` or `in` are fine).

    Returns a tuple tree ("num", x) | ("var", id) | ("neg", node) | (op, left, right), or None if invalid.
    """
    tokens: List[Tuple[str, Any]] = []
    for num, ident, other in EXPR_TOKEN.findall(expr or ""):
        if num:
            tokens.append(("num", float(num)))
        elif ident:
            tokens.append(("var", ident))
        elif other.strip():
            if other not in "+-*/()":
                return None
            tokens.append(("op", other))
    pos = 0

    def peek() -> Optional[Tuple[str, Any]]:
        return tokens[pos] if pos < len(tokens) else None

    def factor() -> Any:
        nonlocal pos
        tok = peek()
        if tok is None:
            raise ValueError("unexpected end")
        pos += 1
        if tok[0] in ("num", "var"):
            return tok
        if tok == ("op", "-"):
            return ("neg", factor())
        if tok == ("op", "("):
            node = sum_()
            if peek() != ("op", ")"):
                raise ValueError("missing )")
            pos += 1
            return node
        raise ValueError(f"unexpected {tok[1]}")

    def product() -> Any:
        nonlocal pos
        node = factor()
        while peek() in (("op", "*"), ("op", "/")):
            op = tokens[pos][1]
            pos += 1
            node = (op, node, factor())
        return node

    def sum_() -> Any:
        nonlocal pos
        node = product()
        while peek() in (("op", "+"), ("op", "-")):
            op = tokens[pos][1]
            pos += 1
            node = (op, node, product())
        return node

    if not tokens:
        return None
    try:
        tree = sum_()
    except ValueError:
        return None
    return tree if pos == len(tokens) else None


def _names(node: Any) -> Set[str]:
    if node[0] == "num":
        return set()
    if node[0] == "var":
        return {node[1]}
    if node[0] == "neg":
        return _names(node[1])
    return _names(node[1]) | _names(node[2])


def expr_identifiers(expr: str) -> Optional[Set[str]]:
    """Identifiers of a valid scoring expression (actions.json expr_grammar), or None if invalid."""
    tree = parse_expr(expr)
    return None if tree is None else _names(tree)


def _snap(value: float, lo: float, step: float) -> float:
    snapped = lo + round((value - lo) / step) * step
    return round(snapped, 6)


def _bounds(opt: Dict[str, Any]) -> List[float]:
    return list(opt["range"]) if opt.get("range") is not None else [opt["target"]]


def _leaks(text: str, values: List[float]) -> bool:
    for token in NUMBER.findall(text or ""):
        if any(math.isclose(float(token), v, rel_tol=1e-9, abs_tol=1e-9) for v in values):
            return True
    return False


def _optimum_values(draft: Dict[str, Any]) -> List[float]:
    values: List[float] = []
    for opt in draft.get("optima", []):
        if opt.get("range") is not None or opt.get("target") is not None:
            values.extend(_bounds(opt))
    return values


def evaluate(expr: str, values: Dict[str, float]) -> Optional[float]:
    """Value of a valid scoring expression, or None (invalid, unknown id, division by zero)."""
    tree = parse_expr(expr)
    if tree is None or not _names(tree) <= set(values):
        return None

    def ev(node: Any) -> float:
        kind = node[0]
        if kind == "num":
            return node[1]
        if kind == "var":
            return float(values[node[1]])
        if kind == "neg":
            return -ev(node[1])
        left, right = ev(node[1]), ev(node[2])
        if kind == "+":
            return left + right
        if kind == "-":
            return left - right
        if kind == "*":
            return left * right
        return left / right

    try:
        return ev(tree)
    except ZeroDivisionError:
        return None


def _derived_mismatches(draft: Dict[str, Any]) -> Dict[str, float]:
    """Derived terms whose optimum disagrees with the value implied by the variable optima: {term: implied value}."""
    centers = {o["term"]: sum(_bounds(o)) / len(_bounds(o)) for o in draft.get("optima", [])
               if (o.get("range") is None) != (o.get("target") is None) and _bounds(o)}
    tolerance = {h["term"]: h["tolerance"] for h in draft.get("heuristic", [])}
    mismatches = {}
    for d in draft.get("derived", []):
        opt = next((o for o in draft.get("optima", []) if o["term"] == d["id"] and d["id"] in centers), None)
        implied = evaluate(d["expr"], centers) if opt else None
        if implied is None:
            continue
        lo, hi = min(_bounds(opt)), max(_bounds(opt))
        gap = max(lo - implied, implied - hi, 0.0)
        if gap > tolerance.get(d["id"], abs(centers[d["id"]]) * 0.1 or 1e-9):
            mismatches[d["id"]] = implied
    return mismatches


def _curve_score(d: float, tolerance: float, curve: str) -> float:
    """actions.json scoring_spec.numeric_term curves."""
    if curve == "gaussian":
        return math.exp(-0.5 * (d / tolerance) ** 2)
    if curve == "linear":
        return max(0.0, 1 - d / (2 * tolerance))
    return 1.0 if d <= tolerance else 0.0


def _best_grid_score(v: Dict[str, Any], opt: Dict[str, Any], h: Dict[str, Any]) -> float:
    """Best sub-score a control can reach for its own term on its slider grid (min + k*step)."""
    if not (v["step"] > 0 and v["max"] > v["min"] and h["tolerance"] > 0):
        return 0.0
    lo, hi = min(_bounds(opt)), max(_bounds(opt))
    best = 0.0
    for goal in {lo, hi, (lo + hi) / 2}:
        k = round((goal - v["min"]) / v["step"])
        for kk in (k - 1, k, k + 1):
            x = v["min"] + kk * v["step"]
            if v["min"] - 1e-9 <= x <= v["max"] + 1e-9:
                best = max(best, _curve_score(max(lo - x, x - hi, 0.0), h["tolerance"], h["curve"]))
    return best


def _nice_step(limit: float) -> float:
    """Largest 1/2/2.5/5 x 10^k step that is <= limit."""
    exp = math.floor(math.log10(limit))
    step = next(mult * 10 ** exp for mult in (5, 2.5, 2, 1) if mult * 10 ** exp <= limit)
    return round(step, 6) or limit


# ---------------------------------------------------------------------------
# Validation (issues are fed back to Gemini for one repair round)
# ---------------------------------------------------------------------------

def validate_draft(draft: Dict[str, Any], mechanic: str, n_sources: int) -> List[str]:
    issues: List[str] = []
    variables = draft.get("variables", [])
    var_ids = [v["id"] for v in variables]
    if mechanic in NUMERIC:
        lo_n, hi_n = VARIABLE_LIMITS[mechanic]
        if not lo_n <= len(variables) <= hi_n:
            issues.append(f"{mechanic} needs {lo_n}-{hi_n} variables, got {len(variables)}")
    elif variables:
        issues.append(f"{mechanic} tasks must have no variables")
    if len(set(var_ids)) != len(var_ids):
        issues.append("variable ids must be unique")
    for v in variables:
        if not VAR_ID.match(v["id"]):
            issues.append(f"variable id '{v['id']}' must match [a-z][a-z0-9_]*")
        if not v["min"] < v["max"]:
            issues.append(f"variable {v['id']}: min must be < max")
        elif not 0 < v["step"] <= v["max"] - v["min"]:
            issues.append(f"variable {v['id']}: step must be > 0 and <= max - min")
        if not v["min"] <= v["default"] <= v["max"]:
            issues.append(f"variable {v['id']}: default must be inside [min, max]")
    derived_ids = []
    for d in draft.get("derived", []):
        names = expr_identifiers(d["expr"])
        if not VAR_ID.match(d["id"]) or d["id"] in var_ids:
            issues.append(f"derived id '{d['id']}' must be snake_case and differ from variable ids")
        if names is None:
            issues.append(f"derived {d['id']}: expr '{d['expr']}' may only use variable ids, numbers, + - * / ( )")
        elif not names <= set(var_ids):
            issues.append(f"derived {d['id']}: expr uses unknown ids {sorted(names - set(var_ids))}")
        derived_ids.append(d["id"])
    terms = set(var_ids) | set(derived_ids)
    by_id = {v["id"]: v for v in variables}
    optimum_terms = set()
    optima_by_term: Dict[str, Dict[str, Any]] = {}
    for opt in draft.get("optima", []):
        term = opt["term"]
        if term not in terms:
            issues.append(f"optimum term '{term}' is not a variable or derived id")
            continue
        has_range = opt.get("range") is not None
        if has_range == (opt.get("target") is not None):
            issues.append(f"optimum {term}: give exactly one of target or range")
            continue
        if has_range and not (len(opt["range"]) == 2 and opt["range"][0] < opt["range"][1]):
            issues.append(f"optimum {term}: range must be [lo, hi] with lo < hi")
            continue
        if term in by_id:
            v = by_id[term]
            if any(not v["min"] <= b <= v["max"] for b in _bounds(opt)):
                issues.append(f"optimum {term} lies outside the variable's [min, max]; widen min/max or fix the optimum")
        if not any(1 <= n <= n_sources for n in opt.get("source_ids") or []):
            issues.append(f"optimum {term}: source_ids must cite the numbered sources that support this value")
        optimum_terms.add(term)
        optima_by_term[term] = opt
    for term, implied in _derived_mismatches(draft).items():
        issues.append(f"optimum {term} disagrees with the variable optima, which imply about {implied:.4g}; make them consistent")
    covered: Set[str] = set()
    for h in draft.get("heuristic", []):
        if h["term"] not in optimum_terms:
            issues.append(f"heuristic term '{h['term']}' has no optimum")
        if h["tolerance"] <= 0 or h["weight"] <= 0:
            issues.append(f"heuristic {h['term']}: tolerance and weight must be > 0")
        if h["term"] in by_id:
            covered.add(h["term"])
            v, opt = by_id[h["term"]], optima_by_term.get(h["term"])
            if opt and 0 < v["step"] <= v["max"] - v["min"] and h["tolerance"] > 0 and _best_grid_score(v, opt, h) < GRID_REACH:
                issues.append(f"variable {h['term']}: step is too coarse to land near its optimum within the tolerance; use a smaller step")
        else:
            expr = next((d["expr"] for d in draft.get("derived", []) if d["id"] == h["term"]), "")
            covered |= expr_identifiers(expr) or set()
    if mechanic in NUMERIC:
        for vid in var_ids:
            if vid not in covered:
                issues.append(f"variable {vid} affects no heuristic term; add an optimum and heuristic for it or for a derived term using it")
    values = _optimum_values(draft)
    if _leaks(draft.get("aim", ""), values):
        issues.append("aim reveals an optimal value; describe the goal qualitatively")
    for h in draft.get("heuristic", []):
        if _leaks(h["too_low"], values) or _leaks(h["too_high"], values):
            issues.append(f"heuristic {h['term']}: feedback reveals an optimal value; keep it qualitative")
    if mechanic == "sort":
        bins = draft.get("sort_bins", [])
        if not 3 <= len(draft.get("sort_items", [])) <= 12 or not 2 <= len(bins) <= 6:
            issues.append("sort needs 3-12 sort_items and 2-6 sort_bins")
        for item in draft.get("sort_items", []):
            if item["correct_bin"] not in bins:
                issues.append(f"sort item '{item['label']}': correct_bin must be one of sort_bins")
    if mechanic == "deliver" and not 1 <= len(draft.get("orders", [])) <= 5:
        issues.append("deliver needs 1-5 orders")
    if mechanic == "converse":
        turns = draft.get("dialogue", [])
        if not 2 <= len(turns) <= 6:
            issues.append("converse needs 2-6 dialogue turns")
        for i, turn in enumerate(turns, 1):
            if not 2 <= len(turn["options"]) <= 4:
                issues.append(f"dialogue turn {i} needs 2-4 options")
            if any(not 0 <= o["points"] <= 1 for o in turn["options"]):
                issues.append(f"dialogue turn {i}: points must be within 0..1")
            if not any(o["points"] >= 0.8 and not o["critical"] for o in turn["options"]):
                issues.append(f"dialogue turn {i} needs a professionally right response (points >= 0.8, not critical)")
    if not draft.get("caveats") or not draft.get("problems"):
        issues.append("give caveats and problems")
    if not any(1 <= n <= n_sources for n in draft.get("source_ids", [])):
        issues.append("source_ids must cite the numbered sources")
    return issues


# ---------------------------------------------------------------------------
# Deterministic repair + conversion into ResearchTask
# ---------------------------------------------------------------------------

def _fix_variables(draft: Dict[str, Any]) -> None:
    heuristics = {h["term"]: h for h in draft.get("heuristic", []) if h["tolerance"] > 0}
    tolerance = {term: h["tolerance"] for term, h in heuristics.items()}
    optima = {o["term"]: o for o in draft.get("optima", []) if (o.get("range") is None) != (o.get("target") is None)}
    seen: Set[str] = set()
    fixed = []
    for v in draft.get("variables", []):
        v = dict(v)
        if not VAR_ID.match(v["id"]) or v["id"] in seen:
            continue
        seen.add(v["id"])
        if v["min"] > v["max"]:
            v["min"], v["max"] = v["max"], v["min"]
        opt = optima.get(v["id"])
        widened = False
        if opt:
            bounds = _bounds(opt)
            span = max(v["max"] - v["min"], max(abs(b) for b in bounds) * 0.5, 1e-6)
            if min(bounds) < v["min"]:
                low = min(bounds) - span * 0.25
                v["min"], widened = (max(low, 0.0) if v["min"] >= 0 and min(bounds) >= 0 else low), True
            if max(bounds) > v["max"]:
                v["max"], widened = max(bounds) + span * 0.25, True
        if v["max"] <= v["min"]:
            v["max"] = v["min"] + max(abs(v["min"]), 1.0)
        width = v["max"] - v["min"]
        if not 0 < v["step"] <= width:
            v["step"] = width / 20
        term = heuristics.get(v["id"])
        if opt and term and _best_grid_score(v, opt, term) < GRID_REACH:
            # Too coarse to land near the optimum: the finest curve (linear) needs step/2 within 0.2 x tolerance.
            v["step"], widened = _nice_step(min(0.4 * term["tolerance"], width)), True
        if widened:  # keep widened bounds on the step grid
            v["min"] = math.floor(v["min"] / v["step"] + 1e-9) * v["step"]
            v["max"] = math.ceil(v["max"] / v["step"] - 1e-9) * v["step"]
        v["min"], v["max"], v["step"] = round(v["min"], 6), round(v["max"], 6), round(v["step"], 6)
        v["default"] = min(max(_snap(v["default"], v["min"], v["step"]), v["min"]), v["max"])
        if opt:
            bounds = _bounds(opt)
            lo, hi = min(bounds), max(bounds)
            tol = tolerance.get(v["id"], (v["max"] - v["min"]) * 0.1)
            if lo - tol <= v["default"] <= hi + tol:
                candidates = [_snap(v["min"] + 0.15 * (v["max"] - v["min"]), v["min"], v["step"]),
                              _snap(v["max"] - 0.15 * (v["max"] - v["min"]), v["min"], v["step"])]
                v["default"] = max(candidates, key=lambda c: min(abs(c - lo), abs(c - hi)))
        fixed.append(v)
    draft["variables"] = fixed


def _strip_leaks(text: str, values: List[float]) -> str:
    def repl(match: re.Match) -> str:
        return "" if any(math.isclose(float(match.group(0)), v, abs_tol=1e-9) for v in values) else match.group(0)
    return re.sub(r"\s{2,}", " ", NUMBER.sub(repl, text)).strip()


def _clean_optimum(opt: Dict[str, Any]) -> Dict[str, Any]:
    """Prefer a proper [lo, hi] range, turn a degenerate range into a target."""
    opt = dict(opt)
    rng = opt.get("range")
    if rng is not None:
        if len(rng) == 2 and rng[0] != rng[1]:
            opt["range"], opt["target"] = sorted(rng), None
        elif rng and opt.get("target") is None:
            opt["range"], opt["target"] = None, rng[0]
        else:
            opt["range"] = None
    return opt


def _prune_terms(draft: Dict[str, Any]) -> None:
    """Keep only derived terms, optima and heuristic terms that refer to existing variables/terms."""
    var_ids = {v["id"] for v in draft["variables"]}
    draft["derived"] = [d for d in draft.get("derived", [])
                        if VAR_ID.match(d["id"]) and d["id"] not in var_ids
                        and (expr_identifiers(d["expr"]) or {"?"}) <= var_ids]
    terms = var_ids | {d["id"] for d in draft["derived"]}
    draft["optima"] = [o for o in draft.get("optima", []) if o["term"] in terms
                       and (o.get("range") is None) != (o.get("target") is None)
                       and (o.get("range") is None or (len(o["range"]) == 2 and o["range"][0] < o["range"][1]))]
    optimum_terms = {o["term"] for o in draft["optima"]}
    draft["heuristic"] = [h for h in draft.get("heuristic", []) if h["term"] in optimum_terms and h["tolerance"] > 0 and h["weight"] > 0]


def repair_draft(draft: Dict[str, Any], mechanic: str) -> Dict[str, Any]:
    """Fix what can be fixed deterministically; drop what cannot."""
    draft = {**draft, "optima": [_clean_optimum(o) for o in draft.get("optima", [])]}
    if mechanic not in NUMERIC:
        draft["variables"], draft["derived"], draft["optima"], draft["heuristic"] = [], [], [], []
    else:
        draft["variables"] = draft.get("variables", [])[: VARIABLE_LIMITS[mechanic][1]]
    _fix_variables(draft)
    _prune_terms(draft)
    # A control that no scoring term depends on would only distract: drop it (and anything built on it).
    covered = {h["term"] for h in draft["heuristic"]}
    for d in draft["derived"]:
        if d["id"] in covered:
            covered |= expr_identifiers(d["expr"]) or set()
    if covered & {v["id"] for v in draft["variables"]}:
        draft["variables"] = [v for v in draft["variables"] if v["id"] in covered]
        _prune_terms(draft)
    mismatches = _derived_mismatches(draft)
    for opt in draft["optima"]:  # the variable optima are researched directly; align derived terms to them
        if opt["term"] in mismatches:
            implied = round(mismatches[opt["term"]], 6)
            if opt.get("range") is not None:
                half = (opt["range"][1] - opt["range"][0]) / 2
                opt["range"] = [round(implied - half, 6), round(implied + half, 6)]
            else:
                opt["target"] = implied
    values = _optimum_values(draft)
    draft["aim"] = _strip_leaks(draft.get("aim", ""), values)
    draft["heuristic"] = [{**h, "too_low": _strip_leaks(h["too_low"], values), "too_high": _strip_leaks(h["too_high"], values)}
                          for h in draft["heuristic"]]
    if mechanic == "sort":
        bins = list(dict.fromkeys(draft.get("sort_bins", [])))[:6]
        draft["sort_bins"] = bins
        draft["sort_items"] = [i for i in draft.get("sort_items", []) if i["correct_bin"] in bins][:12]
    else:
        draft["sort_bins"], draft["sort_items"] = [], []
    draft["orders"] = draft.get("orders", [])[:5] if mechanic == "deliver" else []
    if mechanic == "converse":
        turns = []
        for turn in draft.get("dialogue", []):
            options = [{**o, "points": min(max(o["points"], 0.0), 1.0)} for o in turn["options"][:4]]
            if len(options) >= 2:
                turns.append({**turn, "options": options})
        draft["dialogue"] = turns[:6]
    else:
        draft["dialogue"] = []
    return draft


def playable(draft: Dict[str, Any], mechanic: str) -> bool:
    if mechanic in NUMERIC:
        return bool(draft["variables"]) and bool(draft["heuristic"])
    if mechanic == "sort":
        return len(draft["sort_items"]) >= 3 and len(draft["sort_bins"]) >= 2
    if mechanic == "deliver":
        return len(draft["orders"]) >= 1
    return len(draft["dialogue"]) >= 2


def to_research_task(plan_task: Dict[str, Any], draft: Dict[str, Any], sources: List[Dict[str, str]]) -> Dict[str, Any]:
    """Merge the plan entry and the repaired draft into a contract ResearchTask (source numbers -> URLs)."""
    def urls(ids: List[int]) -> List[str]:
        return list(dict.fromkeys(sources[n - 1]["url"] for n in ids if 1 <= n <= len(sources)))

    task_sources = [sources[n - 1] for n in dict.fromkeys(draft.get("source_ids", [])) if 1 <= n <= len(sources)]
    optima = []
    for opt in draft["optima"]:
        entry: Dict[str, Any] = {"term": opt["term"], "rationale": opt["rationale"], "source_urls": urls(opt.get("source_ids", []))}
        if opt.get("range") is not None:
            entry["range"] = [float(opt["range"][0]), float(opt["range"][1])]
        else:
            entry["target"] = float(opt["target"])
        optima.append(entry)
    task = {
        "id": plan_task["id"],
        "title": plan_task["title"],
        "summary": plan_task["summary"],
        "mechanic": plan_task["mechanic"],
        "mechanic_rationale": plan_task["mechanic_rationale"],
        "aim": draft["aim"],
        "variables": draft["variables"],
        "derived": draft["derived"],
        "optima": optima,
        "heuristic": draft["heuristic"],
        "sort_items": draft["sort_items"],
        "sort_bins": draft["sort_bins"],
        "orders": draft["orders"],
        "dialogue": draft["dialogue"],
        "caveats": draft.get("caveats", []),
        "problems": draft.get("problems", []),
        "sources": task_sources,
    }
    return ResearchTask.model_validate(task).model_dump(mode="json", exclude_none=True)


def unique_task_ids(tasks: List[Dict[str, Any]]) -> None:
    seen: Set[str] = set()
    for task in tasks:
        base = slugify(task["id"] if TASK_ID.match(task["id"]) else task["title"], max_len=TASK_ID_MAX)
        tid, n = base, 2
        while tid in seen:
            tid, n = f"{base}-{n}", n + 1
        seen.add(tid)
        task["id"] = tid
