"""
Platform action allowlist (shared/actions.json) for the actor.

Every action the actor sends goes through `Allowlist.validate()` first. It checks the control is on
the allowlist, allowed for the level's mechanic and currently offered by the page (`listActions()`),
coerces params to their schema (ints rounded and clamped, unknown params dropped, defaults filled)
and rejects anything it cannot repair. See shared/game_contract.md sections c and d.
"""

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
ACTIONS_PATH = WORKSPACE_ROOT / "shared" / "actions.json"


class ActionRejected(ValueError):
    """Raised when an action cannot be repaired into a valid allowlisted action."""


class Allowlist:
    def __init__(self, rules: Dict[str, Any]):
        self.rules = rules
        self.version = rules.get("version")
        self.controls: Dict[str, Dict[str, Any]] = rules["controls"]
        self.mechanics: Dict[str, Dict[str, Any]] = rules["mechanics"]
        self.attempts_per_level = int(rules.get("limits", {}).get("attempts_per_level", 10))

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "Allowlist":
        return cls(json.loads((path or ACTIONS_PATH).read_text(encoding="utf-8")))

    def mechanic_controls(self, mechanic: Optional[str]) -> List[str]:
        if mechanic and mechanic in self.mechanics:
            return list(self.mechanics[mechanic]["controls"])
        return list(self.controls)

    def allowed(self, observation: Optional[Dict[str, Any]], offered: Optional[Iterable[str]] = None) -> List[str]:
        """Controls valid now: the mechanic's allowlist intersected with what the page offers."""
        mechanic = (observation or {}).get("mechanic") if (observation or {}).get("level_id") else None
        names = [c for c in self.mechanic_controls(mechanic) if c in self.controls]
        if offered is not None:
            offered_set = set(offered)
            names = [c for c in names if c in offered_set]
        return names

    def validate(
        self,
        action: Dict[str, Any],
        observation: Optional[Dict[str, Any]] = None,
        offered: Optional[Iterable[str]] = None,
    ) -> Dict[str, Any]:
        """Returns a repaired `{action, params}` or raises ActionRejected."""
        if not isinstance(action, dict):
            raise ActionRejected("action must be an object")
        name = action.get("action")
        if name not in self.controls:
            raise ActionRejected(f"'{name}' is not an allowlisted control")
        allowed = self.allowed(observation, offered)
        if name not in allowed:
            raise ActionRejected(f"'{name}' is not allowed now (allowed: {', '.join(allowed)})")

        spec = self.controls[name]
        raw = action.get("params") or {}
        if not isinstance(raw, dict):
            raise ActionRejected("params must be an object")
        viewport = (observation or {}).get("viewport") or {}
        target_ids = {t.get("id") for t in (observation or {}).get("targets") or [] if t.get("enabled", True)}
        known_targets = observation is not None and "targets" in observation

        groups: List[List[str]] = spec.get("require_one_of") or []
        grouped = {p for g in groups for p in g}
        params: Dict[str, Any] = {}
        for pname, pspec in spec.get("params", {}).items():
            if pname not in raw or raw[pname] is None:
                if "default" in pspec:
                    params[pname] = pspec["default"]
                continue
            params[pname] = self._coerce(name, pname, pspec, raw[pname], viewport, target_ids, known_targets)

        if groups:
            satisfied = [g for g in groups if all(p in params for p in g)]
            if not satisfied:
                raise ActionRejected(f"'{name}' needs one of {groups}")
            keep = set(satisfied[0])  # target_id wins over x,y when both are given
            params = {k: v for k, v in params.items() if k in keep or k not in grouped}
        for pname, pspec in spec.get("params", {}).items():
            if pname in params or pname in grouped or pspec.get("optional") or "default" in pspec:
                continue
            raise ActionRejected(f"'{name}' is missing required param '{pname}'")
        return {"action": name, "params": params}

    def _coerce(self, name, pname, pspec, value, viewport, target_ids, known_targets):
        kind = pspec.get("type")
        if kind == "integer":
            try:
                num = int(round(float(value)))
            except (TypeError, ValueError):
                raise ActionRejected(f"'{name}.{pname}' must be an integer")
            return int(min(pspec.get("max", num), max(pspec.get("min", num), num)))
        if kind == "number":
            try:
                num = float(value)
            except (TypeError, ValueError):
                raise ActionRejected(f"'{name}.{pname}' must be a number")
            limit = viewport.get("w") if pname == "x" else viewport.get("h") if pname == "y" else None
            return min(float(limit), max(0.0, num)) if limit else num
        if kind == "string":
            text = str(value)
            if pname == "target_id" and known_targets and text not in target_ids:
                raise ActionRejected(f"target '{text}' is not on screen")
            return text
        if kind == "point_or_target":
            if not isinstance(value, dict):
                raise ActionRejected(f"'{name}.{pname}' must be a target or point")
            if "target_id" in value:
                tid = str(value["target_id"])
                if known_targets and tid not in target_ids:
                    raise ActionRejected(f"target '{tid}' is not on screen")
                return {"target_id": tid}
            if "x" in value and "y" in value:
                x, y = float(value["x"]), float(value["y"])
                if viewport.get("w"):
                    x = min(float(viewport["w"]), max(0.0, x))
                if viewport.get("h"):
                    y = min(float(viewport["h"]), max(0.0, y))
                return {"x": x, "y": y}
            raise ActionRejected(f"'{name}.{pname}' needs target_id or x,y")
        return value
