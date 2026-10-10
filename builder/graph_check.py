"""
Entire Graph rules check for generated games (shared/game_contract.md section b).

Every game the builder generates is checked against the platform rules on main
before it is committed on its game/<slug> branch:

1. A local, deterministic validator always runs against
   `git show main:shared/actions.json` (controls, the 5 mechanics, scoring spec)
   and `git show main:shared/schemas/world.schema.json`.
2. The same rules are published into Entire Graph (`entire graph`, a
   deterministic, no-egress local code graph): main's rule files are indexed and
   a compact snapshot is stored. The mechanics, controls, params and curves a
   world uses are then resolved as symbols in that snapshot (with file:line
   evidence). If the plugin is missing, the local validator still decides.
3. Safe deterministic repairs are applied and the world is re-checked. A failing
   world is never committed. A passing one is written with
   games/<slug>/graph_report.json and committed on game/<slug> through a
   temporary git worktree; the commit message carries the result, and the
   committed tree is indexed in Entire Graph.

Builder call site: `world = finalize_world(world, repo_root)`.
CLI: `python3 -m builder.graph_check games/<slug>/world.json [--repair] [--write]`
     `python3 -m builder.graph_check --branch game/<slug>`
"""

import copy
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = "shared/actions.json"
SCHEMA_PATH = "shared/schemas/world.schema.json"
RULES_REF = "main"
REDACTED = "the right amount"


class GraphCheckError(Exception):
    """Raised when a world still violates main's rules after repair. Carries the report."""

    def __init__(self, report: Dict[str, Any]):
        self.report = report
        lines = [f"{v['path']}: {v['message']}" for v in report.get("violations", [])[:8]]
        super().__init__("World violates main's rules:\n" + "\n".join(lines))


# ---------------------------------------------------------------------------
# Rules from main
# ---------------------------------------------------------------------------

def _git(repo: Path, *args: str, env: Optional[Dict[str, str]] = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True, text=True,
        env={**os.environ, **(env or {})},
    ).stdout


def load_rules(repo_root: Path = WORKSPACE_ROOT, ref: str = RULES_REF) -> Dict[str, Any]:
    """Platform rules as committed on `ref`. Falls back to the working tree only when git has no such ref."""
    repo_root = Path(repo_root)
    raw: Dict[str, str] = {}
    try:
        raw[RULES_PATH] = _git(repo_root, "show", f"{ref}:{RULES_PATH}")
        commit = _git(repo_root, "rev-parse", ref).strip()
        try:
            raw[SCHEMA_PATH] = _git(repo_root, "show", f"{ref}:{SCHEMA_PATH}")
        except subprocess.CalledProcessError:
            pass
        source = f"git show {ref}:{RULES_PATH}"
    except (subprocess.CalledProcessError, FileNotFoundError):
        source, ref, commit = f"working tree {RULES_PATH} (no git ref '{ref}')", None, None
        for rel in (RULES_PATH, SCHEMA_PATH):
            if (repo_root / rel).exists():
                raw[rel] = (repo_root / rel).read_text(encoding="utf-8")
    schema = json.loads(raw[SCHEMA_PATH]) if SCHEMA_PATH in raw else None
    # raw text is kept so Entire Graph line evidence matches main's files exactly
    return {"actions": json.loads(raw[RULES_PATH]), "schema": schema, "raw": raw, "ref": ref, "commit": commit, "source": source}


# ---------------------------------------------------------------------------
# Rule text parsing: mechanic params are described in actions.json as text,
# e.g. "[{ id, label, unit, min, max, step, default }] (1-6)".
# ---------------------------------------------------------------------------

def _split_top(text: str) -> List[str]:
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def _object_fields(text: str) -> Optional[Dict[str, Dict[str, Any]]]:
    """Fields of the first '[{ ... }]' in text: {name: {optional, enum, fields}}."""
    start = text.find("[{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] in "[{":
            depth += 1
        elif text[i] in "]}":
            depth -= 1
            if depth == 0:
                body = text[start + 2:i - 1]
                break
    else:
        return None
    fields: Dict[str, Dict[str, Any]] = {}
    for part in _split_top(body):
        name, _, value = part.partition(":")
        name, value = name.strip(), value.strip()
        spec: Dict[str, Any] = {"optional": name.endswith("?")}
        if re.fullmatch(r"[a-z_]+(\|[a-z_]+)+", value):
            spec["enum"] = value.split("|")
        if value.startswith("[{"):
            spec["fields"] = _object_fields(value)
        fields[name.rstrip("?")] = spec
    return fields


def param_spec(desc: str, name: str) -> Dict[str, Any]:
    spec: Dict[str, Any] = {"optional": desc.strip().lower().startswith("optional"), "fields": _object_fields(desc), "bounds": {}}
    group = re.search(r"\(([^()]*\d+-\d+[^()]*)\)\s*$", desc)
    if group:
        for lo, hi, label in re.findall(r"(\d+)-(\d+)(?:\s+([a-z_]+))?", group.group(1)):
            spec["bounds"][None if not label or label == name else label] = (int(lo), int(hi))
    m = re.search(r"integer\s*>=\s*(\d+)", desc)
    if m:
        spec["integer_min"] = int(m.group(1))
    return spec


def _default_pass_threshold(actions: Dict[str, Any]) -> float:
    text = actions.get("scoring_spec", {}).get("common", {}).get("pass_threshold", "")
    m = re.search(r"default\s+(\d+(?:\.\d+)?)", text)
    return float(m.group(1)) if m else 70.0


def _allowed_letters(actions: Dict[str, Any]) -> set:
    letters = set()
    for ctrl in actions.get("controls", {}).values():
        letters |= set(re.findall(r"\b([A-Z])\b", ctrl.get("input", "")))
    return letters


# ---------------------------------------------------------------------------
# Expression grammar (actions.json scoring_spec.expr_grammar) and scoring
# ---------------------------------------------------------------------------

_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?|\.\d+)|([a-z][a-z0-9_]*)|(.))")


@lru_cache(maxsize=512)
def parse_expr(expr: str) -> Tuple[Optional[Any], Optional[str], List[str]]:
    """Parse expr per the grammar. Returns (ast, error, identifiers)."""
    tokens: List[Tuple[str, str]] = []
    for num, ident, other in _TOKEN.findall(expr):
        if num:
            tokens.append(("num", num))
        elif ident:
            tokens.append(("var", ident))
        elif other.strip():
            if other not in "+-*/()":
                return None, f"unsupported character {other!r}", []
            tokens.append(("op", other))
    pos = 0
    idents: List[str] = []

    def peek() -> Optional[Tuple[str, str]]:
        return tokens[pos] if pos < len(tokens) else None

    def factor() -> Any:
        nonlocal pos
        tok = peek()
        if tok is None:
            raise ValueError("unexpected end of expression")
        pos += 1
        if tok[0] == "num":
            return ("num", float(tok[1]))
        if tok[0] == "var":
            idents.append(tok[1])
            return ("var", tok[1])
        if tok == ("op", "-"):
            return ("neg", factor())
        if tok == ("op", "("):
            node = expr_()
            if peek() != ("op", ")"):
                raise ValueError("missing ')'")
            pos += 1
            return node
        raise ValueError(f"unexpected {tok[1]!r}")

    def term() -> Any:
        nonlocal pos
        node = factor()
        while peek() in (("op", "*"), ("op", "/")):
            op = tokens[pos][1]
            pos += 1
            node = (op, node, factor())
        return node

    def expr_() -> Any:
        nonlocal pos
        node = term()
        while peek() in (("op", "+"), ("op", "-")):
            op = tokens[pos][1]
            pos += 1
            node = (op, node, term())
        return node

    if not tokens:
        return None, "empty expression", []
    try:
        ast = expr_()
        if pos != len(tokens):
            raise ValueError(f"unexpected {tokens[pos][1]!r}")
    except ValueError as exc:
        return None, str(exc), idents
    return ast, None, idents


def eval_expr(ast: Any, values: Dict[str, float]) -> Optional[float]:
    """Evaluate a parsed expr; None on division by zero (scores 0 per the spec)."""
    kind = ast[0]
    if kind == "num":
        return ast[1]
    if kind == "var":
        return float(values[ast[1]])
    if kind == "neg":
        v = eval_expr(ast[1], values)
        return None if v is None else -v
    a, b = eval_expr(ast[1], values), eval_expr(ast[2], values)
    if a is None or b is None:
        return None
    if kind == "+":
        return a + b
    if kind == "-":
        return a - b
    if kind == "*":
        return a * b
    return None if b == 0 else a / b


def term_score(value: Optional[float], term: Dict[str, Any]) -> float:
    if value is None:
        return 0.0
    if "range" in term:
        lo, hi = term["range"]
        d = 0.0 if lo <= value <= hi else min(abs(value - lo), abs(value - hi))
    else:
        d = abs(value - term["target"])
    tol, curve = term["tolerance"], term["curve"]
    if curve == "gaussian":
        return math.exp(-0.5 * (d / tol) ** 2)
    if curve == "linear":
        return max(0.0, 1 - d / (2 * tol))
    return 1.0 if d <= tol else 0.0


def numeric_score(scoring: Dict[str, Any], values: Dict[str, float]) -> float:
    """scoring_spec.total over variables + derived (order excluded)."""
    parts = [(t["weight"], term_score(values.get(vid), t)) for vid, t in scoring.get("variables", {}).items()]
    for d in scoring.get("derived", []):
        ast, err, _ = parse_expr(d["expr"])
        parts.append((d["weight"], 0.0 if err else term_score(eval_expr(ast, values), d)))
    total_w = sum(w for w, _ in parts)
    return round(100 * sum(w * s for w, s in parts) / total_w, 1) if total_w else 0.0


def best_numeric_score(controls: List[Dict[str, Any]], scoring: Dict[str, Any]) -> float:
    """Deterministic coordinate ascent from the optimum of each variable; a lower bound on the best score."""
    def grid(c: Dict[str, Any]) -> List[float]:
        lo, hi, step = float(c["min"]), float(c["max"]), float(c.get("step") or (float(c["max"]) - float(c["min"])) / 100 or 1)
        n = int(math.floor((hi - lo) / step + 1e-9))
        idx = range(n + 1) if n <= 400 else sorted({round(i * n / 400) for i in range(401)})
        return [round(lo + i * step, 10) for i in idx]

    grids = {c["id"]: grid(c) for c in controls}
    values: Dict[str, float] = {}
    for c in controls:
        term = scoring.get("variables", {}).get(c["id"])
        goal = (sum(term["range"]) / 2 if "range" in term else term["target"]) if term else float(c.get("default", c["min"]))
        values[c["id"]] = min(grids[c["id"]], key=lambda v: abs(v - goal))
    best = numeric_score(scoring, values)
    for _ in range(8):
        improved = False
        for vid, options in grids.items():
            for v in options:
                trial = {**values, vid: v}
                s = numeric_score(scoring, trial)
                if s > best:
                    best, values, improved = s, trial, True
        if not improved:
            break
    return best


# ---------------------------------------------------------------------------
# Minimal JSON Schema (2020-12 subset used by world.schema.json)
# ---------------------------------------------------------------------------

def _type_ok(value: Any, t: str) -> bool:
    if t == "integer":
        return (isinstance(value, int) and not isinstance(value, bool)) or (isinstance(value, float) and value.is_integer())
    if t == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if t == "boolean":
        return isinstance(value, bool)
    if t == "null":
        return value is None
    return isinstance(value, {"string": str, "object": dict, "array": list}[t])


def schema_errors(value: Any, schema: Dict[str, Any], root: Dict[str, Any], path: str = "") -> List[Tuple[str, str]]:
    errs: List[Tuple[str, str]] = []
    here = path or "world"
    if "$ref" in schema:
        node: Any = root
        for part in schema["$ref"].lstrip("#/").split("/"):
            node = node[part]
        errs += schema_errors(value, node, root, path)
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(value, t) for t in types):
            return errs + [(here, f"must be {' or '.join(types)}")]
    if "const" in schema and value != schema["const"]:
        errs.append((here, f"must be {schema['const']!r}"))
    if "enum" in schema and value not in schema["enum"]:
        errs.append((here, f"must be one of {schema['enum']}"))
    if isinstance(value, str) and "pattern" in schema and not re.search(schema["pattern"], value):
        errs.append((here, f"must match {schema['pattern']}"))
    if _type_ok(value, "number"):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append((here, f"must be >= {schema['minimum']}"))
        if "maximum" in schema and value > schema["maximum"]:
            errs.append((here, f"must be <= {schema['maximum']}"))
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            errs.append((here, f"must be > {schema['exclusiveMinimum']}"))
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errs.append((here, f"needs at least {schema['minItems']} items"))
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errs.append((here, f"allows at most {schema['maxItems']} items"))
        if "items" in schema:
            for i, item in enumerate(value):
                errs += schema_errors(item, schema["items"], root, f"{path}[{i}]")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errs.append((f"{path}.{key}".lstrip("."), "is required"))
        props = schema.get("properties", {})
        for key, sub in props.items():
            if key in value:
                errs += schema_errors(value[key], sub, root, f"{path}.{key}".lstrip("."))
        extra = schema.get("additionalProperties")
        if isinstance(extra, dict):
            for key in value:
                if key not in props:
                    errs += schema_errors(value[key], extra, root, f"{path}.{key}".lstrip("."))
    for sub in schema.get("allOf", []):
        errs += schema_errors(value, sub, root, path)
    if "oneOf" in schema:
        passing = sum(1 for sub in schema["oneOf"] if not schema_errors(value, sub, root, path))
        if passing != 1:
            errs.append((here, "must match exactly one allowed form"))
    if "if" in schema and not schema_errors(value, schema["if"], root, path) and "then" in schema:
        errs += schema_errors(value, schema["then"], root, path)
    return errs


# ---------------------------------------------------------------------------
# Local deterministic validator
# ---------------------------------------------------------------------------

_FORBIDDEN_INPUTS = re.compile(
    r"\b(space\s*bar|spacebar|space|shift|ctrl|control key|alt|option key|tab|esc|escape|backspace|delete key|"
    r"cmd|command key|meta|right[- ]click|scroll(?: wheel)?|mouse wheel|f\d{1,2}|numpad|page up|page down|home key|end key)\b",
    re.IGNORECASE,
)
_LETTER_KEY = re.compile(r"\b(?i:press|hit|tap|hold)\s+([A-Z0-9])\b|\b([A-Z0-9])\s+(?i:key)\b")
_NUMBER = re.compile(r"(?<![\w.])(-?\d+(?:\.\d+)?)(\s*)([A-Za-z°%µ]+)?")
_RATIO = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?![\w.])")


def _ids(items: Any) -> List[str]:
    return [x.get("id") for x in items if isinstance(x, dict)] if isinstance(items, list) else []


def _num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _resolve_target(ref: Any, prefixes: List[str], npcs: set, locations: set) -> bool:
    if not isinstance(ref, str):
        return False
    kinds = {p.split(":")[0] for p in prefixes}
    if ":" in ref:
        kind, _, rid = ref.partition(":")
        return kind in kinds and ((kind == "npc" and rid in npcs) or (kind in ("location", "spot") and rid in locations))
    return ref in npcs or ref in locations


def _secret_values(level: Dict[str, Any]) -> List[Tuple[float, Optional[str]]]:
    """(value, unit) pairs a player must not be told: numeric targets and range bounds."""
    params, scoring = level.get("params") or {}, level.get("scoring") or {}
    units = {c.get("id"): c.get("unit") for c in (params.get("variables") or params.get("phases") or []) if isinstance(c, dict)}
    out: List[Tuple[float, Optional[str]]] = []
    terms = [(vid, t) for vid, t in (scoring.get("variables") or {}).items() if isinstance(t, dict)]
    terms += [(None, t) for t in (scoring.get("derived") or []) if isinstance(t, dict)]
    for vid, t in terms:
        unit = units.get(vid) if vid else None
        if _num(t.get("target")):
            out.append((float(t["target"]), unit))
        if isinstance(t.get("range"), list):
            out += [(float(b), unit) for b in t["range"] if _num(b)]
    return out


def find_leaks(text: str, secrets: List[Tuple[float, Optional[str]]]) -> List[Tuple[int, int]]:
    """Spans of text that reveal a secret value: a number with its unit, any number >= 10 or fractional, or a 1:N ratio."""
    spans: List[Tuple[int, int]] = []
    for m in _RATIO.finditer(text):
        a, b = float(m.group(1)), float(m.group(2))
        for value, _ in secrets:
            if (a == 1 and abs(b - value) < 1e-9) or (b == 1 and abs(a - value) < 1e-9):
                spans.append((m.start(), m.end()))
                break
    for m in _NUMBER.finditer(text):
        if any(s <= m.start() < e for s, e in spans):
            continue
        n, word = float(m.group(1)), m.group(3) or ""
        for value, unit in secrets:
            if abs(n - value) > 1e-9:
                continue
            has_unit = bool(unit and word and (word.lower() == unit.lower() or word.lower().startswith(unit.lower())))
            if has_unit or abs(value) >= 10 or not float(value).is_integer():
                spans.append((m.start(), m.end() if has_unit else m.end(1)))
                break
    return sorted(spans)


def _redact(text: str, spans: List[Tuple[int, int]]) -> str:
    for s, e in reversed(spans):
        text = text[:s] + REDACTED + text[e:]
    return text


def _feedback_strings(scoring: Dict[str, Any], path: str):
    """Yield (path, container, key) for every feedback string in a scoring spec."""
    def walk(node: Any, p: str, in_feedback: bool):
        if isinstance(node, dict):
            for k, v in node.items():
                sub = f"{p}.{k}"
                if isinstance(v, str) and (in_feedback or k == "feedback"):
                    yield sub, node, k
                else:
                    yield from walk(v, sub, in_feedback or k == "feedback")
        elif isinstance(node, list):
            for i, v in enumerate(node):
                yield from walk(v, f"{p}[{i}]", in_feedback)
    yield from walk(scoring, path, False)


def controls_hint_for(mechanic: str, actions: Dict[str, Any]) -> str:
    """A controls hint built from the mechanic's allowed controls in actions.json."""
    ctrls = actions["mechanics"][mechanic]["controls"]
    arrows = [name for cid, name in (("key_up", "Up"), ("key_down", "Down"), ("key_left", "Left"), ("key_right", "Right")) if cid in ctrls]
    parts = []
    if arrows:
        parts.append(f"{'/'.join(arrows)} arrows")
    if any(c.startswith("mouse_") for c in ctrls):
        parts.append("the mouse")
    if "interact" in ctrls:
        parts.append("Enter")
    return "Use " + (", ".join(parts[:-1]) + " and " + parts[-1] if len(parts) > 1 else parts[0]) + "."


class _Checker:
    def __init__(self, world: Dict[str, Any], rules: Dict[str, Any], repair: bool):
        self.world, self.rules, self.actions, self.repair = world, rules, rules["actions"], repair
        self.violations: List[Dict[str, str]] = []
        self.repairs: List[Dict[str, str]] = []

    def bad(self, path: str, rule: str, message: str) -> None:
        self.violations.append({"path": path, "rule": rule, "message": message})

    def fixed(self, path: str, rule: str, message: str) -> None:
        self.repairs.append({"path": path, "rule": rule, "message": message})

    def issue(self, path: str, rule: str, message: str, fix=None, fix_message: str = "") -> None:
        """Record a violation, or apply `fix` (a no-arg callable) and record the repair."""
        if self.repair and fix is not None:
            fix()
            self.fixed(path, rule, f"{message} -> {fix_message}")
        else:
            self.bad(path, rule, message)

    # -- world ---------------------------------------------------------------
    def run(self) -> None:
        w, actions = self.world, self.actions
        limits = actions.get("limits", {})
        mechanic_ids = set(limits.get("mechanic_ids", [])) & set(actions.get("mechanics", {}))
        n_levels = limits.get("levels_per_game", 4)

        if w.get("version") != 2:
            self.bad("version", "world.version", "world.version must be 2")
        if w.get("rulesVersion") != actions.get("version"):
            self.issue("rulesVersion", "world.rules_version", f"rulesVersion must be {actions.get('version')} (actions.json on main)",
                       lambda: w.__setitem__("rulesVersion", actions.get("version")), f"set to {actions.get('version')}")
        slug = w.get("slug")
        if isinstance(slug, str) and re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug) and w.get("branch") != f"game/{slug}":
            self.issue("branch", "world.branch", f"branch must be game/{slug}",
                       lambda: w.__setitem__("branch", f"game/{slug}"), f"set to game/{slug}")

        levels = w.get("levels")
        if not isinstance(levels, list):
            self.bad("levels", "levels.count", f"levels must be a list of exactly {n_levels}")
            levels = []
        if len(levels) > n_levels:
            keep = [lvl for lvl in levels if isinstance(lvl, dict) and lvl.get("mechanic") in mechanic_ids][:n_levels]
            if len(keep) == n_levels:
                self.issue("levels", "levels.count", f"{len(levels)} levels, exactly {n_levels} allowed",
                           lambda: w.__setitem__("levels", keep), f"kept the first {n_levels} with allowed mechanics")
                levels = w["levels"]
            else:
                self.bad("levels", "levels.count", f"{len(levels)} levels, exactly {n_levels} allowed")
        elif len(levels) < n_levels:
            self.bad("levels", "levels.count", f"{len(levels)} levels, exactly {n_levels} required")

        tasks = [lvl.get("task_id") for lvl in levels if isinstance(lvl, dict)]
        if len(set(tasks)) != len(tasks):
            self.bad("levels", "levels.distinct_tasks", "each level must implement a different research task (task_id)")
        ids = [lvl.get("id") for lvl in levels if isinstance(lvl, dict)]
        if len(set(ids)) != len(ids):
            self.bad("levels", "levels.distinct_ids", "level ids must be unique")

        self.npcs = set(_ids(w.get("npcs")))
        self.locations = set(_ids((w.get("map") or {}).get("locations")))
        if len(self.npcs) != len(_ids(w.get("npcs"))):
            self.bad("npcs", "world.ids", "npc ids must be unique")
        if len(self.locations) != len(_ids((w.get("map") or {}).get("locations"))):
            self.bad("map.locations", "world.ids", "location ids must be unique")
        self.walkable = self._walkable()

        for i, lvl in enumerate(levels):
            if not isinstance(lvl, dict):
                self.bad(f"levels[{i}]", "level.shape", "level must be an object")
                continue
            if lvl.get("index") != i + 1:
                self.issue(f"levels[{i}].index", "level.index", f"index must be {i + 1}",
                           lambda lvl=lvl, i=i: lvl.__setitem__("index", i + 1), f"set to {i + 1}")
            self.level(i, lvl, mechanic_ids)

        if self.rules.get("schema"):
            known = [v["path"] for v in self.violations]
            for path, msg in schema_errors(w, self.rules["schema"], self.rules["schema"]):
                # skip schema errors already explained by a rule violation on the same path
                if not any(path == k or path.startswith((k + ".", k + "[")) or k.startswith((path + ".", path + "[")) for k in known):
                    self.bad(path, "schema", f"{msg} (world.schema.json on main)")

    def _walkable(self) -> Optional[set]:
        m = self.world.get("map") or {}
        cols, rows = m.get("cols"), m.get("rows")
        if not (isinstance(cols, int) and isinstance(rows, int)):
            return None
        blocked = set()
        for s in m.get("solids") or []:
            if all(_num(s.get(k)) for k in ("x", "y", "w", "h")):
                blocked |= {(x, y) for x in range(int(s["x"]), int(s["x"] + s["w"])) for y in range(int(s["y"]), int(s["y"] + s["h"]))}
        blocked |= {tuple(n["tile"]) for n in self.world.get("npcs") or [] if isinstance(n, dict) and isinstance(n.get("tile"), list)}
        spawn = m.get("spawn")
        if not (isinstance(spawn, list) and len(spawn) == 2 and all(isinstance(t, int) for t in spawn)
                and 0 <= spawn[0] < cols and 0 <= spawn[1] < rows):
            self.bad("map.spawn", "world.spawn", "spawn must be a tile inside the map")
            return None
        if tuple(spawn) in blocked:
            self.bad("map.spawn", "world.spawn", "spawn is on a solid tile")
            return None
        seen, queue = {tuple(spawn)}, [tuple(spawn)]
        while queue:
            x, y = queue.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < cols and 0 <= ny < rows and (nx, ny) not in blocked and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    queue.append((nx, ny))
        return seen

    def _reachable(self, tiles: List[Tuple[int, int]]) -> bool:
        if self.walkable is None:
            return True
        return any((x + dx, y + dy) in self.walkable for x, y in tiles for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)))

    # -- level ---------------------------------------------------------------
    def level(self, i: int, lvl: Dict[str, Any], mechanic_ids: set) -> None:
        p, actions = f"levels[{i}]", self.actions
        mech = lvl.get("mechanic")
        if mech not in mechanic_ids:
            self.bad(f"{p}.mechanic", "mechanic.allowlist", f"unknown mechanic {mech!r}; allowed: {sorted(mechanic_ids)}")
            return
        rule = actions["mechanics"][mech]
        slug = self.world.get("slug")
        if isinstance(slug, str) and isinstance(lvl.get("id"), str) and not lvl["id"].startswith(f"{slug}-"):
            self.bad(f"{p}.id", "level.id", f"level id must be <job-slug>-<task-id> ({slug}-...)")

        if not isinstance(lvl.get("aim"), str) or not lvl["aim"].strip():
            self.issue(f"{p}.aim", "level.aim", "level has no aim",
                       lambda: lvl.__setitem__("aim", rule["aim"]), "used the mechanic aim from actions.json")
        metric = lvl.get("metric")
        if not isinstance(metric, dict) or not str(metric.get("name") or "").strip() or not str(metric.get("description") or "").strip():
            name = str((metric or {}).get("name") or "").strip() if isinstance(metric, dict) else ""
            fallback = {"name": name or f"{lvl.get('skill_name') or lvl.get('title') or 'Level'} score",
                        "description": "0-100 from the level's scoring rules"}
            self.issue(f"{p}.metric", "level.metric", "level has no metric {name, description}",
                       lambda: lvl.__setitem__("metric", fallback), f"set metric '{fallback['name']}'")

        hint = lvl.get("controls_hint")
        reason = None
        if not isinstance(hint, str) or not hint.strip():
            reason = "level has no controls_hint"
        else:
            letters = _allowed_letters(actions)
            found = [m.group(0) for m in _FORBIDDEN_INPUTS.finditer(hint)]
            found += [k for m in _LETTER_KEY.finditer(hint) for k in m.groups() if k and k not in letters]
            if found:
                reason = f"controls_hint uses unsupported inputs {found}; only arrows, mouse and Enter/E exist"
        if reason:
            self.issue(f"{p}.controls_hint", "controls.allowlist", reason,
                       lambda: lvl.__setitem__("controls_hint", controls_hint_for(mech, actions)), "rebuilt from actions.json controls")

        declared = lvl.get("controls")
        if isinstance(declared, list):
            bad = [c for c in declared if c not in rule["controls"]]
            if bad:
                self.issue(f"{p}.controls", "controls.allowlist", f"controls {bad} are not allowed for {mech}; allowed: {rule['controls']}",
                           lambda: lvl.__setitem__("controls", [c for c in declared if c in rule["controls"]]), "removed them")

        quest = lvl.get("quest") if isinstance(lvl.get("quest"), dict) else {}
        if quest.get("npc_id") not in self.npcs:
            self.bad(f"{p}.quest.npc_id", "level.quest", f"quest npc {quest.get('npc_id')!r} is not in npcs")
        if quest.get("location_id") not in self.locations:
            self.bad(f"{p}.quest.location_id", "level.quest", f"quest location {quest.get('location_id')!r} is not in map.locations")
        npc_tiles = {n["id"]: n.get("tile") for n in self.world.get("npcs") or [] if isinstance(n, dict) and "id" in n}
        locs = {loc["id"]: loc for loc in (self.world.get("map") or {}).get("locations") or [] if isinstance(loc, dict) and "id" in loc}
        npc_tile = npc_tiles.get(quest.get("npc_id"))
        if isinstance(npc_tile, list) and len(npc_tile) == 2 and not self._reachable([tuple(npc_tile)]):
            self.bad(f"{p}.quest.npc_id", "level.reachable", "the quest NPC cannot be reached by walking from spawn")
        loc = locs.get(quest.get("location_id"))
        if loc and isinstance(loc.get("tile"), list) and len(loc["tile"]) == 2:
            tx, ty = loc["tile"]
            if not self._reachable([(tx + dx, ty + dy) for dx in range(int(loc.get("w", 1))) for dy in range(int(loc.get("h", 1)))]):
                self.bad(f"{p}.quest.location_id", "level.reachable", "the quest location cannot be reached by walking from spawn")
        for j, line in enumerate(lvl.get("dialogue") or []):
            if isinstance(line, dict) and line.get("npc_id") not in self.npcs:
                self.bad(f"{p}.dialogue[{j}].npc_id", "level.dialogue", f"dialogue npc {line.get('npc_id')!r} is not in npcs")

        params = lvl.get("params")
        scoring = lvl.get("scoring")
        if not isinstance(params, dict) or not isinstance(scoring, dict):
            self.bad(f"{p}.params", "params.required", "level needs params and scoring objects")
            return
        self.params(p, mech, rule, params)
        self.scoring(p, lvl, mech, params, scoring)
        self.leaks(p, lvl)

    def params(self, p: str, mech: str, rule: Dict[str, Any], params: Dict[str, Any]) -> None:
        for name in [k for k in params if k not in rule["params"]]:
            self.issue(f"{p}.params.{name}", "params.unknown", f"params.{name} is not a {mech} param; allowed: {sorted(rule['params'])}",
                       lambda name=name: params.pop(name), "removed it")
        for name, desc in rule["params"].items():
            spec = param_spec(desc, name)
            value = params.get(name)
            if value is None:
                if not spec["optional"]:
                    self.bad(f"{p}.params.{name}", "params.required", f"{mech} requires params.{name} ({desc})")
                continue
            if "integer_min" in spec and (not isinstance(value, int) or isinstance(value, bool) or value < spec["integer_min"]):
                self.bad(f"{p}.params.{name}", "params.value", f"params.{name} must be an integer >= {spec['integer_min']}")
            if spec["fields"] is not None:
                self._items(f"{p}.params.{name}", name, value, spec["fields"], spec["bounds"])
        if "station_id" in rule["params"] and params.get("station_id") not in self.locations:
            self.bad(f"{p}.params.station_id", "params.ref", f"station {params.get('station_id')!r} is not in map.locations")
        if mech == "converse" and params.get("npc_id") not in self.npcs:
            self.bad(f"{p}.params.npc_id", "params.ref", f"npc {params.get('npc_id')!r} is not in npcs")
        for key in ("variables", "phases", "items", "bins", "orders", "turns", "ingredients"):
            ids = _ids(params.get(key))
            if len(set(ids)) != len(ids):
                self.bad(f"{p}.params.{key}", "params.ids", f"params.{key} ids must be unique")
        for j, c in enumerate(params.get("variables") or params.get("phases") or []):
            if not isinstance(c, dict) or not all(_num(c.get(k)) for k in ("min", "max")):
                continue
            q = f"{p}.params.{'variables' if mech == 'mix' else 'phases'}[{j}]"
            if c["min"] >= c["max"]:
                self.bad(q, "params.range", "min must be below max")
            if mech == "mix":
                if not _num(c.get("step")) or c["step"] <= 0:
                    self.bad(f"{q}.step", "params.range", "step must be > 0")
                if _num(c.get("default")) and not c["min"] <= c["default"] <= c["max"]:
                    clamped = min(max(c["default"], c["min"]), c["max"])
                    self.issue(f"{q}.default", "params.range", "default lies outside min/max",
                               lambda c=c, v=clamped: c.__setitem__("default", v), f"clamped to {clamped}")
            if mech == "timing":
                if c.get("mode") == "stop" and not (_num(c.get("period_ms")) and c["period_ms"] > 0):
                    self.bad(f"{q}.period_ms", "params.value", "stop phases need period_ms > 0")
                if c.get("mode") == "hold" and not (_num(c.get("fill_per_s")) and c["fill_per_s"] > 0):
                    self.bad(f"{q}.fill_per_s", "params.value", "hold phases need fill_per_s > 0")
        if mech == "deliver":
            m = self.world.get("map") or {}
            tile = params.get("start_tile")
            if not (isinstance(tile, list) and len(tile) == 2 and all(isinstance(t, int) for t in tile)
                    and 0 <= tile[0] < m.get("cols", 0) and 0 <= tile[1] < m.get("rows", 0)):
                self.bad(f"{p}.params.start_tile", "params.value", "start_tile must be [col, row] inside the map")
            prefixes = rule.get("target_prefixes", [])
            for j, order in enumerate(params.get("orders") or []):
                for end in ("from", "to"):
                    if isinstance(order, dict) and not _resolve_target(order.get(end), prefixes, self.npcs, self.locations):
                        self.bad(f"{p}.params.orders[{j}].{end}", "params.ref", f"order {end} {order.get(end)!r} is not an npc/location target")

    def _items(self, path: str, name: str, value: Any, fields: Dict[str, Dict[str, Any]], bounds: Dict[Optional[str], Tuple[int, int]]) -> None:
        if not isinstance(value, list):
            self.bad(path, "params.value", f"params.{name} must be a list")
            return
        lo, hi = bounds.get(None, (0, 10 ** 9))
        if not lo <= len(value) <= hi:
            self.bad(path, "params.count", f"params.{name} needs {lo}-{hi} entries, has {len(value)}")
        for j, item in enumerate(value):
            if not isinstance(item, dict):
                self.bad(f"{path}[{j}]", "params.value", "entry must be an object")
                continue
            for fname, fspec in fields.items():
                if fname not in item:
                    if not fspec["optional"]:
                        self.bad(f"{path}[{j}].{fname}", "params.required", f"missing {fname}")
                    continue
                if "enum" in fspec and item[fname] not in fspec["enum"]:
                    self.bad(f"{path}[{j}].{fname}", "params.value", f"{fname} must be one of {fspec['enum']}")
                if fspec.get("fields"):
                    self._items(f"{path}[{j}].{fname}", fname, item[fname], fspec["fields"], {None: bounds[fname]} if fname in bounds else {})

    def scoring(self, p: str, lvl: Dict[str, Any], mech: str, params: Dict[str, Any], scoring: Dict[str, Any]) -> None:
        q = f"{p}.scoring"
        thr = scoring.get("pass_threshold")
        if not _num(thr) or not 0 <= thr <= 100:
            default = _default_pass_threshold(self.actions) if not _num(thr) else min(max(thr, 0), 100)
            self.issue(f"{q}.pass_threshold", "scoring.pass_threshold", "pass_threshold must be a number 0-100",
                       lambda: scoring.__setitem__("pass_threshold", default), f"set to {default}")
        curves = set(self.actions.get("scoring_spec", {}).get("numeric_term", {}).get("curves", {}))

        if mech in ("mix", "timing"):
            key = "variables" if mech == "mix" else "phases"
            controls = [c for c in params.get(key) or [] if isinstance(c, dict) and "id" in c]
            by_id = {c["id"]: c for c in controls}
            terms = scoring.get("variables") if isinstance(scoring.get("variables"), dict) else {}
            for vid in [v for v in terms if v not in by_id]:
                self.issue(f"{q}.variables.{vid}", "scoring.terms", f"scoring term {vid!r} has no matching {key[:-1]}",
                           lambda vid=vid: terms.pop(vid), "removed the term")
            in_derived = {i for d in scoring.get("derived") or [] if isinstance(d, dict) and isinstance(d.get("expr"), str) for i in parse_expr(d["expr"])[2]}
            unscored = [vid for vid in by_id if vid not in terms and vid not in in_derived]
            for vid in unscored:
                def drop(vid=vid):
                    params[key] = [c for c in params[key] if not (isinstance(c, dict) and c.get("id") == vid)]

                self.issue(f"{p}.params.{key}.{vid}", "scoring.terms", f"{key[:-1]} {vid!r} has no scoring term",
                           drop if len(by_id) > len(unscored) else None, "removed the unscored control")
            for vid, term in terms.items():
                self._term(f"{q}.variables.{vid}", term, curves, by_id.get(vid))
            names = set(by_id)
            for j, d in enumerate(scoring.get("derived") or []):
                dp = f"{q}.derived[{j}]"
                if not isinstance(d, dict) or not all(isinstance(d.get(k), str) and d[k] for k in ("id", "label", "expr")):
                    self.bad(dp, "scoring.derived", "derived terms need id, label and expr")
                    continue
                if d["id"] in names:
                    self.bad(f"{dp}.id", "scoring.derived", f"derived id {d['id']!r} clashes with a variable")
                _, err, idents = parse_expr(d["expr"])
                if err:
                    self.bad(f"{dp}.expr", "scoring.expr", f"expr {d['expr']!r} breaks the grammar: {err}")
                unknown = sorted(set(idents) - names)
                if unknown:
                    self.bad(f"{dp}.expr", "scoring.expr", f"expr uses unknown identifiers {unknown}")
                self._term(dp, d, curves, None)
            order = scoring.get("order")
            if isinstance(order, dict):
                if set(order.get("expected") or []) - set(_ids(params.get("ingredients"))):
                    self.bad(f"{q}.order.expected", "scoring.terms", "order.expected uses unknown ingredients")
            if not any(v["path"].startswith(q) or v["path"].startswith(f"{p}.params") for v in self.violations) and terms and controls and _num(scoring.get("pass_threshold")):
                ctrl = controls if mech == "mix" else [{**c, "step": (c["max"] - c["min"]) / 400} for c in controls]
                best = best_numeric_score(ctrl, scoring)
                if best < scoring["pass_threshold"]:
                    self.bad(q, "scoring.reachable", f"best reachable score {best} is below pass_threshold {scoring['pass_threshold']}")

        elif mech == "sort":
            items, bins = set(_ids(params.get("items"))), set(_ids(params.get("bins")))
            correct = scoring.get("correct") if isinstance(scoring.get("correct"), dict) else {}
            if set(correct) != items:
                self.bad(f"{q}.correct", "scoring.terms", "scoring.correct must map every item id, and only item ids")
            if set(correct.values()) - bins:
                self.bad(f"{q}.correct", "scoring.terms", f"scoring.correct uses unknown bins {sorted(set(correct.values()) - bins)}")
            for key in ("weights", "feedback"):
                extra = set(scoring.get(key) or {}) - items
                if extra:
                    self.bad(f"{q}.{key}", "scoring.terms", f"scoring.{key} has unknown items {sorted(extra)}")
            for iid, wt in (scoring.get("weights") or {}).items():
                if not _num(wt) or wt <= 0:
                    self.bad(f"{q}.weights.{iid}", "scoring.value", "weights must be > 0")

        elif mech == "deliver":
            weights = scoring.get("weights") if isinstance(scoring.get("weights"), dict) else {}
            for k in ("accuracy", "time"):
                if not _num(weights.get(k)) or weights[k] < 0:
                    self.bad(f"{q}.weights.{k}", "scoring.terms", f"deliver scoring needs weights.{k} >= 0")
            if _num(weights.get("accuracy")) and _num(weights.get("time")) and weights["accuracy"] + weights["time"] <= 0:
                self.bad(f"{q}.weights", "scoring.terms", "deliver weights must not sum to 0")
            missing = [k for k in ("wrong_target", "late", "missed") if k not in (scoring.get("feedback") or {})]
            if missing:
                self.bad(f"{q}.feedback", "scoring.terms", f"deliver feedback needs {missing}")
            par = params.get("par_ms")
            if not _num(par) or par <= 0:
                self.bad(f"{p}.params.par_ms", "params.value", "par_ms must be > 0")
            limit = lvl.get("time_limit_ms")
            if not _num(limit):
                self.issue(f"{p}.time_limit_ms", "level.time_limit", "deliver levels need time_limit_ms",
                           (lambda: lvl.__setitem__("time_limit_ms", int(par * 2))) if _num(par) and par > 0 else None, "set to 2 x par_ms")
            elif _num(par) and par >= limit:
                self.bad(f"{p}.params.par_ms", "params.value", "par_ms must be below time_limit_ms")

        elif mech == "converse":
            turns = {t.get("id"): t for t in params.get("turns") or [] if isinstance(t, dict)}
            spec = scoring.get("turns") if isinstance(scoring.get("turns"), dict) else {}
            if set(spec) != set(turns):
                self.bad(f"{q}.turns", "scoring.terms", "scoring.turns must cover every turn id, and only turn ids")
            best = []
            for tid, turn in turns.items():
                opts, scored = set(_ids(turn.get("options"))), spec.get(tid) or {}
                if set(scored) != opts:
                    self.bad(f"{q}.turns.{tid}", "scoring.terms", "scoring must cover every option of the turn, and only those")
                pts = [o.get("points") for o in scored.values() if isinstance(o, dict)]
                if any(not _num(x) or not 0 <= x <= 1 for x in pts):
                    self.bad(f"{q}.turns.{tid}", "scoring.value", "points must be 0..1")
                best.append(max([x for x in pts if _num(x)] or [0]))
            if best and _num(scoring.get("pass_threshold")) and 100 * sum(best) / len(best) < scoring["pass_threshold"]:
                self.bad(q, "scoring.reachable", "the best answers cannot reach pass_threshold")

    def _term(self, path: str, term: Any, curves: set, control: Optional[Dict[str, Any]]) -> None:
        if not isinstance(term, dict):
            self.bad(path, "scoring.term", "term must be an object")
            return
        if ("target" in term) == ("range" in term):
            self.bad(path, "scoring.term", "term needs exactly one of target or range")
        if "target" in term and not _num(term["target"]):
            self.bad(f"{path}.target", "scoring.term", "target must be a number")
        if "range" in term and not (isinstance(term["range"], list) and len(term["range"]) == 2 and all(_num(x) for x in term["range"]) and term["range"][0] <= term["range"][1]):
            self.bad(f"{path}.range", "scoring.term", "range must be [lo, hi] with lo <= hi")
        for k in ("tolerance", "weight"):
            if not _num(term.get(k)) or term[k] <= 0:
                self.bad(f"{path}.{k}", "scoring.term", f"{k} must be > 0")
        if term.get("curve") not in curves:
            self.bad(f"{path}.curve", "scoring.term", f"curve must be one of {sorted(curves)}")
        fb = term.get("feedback")
        if not isinstance(fb, dict) or not all(isinstance(fb.get(k), str) and fb[k].strip() for k in ("too_low", "too_high")):
            self.bad(f"{path}.feedback", "scoring.term", "feedback needs too_low and too_high messages")
        if control and _num(control.get("min")) and _num(control.get("max")):
            bounds = [term["target"]] if _num(term.get("target")) else [x for x in term.get("range") or [] if _num(x)]
            if bounds and (min(bounds) < control["min"] or max(bounds) > control["max"]):
                lo, hi = min(control["min"], min(bounds)), max(control["max"], max(bounds))

                def widen(c=control, lo=lo, hi=hi):
                    c["min"], c["max"] = lo, hi

                self.issue(path, "scoring.target_in_range", f"target lies outside the control's min/max [{control['min']}, {control['max']}]",
                           widen, f"widened the control to [{lo}, {hi}]")

    def leaks(self, p: str, lvl: Dict[str, Any]) -> None:
        secrets = _secret_values(lvl)
        if not secrets:
            return
        spots = [(f"{p}.{k}", lvl, k) for k in ("aim", "controls_hint") if isinstance(lvl.get(k), str)]
        spots += list(_feedback_strings(lvl.get("scoring") or {}, f"{p}.scoring"))
        for path, container, key in spots:
            spans = find_leaks(container[key], secrets)
            if spans:
                revealed = [container[key][s:e] for s, e in spans]
                self.issue(path, "hidden_target", f"reveals a scoring target {revealed}; say what to achieve, not the answer",
                           lambda c=container, k=key, s=spans: c.__setitem__(k, _redact(c[k], s)), f"replaced with '{REDACTED}'")


def validate_world(world: Dict[str, Any], rules: Dict[str, Any], repair: bool = False) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """Local deterministic check. With repair=True the world is fixed in place where safe. Returns (violations, repairs)."""
    checker = _Checker(world, rules, repair)
    checker.run()
    return checker.violations, checker.repairs


# ---------------------------------------------------------------------------
# Entire Graph
# ---------------------------------------------------------------------------

def entire_bin() -> Optional[str]:
    """The entire CLI; ENTIRE_BIN, when set, is the only candidate."""
    override = os.environ.get("ENTIRE_BIN")
    candidates = [override] if override else [shutil.which("entire"), str(Path.home() / ".local" / "bin" / "entire")]
    return next((c for c in candidates if c and Path(c).is_file() and os.access(c, os.X_OK)), None)


def _entire(*args: str, cwd: Optional[Path] = None, timeout: int = 120) -> str:
    binary = entire_bin()
    if not binary:
        raise FileNotFoundError("entire CLI not found (set ENTIRE_BIN or install https://docs.entire.io/installation)")
    out = subprocess.run([binary, *args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"entire {' '.join(args[:2])} failed: {(out.stderr or out.stdout).strip()[:300]}")
    return out.stdout


def graph_version() -> str:
    return json.loads(_entire("graph", "version", "--json", timeout=30)).get("version", "unknown")


def _rules_cache_root() -> Path:
    return Path(os.environ.get("REPLACEME_RULES_GRAPH_DIR") or Path(tempfile.gettempdir()) / "replaceme-rules-graph")


def publish_rules(repo_root: Path = WORKSPACE_ROOT, ref: str = RULES_REF, rules: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Publish main's rule files into Entire Graph: a content-addressed git repo holding
    shared/actions.json + world.schema.json from `ref`, indexed with `entire graph index`
    and snapshotted to rules.compact.ndjson for `entire graph snapshot-query`."""
    rules = rules or load_rules(repo_root, ref)
    files = rules.get("raw") or {RULES_PATH: json.dumps(rules["actions"], indent=2) + "\n"}
    key = hashlib.sha256("".join(f"{k}\0{v}\0" for k, v in sorted(files.items())).encode()).hexdigest()[:16]
    target = _rules_cache_root() / key
    manifest_file = target / "manifest.json"
    if manifest_file.exists() and (target / "rules.compact.ndjson").exists():
        manifest = json.loads(manifest_file.read_text())
        manifest.update(rules_commit=rules.get("commit"), rules_ref=rules.get("ref"), cache_hit=True)
        return manifest

    target.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=f"{key}-", dir=target.parent))
    repo = work / "repo"
    for rel, text in files.items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text, encoding="utf-8")
    stamp = "2000-01-01T00:00:00Z"
    env = {"GIT_AUTHOR_NAME": "ReplaceMe rules", "GIT_AUTHOR_EMAIL": "rules@replaceme.local", "GIT_AUTHOR_DATE": stamp,
           "GIT_COMMITTER_NAME": "ReplaceMe rules", "GIT_COMMITTER_EMAIL": "rules@replaceme.local", "GIT_COMMITTER_DATE": stamp}
    _git(repo, "init", "-q", "-b", "main")
    _git(repo, "add", ".")
    _git(repo, "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", f"ReplaceMe platform rules v{rules['actions'].get('version')}", env=env)
    index = json.loads(_entire("graph", "index", "--repo", str(repo), "--format", "json", cwd=repo))
    snapshot = work / "rules.compact.ndjson"
    snapshot.write_text(_entire("graph", "snapshot", "--repo", str(repo), "--format", "compact-ndjson", cwd=repo), encoding="utf-8")
    manifest = {
        "provider": index.get("provider", "entire-graph"),
        "provider_version": index.get("provider_version"),
        "rules_version": rules["actions"].get("version"),
        "rules_ref": rules.get("ref"),
        "rules_commit": rules.get("commit"),
        "graph_commit": index.get("commit"),
        "graph_tree": index.get("tree"),
        "counts": index.get("counts", {}),
        "files": sorted(files),
        "repo": str(target / "repo"),
        "snapshot": str(target / "rules.compact.ndjson"),
    }
    (work / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    try:
        work.rename(target)
    except OSError:  # another builder published the same rules first
        shutil.rmtree(work, ignore_errors=True)
        return {**json.loads(manifest_file.read_text()), "rules_commit": rules.get("commit"), "cache_hit": True}
    return {**manifest, "cache_hit": False}


class _RulesGraph:
    """Resolves rule names as symbols in the published compact snapshot of shared/actions.json."""

    def __init__(self, manifest: Dict[str, Any], actions: Dict[str, Any]):
        self.snapshot, self.cache = manifest["snapshot"], {}
        self.sections = self._ranges(list(actions), 0, None)

    def lines(self, name: str) -> List[int]:
        if name not in self.cache:
            out = _entire("graph", "snapshot-query", "--input", self.snapshot, "--symbol", name, "--format", "ndjson", timeout=30)
            recs = [json.loads(line) for line in out.splitlines() if line.strip()]
            self.cache[name] = sorted(r["start_line"] for r in recs if r.get("record_type") == "symbol" and r.get("file_path") == RULES_PATH and r.get("name") == name)
        return self.cache[name]

    def _ranges(self, keys: List[str], after: int, end: Optional[int]) -> Dict[str, Tuple[int, int]]:
        """Line ranges of consecutive JSON keys (in file order) between `after` and `end`."""
        starts: List[Tuple[str, int]] = []
        for key in keys:
            line = next((n for n in self.lines(key) if n > (starts[-1][1] if starts else after) and (end is None or n <= end)), None)
            if line is None:
                continue
            starts.append((key, line))
        return {k: (s, (starts[i + 1][1] - 1) if i + 1 < len(starts) else (end or 10 ** 9)) for i, (k, s) in enumerate(starts)}

    def find(self, name: str, within: Optional[Tuple[int, int]]) -> Optional[int]:
        if not within:
            return None
        return next((n for n in self.lines(name) if within[0] < n <= within[1]), None)


def query_rules_graph(world: Dict[str, Any], actions: Dict[str, Any], manifest: Dict[str, Any]) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    """Resolve every mechanic, control, required param and curve the world uses in main's rules graph."""
    graph = _RulesGraph(manifest, actions)
    violations: List[Dict[str, str]] = []
    evidence: List[Dict[str, Any]] = []
    mechanics = graph._ranges(list(actions.get("mechanics", {})), *graph.sections.get("mechanics", (0, 0)))
    controls_section = graph.sections.get("controls")
    curves_line = graph.find("curves", graph.sections.get("scoring_spec"))
    curves_section = (curves_line, graph.sections["scoring_spec"][1]) if curves_line else None

    def resolve(kind: str, name: str, within: Optional[Tuple[int, int]], path: str, where: str) -> None:
        line = graph.find(name, within)
        if line is None:
            violations.append({"path": path, "rule": f"graph.{kind}", "message": f"{kind} {name!r} is not defined under {where} in main's rules graph ({RULES_PATH})"})
        elif not any(e["kind"] == kind and e["name"] == name for e in evidence):
            evidence.append({"kind": kind, "name": name, "at": f"{RULES_PATH}:{line}"})

    for i, lvl in enumerate(world.get("levels") or []):
        if not isinstance(lvl, dict):
            continue
        mech = lvl.get("mechanic")
        resolve("mechanic", str(mech), graph.sections.get("mechanics"), f"levels[{i}].mechanic", "mechanics")
        block = mechanics.get(str(mech))
        if not block:
            continue
        rule = actions["mechanics"].get(mech, {})
        for ctrl in list(rule.get("controls", [])) + [c for c in lvl.get("controls") or [] if isinstance(c, str)]:
            resolve("control", ctrl, controls_section, f"levels[{i}].controls", "controls")
        # The graph keeps one symbol per JSON key name, so a param resolves within the mechanics
        # section; the local validator checks params per mechanic.
        for name in (lvl.get("params") or {}):
            resolve("param", name, graph.sections.get("mechanics"), f"levels[{i}].params.{name}", "mechanics.*.params")
        scoring = lvl.get("scoring") or {}
        terms = list((scoring.get("variables") or {}).values()) + list(scoring.get("derived") or [])
        for term in terms:
            if isinstance(term, dict) and isinstance(term.get("curve"), str):
                resolve("curve", term["curve"], curves_section, f"levels[{i}].scoring", "scoring_spec.numeric_term.curves")
    return violations, evidence


def graph_branch_scope(repo_root: Path, branch: str, slug: str, base: str = RULES_REF) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
    """`entire graph diff` from the merge-base with main: a game branch may only add games/<slug>/."""
    merge_base = _git(Path(repo_root), "merge-base", base, branch).strip()
    diff = json.loads(_entire("graph", "diff", "--base", merge_base, "--head", branch, "--json", "--repo", str(repo_root), cwd=Path(repo_root)))
    violations = []
    entities = 0
    for f in diff.get("files", []):
        entities += len(f.get("changes", []))
        if not f.get("path", "").startswith(f"games/{slug}/"):
            names = [c.get("name") for c in f.get("changes", [])][:6]
            violations.append({"path": f.get("path", ""), "rule": "graph.branch_scope",
                               "message": f"game branch changes platform file {f.get('path')} (entities {names}); only games/{slug}/ may change"})
    return violations, {"base": merge_base, "head": branch, "files": len(diff.get("files", [])), "entities": entities}


# ---------------------------------------------------------------------------
# Check, report, commit
# ---------------------------------------------------------------------------

def check_world(world: Dict[str, Any], repo_root: Path = WORKSPACE_ROOT, *, ref: str = RULES_REF,
                repair: bool = False, use_graph: bool = True, rules: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Check (and with repair=True fix in place) a world against main's rules. Returns graph_report."""
    rules = rules or load_rules(repo_root, ref)
    violations, repairs = validate_world(world, rules, repair=repair)
    graph: Dict[str, Any] = {"status": "skipped"}
    if use_graph:
        try:
            manifest = publish_rules(repo_root, ref, rules)
            graph_violations, evidence = query_rules_graph(world, rules["actions"], manifest)
            violations += graph_violations
            graph = {
                "status": "fail" if graph_violations else "pass",
                "provider": manifest.get("provider"), "provider_version": manifest.get("provider_version"),
                "rules_graph_commit": manifest.get("graph_commit"), "rule_symbols": manifest.get("counts", {}).get("symbols"), "resolved": len(evidence), "evidence": evidence,
            }
        except (FileNotFoundError, RuntimeError, subprocess.SubprocessError, OSError, ValueError, KeyError) as exc:
            graph = {"status": "unavailable", "reason": str(exc)[:300]}
    return {
        "ok": not violations,
        "rules_version": rules["actions"].get("version"),
        "rules_commit": rules.get("commit"),
        "rules_source": rules.get("source"),
        "slug": world.get("slug"),
        "branch": world.get("branch"),
        "violations": violations,
        "repairs": repairs,
        "graph": graph,
        "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def commit_message(report: Dict[str, Any], world: Dict[str, Any]) -> str:
    g = report.get("graph", {})
    graph_line = {
        "pass": f"pass ({g.get('provider')} {g.get('provider_version')}, {g.get('resolved')} rule symbols resolved)",
        "fail": f"fail ({len([v for v in report['violations'] if v['rule'].startswith('graph.')])} unresolved)",
    }.get(g.get("status"), f"{g.get('status')} ({g.get('reason', 'local validator only')})")
    mechanics = ", ".join(str(lvl.get("mechanic")) for lvl in world.get("levels", []))
    commit = report.get("rules_commit") or "working-tree"
    return (
        f"game({world.get('slug')}): {world.get('title', world.get('slug'))} - rules check {'passed' if report['ok'] else 'FAILED'}\n\n"
        f"Validated games/{world.get('slug')}/world.json against {RULES_REF}@{commit[:10]} {RULES_PATH} "
        f"v{report.get('rules_version')} ({len(world.get('levels', []))} levels: {mechanics}). "
        f"Repairs applied: {len(report.get('repairs', []))}.\n\n"
        f"Rules-Check: {'ok' if report['ok'] else 'failed'}\n"
        f"Rules-Version: {report.get('rules_version')}\n"
        f"Rules-Commit: {commit}\n"
        f"Entire-Graph: {graph_line}\n"
        f"Graph-Report: games/{world.get('slug')}/graph_report.json\n"
    )


def write_game_files(world: Dict[str, Any], report: Dict[str, Any], repo_root: Path) -> Path:
    """Write graph_report.json, and world.json only when it passed (GET /api/world serves games/<slug>/world.json first)."""
    game_dir = Path(repo_root) / "games" / str(world["slug"])
    game_dir.mkdir(parents=True, exist_ok=True)
    if report["ok"]:
        (game_dir / "world.json").write_text(json.dumps(world, indent=2) + "\n", encoding="utf-8")
    (game_dir / "graph_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return game_dir


def commit_game_branch(world: Dict[str, Any], report: Dict[str, Any], repo_root: Path) -> Dict[str, Any]:
    """Commit games/<slug>/ on game/<slug> (from main) through a temporary worktree, then index it in Entire Graph."""
    if not report.get("ok"):
        raise GraphCheckError(report)
    repo_root, slug = Path(repo_root), str(world["slug"])
    branch = f"game/{slug}"
    tmp = Path(tempfile.mkdtemp(prefix=f"game-{slug}-"))
    shutil.rmtree(tmp)
    _git(repo_root, "worktree", "prune")
    _git(repo_root, "worktree", "add", "-q", "-B", branch, str(tmp), RULES_REF)
    try:
        shutil.copytree(repo_root / "games" / slug, tmp / "games" / slug, dirs_exist_ok=True)
        _git(tmp, "add", "-f", f"games/{slug}")
        ident = [] if _git(repo_root, "config", "--default", "", "user.email").strip() else ["-c", "user.name=ReplaceMe Builder", "-c", "user.email=builder@replaceme.local"]
        _git(tmp, *ident, "commit", "-q", "--allow-empty", "-m", commit_message(report, world))
        sha = _git(tmp, "rev-parse", "HEAD").strip()
        recorded: Dict[str, Any] = {"branch": branch, "commit": sha}
        try:
            index = json.loads(_entire("graph", "index", "--repo", str(tmp), "--format", "json", cwd=tmp))
            recorded["graph_index"] = {"commit": index.get("commit"), "tree": index.get("tree"), "counts": index.get("counts")}
            scope_violations, scope = graph_branch_scope(repo_root, branch, slug)
            recorded["graph_branch_scope"] = {**scope, "ok": not scope_violations, "violations": scope_violations}
        except (FileNotFoundError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
            recorded["graph_index"] = {"status": "unavailable", "reason": str(exc)[:300]}
        return recorded
    finally:
        subprocess.run(["git", "worktree", "remove", "--force", str(tmp)], cwd=repo_root, capture_output=True)


def finalize_world(world: Dict[str, Any], repo_root: Path = WORKSPACE_ROOT, *, ref: str = RULES_REF, commit: bool = True) -> Dict[str, Any]:
    """Builder call site: check -> repair -> re-check -> write games/<slug>/ -> commit on game/<slug>.
    Raises GraphCheckError (after writing graph_report.json) if the world still fails. Legacy v1 worlds pass through."""
    if world.get("version") != 2:
        print("[graph_check] skipped: legacy v1 world (v2 worlds are checked against main's rules)")
        return world
    rules = load_rules(repo_root, ref)
    world = copy.deepcopy(world)
    first = check_world(world, repo_root, ref=ref, repair=True, rules=rules)
    report = check_world(world, repo_root, ref=ref, rules=rules)
    report["repairs"] = first["repairs"]
    write_game_files(world, report, repo_root)
    print(f"[graph_check] {world.get('slug')}: ok={report['ok']} violations={len(report['violations'])} "
          f"repairs={len(report['repairs'])} graph={report['graph'].get('status')}")
    if not report["ok"]:
        raise GraphCheckError(report)
    if commit:
        recorded = commit_game_branch(world, report, repo_root)
        scope = recorded.get("graph_branch_scope")
        print(f"[graph_check] committed {recorded['branch']} {recorded['commit'][:10]}"
              + (f"; graph branch scope ok={scope['ok']} ({scope['entities']} entities)" if scope else ""))
        for v in (scope or {}).get("violations", []):
            print(f"[graph_check] warning: {v['message']}")
    return world


def check_branch(branch: str, repo_root: Path = WORKSPACE_ROOT, ref: str = RULES_REF) -> Dict[str, Any]:
    """Re-check a committed game branch: its world against main's rules, plus the graph diff scope."""
    slug = branch.split("/", 1)[1]
    world = json.loads(_git(Path(repo_root), "show", f"{branch}:games/{slug}/world.json"))
    report = check_world(world, repo_root, ref=ref)
    try:
        scope_violations, scope = graph_branch_scope(repo_root, branch, slug, ref)
        report["violations"] += scope_violations
        report["graph"]["branch_scope"] = scope
        report["ok"] = not report["violations"]
    except (FileNotFoundError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
        report["graph"]["branch_scope"] = {"status": "unavailable", "reason": str(exc)[:300]}
    return report


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Check a generated world against the platform rules on main (Entire Graph + local validator)")
    parser.add_argument("world", nargs="?", help="path to a world.json")
    parser.add_argument("--branch", help="check a committed game/<slug> branch instead")
    parser.add_argument("--ref", default=RULES_REF, help="git ref holding the rules (default: main)")
    parser.add_argument("--repair", action="store_true", help="apply deterministic repairs before reporting")
    parser.add_argument("--write", action="store_true", help="write the (repaired) world and graph_report.json next to the input")
    parser.add_argument("--no-graph", action="store_true", help="skip Entire Graph (local validator only)")
    args = parser.parse_args()
    if not args.world and not args.branch:
        parser.error("give a world.json path or --branch game/<slug>")

    if args.branch:
        result = check_branch(args.branch, WORKSPACE_ROOT, args.ref)
    else:
        world_path = Path(args.world)
        data = json.loads(world_path.read_text(encoding="utf-8"))
        result = check_world(data, WORKSPACE_ROOT, ref=args.ref, repair=args.repair, use_graph=not args.no_graph)
        if args.repair:
            result = {**check_world(data, WORKSPACE_ROOT, ref=args.ref, use_graph=not args.no_graph), "repairs": result["repairs"]}
        if args.write:
            world_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            (world_path.parent / "graph_report.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["ok"] else 1)
