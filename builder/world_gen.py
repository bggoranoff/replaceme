"""
World v2 generation: research.json v2 (ResearchBrief) -> world.json v2.

Turns the researcher's tasks into one cozy top-down village map with 4 quest levels.
Every level uses one of the 5 platform mechanics from shared/actions.json and carries a
declarative, deterministic scoring spec built from the researched variables, optima and
heuristic. Nothing here knows about any particular job.
"""

import hashlib
import math
import random
import re
from collections import deque
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from builder.environments import ENVIRONMENTS, ICON_SIZE, resolve_environment
from builder.scoring import (
    ExprError,
    eval_expr,
    parse_expr,
    score_converse,
    score_mix,
    score_numeric,
    term_score,
)

LEVELS_PER_GAME = 4
MECHANICS = ("mix", "timing", "sort", "deliver", "converse")
COLS, ROWS, TILE = 26, 16, 16
PASS_THRESHOLD = 70
STEP_MS = 100  # one tile per key press (actions.json control_semantics.key_press)
TIME_UNITS = {"s", "sec", "secs", "second", "seconds", "min", "mins", "minute", "minutes", "ms", "h", "hr", "hrs", "hour", "hours"}
LOCATION_KINDS = ("building", "stall", "station", "field", "table")
ICONS = ("house", "shop", "stall", "bench", "pot", "oven", "fire", "shelf", "crate", "counter", "table", "desk",
         "field", "garden", "well", "barrel", "cart", "anvil", "hive", "easel", "chest", "tub")
KIND_SIZE = {"building": (5, 3), "stall": (4, 2), "station": (3, 2), "field": (5, 3), "table": (3, 2)}
MECH_DEFAULT_KIND = {"mix": ("station", "pot"), "timing": ("station", "oven"), "sort": ("stall", "shelf"),
                     "deliver": ("stall", "counter"), "converse": ("stall", "stall")}
CONTROLS_HINT = {
    "mix": "Up/Down pick a setting, Left/Right adjust it, Enter to {submit}. Or drag a slider and click {submit}.",
    "timing_stop": "Press Up or Enter, or click the gauge, to stop the needle.",
    "timing_hold": "Hold Up, or hold the mouse on the gauge, and release to stop.",
    "sort": "Left/Right pick a spot, Down or Enter to place. Or drag the item onto a spot.",
    "deliver": "Arrows to walk. Enter next to the counter picks up, Enter next to a destination hands over. Or click where to go.",
    "converse": "Up/Down choose what to say, Enter to answer. Or click an answer.",
}
METRIC = {
    "mix": ("Quality", "0-100 from how close {terms} are to good practice"),
    "timing": ("Timing", "0-100 from how well you judged {terms}"),
    "sort": ("Accuracy", "0-100 share of items put in the right place"),
    "deliver": ("Service", "0-100 from right deliveries and speed"),
    "converse": ("Rapport", "0-100 average quality of your answers"),
}
MECH_AIM = {
    "mix": "Produce the best result by choosing the right values.",
    "timing": "Stop or release at the right moment for each phase.",
    "sort": "Put every item where it belongs.",
    "deliver": "Deliver every order to the right place quickly.",
    "converse": "Handle the conversation well.",
}


class BuildError(ValueError):
    pass


def slugify(text: str, fallback: str = "x") -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s or fallback


def var_id(text: str) -> str:
    s = re.sub(r"[^a-z0-9_]+", "_", str(text).lower()).strip("_")
    if not s or not s[0].isalpha():
        s = "v_" + s
    return s


def seeded(*parts: str) -> random.Random:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return random.Random(int(digest[:12], 16))


def _num(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _clean_num(x: float) -> float:
    """Trims float noise so JSON stays readable (12.000000001 -> 12)."""
    r = round(x, 6)
    return int(r) if r == int(r) else r


def clip(text: Any, limit: int) -> str:
    """Shortens text at a word boundary."""
    s = " ".join(str(text or "").split())
    if len(s) <= limit:
        return s
    cut = s[: limit + 1].rsplit(" ", 1)[0].rstrip(" ,;:-(")
    return cut if len(cut) >= limit // 2 else s[:limit].rstrip()


def snap(value: float, lo: float, hi: float, step: float) -> float:
    if step <= 0:
        return _clean_num(min(hi, max(lo, value)))
    n = round((value - lo) / step)
    return _clean_num(min(hi, max(lo, lo + n * step)))


# ---------------------------------------------------------------------------
# Secrets: a level's aim, hints and feedback must never state a target
# ---------------------------------------------------------------------------

_NUMBER = re.compile(r"(?<![a-zA-Z_])-?\d+(?:[.,]\d+)?")


def numbers_in(text: str) -> List[float]:
    return [float(m.replace(",", ".")) for m in _NUMBER.findall(text or "")]


def reveals(text: str, secrets: Iterable[float]) -> bool:
    secrets = list(secrets)
    return any(abs(n - s) < 1e-9 for n in numbers_in(text) for s in secrets)


def scoring_secrets(scoring: Dict[str, Any]) -> Set[float]:
    out: Set[float] = set()
    terms = list(scoring.get("variables", {}).values()) + list(scoring.get("derived", []))
    for t in terms:
        if "target" in t:
            out.add(float(t["target"]))
        if "range" in t:
            out.update(float(x) for x in t["range"])
            out.add((float(t["range"][0]) + float(t["range"][1])) / 2)
    return out


# ---------------------------------------------------------------------------
# Task selection
# ---------------------------------------------------------------------------

def _optimum(task: Dict[str, Any], term: str) -> Optional[Dict[str, Any]]:
    for o in task.get("optima") or []:
        if o.get("term") != term:
            continue
        rng = o.get("range")
        if o.get("target") is not None or (isinstance(rng, list) and len(rng) == 2):
            return o
    return None


def _heuristic(task: Dict[str, Any], term: str) -> Optional[Dict[str, Any]]:
    return next((h for h in task.get("heuristic") or [] if h.get("term") == term), None)


def playable_as(task: Dict[str, Any], mech: str) -> bool:
    variables = [v for v in task.get("variables") or [] if _num(v.get("max")) > _num(v.get("min"))]
    if mech in ("mix", "timing"):
        limit = 6 if mech == "mix" else 3
        if not 1 <= len(variables) <= limit:
            return False
        terms = [v.get("id") for v in variables] + [d.get("id") for d in task.get("derived") or []]
        return any(_optimum(task, t) for t in terms if t)
    if mech == "sort":
        bins = {str(b).strip().lower() for b in task.get("sort_bins") or [] if str(b).strip()}
        return len(task.get("sort_items") or []) >= 3 and len(bins) >= 2
    if mech == "deliver":
        return len(task.get("orders") or []) >= 1
    if mech == "converse":
        turns = task.get("dialogue") or []
        return len(turns) >= 2 and all(len(t.get("options") or []) >= 2 for t in turns)
    return False


def select_tasks(tasks: List[Dict[str, Any]]) -> List[Tuple[Dict[str, Any], str]]:
    """Picks exactly 4 distinct playable tasks, preferring different mechanics, in research order."""
    candidates: List[Tuple[Dict[str, Any], str]] = []
    for task in tasks:
        mech = task.get("mechanic")
        if mech in MECHANICS and playable_as(task, mech):
            candidates.append((task, mech))
        elif playable_as(task, "mix"):
            candidates.append((task, "mix"))
    picked: List[Tuple[Dict[str, Any], str]] = []
    seen: Set[str] = set()
    used: Set[str] = set()
    for distinct in (True, False):
        for task, mech in candidates:
            if len(picked) == LEVELS_PER_GAME:
                break
            if task["id"] in seen or (distinct and mech in used):
                continue
            picked.append((task, mech))
            seen.add(task["id"])
            used.add(mech)
    if len(picked) < LEVELS_PER_GAME:
        raise BuildError(f"research has only {len(picked)} playable tasks; {LEVELS_PER_GAME} are needed")
    order = {t["id"]: i for i, t in enumerate(tasks)}
    picked.sort(key=lambda p: order[p[0]["id"]])
    return picked


# ---------------------------------------------------------------------------
# Numeric scoring spec (mix and timing)
# ---------------------------------------------------------------------------

def _generic_feedback(label: str) -> Dict[str, str]:
    name = label.strip().lower() or "that"
    return {"too_low": f"The {name} was too low.", "too_high": f"The {name} was too high."}


def _numeric_term(task: Dict[str, Any], term_id: str, label: str, default_tol: float) -> Optional[Dict[str, Any]]:
    opt = _optimum(task, term_id)
    if not opt:
        return None
    heur = _heuristic(task, term_id) or {}
    term: Dict[str, Any] = {}
    rng = opt.get("range")
    if isinstance(rng, list) and len(rng) == 2:
        lo, hi = sorted((_num(rng[0]), _num(rng[1])))
        term["range"] = [_clean_num(lo), _clean_num(hi)] if hi > lo else None
        if term["range"] is None:
            term.pop("range")
            term["target"] = _clean_num(lo)
    else:
        term["target"] = _clean_num(_num(opt.get("target")))
    tol = _num(heur.get("tolerance"), 0.0)
    term["tolerance"] = _clean_num(tol if tol > 0 else default_tol)
    weight = _num(heur.get("weight"), 1.0)
    term["weight"] = _clean_num(weight if weight > 0 else 1.0)
    term["curve"] = heur.get("curve") if heur.get("curve") in ("gaussian", "linear", "step") else "gaussian"
    fb = _generic_feedback(label)
    term["feedback"] = {
        "too_low": str(heur.get("too_low") or fb["too_low"]).strip(),
        "too_high": str(heur.get("too_high") or fb["too_high"]).strip(),
    }
    return term


def _rewrite_expr(expr: str, rename: Dict[str, str]) -> str:
    return re.sub(r"[A-Za-z_][A-Za-z0-9_]*", lambda m: rename.get(m.group(0), rename.get(m.group(0).lower(), m.group(0).lower())), expr)


def _term_center(term: Dict[str, Any]) -> float:
    return (term["range"][0] + term["range"][1]) / 2 if "range" in term else term["target"]


def _fit_inside(var: Dict[str, Any], term: Dict[str, Any]) -> None:
    """Extends a control's min/max so its researched target lies inside (actions.json: targets inside min/max)."""
    lo_t = term["range"][0] if "range" in term else term["target"]
    hi_t = term["range"][1] if "range" in term else term["target"]
    tol = term["tolerance"]
    if lo_t < var["min"]:
        var["min"] = _clean_num(var["min"] - math.ceil((var["min"] - (lo_t - tol)) / var["step"]) * var["step"])
    if hi_t > var["max"]:
        var["max"] = _clean_num(var["max"] + math.ceil(((hi_t + tol) - var["max"]) / var["step"]) * var["step"])


def build_numeric(task: Dict[str, Any], mech: str, rng: random.Random) -> Tuple[List[Dict[str, Any]], Dict[str, Any], List[str]]:
    """Returns (controls, scoring, notes). controls are mix variables or timing phases."""
    notes: List[str] = []
    limit = 6 if mech == "mix" else 3
    raw_vars = [v for v in task.get("variables") or [] if _num(v.get("max")) > _num(v.get("min"))][:limit]
    rename: Dict[str, str] = {}
    controls: List[Dict[str, Any]] = []
    for v in raw_vars:
        vid = var_id(v.get("id") or v.get("label"))
        while vid in {c["id"] for c in controls}:
            vid += "_2"
        rename[str(v.get("id"))] = vid
        lo, hi = _num(v.get("min")), _num(v.get("max"))
        step = _num(v.get("step"), 0.0)
        if step <= 0 or step > (hi - lo):
            step = _clean_num((hi - lo) / 20)
        controls.append({
            "id": vid, "label": str(v.get("label") or vid).strip(), "unit": str(v.get("unit") or "").strip(),
            "min": _clean_num(lo), "max": _clean_num(hi), "step": _clean_num(step), "default": _num(v.get("default"), lo),
        })
    by_id = {c["id"]: c for c in controls}
    task_r = dict(task)
    task_r["optima"] = [dict(o, term=rename.get(o.get("term"), o.get("term"))) for o in task.get("optima") or []]
    task_r["heuristic"] = [dict(h, term=rename.get(h.get("term"), h.get("term"))) for h in task.get("heuristic") or []]

    variables: Dict[str, Dict[str, Any]] = {}
    for c in controls:
        term = _numeric_term(task_r, c["id"], c["label"], max(c["step"], (c["max"] - c["min"]) / 8))
        if not term:
            continue
        term["tolerance"] = _clean_num(max(term["tolerance"], c["step"]))
        _fit_inside(c, term)
        variables[c["id"]] = term

    derived: List[Dict[str, Any]] = []
    for d in task.get("derived") or []:
        did = var_id(d.get("id") or d.get("label") or "relation")
        if did in by_id or did in {x["id"] for x in derived}:
            did += "_rel"
        expr = _rewrite_expr(str(d.get("expr") or ""), rename)
        try:
            parse_expr(expr, set(by_id))
        except ExprError as exc:
            notes.append(f"dropped derived term {d.get('id')}: {exc}")
            continue
        task_r["optima"] = [dict(o, term=did) if o.get("term") == d.get("id") else o for o in task_r["optima"]]
        task_r["heuristic"] = [dict(h, term=did) if h.get("term") == d.get("id") else h for h in task_r["heuristic"]]
        label = str(d.get("label") or did).strip()
        term = _numeric_term(task_r, did, label, 1.0)
        if not term:
            continue
        derived.append({"id": did, "label": label, "expr": expr, **term})

    if not variables and not derived:
        raise BuildError(f"task {task.get('id')} has no scorable terms")

    # Best reachable point; derived targets that still contradict it would make the level unwinnable: align them.
    best = optimal_point(controls, {"pass_threshold": PASS_THRESHOLD, "variables": variables, "derived": derived}, mech)
    for d in derived:
        value = eval_expr(parse_expr(d["expr"]), best)
        if value is None:
            continue
        if term_score(d, value) < 0.9:
            notes.append(f"aligned derived term {d['id']} target with the variable optima")
            d.pop("range", None)
            d["target"] = _clean_num(round(value, 4))
            d["tolerance"] = _clean_num(max(d["tolerance"], abs(value) * 0.05, 1e-3))

    if mech == "mix":
        for c in controls:
            c["default"] = snap(c["default"], c["min"], c["max"], c["step"])
        _push_defaults_off_optimum(controls, variables, rng)
    else:
        for c in controls:
            c.pop("default", None)
    scoring = {"pass_threshold": PASS_THRESHOLD, "variables": variables}
    if derived:
        scoring["derived"] = derived
    return controls, scoring, notes


def _grid(c: Dict[str, Any], mech: str, limit: int = 400) -> List[float]:
    if mech == "mix" and c["step"] > 0:
        n = int(round((c["max"] - c["min"]) / c["step"]))
        stride = max(1, -(-n // limit))
        return [snap(c["min"] + k * c["step"], c["min"], c["max"], c["step"]) for k in range(0, n + 1, stride)]
    return [c["min"] + (c["max"] - c["min"]) * k / 200 for k in range(201)]


def optimal_point(controls: List[Dict[str, Any]], scoring: Dict[str, Any], mech: str) -> Dict[str, float]:
    """
    Best reachable control values: scored controls start at their researched optimum, the others at
    their defaults, then a few rounds of coordinate search on the control grid also satisfy derived
    terms (e.g. a ratio between two controls). Deterministic.
    """
    variables = scoring.get("variables", {})
    labels = {c["id"]: c["label"] for c in controls}
    point: Dict[str, float] = {}
    for c in controls:
        start = _term_center(variables[c["id"]]) if c["id"] in variables else c.get("default", (c["min"] + c["max"]) / 2)
        point[c["id"]] = snap(start, c["min"], c["max"], c["step"]) if mech == "mix" else min(c["max"], max(c["min"], start))

    def total(pt: Dict[str, float]) -> float:
        return score_numeric(scoring, pt, labels, "")["score"]

    if not scoring.get("derived"):
        return point
    best = total(point)
    # First move only the controls without their own optimum, then everything.
    for group in ([c for c in controls if c["id"] not in variables], controls):
        for _ in range(3):
            improved = False
            for c in group:
                for v in _grid(c, mech):
                    cand = dict(point, **{c["id"]: v})
                    sc = total(cand)
                    if sc > best + 1e-9:
                        best, point, improved = sc, cand, True
            if not improved:
                break
    return point


def _push_defaults_off_optimum(controls: List[Dict[str, Any]], variables: Dict[str, Dict[str, Any]], rng: random.Random) -> None:
    """The starting values must not already be a good answer (research: default should not be optimal)."""
    for c in controls:
        term = variables.get(c["id"])
        if not term or term_score(term, c["default"]) < 0.5:
            continue
        center = _term_center(term)
        room_low, room_high = center - c["min"], c["max"] - center
        direction = -1 if (room_low > room_high if room_low != room_high else rng.random() < 0.5) else 1
        for k in range(1, 400):
            cand = snap(center + direction * k * c["step"], c["min"], c["max"], c["step"])
            if term_score(term, cand) < 0.5 or cand in (c["min"], c["max"]):
                c["default"] = cand
                break


def timing_phases(controls: List[Dict[str, Any]], variables: Dict[str, Dict[str, Any]], rng: random.Random) -> List[Dict[str, Any]]:
    """Gives each timing control a mode and speed so the good zone is passable by hand (>= ~250 ms wide)."""
    phases = []
    for i, c in enumerate(controls):
        term = variables.get(c["id"])
        lo, hi = c["min"], c["max"]
        if term:
            # Needle/fill speed: a +-tolerance band then lasts ~300 ms (stop) or ~0.8 s (hold).
            span_max = 10 * term["tolerance"]
            if hi - lo > span_max:
                center = _term_center(term)
                f = 0.3 + 0.4 * rng.random()
                lo = max(c["min"], center - span_max * f)
                hi = min(c["max"], lo + span_max)
                lo = max(c["min"], min(lo, hi - span_max))
                lo_t = term["range"][0] if "range" in term else term["target"]
                hi_t = term["range"][1] if "range" in term else term["target"]
                if lo_t < lo or hi_t > hi:
                    lo, hi = c["min"], c["max"]
        phase = {"id": c["id"], "label": c["label"], "unit": c["unit"], "min": _clean_num(round(lo, 4)), "max": _clean_num(round(hi, 4))}
        if c["unit"].strip().lower() in TIME_UNITS:
            phase["mode"] = "hold"
            phase["fill_per_s"] = _clean_num(round((hi - lo) / 4, 4))
        else:
            phase["mode"] = "stop"
            phase["period_ms"] = 3000 + 400 * i
        phases.append(phase)
    return phases


# ---------------------------------------------------------------------------
# Map
# ---------------------------------------------------------------------------

class MapBuilder:
    def __init__(self, rng: random.Random, cols: int = COLS, rows: int = ROWS):
        self.rng = rng
        self.cols, self.rows = cols, rows
        self.ground = [["g"] * cols for _ in range(rows)]
        self.solid = [[False] * cols for _ in range(rows)]
        self.reserved = [[False] * cols for _ in range(rows)]
        self.locations: List[Dict[str, Any]] = []
        self.solids: List[Dict[str, int]] = []
        self.npc_tiles: Set[Tuple[int, int]] = set()
        self.required: Set[Tuple[int, int]] = set()

    def interior(self, x: int, y: int) -> bool:
        return 1 <= x < self.cols - 1 and 1 <= y < self.rows - 1

    def rect_free(self, x: int, y: int, w: int, h: int, margin: int = 0) -> bool:
        for yy in range(y - margin, y + h + margin):
            for xx in range(x - margin, x + w + margin):
                if not self.interior(xx, yy) or self.solid[yy][xx] or self.reserved[yy][xx] or (xx, yy) in self.npc_tiles:
                    return False
        return True

    def block(self, x: int, y: int, w: int, h: int) -> None:
        self.solids.append({"x": x, "y": y, "w": w, "h": h})
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < self.cols and 0 <= yy < self.rows:
                    self.solid[yy][xx] = True

    def add(self, loc: Dict[str, Any], solid: bool = True) -> Dict[str, Any]:
        self.locations.append(loc)
        if solid:
            self.block(loc["tile"][0], loc["tile"][1], loc["w"], loc["h"])
        return loc

    def reserve(self, x: int, y: int) -> None:
        self.reserved[y][x] = True

    def walkable(self, x: int, y: int) -> bool:
        return 0 <= x < self.cols and 0 <= y < self.rows and not self.solid[y][x] and (x, y) not in self.npc_tiles

    def bfs(self, start: Tuple[int, int]) -> Dict[Tuple[int, int], Tuple[int, int]]:
        parent = {start: start}
        q = deque([start])
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in parent and self.walkable(*n):
                    parent[n] = (x, y)
                    q.append(n)
        return parent

    def path_to_ground(self, start: Tuple[int, int], code: str) -> List[Tuple[int, int]]:
        """Shortest walkable path from start to the nearest tile whose ground is `code`."""
        parent = {start: start}
        q = deque([start])
        while q:
            cur = q.popleft()
            if self.ground[cur[1]][cur[0]] == code:
                out = [cur]
                while out[-1] != start:
                    out.append(parent[out[-1]])
                return out
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (cur[0] + dx, cur[1] + dy)
                if n not in parent and self.walkable(*n):
                    parent[n] = cur
                    q.append(n)
        return []

    def all_reachable(self, spawn: Tuple[int, int]) -> bool:
        seen = self.bfs(spawn)
        return all(t in seen for t in self.required)

    def adjacent_walkable(self, x: int, y: int, w: int, h: int) -> List[Tuple[int, int]]:
        out = []
        for yy in range(y - 1, y + h + 1):
            for xx in range(x - 1, x + w + 1):
                inside = x <= xx < x + w and y <= yy < y + h
                if not inside and self.walkable(xx, yy):
                    out.append((xx, yy))
        return out

    def ground_rows(self) -> List[str]:
        return ["".join(r) for r in self.ground]


def _distance_map(mb: MapBuilder, start: Tuple[int, int]) -> Dict[Tuple[int, int], int]:
    dist = {start: 0}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in dist and mb.walkable(*n):
                dist[n] = dist[(x, y)] + 1
                q.append(n)
    return dist


def _walk_to(mb: MapBuilder, pos: Tuple[int, int], goals: List[Tuple[int, int]]) -> Tuple[int, Tuple[int, int]]:
    dist = _distance_map(mb, pos)
    reachable = [(dist[g], g) for g in goals if g in dist]
    if not reachable:
        raise BuildError("deliver route is unreachable")
    return min(reachable)


def deliver_route_ms(mb: MapBuilder, start: Tuple[int, int], pickup: Dict[str, Any], dests: Dict[str, Dict[str, Any]],
                     orders: List[Dict[str, Any]], capacity: int) -> int:
    """Shortest-ish full route (greedy per batch) in virtual ms: one tile = one key press = 100 ms."""
    def adj(loc):
        return mb.adjacent_walkable(loc["tile"][0], loc["tile"][1], loc["w"], loc["h"])

    pos, steps = start, 0
    pending = list(orders)
    while pending:
        batch, pending = pending[:capacity], pending[capacity:]
        d, pos = _walk_to(mb, pos, adj(pickup))
        steps += d
        left = list(batch)
        while left:
            best = None
            for o in left:
                d, tile = _walk_to(mb, pos, adj(dests[o["to"]]))
                if best is None or d < best[0]:
                    best = (d, tile, o)
            steps += best[0]
            pos = best[1]
            left.remove(best[2])
    return steps * STEP_MS


# ---------------------------------------------------------------------------
# World assembly
# ---------------------------------------------------------------------------

NPC_COLORS = [
    {"shirt": "#d9734e", "hair": "#5b3a29", "skin": "#f2c9a0"},
    {"shirt": "#5e8fc9", "hair": "#2f2a2a", "skin": "#e8b48a"},
    {"shirt": "#8cbf5a", "hair": "#c9873e", "skin": "#f6d3b0"},
    {"shirt": "#b56fc2", "hair": "#e3d9c6", "skin": "#c98e64"},
    {"shirt": "#e2b84a", "hair": "#7a4b2a", "skin": "#8d5a3b"},
    {"shirt": "#4fa59a", "hair": "#a33f2f", "skin": "#f0c4a0"},
]

BASE_PALETTE = {"grass": "#7fbf5a", "path": "#dcb983", "water": "#6fb3d9", "wood": "#9a6a3f", "roof": "#c8553d", "accent": "#f2c14e"}
ROOFS = ["#c8553d", "#b4563f", "#8f5bb5", "#3f7fb4", "#c27a2c", "#4f8f5a"]
GRASSES = ["#7fbf5a", "#86c45e", "#78b85a", "#8bc766"]


def _palette(rng: random.Random, env: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    p = dict(BASE_PALETTE)
    p["grass"] = rng.choice(GRASSES)
    p["roof"] = rng.choice(ROOFS)
    ep = (env or {}).get("palette") or {}
    if ep:
        p["floor"] = rng.choice(ep["floors"])
        p["wall"] = rng.choice(ep["walls"])
        p["trim"] = ep["trim"]
        p["accent"] = ep["accent"]
    return p


def _walls(mb: "MapBuilder", spawn: Tuple[int, int]) -> None:
    """Interior shell: a two-tile back wall (windows go there), thin side walls and a front wall with a door."""
    door = spawn[0]
    for wid, x, y, w, h in (("wall-back", 0, 0, COLS, 2), ("wall-left", 0, 2, 1, ROWS - 3), ("wall-right", COLS - 1, 2, 1, ROWS - 3),
                            ("wall-front-left", 0, ROWS - 1, door, 1), ("wall-front-right", door + 1, ROWS - 1, COLS - door - 1, 1)):
        mb.add({"id": wid, "name": "Wall", "kind": "decor", "icon": "wall", "tile": [x, y], "w": w, "h": h})
    mb.add({"id": "door", "name": "Door", "kind": "decor", "icon": "door", "tile": [door, ROWS - 1], "w": 1, "h": 1})


def _furniture(env: Dict[str, Any], mech: str, wanted: Optional[str], used: Set[str]) -> Tuple[str, str]:
    """Quest furniture for an interior: the flavor's icon if this room has it, else the mechanic's first unused piece."""
    opts = env["kinds"].get(mech) or [MECH_DEFAULT_KIND[mech]]
    every = [o for lst in env["kinds"].values() for o in lst]
    if wanted and wanted not in used:
        own = [o for o in opts if o[1] == wanted] or ([o for o in every if o[1] == wanted] if mech != "deliver" else [])
        if own:
            return own[0]
    return next((o for o in opts if o[1] not in used), opts[0])


def _touches_wall(x: int, y: int, w: int, h: int) -> bool:
    return y == 2 or x == 1 or x + w == COLS - 1 or y + h == ROWS - 1


def _furnish(mb: "MapBuilder", env: Dict[str, Any], spawn: Tuple[int, int], rng: random.Random) -> None:
    """Fills an interior with the template's props, keeping every quest spot reachable."""
    for spec in env["props"]:
        w, h, cap = spec["w"], spec["h"], spec["cap"]
        solid = spec.get("solid", True)
        wall = spec.get("wall", False)
        spots = [(x, y) for y in range(2, ROWS - h) for x in range(1, COLS - w)]
        rng.shuffle(spots)
        n = 0
        for (x, y) in spots:
            if n >= cap:
                break
            if wall != _touches_wall(x, y, w, h):
                continue
            if not mb.rect_free(x, y, w, h, margin=0 if (wall or not solid) else 1):
                continue
            loc = {"id": f"{spec['icon'].replace('_', '-')}-{x}-{y}", "name": spec["icon"].replace("_", " ").capitalize(),
                   "kind": "decor", "icon": spec["icon"], "tile": [x, y], "w": w, "h": h}
            mb.add(loc, solid=solid)
            if solid and not mb.all_reachable(spawn):
                _undo_last(mb, loc)
                continue
            for yy in range(y, y + h):
                for xx in range(x, x + w):
                    mb.reserve(xx, yy)
            n += 1


def _hint_for(mech: str, params: Dict[str, Any]) -> str:
    if mech == "mix":
        return CONTROLS_HINT["mix"].format(submit=params["submit_label"])
    if mech == "timing":
        modes = {p["mode"] for p in params["phases"]}
        return " ".join(CONTROLS_HINT[f"timing_{m}"] for m in ("stop", "hold") if m in modes)
    return CONTROLS_HINT[mech]


def _metric(mech: str, labels: List[str], name: Optional[str]) -> Dict[str, str]:
    default_name, desc = METRIC[mech]
    terms = ", ".join(l.lower() for l in labels[:3]) or "each setting"
    return {"name": clip(name or default_name, 24), "description": desc.format(terms=terms)}


MAX_LINE_WORDS = 16  # speech bubbles stay one short, readable sentence


def short_line(line: Any) -> str:
    """First sentence without parentheticals, or "" if it is still too long for a speech bubble."""
    line = re.sub(r"\s*\([^)]*\)", "", str(line or "")).strip()
    first = re.split(r"(?<=[.!?])\s+|;\s*", line, maxsplit=1)[0].strip()
    return first if 0 < len(first.split()) <= MAX_LINE_WORDS else ""


def _safe_lines(lines: Iterable[str], secrets: Set[float], limit: int) -> List[str]:
    out = []
    for line in lines:
        line = short_line(line)
        if line and not reveals(line, secrets):
            out.append(line)
        if len(out) == limit:
            break
    return out


def build_world(brief: Dict[str, Any], flavor: Dict[str, Any], rules_version: int) -> Tuple[Dict[str, Any], List[str]]:
    """Builds world.json v2 from a research brief v2 and a flavor pack (see builder/flavor.py)."""
    if brief.get("version") != 2 or not isinstance(brief.get("tasks"), list):
        raise BuildError("brief is not research.json v2 (ResearchBrief with tasks[])")
    slug = slugify(brief.get("slug") or brief.get("job") or "game")
    rng = seeded(slug, "world")
    notes: List[str] = []
    picked = select_tasks(brief["tasks"])
    lf_by_task = {lf.get("task_id"): lf for lf in flavor.get("levels", [])}

    env_id = resolve_environment(flavor.get("environment"), brief)
    env = ENVIRONMENTS[env_id]
    interior = bool(env["interior"])
    mb = MapBuilder(rng)
    spawn = (COLS // 2, ROWS // 2)
    if interior:
        mb.ground = [["f"] * COLS for _ in range(ROWS)]
        _walls(mb, spawn)
    else:
        # Tree line around the village.
        for x, y, w, h in ((0, 0, COLS, 1), (0, ROWS - 1, COLS, 1), (0, 1, 1, ROWS - 2), (COLS - 1, 1, 1, ROWS - 2)):
            mb.add({"id": f"trees-{x}-{y}", "name": "Trees", "kind": "decor", "icon": "trees", "tile": [x, y], "w": w, "h": h})
    # Main paths: a cross through the square.
    for x in range(2, COLS - 2):
        mb.ground[spawn[1]][x] = "p"
        mb.reserve(x, spawn[1])
    for y in range(2, ROWS - 2):
        mb.ground[y][spawn[0]] = "p"
        mb.reserve(spawn[0], y)
    if interior:
        # The lane runs on to the door in the bottom wall.
        mb.ground[ROWS - 2][spawn[0]] = "p"
        mb.reserve(spawn[0], ROWS - 2)
    mb.required.add(spawn)

    # One quest location per level, one per quadrant.
    slots = [("top", "left"), ("top", "right"), ("bottom", "left"), ("bottom", "right")]
    rng.shuffle(slots)
    levels_ctx = []
    for i, (task, mech) in enumerate(picked):
        lf = lf_by_task.get(task["id"], {})
        if interior:
            kind, icon = _furniture(env, mech, lf.get("icon"), {c["loc"]["icon"] for c in levels_ctx})
            w, h = ICON_SIZE.get(icon, KIND_SIZE[kind])
        else:
            kind = lf.get("location_kind") if lf.get("location_kind") in LOCATION_KINDS else MECH_DEFAULT_KIND[mech][0]
            if mech == "deliver" and kind in ("field", "building"):
                kind = "stall"
            icon = lf.get("icon") if lf.get("icon") in ICONS else MECH_DEFAULT_KIND[mech][1]
            w, h = KIND_SIZE[kind]
        vert, horiz = slots[i]
        y_opts = list(range(2, 7 - h)) if vert == "top" else list(range(spawn[1] + 2, ROWS - 2 - h))
        x_opts = list(range(2, spawn[0] - 1 - w)) if horiz == "left" else list(range(spawn[0] + 2, COLS - 1 - w))
        placed = None
        for _ in range(60):
            x, y = rng.choice(x_opts), rng.choice(y_opts)
            fx, fy = x + w // 2, y + h
            if mb.rect_free(x, y, w, h) and mb.interior(fx, fy) and not mb.solid[fy][fx] and (fx, fy) not in mb.npc_tiles:
                placed = (x, y)
                break
        if not placed:
            raise BuildError("could not place quest locations")
        x, y = placed
        loc_id = slugify(lf.get("location_name") or task.get("title") or task["id"])
        while loc_id in {l["id"] for l in mb.locations}:
            loc_id += "-2"
        loc = mb.add({"id": loc_id, "name": clip(lf.get("location_name") or task.get("title") or task["id"], 26),
                      "kind": kind, "icon": icon, "tile": [x, y], "w": w, "h": h})
        front = (x + w // 2, y + h)
        mb.reserve(*front)
        mb.required.add(front)
        levels_ctx.append({"task": task, "mech": mech, "lf": lf, "loc": loc, "front": front})

    # Quest givers stand near their location, a couple of tiles from its door.
    npcs: List[Dict[str, Any]] = []
    used_names: Set[str] = set()
    for i, ctx in enumerate(levels_ctx):
        fx, fy = ctx["front"]
        spot = None
        for dx, dy in ((2, 0), (-2, 0), (3, 0), (-3, 0), (2, 1), (-2, 1), (1, 1), (-1, 1), (0, 2)):
            tx, ty = fx + dx, fy + dy
            if mb.interior(tx, ty) and not mb.solid[ty][tx] and not mb.reserved[ty][tx] and (tx, ty) not in mb.npc_tiles:
                spot = (tx, ty)
                break
        if not spot:
            raise BuildError("no room for a quest giver")
        mb.npc_tiles.add(spot)
        nf = ctx["lf"].get("npc") or {}
        name = clip(nf.get("name"), 18) or f"Villager {i + 1}"
        while name in used_names:
            name += "'s twin"
        used_names.add(name)
        npc_id = slugify(name, f"npc-{i + 1}")
        while npc_id in {n["id"] for n in npcs}:
            npc_id += "-2"
        npc = {"id": npc_id, "name": name, "role": clip(nf.get("role") or "villager", 40), "tile": list(spot),
               "palette": NPC_COLORS[i % len(NPC_COLORS)]}
        npcs.append(npc)
        ctx["npc"] = npc
        for t in mb.adjacent_walkable(spot[0], spot[1], 1, 1)[:1]:
            mb.required.add(t)

    # Destinations for deliver levels.
    for ctx in levels_ctx:
        if ctx["mech"] != "deliver":
            continue
        dests: Dict[str, Dict[str, Any]] = {}
        names = []
        for o in ctx["task"].get("orders", [])[:5]:
            dn = clip(o.get("destination") or "Customer", 22)
            if dn.lower() not in {n.lower() for n in names}:
                names.append(dn)
        chosen: List[Tuple[int, int]] = []
        fx, fy = ctx["front"]
        cands = [(x, y) for y in range(2, ROWS - 3) for x in range(2, COLS - 2)]
        rng.shuffle(cands)
        for dn in names:
            best = None
            for (x, y) in cands:
                if not mb.rect_free(x, y, 1, 1, margin=1) or abs(x - fx) + abs(y - fy) < 5:
                    continue
                if not mb.interior(x, y + 1) or mb.solid[y + 1][x]:
                    continue
                spread = min([abs(x - a) + abs(y - b) for a, b in chosen] or [99])
                if best is None or spread > best[0]:
                    best = (spread, (x, y))
            if not best:
                raise BuildError("no room for delivery destinations")
            x, y = best[1]
            chosen.append((x, y))
            sid = slugify(dn, "spot")
            while sid in {l["id"] for l in mb.locations}:
                sid += "-2"
            loc = mb.add({"id": sid, "name": dn, "kind": "spot", "icon": env["spot"], "tile": [x, y], "w": 1, "h": 1})
            mb.reserve(x, y + 1)
            mb.required.add((x, y + 1))
            dests[dn.lower()] = loc
        ctx["dests"] = dests

    # Paths branch off the nearest existing path to every door, quest giver and destination.
    for goal in sorted(mb.required, key=lambda t: (abs(t[0] - spawn[0]) + abs(t[1] - spawn[1]), t)):
        for (x, y) in mb.path_to_ground(goal, "p"):
            mb.ground[y][x] = "p"
            mb.reserve(x, y)
    if not mb.all_reachable(spawn):
        raise BuildError("map is not fully reachable")

    if interior:
        _furnish(mb, env, spawn, rng)
    # Outdoors: a pond, a couple of cottages and greenery wherever there is room.
    for (w, h) in (() if interior else ((4, 3), (3, 2))):
        spots = [(x, y) for y in range(2, ROWS - 2 - h) for x in range(2, COLS - 1 - w)]
        rng.shuffle(spots)
        done = False
        for (x, y) in spots:
            if mb.rect_free(x, y, w, h, margin=1):
                for yy in range(y, y + h):
                    for xx in range(x, x + w):
                        mb.ground[yy][xx] = "w"
                mb.block(x, y, w, h)
                if mb.all_reachable(spawn):
                    done = True
                    break
                mb.solids.pop()
                for yy in range(y, y + h):
                    for xx in range(x, x + w):
                        mb.ground[yy][xx] = "g"
                        mb.solid[yy][xx] = False
        if done:
            break
    cottage = 0
    spots = [(x, y) for y in range(2, ROWS - 4) for x in range(2, COLS - 6)]
    rng.shuffle(spots)
    for margin in (() if interior else (1, 0)):
        for (x, y) in spots:
            if cottage == 2:
                break
            if mb.rect_free(x, y, 4, 3, margin=margin):
                loc = mb.add({"id": f"cottage-{cottage + 1}", "name": "Cottage", "kind": "decor", "icon": "cottage", "tile": [x, y], "w": 4, "h": 3})
                if mb.all_reachable(spawn):
                    cottage += 1
                else:
                    _undo_last(mb, loc)
    free = [(x, y) for y in range(1, ROWS - 1) for x in range(1, COLS - 1)]
    rng.shuffle(free)
    counts = {"tree": 0, "bush": 0, "flowers": 0, "rock": 0, "lamp": 0}
    caps = {"tree": 14, "bush": 7, "flowers": 12, "rock": 3, "lamp": 2}
    for (x, y) in ([] if interior else free):
        if not mb.rect_free(x, y, 1, 1):
            continue
        near_path = any(mb.ground[y + dy][x + dx] == "p" for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if mb.interior(x + dx, y + dy))
        kind = "lamp" if near_path and counts["lamp"] < caps["lamp"] and rng.random() < 0.15 else rng.choice(["tree", "tree", "bush", "flowers", "flowers", "rock"])
        if counts[kind] >= caps[kind]:
            continue
        solid = kind != "flowers"
        loc = mb.add({"id": f"{kind}-{x}-{y}", "name": kind.capitalize(), "kind": "decor", "icon": kind, "tile": [x, y], "w": 1, "h": 1}, solid=solid)
        if solid and not mb.all_reachable(spawn):
            _undo_last(mb, loc)
            continue
        mb.reserve(x, y)
        counts[kind] += 1

    # Levels.
    levels = []
    all_sources: Dict[str, Dict[str, str]] = {}
    for i, ctx in enumerate(levels_ctx):
        helper = levels_ctx[(i + 1) % len(levels_ctx)]["npc"]
        level, lnotes = make_level(slug, i + 1, ctx, helper, mb, rng)
        notes.extend(f"{level['id']}: {n}" for n in lnotes)
        levels.append(level)
        for s in level.get("sources", []):
            all_sources.setdefault(s["url"], s)
    for s in brief.get("sources") or []:
        if isinstance(s, dict) and s.get("url"):
            all_sources.setdefault(s["url"], {"title": str(s.get("title") or s["url"]), "url": s["url"]})

    world = {
        "version": 2,
        "rulesVersion": rules_version,
        "researchVersion": 2,
        "job": str(brief.get("job") or slug),
        "slug": slug,
        "title": clip(flavor.get("title") or brief.get("title") or slug.replace("-", " ").title(), 40),
        "branch": f"game/{slug}",
        "theme": {"name": clip(flavor.get("theme_name") or brief.get("title") or slug, 40), "environment": env_id,
                  "palette": _palette(rng, env)},
        "map": {"cols": COLS, "rows": ROWS, "tile": TILE, "spawn": list(spawn), "ground": mb.ground_rows(),
                "locations": mb.locations, "solids": mb.solids},
        "npcs": npcs,
        "levels": levels,
        "sources": list(all_sources.values()),
    }
    return world, notes


def _undo_last(mb: MapBuilder, loc: Dict[str, Any]) -> None:
    mb.locations.remove(loc)
    rect = mb.solids.pop()
    for yy in range(rect["y"], rect["y"] + rect["h"]):
        for xx in range(rect["x"], rect["x"] + rect["w"]):
            mb.solid[yy][xx] = False


def _reply_for(points: float) -> str:
    if points >= 0.75:
        return "That is just what I needed to hear, thank you."
    if points >= 0.4:
        return "Hmm, I suppose that could work."
    return "Oh... are you sure about that?"


def make_level(slug: str, index: int, ctx: Dict[str, Any], helper: Dict[str, Any], mb: MapBuilder,
               rng: random.Random) -> Tuple[Dict[str, Any], List[str]]:
    task, mech, lf, loc, npc = ctx["task"], ctx["mech"], ctx["lf"], ctx["loc"], ctx["npc"]
    notes: List[str] = []
    task_id = slugify(task["id"])
    title = clip(lf.get("title") or task.get("title") or task_id, 36)
    params: Dict[str, Any]
    scoring: Dict[str, Any]
    time_limit: Optional[int] = None
    labels: List[str] = []

    if mech in ("mix", "timing"):
        controls, scoring, notes = build_numeric(task, mech, rng)
        labels = [c["label"] for c in controls if c["id"] in scoring["variables"]] + [d["label"] for d in scoring.get("derived", [])]
        if mech == "mix":
            params = {"station_id": loc["id"], "variables": controls,
                      "submit_label": clip(lf.get("submit_label") or "Finish", 12)}
        else:
            params = {"station_id": loc["id"], "phases": timing_phases(controls, scoring["variables"], rng)}
            time_limit = 20000 + 10000 * len(params["phases"])
    elif mech == "sort":
        bins, bin_ids = [], {}
        for b in task.get("sort_bins") or []:
            label = str(b).strip()
            if label and label.lower() not in bin_ids and len(bins) < 6:
                bid = slugify(label, f"bin-{len(bins) + 1}")
                while bid in {x["id"] for x in bins}:
                    bid += "-2"
                bins.append({"id": bid, "label": clip(label, 32)})
                bin_ids[label.lower()] = bid
        items, correct, fb = [], {}, {}
        for it in (task.get("sort_items") or [])[:12]:
            want = str(it.get("correct_bin") or "").strip().lower()
            if want not in bin_ids:
                if len(bins) >= 6 or not want:
                    notes.append(f"dropped sort item {it.get('label')}: unknown bin")
                    continue
                bid = slugify(want, f"bin-{len(bins) + 1}")
                bins.append({"id": bid, "label": clip(it.get("correct_bin"), 32)})
                bin_ids[want] = bid
            iid = slugify(it.get("label") or "item", "item")
            while iid in correct:
                iid += "-2"
            items.append({"id": iid, "label": clip(it.get("label"), 48)})
            correct[iid] = bin_ids[want]
            if it.get("feedback"):
                fb[iid] = str(it["feedback"]).strip()
        rng.shuffle(items)
        params = {"station_id": loc["id"], "items": items, "bins": bins}
        scoring = {"pass_threshold": PASS_THRESHOLD, "correct": correct, "feedback": fb}
        time_limit = 15000 + 6000 * len(items)
    elif mech == "deliver":
        orders, dests = [], ctx["dests"]
        for j, o in enumerate((task.get("orders") or [])[:5]):
            dn = clip(o.get("destination") or "Customer", 22)
            dest = dests[dn.lower()]
            item = clip(o.get("item") or "Order", 24)
            orders.append({"id": f"order-{j + 1}", "item": item, "label": f"{item} for {dest['name']}",
                           "from": f"location:{loc['id']}", "to": f"spot:{dest['id']}"})
        capacity = 2 if len(orders) >= 3 else 1
        by_target = {f"spot:{d['id']}": d for d in dests.values()}
        best_ms = deliver_route_ms(mb, ctx["front"], loc, by_target, orders, capacity)
        par = int(math.ceil((best_ms * 2 + 4000) / 1000.0) * 1000)
        time_limit = max(par * 2, 30000)
        params = {"start_tile": list(ctx["front"]), "orders": orders, "capacity": capacity, "par_ms": par}
        scoring = {"pass_threshold": PASS_THRESHOLD, "weights": {"accuracy": 2, "time": 1},
                   "feedback": {"wrong_target": "Someone got an order that was not theirs.",
                                "late": "The orders took too long to arrive.",
                                "missed": "Some orders never reached their destination."}}
    else:  # converse
        turns, spec = [], {}
        replies = lf.get("replies") or []
        for j, t in enumerate((task.get("dialogue") or [])[:6]):
            opts = list(enumerate((t.get("options") or [])[:4]))
            rng.shuffle(opts)
            tid = f"turn-{j + 1}"
            row_replies = replies[j] if j < len(replies) and isinstance(replies[j], list) else []
            options, ospec = [], {}
            for k, (orig, o) in enumerate(opts):
                oid = f"opt-{'abcd'[k]}"
                points = max(0.0, min(1.0, _num(o.get("points"))))
                reply = str(row_replies[orig]).strip() if orig < len(row_replies) and str(row_replies[orig]).strip() else _reply_for(points)
                options.append({"id": oid, "text": str(o.get("text")).strip(), "reply": clip(reply, 200)})
                ospec[oid] = {"points": _clean_num(round(points, 3)), "feedback": str(o.get("feedback") or "").strip() or "Think about what they really need."}
                if o.get("critical"):
                    ospec[oid]["critical"] = True
            turns.append({"id": tid, "npc_line": str(t.get("npc_line")).strip(), "options": options})
            spec[tid] = ospec
        params = {"npc_id": npc["id"], "turns": turns}
        scoring = {"pass_threshold": PASS_THRESHOLD, "turns": spec}
        best = score_converse({"params": params, "scoring": scoring}, {t["id"]: max(spec[t["id"]], key=lambda o: spec[t["id"]][o]["points"]) for t in turns})
        if best["score"] < PASS_THRESHOLD + 5:
            scoring["pass_threshold"] = max(40, int(best["score"]) - 10)
            notes.append(f"lowered pass threshold to {scoring['pass_threshold']} (best possible {best['score']})")

    secrets = scoring_secrets(scoring)
    for term in list(scoring.get("variables", {}).values()) + list(scoring.get("derived", [])):
        label = next((c["label"] for c in params.get("variables", params.get("phases", [])) if scoring.get("variables", {}).get(c["id"]) is term), None)
        label = label or term.get("label") or "value"
        generic = _generic_feedback(label)
        for side in ("too_low", "too_high"):
            if reveals(term["feedback"][side], secrets):
                term["feedback"][side] = generic[side]
                notes.append(f"replaced feedback that stated a target ({side})")
    for k, msg in list(scoring.get("feedback", {}).items()):
        if reveals(msg, secrets):
            scoring["feedback"][k] = "That did not belong there."

    aim = (_safe_lines([lf.get("aim")], secrets, 1) or [str(task.get("aim") or "").strip()])[0]
    if not aim or reveals(aim, secrets) or len(aim) > 200:
        aim = f"{task.get('title') or title}: {MECH_AIM[mech]}"
        notes.append("aim replaced (empty, too long or stated a target)")
    hint = _hint_for(mech, params)

    caveat_lines = _safe_lines((task.get("caveats") or []) + (task.get("problems") or []), secrets, 2)
    chatter = _safe_lines(lf.get("chatter") or [], secrets, 2) or caveat_lines
    quest_line = _safe_lines([lf.get("quest_line")], secrets, 1)
    if not quest_line:
        quest_line = [f"Could you give me a hand with {str(task.get('title') or title).lower()}?"]
    dialogue = [{"at": "quest", "npc_id": npc["id"], "text": quest_line[0]}]
    speakers = [helper["id"], npc["id"]]
    for k, line in enumerate(chatter):
        dialogue.append({"at": "start", "npc_id": speakers[k % 2], "text": line})
    dialogue.append({"at": "pass", "npc_id": npc["id"], "text": (_safe_lines([lf.get("pass_line")], secrets, 1) or ["That is exactly how it should be done. Thank you!"])[0]})
    dialogue.append({"at": "fail", "npc_id": npc["id"], "text": (_safe_lines([lf.get("fail_line")], secrets, 1) or ["Not quite. Come back and try again?"])[0]})

    sources = []
    for s in task.get("sources") or []:
        if isinstance(s, dict) and s.get("url"):
            sources.append({"title": str(s.get("title") or s["url"]), "url": str(s["url"])})

    level = {
        "id": f"{slug}-{task_id}",
        "index": index,
        "title": title,
        "task_id": str(task["id"]),
        "skill_name": clip(lf.get("skill_name") or task.get("title") or title, 60),
        "mechanic": mech,
        "quest": {"npc_id": npc["id"], "location_id": loc["id"],
                  "title": clip(lf.get("quest_title") or f"{npc['name']} needs a hand", 48)},
        "aim": aim,
        "controls_hint": hint,
        "metric": _metric(mech, labels, lf.get("metric_name")),
        "time_limit_ms": time_limit,
        "success_line": (_safe_lines([lf.get("success_line")], secrets, 1) or ["Lovely work!"])[0],
        "dialogue": dialogue,
        "params": params,
        "scoring": scoring,
        "sources": sources,
    }
    if mech == "mix":
        defaults = score_mix(level, {v["id"]: v["default"] for v in params["variables"]})
        best = score_mix(level, optimal_point(params["variables"], scoring, "mix"))
        if best["score"] < PASS_THRESHOLD + 5:
            raise BuildError(f"{level['id']}: best reachable score is only {best['score']}")
        notes.append(f"default score {defaults['score']}, best {best['score']}")
    return level, notes


# ---------------------------------------------------------------------------
# Self-check (the Entire Graph check in builder/graph_check.py is the authority)
# ---------------------------------------------------------------------------

REQUIRED_PARAMS = {"mix": ("station_id", "variables", "submit_label"), "timing": ("station_id", "phases"),
                   "sort": ("station_id", "items", "bins"), "deliver": ("start_tile", "orders", "capacity", "par_ms"),
                   "converse": ("npc_id", "turns")}
ID_RE = re.compile(r"^[a-z0-9]+([-_][a-z0-9]+)*$")
VAR_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def validate_world(world: Dict[str, Any], rules: Dict[str, Any]) -> List[str]:
    """Structural and rule checks for a generated world. Returns a list of problems (empty = ok)."""
    errs: List[str] = []

    def need(cond: bool, msg: str) -> None:
        if not cond:
            errs.append(msg)

    need(world.get("version") == 2, "version must be 2")
    need(world.get("rulesVersion") == rules.get("version"), "rulesVersion must match actions.json")
    need(world.get("branch") == f"game/{world.get('slug')}", "branch must be game/<slug>")
    m = world.get("map", {})
    need(16 <= m.get("cols", 0) <= 64 and 12 <= m.get("rows", 0) <= 48 and m.get("tile") == 16, "map size")
    levels = world.get("levels", [])
    need(len(levels) == rules["limits"]["levels_per_game"], "exactly 4 levels")
    need([l.get("index") for l in levels] == [1, 2, 3, 4], "level indexes 1-4")
    need(len({l.get("task_id") for l in levels}) == len(levels), "levels must implement distinct tasks")
    need(len({l.get("id") for l in levels}) == len(levels), "level ids must be unique")
    npc_ids = {n["id"] for n in world.get("npcs", [])}
    loc_ids = {l["id"] for l in m.get("locations", [])}
    for n in world.get("npcs", []):
        need(bool(ID_RE.match(n["id"])), f"npc id {n['id']}")
    for l in m.get("locations", []):
        need(bool(ID_RE.match(l["id"])), f"location id {l['id']}")
    for lvl in levels:
        lid = lvl.get("id", "?")
        mech = lvl.get("mechanic")
        need(mech in rules["mechanics"], f"{lid}: mechanic {mech} not allowed")
        if mech not in REQUIRED_PARAMS:
            continue
        params, scoring = lvl.get("params", {}), lvl.get("scoring", {})
        need(all(k in params for k in REQUIRED_PARAMS[mech]), f"{lid}: missing params")
        need(lvl["quest"]["npc_id"] in npc_ids and lvl["quest"]["location_id"] in loc_ids, f"{lid}: quest refs")
        need(0 <= scoring.get("pass_threshold", -1) <= 100, f"{lid}: pass_threshold")
        secrets = scoring_secrets(scoring)
        for text in [lvl.get("aim", ""), lvl.get("controls_hint", "")]:
            need(not reveals(text, secrets), f"{lid}: text reveals a target: {text!r}")
        if mech in ("mix", "timing"):
            ctrls = params.get("variables" if mech == "mix" else "phases", [])
            by_id = {c["id"]: c for c in ctrls}
            need(1 <= len(ctrls) <= (6 if mech == "mix" else 3), f"{lid}: control count")
            for c in ctrls:
                need(bool(VAR_RE.match(c["id"])), f"{lid}: bad variable id {c['id']}")
                need(c["max"] > c["min"], f"{lid}: {c['id']} min/max")
                if mech == "mix":
                    need(c["step"] > 0 and c["min"] <= c["default"] <= c["max"], f"{lid}: {c['id']} step/default")
                else:
                    need(c["mode"] in ("stop", "hold"), f"{lid}: {c['id']} mode")
            need(set(scoring.get("variables", {})) <= set(by_id), f"{lid}: scoring.variables must match controls")
            terms = list(scoring.get("variables", {}).items()) + [(d["id"], d) for d in scoring.get("derived", [])]
            for tid, term in terms:
                need(("target" in term) != ("range" in term), f"{lid}.{tid}: target xor range")
                need(term.get("tolerance", 0) > 0 and term.get("weight", 0) > 0 and term.get("curve") in ("gaussian", "linear", "step"), f"{lid}.{tid}: term fields")
                for side in ("too_low", "too_high"):
                    need(not reveals(term["feedback"][side], secrets), f"{lid}.{tid}: feedback reveals a target")
                if tid in by_id:
                    lo, hi = (term["range"] if "range" in term else (term["target"], term["target"]))
                    need(by_id[tid]["min"] <= lo and hi <= by_id[tid]["max"], f"{lid}.{tid}: target outside min/max")
            for d in scoring.get("derived", []):
                try:
                    parse_expr(d["expr"], set(by_id))
                except ExprError as exc:
                    errs.append(f"{lid}.{d['id']}: {exc}")
        if mech == "sort":
            need(3 <= len(params["items"]) <= 12 and 2 <= len(params["bins"]) <= 6, f"{lid}: item/bin counts")
            need(set(scoring.get("correct", {})) == {i["id"] for i in params["items"]}, f"{lid}: correct must cover items")
            need(set(scoring.get("correct", {}).values()) <= {b["id"] for b in params["bins"]}, f"{lid}: correct bins")
        if mech == "converse":
            need(params["npc_id"] in npc_ids, f"{lid}: converse npc")
            need(set(scoring.get("turns", {})) == {t["id"] for t in params["turns"]}, f"{lid}: turns")
            for t in params["turns"]:
                need(set(scoring["turns"][t["id"]]) == {o["id"] for o in t["options"]}, f"{lid}.{t['id']}: options")
        if mech == "deliver":
            need(bool(lvl.get("time_limit_ms")) and {"accuracy", "time"} <= set(scoring.get("weights", {})), f"{lid}: deliver scoring")
            targets = {f"location:{i}" for i in loc_ids} | {f"spot:{i}" for i in loc_ids} | {f"npc:{i}" for i in npc_ids}
            for o in params["orders"]:
                need(o["from"] in targets and o["to"] in targets, f"{lid}.{o['id']}: order targets")
    return errs
