"""
Deterministic scoring for world v2 levels (shared/actions.json scoring_spec).

Python mirror of frontend/src/game/scoring.ts. The builder uses it to check that a
generated level is winnable and that its starting values are not already optimal.
No randomness: the same inputs always give the same score.
"""

import math
import re
from typing import Any, Dict, List, Optional, Tuple

_NUM = re.compile(r"\d+(\.\d+)?|\.\d+")
_ID = re.compile(r"[a-z][a-z0-9_]*")


class ExprError(ValueError):
    pass


def _tokenize(src: str) -> List[Tuple[str, Any]]:
    out: List[Tuple[str, Any]] = []
    i = 0
    while i < len(src):
        c = src[i]
        if c == " ":
            i += 1
        elif c in "+-*/()":
            out.append(("op", c))
            i += 1
        elif c.isdigit() or c == ".":
            m = _NUM.match(src, i)
            if not m:
                raise ExprError(f"bad number at {i} in {src!r}")
            out.append(("num", float(m.group(0))))
            i = m.end()
        elif "a" <= c <= "z":
            m = _ID.match(src, i)
            out.append(("id", m.group(0)))
            i = m.end()
        else:
            raise ExprError(f"unexpected {c!r} in {src!r}")
    return out


def parse_expr(src: str, var_ids: Optional[set] = None) -> Any:
    """Parses the expr grammar into a nested tuple AST; raises ExprError."""
    toks = _tokenize(src)
    pos = 0

    def peek_op(v: str) -> bool:
        return pos < len(toks) and toks[pos] == ("op", v)

    def factor():
        nonlocal pos
        if pos >= len(toks):
            raise ExprError(f"unexpected end of {src!r}")
        kind, val = toks[pos]
        pos += 1
        if kind == "num":
            return ("num", val)
        if kind == "id":
            if var_ids is not None and val not in var_ids:
                raise ExprError(f"unknown variable {val!r} in {src!r}")
            return ("var", val)
        if val == "-":
            return ("neg", factor())
        if val == "(":
            e = expr()
            if not peek_op(")"):
                raise ExprError(f"missing ) in {src!r}")
            pos += 1
            return e
        raise ExprError(f"unexpected {val!r} in {src!r}")

    def term():
        nonlocal pos
        a = factor()
        while peek_op("*") or peek_op("/"):
            op = toks[pos][1]
            pos += 1
            a = ("bin", op, a, factor())
        return a

    def expr():
        nonlocal pos
        a = term()
        while peek_op("+") or peek_op("-"):
            op = toks[pos][1]
            pos += 1
            a = ("bin", op, a, term())
        return a

    tree = expr()
    if pos != len(toks):
        raise ExprError(f"trailing input in {src!r}")
    return tree


def eval_expr(tree: Any, values: Dict[str, float]) -> Optional[float]:
    """Returns None on division by zero or a non-finite result."""
    kind = tree[0]
    if kind == "num":
        return tree[1]
    if kind == "var":
        v = values.get(tree[1])
        return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else None
    if kind == "neg":
        v = eval_expr(tree[1], values)
        return None if v is None else -v
    _, op, a_t, b_t = tree
    a = eval_expr(a_t, values)
    b = eval_expr(b_t, values)
    if a is None or b is None:
        return None
    if op == "/" and b == 0:
        return None
    r = a + b if op == "+" else a - b if op == "-" else a * b if op == "*" else a / b
    return r if math.isfinite(r) else None


def expr_vars(src: str) -> set:
    return set(_ID.findall(src))


def round1(x: float) -> float:
    return math.floor(x * 10 + 0.5) / 10


def round0(x: float) -> int:
    return int(math.floor(x + 0.5))


def deviation(term: Dict[str, Any], value: float) -> float:
    if "range" in term:
        lo, hi = term["range"]
        return lo - value if value < lo else value - hi if value > hi else 0.0
    return abs(value - term["target"])


def curve_score(term: Dict[str, Any], d: float) -> float:
    tol = term["tolerance"]
    if term["curve"] == "linear":
        return max(0.0, 1 - d / (2 * tol))
    if term["curve"] == "step":
        return 1.0 if d <= tol else 0.0
    return math.exp(-0.5 * (d / tol) ** 2)


def term_score(term: Dict[str, Any], value: Optional[float]) -> float:
    return 0.0 if value is None else curve_score(term, deviation(term, value))


def _is_low(term: Dict[str, Any], value: Optional[float]) -> bool:
    if value is None:
        return True
    return value < term["range"][0] if "range" in term else value < term["target"]


def _finish(scored: List[Dict[str, Any]], pass_threshold: float, success: str, cap: Optional[float] = None) -> Dict[str, Any]:
    wsum = sum(t["weight"] for t in scored)
    score = round1(100 * sum(t["weight"] * t["s"] for t in scored) / wsum) if wsum > 0 else 0.0
    if cap is not None:
        score = min(score, cap)
    ranked = sorted(
        [(i, t) for i, t in enumerate(scored) if t["s"] < 0.8 and t["message"]],
        key=lambda it: (-(it[1]["weight"] * (1 - it[1]["s"])), it[0]),
    )
    feedback = [t["message"] for _, t in ranked[:3]]
    return {
        "score": score,
        "passed": score >= pass_threshold,
        "feedback": feedback or [success],
        "breakdown": {t["id"]: {"label": t["label"], "score": round0(100 * t["s"])} for t in scored},
    }


def score_numeric(scoring: Dict[str, Any], values: Dict[str, Optional[float]], labels: Dict[str, str], success: str,
                  added_order: Optional[List[str]] = None) -> Dict[str, Any]:
    scored = []
    known = {k: v for k, v in values.items() if isinstance(v, (int, float))}
    for vid, term in scoring.get("variables", {}).items():
        v = values.get(vid)
        v = v if isinstance(v, (int, float)) else None
        scored.append({"id": vid, "label": labels.get(vid, vid), "weight": term["weight"], "s": term_score(term, v),
                       "message": term["feedback"]["too_low" if _is_low(term, v) else "too_high"]})
    for term in scoring.get("derived", []):
        try:
            v = eval_expr(parse_expr(term["expr"]), known)
        except ExprError:
            v = None
        scored.append({"id": term["id"], "label": term["label"], "weight": term["weight"], "s": term_score(term, v),
                       "message": term["feedback"]["too_low" if _is_low(term, v) else "too_high"]})
    order = scoring.get("order")
    if order and added_order is not None:
        scored.append({"id": "order", "label": "Order", "weight": order["weight"],
                       "s": 1.0 if list(added_order) == list(order["expected"]) else 0.0, "message": order["feedback"]})
    return _finish(scored, scoring["pass_threshold"], success)


def _success(level: Dict[str, Any]) -> str:
    return level.get("success_line") or "Well done!"


def score_mix(level: Dict[str, Any], values: Dict[str, float], added_order: Optional[List[str]] = None) -> Dict[str, Any]:
    params = level["params"]
    labels = {v["id"]: v["label"] for v in params["variables"]}
    order = (added_order or []) if params.get("ingredients") else None
    return score_numeric(level["scoring"], values, labels, _success(level), order)


def score_timing(level: Dict[str, Any], results: Dict[str, Optional[float]]) -> Dict[str, Any]:
    phases = level["params"]["phases"]
    labels = {p["id"]: p["label"] for p in phases}
    return score_numeric(level["scoring"], {p["id"]: results.get(p["id"]) for p in phases}, labels, _success(level))


def score_sort(level: Dict[str, Any], placed: Dict[str, str]) -> Dict[str, Any]:
    scoring = level["scoring"]
    weights = scoring.get("weights", {})
    fb = scoring.get("feedback", {})
    scored = []
    for it in level["params"]["items"]:
        w = weights.get(it["id"])
        got = placed.get(it["id"])
        scored.append({
            "id": it["id"], "label": it["label"],
            "weight": w if isinstance(w, (int, float)) and w > 0 else 1,
            "s": 1.0 if got is not None and got == scoring["correct"].get(it["id"]) else 0.0,
            "message": f"{it['label']} was never put away." if got is None else fb.get(it["id"]) or f"{it['label']} ended up in the wrong place.",
        })
    return _finish(scored, scoring["pass_threshold"], _success(level))


def score_deliver(level: Dict[str, Any], statuses: Dict[str, str], t_ms: float) -> Dict[str, Any]:
    params, scoring = level["params"], level["scoring"]
    orders = params["orders"]
    par = float(params["par_ms"])
    limit = level.get("time_limit_ms") or par * 2
    weights = scoring.get("weights", {})
    fb = scoring.get("feedback", {})

    def ow(o):
        w = weights.get(o["id"])
        return w if isinstance(w, (int, float)) and w > 0 else 1

    wsum = sum(ow(o) for o in orders)
    accuracy = sum(ow(o) for o in orders if statuses.get(o["id"]) == "delivered") / wsum if wsum else 0.0
    time = 1.0 if t_ms <= par else max(0.0, 1 - (t_ms - par) / (limit - par)) if limit > par else 0.0
    wa, wt = weights.get("accuracy", 1), weights.get("time", 1)
    score = round1(100 * (wa * accuracy + wt * time) / (wa + wt))
    feedback = []
    if any(statuses.get(o["id"]) == "wrong" for o in orders):
        feedback.append(fb.get("wrong_target") or "Something went to the wrong place.")
    if any(statuses.get(o["id"], "waiting") in ("waiting", "carrying") for o in orders):
        feedback.append(fb.get("missed") or "Not every order arrived.")
    if t_ms > par:
        feedback.append(fb.get("late") or "That took a while.")
    return {
        "score": score,
        "passed": score >= scoring["pass_threshold"],
        "feedback": feedback[:3] or [_success(level)],
        "breakdown": {"accuracy": {"label": "Right place", "score": round0(100 * accuracy)},
                      "time": {"label": "Speed", "score": round0(100 * time)}},
    }


def score_converse(level: Dict[str, Any], chosen: Dict[str, str], ended: str = "complete") -> Dict[str, Any]:
    scoring = level["scoring"]
    turns = level["params"]["turns"]
    considered = [t for t in turns if t["id"] in chosen] if ended == "critical" else turns
    scored = []
    for i, t in enumerate(considered):
        opt = scoring["turns"].get(t["id"], {}).get(chosen[t["id"]]) if t["id"] in chosen else None
        scored.append({"id": t["id"], "label": f"Reply {i + 1}", "weight": 1,
                       "s": max(0.0, min(1.0, opt["points"])) if opt else 0.0,
                       "message": opt["feedback"] if opt else "You left them waiting for an answer."})
    cap = scoring["pass_threshold"] - 1 if ended == "critical" else None
    res = _finish(scored, scoring["pass_threshold"], _success(level), cap)
    if ended == "critical":
        res["passed"] = False
    return res
