"""
Closed-loop drivers: turn an attempt plan (control values / choices / route) into allowlisted
input actions, one at a time, from the current observation (shared/actions.json mechanics.*.input_mapping).

Each driver returns `{action, params}` dicts built only from controls on the allowlist. The agent
validates every action with `Allowlist.validate()` before sending it. Drivers never see scoring targets.
"""

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple

MAX_HOLD_STEPS = 51  # key hold_ms max 5000 -> 1 + 5000 // 100 steps
CALIBRATE_MS = 20


def key(name: str, steps: int = 1) -> Dict[str, Any]:
    steps = max(1, min(MAX_HOLD_STEPS, int(steps)))
    return {"action": name, "params": {"hold_ms": (steps - 1) * 100}}


def target_ids(obs: Dict[str, Any]) -> Set[str]:
    return {t["id"] for t in obs.get("targets") or [] if t.get("enabled", True)}


def find_target(obs: Dict[str, Any], tid: str) -> Optional[Dict[str, Any]]:
    return next((t for t in obs.get("targets") or [] if t.get("id") == tid), None)


class Driver:
    def __init__(self, strategy, plan: Dict[str, Any]):
        self.strategy = strategy
        self.plan = plan
        self.problems: List[str] = []

    def next_action(self, obs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    def no_effect(self, action: Dict[str, Any], before: Dict[str, Any], after: Dict[str, Any]) -> None:
        """Called when an action did not change the observation (the driver may switch input method)."""

    def inputs(self, obs: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError


class MixDriver(Driver):
    def __init__(self, strategy, plan):
        super().__init__(strategy, plan)
        self.mouse: Set[str] = set()  # variables set with the mouse because keys had no effect
        self.mouse_offset: Dict[str, float] = {}
        self.given_up: Set[str] = set()
        self.last_values: Dict[str, float] = {}

    def next_action(self, obs):
        self.strategy.register(obs)
        ms = obs.get("mechanic_state") or {}
        variables = ms.get("variables") or []
        sel = ms.get("selected_index") or 0
        for i, v in enumerate(variables):
            self.last_values[v["id"]] = v.get("value")
            if v["id"] in self.given_up:
                continue
            want = self.strategy.value_for(v["id"], self.plan)
            step = v.get("step") or 1
            if abs(float(v.get("value", 0)) - want) <= step / 2:
                continue
            if v["id"] in self.mouse:
                slider = find_target(obs, f"slider:{v['id']}")
                if slider and v["max"] > v["min"]:
                    frac = (want - v["min"]) / (v["max"] - v["min"])
                    x = slider["x"] + frac * slider["w"] + self.mouse_offset.get(v["id"], 0.0)
                    return {"action": "mouse_click", "params": {"x": x, "y": slider["y"] + slider["h"] / 2}}
                self.given_up.add(v["id"])
                self.problems.append(f"Could not set {v.get('label', v['id'])}: neither keys nor the slider responded.")
                continue
            if sel != i:
                return key("key_down" if i > sel else "key_up", abs(i - sel))
            n = round((want - float(v.get("value", 0))) / step)
            return key("key_right" if n > 0 else "key_left", abs(n))
        order = self.plan.get("order")
        if order and "added_order" in ms:
            added = ms.get("added_order") or []
            if len(added) < len(order) and added == order[: len(added)]:
                tid = f"ingredient:{order[len(added)]}"
                if tid in target_ids(obs):
                    return {"action": "mouse_click", "params": {"target_id": tid}}
        return {"action": "interact", "params": {}}

    def no_effect(self, action, before, after):
        ms = before.get("mechanic_state") or {}
        variables = ms.get("variables") or []
        sel = ms.get("selected_index") or 0
        if action["action"] in ("key_left", "key_right") and 0 <= sel < len(variables):
            self.mouse.add(variables[sel]["id"])
        elif action["action"] in ("key_up", "key_down"):
            for v in variables:  # selection does not move: set the rest with the mouse
                self.mouse.add(v["id"])
        elif action["action"] == "mouse_click" and "x" in action["params"]:
            for v in variables:
                if v["id"] in self.mouse:
                    self.given_up.add(v["id"])
                    self.problems.append(f"{v.get('label', v['id'])} did not respond to the slider either.")
                    break

    def after(self, action, before, after):
        """Calibrate slider clicks: shift the click by the observed value error."""
        if action["action"] != "mouse_click" or "x" not in action.get("params", {}):
            return
        for v_after in (after.get("mechanic_state") or {}).get("variables") or []:
            vid = v_after["id"]
            if vid not in self.mouse:
                continue
            slider = find_target(after, f"slider:{vid}")
            want = self.strategy.value_for(vid, self.plan)
            if slider and v_after["max"] > v_after["min"] and abs(v_after["value"] - want) > (v_after.get("step") or 1) / 2:
                self.mouse_offset[vid] = self.mouse_offset.get(vid, 0.0) + (want - v_after["value"]) / (v_after["max"] - v_after["min"]) * slider["w"]
            break

    def inputs(self, obs):
        values = {}
        for v in (obs.get("mechanic_state") or {}).get("variables") or []:
            values[v["id"]] = v.get("value")
        values = {k: (v if v is not None else self.last_values.get(k)) for k, v in values.items()} or dict(self.last_values)
        out: Dict[str, Any] = {"values": values}
        added = (obs.get("mechanic_state") or {}).get("added_order")
        if added or self.plan.get("order"):
            out["order"] = list(added or [])
        return out


class TimingDriver(Driver):
    """Stop mode: calibrate the needle speed, wait until it reaches the planned value, stop.
    Hold mode: press on the meter, calibrate the fill rate, wait, release."""

    def __init__(self, strategy, plan):
        super().__init__(strategy, plan)
        self.phase: Dict[Any, Dict[str, Any]] = {}
        self.results: Dict[str, float] = {}

    def next_action(self, obs):
        self.strategy.register(obs)
        ms = obs.get("mechanic_state") or {}
        for r in ms.get("results") or []:
            self.results[r["id"]] = r["value"]
        meter = ms.get("meter")
        if not meter or obs.get("phase") != "playing":
            return None
        want = self.strategy.value_for(meter["id"], self.plan)
        pid = (ms.get("phase_index"), meter["id"])
        st = self.phase.setdefault(pid, {"stage": "start"})
        value, t = float(meter.get("value", 0)), float(obs.get("t_ms", 0))
        lo, hi = float(meter["min"]), float(meter["max"])
        mode = meter.get("mode") or ("hold" if meter.get("holding") or (st.get("mode") == "hold") else
                                      "stop" if meter.get("moving") else "hold")
        st["mode"] = mode
        centre = self._centre(obs)
        if mode == "stop":
            if st["stage"] == "start":
                st.update(stage="calibrate", v0=value, t0=t)
                return {"action": "wait", "params": {"ms": CALIBRATE_MS}}
            if st["stage"] == "calibrate":
                dt = max(1e-6, t - st["t0"])
                speed = abs(value - st["v0"]) / dt
                direction = 1 if value >= st["v0"] else -1
                if speed <= 0:
                    st["stage"] = "stop"
                    return self._stop(obs)
                if direction > 0:
                    wait = (want - value) / speed if want >= value else ((hi - value) + (hi - want)) / speed
                else:
                    wait = (value - want) / speed if want <= value else ((value - lo) + (want - lo)) / speed
                st.update(stage="stop", until=t + wait)
            return self._wait_until(st, t) or self._stop(obs)
        # hold mode
        if not meter.get("holding") and st["stage"] == "start":
            st["stage"] = "pressed"
            return {"action": "mouse_down", "params": {"target_id": "meter"} if "meter" in target_ids(obs) else centre}
        if st["stage"] == "pressed":
            st.update(stage="calibrate", v0=value, t0=t)
            return {"action": "wait", "params": {"ms": CALIBRATE_MS}}
        if st["stage"] == "calibrate":
            rate = (value - st["v0"]) / max(1e-6, t - st["t0"])
            st.update(stage="release", until=t + (want - value) / rate if rate > 0 and want > value else t)
        return self._wait_until(st, t) or {"action": "mouse_up", "params": centre}

    @staticmethod
    def _wait_until(st, t):
        """Waits (in chunks of at most 10 s, the wait action's max) until the planned stop or release time."""
        left = st.get("until", t) - t
        if left < 1 or st.get("waited_at") == t:  # done, or the clock did not move on the last wait
            return None
        st["waited_at"] = t
        return {"action": "wait", "params": {"ms": int(round(min(left, 10000)))}}

    def _centre(self, obs):
        m = find_target(obs, "meter")
        if m:
            return {"x": m["x"] + m.get("w", 0) / 2, "y": m["y"] + m.get("h", 0) / 2}
        vp = obs.get("viewport") or {"w": 0, "h": 0}
        return {"x": vp.get("w", 0) / 2, "y": vp.get("h", 0) / 2}

    def _stop(self, obs):
        return {"action": "interact", "params": {}}

    def inputs(self, obs):
        for r in (obs.get("mechanic_state") or {}).get("results") or []:
            self.results[r["id"]] = r["value"]
        return {"values": dict(self.results)}


class SortDriver(Driver):
    def __init__(self, strategy, plan):
        super().__init__(strategy, plan)
        self.use_mouse = False
        self.placed: Dict[str, str] = {}

    def next_action(self, obs):
        self.strategy.register(obs)
        ms = obs.get("mechanic_state") or {}
        for p in ms.get("placed") or []:
            self.placed[p["item_id"]] = p["bin_id"]
        item = ms.get("current_item")
        if not item:
            return None
        want = self.strategy.value_for(item["id"], self.plan)
        bins = [b["id"] for b in ms.get("bins") or []]
        sel = ms.get("selected_bin")
        sel_idx = bins.index(sel) if sel in bins else sel if isinstance(sel, int) else None
        if not self.use_mouse and sel_idx is not None and want in bins:
            k = bins.index(want) - sel_idx
            if k:
                return key("key_right" if k > 0 else "key_left", abs(k))
            return key("key_down")
        if f"bin:{want}" in target_ids(obs):
            return {"action": "mouse_click", "params": {"target_id": f"bin:{want}"}}
        return {"action": "interact", "params": {}}

    def no_effect(self, action, before, after):
        if action["action"].startswith("key_"):
            self.use_mouse = True

    def inputs(self, obs):
        for p in (obs.get("mechanic_state") or {}).get("placed") or []:
            self.placed[p["item_id"]] = p["bin_id"]
        return {"choices": dict(self.placed)}


class ConverseDriver(Driver):
    def __init__(self, strategy, plan):
        super().__init__(strategy, plan)
        self.use_mouse = False
        self.history: List[Dict[str, Any]] = []
        self.turns_total: Optional[int] = None

    def next_action(self, obs):
        self.strategy.register(obs)
        ms = obs.get("mechanic_state") or {}
        self.history = list(ms.get("history") or self.history)
        self.turns_total = ms.get("turns_total", self.turns_total)
        options = [o["id"] for o in ms.get("options") or []]
        if ms.get("turn_index") is None or not options:
            return None
        want = self.strategy.value_for(str(ms["turn_index"]), self.plan)
        if self.use_mouse and f"choice:{want}" in target_ids(obs):
            return {"action": "mouse_click", "params": {"target_id": f"choice:{want}"}}
        sel = ms.get("selected_index") or 0
        k = options.index(want) - sel if want in options else 0
        if k:
            return key("key_down" if k > 0 else "key_up", abs(k))
        return {"action": "interact", "params": {}}

    def no_effect(self, action, before, after):
        if action["action"].startswith("key_"):
            self.use_mouse = True

    def inputs(self, obs):
        ms = obs.get("mechanic_state") or {}
        hist = ms.get("history") or self.history
        self.turns_total = ms.get("turns_total", self.turns_total)
        return {"choices": {str(i): h["option_id"] for i, h in enumerate(hist)}}

    def ended_early(self, obs) -> bool:
        hist = (obs.get("mechanic_state") or {}).get("history") or self.history
        timed_out = obs.get("time_left_ms") is not None and obs["time_left_ms"] <= 0
        return bool(self.turns_total) and len(hist) < int(self.turns_total) and not timed_out


class DeliverDriver(Driver):
    """Walks the avatar with BFS on observation.grid, picks up at the order's spot, hands over at its destination."""

    DIRS = {"key_up": (0, -1), "key_down": (0, 1), "key_left": (-1, 0), "key_right": (1, 0)}

    def __init__(self, strategy, plan):
        super().__init__(strategy, plan)
        self.sequence: List[str] = []  # order ids in pickup order actually used
        self.used_dest: Dict[str, str] = {}
        self.failed_tiles: Dict[str, Set[Tuple[int, int]]] = {}  # target id -> tiles where interact was refused
        self.extra_blocked: Set[Tuple[int, int]] = set()
        self.statuses: Dict[str, str] = {}
        self.goal: Optional[Tuple[str, str, str]] = None  # (kind, order_id, target_id)
        self.bad_targets: Dict[str, Set[str]] = {}

    # geometry ---------------------------------------------------------
    @staticmethod
    def _tile_px(obs) -> float:
        grid, vp = obs.get("grid") or {}, obs.get("viewport") or {}
        return (vp.get("w") or 16 * (grid.get("cols") or 1)) / max(1, grid.get("cols") or 1)

    def _footprint(self, obs, target, centred: bool = False) -> Set[Tuple[int, int]]:
        """Tiles under a target's box. x,y is the top-left corner; `centred` reads it as the centre instead."""
        if isinstance(target.get("tile"), list):
            return {tuple(target["tile"])}
        px = self._tile_px(obs)
        w, h = target.get("w", 0), target.get("h", 0)
        x0, y0 = (target["x"] - w / 2, target["y"] - h / 2) if centred else (target["x"], target["y"])
        c0, r0 = int(x0 // px), int(y0 // px)
        c1, r1 = int(max(x0, x0 + w - 0.01) // px), int(max(y0, y0 + h - 0.01) // px)
        return {(c, r) for c in range(c0, c1 + 1) for r in range(r0, r1 + 1)}

    def _walkable(self, obs):
        grid = obs.get("grid") or {}
        cols, rows = grid.get("cols") or 0, grid.get("rows") or 0
        blocked = {tuple(b) for b in grid.get("blocked") or []} | self.extra_blocked
        return lambda c, r: 0 <= c < cols and 0 <= r < rows and (c, r) not in blocked

    def _path(self, obs, goals: Set[Tuple[int, int]]) -> Optional[List[str]]:
        start = tuple((obs.get("avatar") or {}).get("tile") or (0, 0))
        if start in goals:
            return []
        ok = self._walkable(obs)
        prev: Dict[Tuple[int, int], Tuple[Tuple[int, int], str]] = {start: (start, "")}
        q = deque([start])
        while q:
            cur = q.popleft()
            for name, (dc, dr) in self.DIRS.items():
                nxt = (cur[0] + dc, cur[1] + dr)
                if nxt in prev or not ok(*nxt):
                    continue
                prev[nxt] = (cur, name)
                if nxt in goals:
                    path = []
                    node = nxt
                    while node != start:
                        node, step = prev[node][0], prev[node][1]
                        path.append(step)
                    return path[::-1]
                q.append(nxt)
        return None

    def distance(self, obs, target) -> int:
        path = self._path(obs, self._adjacent(obs, target))
        return len(path) if path is not None else 10 ** 6

    def _adjacent(self, obs, target) -> Set[Tuple[int, int]]:
        """Walkable tiles next to the target not yet refused; the centred reading only once every side failed."""
        ok = self._walkable(obs)
        failed = self.failed_tiles.get(target["id"], set())
        for centred in (False, True):
            foot = self._footprint(obs, target, centred)
            adj = {(c + dc, r + dr) for c, r in foot for dc, dr in self.DIRS.values()}
            goals = {t for t in adj if ok(*t) and t not in foot and t not in failed}
            if goals:
                return goals
        return set()

    # matching ---------------------------------------------------------
    def _match(self, obs, label: str, kinds: Tuple[str, ...], avoid: List[str] = ()) -> Optional[Dict[str, Any]]:
        from actor.explore import similarity

        cands = [t for t in obs.get("targets") or [] if t.get("kind") in kinds and t.get("enabled", True) and t["id"] not in avoid]
        if not cands:
            return None
        return max(cands, key=lambda t: (similarity(label, t.get("label", "")), -len(t.get("label", ""))))

    # driving ----------------------------------------------------------
    def next_action(self, obs):
        self.strategy.register(obs)
        ms = obs.get("mechanic_state") or {}
        orders = ms.get("orders") or []
        for o in orders:
            self.statuses[o["id"]] = o.get("status", "waiting")
        carrying = list(ms.get("carrying") or [])
        waiting = [o for o in orders if o.get("status") == "waiting" and o["id"] not in carrying]
        if not waiting and not carrying:
            return None
        batch = max(1, int(self.plan.get("batch", 1)))
        avoid = (self.plan.get("avoid") or {})
        if carrying and (len(carrying) >= batch or not waiting):
            oid = self._first(carrying)
            order = next(o for o in orders if o["id"] == oid)
            skip = [*avoid.get(oid, []), *self.bad_targets.get(oid, ())]
            named = find_target(obs, order["to"]) if order.get("to") else None  # the ticket's place, when the page lists it
            target = named if named and named["id"] not in skip else \
                self._match(obs, order.get("to_label", ""), ("npc", "location", "spot"), skip)
            kind = "handover"
        else:
            order = self._pick_next(obs, waiting)
            oid, kind = order["id"], "pickup"
            target = self._pickup_target(obs, order)
        if not target:
            self.problems.append(f"No place on the map matches '{order.get('label')}'.")
            return {"action": "wait", "params": {"ms": min(10000, int(obs.get("time_left_ms") or 1000))}}
        self.goal = (kind, oid, target["id"])
        goals = self._adjacent(obs, target)
        tile = tuple((obs.get("avatar") or {}).get("tile") or (0, 0))
        if tile in goals:
            if kind == "handover":
                self.used_dest[oid] = target["id"]
            elif oid not in self.sequence:
                self.sequence.append(oid)
            return {"action": "interact", "params": {"target_id": target["id"]}}
        path = self._path(obs, goals)
        if not path:
            self.problems.append(f"No walkable path to {target.get('label', target['id'])}.")
            return {"action": "wait", "params": {"ms": min(10000, int(obs.get("time_left_ms") or 1000))}}
        n = 1
        while n < len(path) and path[n] == path[0] and n < MAX_HOLD_STEPS:
            n += 1
        return key(path[0], n)

    def _first(self, carrying: List[str]) -> str:
        order = self.plan.get("sequence") or self.sequence
        return min(carrying, key=lambda oid: order.index(oid) if oid in order else len(order))

    def _pick_next(self, obs, waiting: List[Dict[str, Any]]) -> Dict[str, Any]:
        policy = self.plan.get("policy", "listed")
        if policy == "sequence" and self.plan.get("sequence"):
            seq = self.plan["sequence"]
            return min(waiting, key=lambda o: seq.index(o["id"]) if o["id"] in seq else len(seq))
        if policy == "nearest":
            def dist(o):
                t = self._pickup_target(obs, o)
                return self.distance(obs, t) if t else 10 ** 6
            return min(waiting, key=dist)
        return waiting[0]

    def _pickup_target(self, obs, order) -> Optional[Dict[str, Any]]:
        """The order's own spot or its listed pickup place if the page shows one, else the best label match
        among places that are not some order's destination."""
        bad = self.bad_targets.get(order["id"], set())
        for tid in (f"spot:{order['id']}", order.get("from")):
            own = find_target(obs, tid) if tid else None
            if own and own["id"] not in bad:
                return own
        orders = (obs.get("mechanic_state") or {}).get("orders") or []
        dests = [t["id"] for t in obs.get("targets") or []
                 if any(o.get("to") == t["id"] or (o.get("to_label") and o["to_label"] == t.get("label")) for o in orders)]
        return self._match(obs, order.get("label", ""), ("spot", "item", "location"), [*bad, *dests]) or \
            self._match(obs, order.get("label", ""), ("spot", "item", "location"), list(bad))

    def no_effect(self, action, before, after):
        name = action["action"]
        tile = tuple((before.get("avatar") or {}).get("tile") or (0, 0))
        if name in self.DIRS:
            dc, dr = self.DIRS[name]
            self.extra_blocked.add((tile[0] + dc, tile[1] + dr))
        elif name == "interact" and self.goal:
            kind, oid, tid = self.goal
            self.failed_tiles.setdefault(tid, set()).add(tile)  # maybe not adjacent from here: try another side
            target = find_target(before, tid)
            if target and not self._adjacent(before, target):  # refused from every side: wrong place for this order
                self.bad_targets.setdefault(oid, set()).add(tid)
                self.failed_tiles.pop(tid, None)
                self.problems.append(f"{target.get('label', tid)} refused the {kind} of order {oid}.")

    def inputs(self, obs):
        for o in (obs.get("mechanic_state") or {}).get("orders") or []:
            self.statuses[o["id"]] = o.get("status", "waiting")
        out = {"policy": self.plan.get("policy", "listed"), "batch": int(self.plan.get("batch", 1)), "sequence": list(self.sequence),
               "destinations": dict(self.used_dest)}
        return out


def make_driver(mechanic: str, strategy, plan: Dict[str, Any]) -> Driver:
    return {"mix": MixDriver, "timing": TimingDriver, "sort": SortDriver, "converse": ConverseDriver,
            "deliver": DeliverDriver}[mechanic](strategy, plan)
