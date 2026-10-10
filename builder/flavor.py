"""
Flavor pack for a generated world: village title, NPC names and roles, location names,
quest titles and dialogue lines. Gemini writes it from the research brief; a deterministic
fallback derived from the same brief is used when Gemini is not configured or fails.

Flavor never sees the researched optima, so it cannot leak an answer; world_gen still drops
any line that states a target number.
"""

import concurrent.futures
import json
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from builder.world_gen import ICONS, LOCATION_KINDS, seeded

FLAVOR_TIMEOUT_S = 90

NAMES = ["Maple", "Pip", "Rosa", "Theo", "Juniper", "Basil", "Clover", "Hazel", "Otto", "Wren", "Fern", "Milo",
         "Ivy", "Rowan", "Poppy", "Sage", "Bram", "Lark", "Nell", "Quill", "Tansy", "Alder", "Bea", "Cosmo"]
ROLES = {"mix": "workshop owner", "timing": "old hand", "sort": "storekeeper", "deliver": "shift lead", "converse": "regular visitor"}


class NpcFlavor(BaseModel):
    name: str = Field(..., description="Short friendly first name, unique in the village")
    role: str = Field(..., description="Who they are in this job's world, e.g. owner, apprentice, regular customer")


class LevelFlavor(BaseModel):
    task_id: str = Field(..., description="The research task id this level implements")
    title: str = Field(..., description="Catchy level title, max 5 words")
    skill_name: str = Field(..., description="The skill this level trains, max 6 words")
    location_name: str = Field(..., description="Name of the place on the village map where the task happens, max 3 words")
    location_kind: Literal["building", "stall", "station", "field", "table"] = Field(..., description="Kind of place")
    icon: str = Field(..., description="Map icon, one of: " + ", ".join(ICONS))
    npc: NpcFlavor = Field(..., description="The villager who gives this quest")
    quest_title: str = Field(..., description="Quest title shown in the journal, max 7 words")
    aim: str = Field(..., description="The level goal shown to the player, plain everyday words, max 12 words: what to achieve, never how much or the answer")
    quest_line: str = Field(..., description="What the NPC says when giving the quest: ONE short sentence, max 14 words, everyday words (what they need and why), no numbers")
    chatter: List[str] = Field(..., description="2 tips coworkers say during the level, max 10 words each, everyday words, about a common mistake; no numbers, never the answer")
    pass_line: str = Field(..., description="NPC line after a passed attempt, max 8 words")
    fail_line: str = Field(..., description="NPC line after a failed attempt, encouraging, max 8 words")
    success_line: str = Field(..., description="Line shown on a perfect result, max 6 words")
    submit_label: str = Field(..., description="1-2 word verb for the finish action, e.g. Bake, Send, Mix")
    metric_name: str = Field(..., description="1-2 word name of the score, e.g. Quality, Freshness")
    replies: List[List[str]] = Field(..., description="converse levels only: for each dialogue turn, the NPC's reply to each option in the given order; empty list otherwise")


class WorldFlavor(BaseModel):
    title: str = Field(..., description="Cozy village or venue name, max 4 words")
    theme_name: str = Field(..., description="Short theme name for the map")
    levels: List[LevelFlavor] = Field(..., description="One entry per task given, same task_id")


SYSTEM = (
    "You write the flavor text for a cozy, Stardew Valley style village game that teaches a real job. "
    "The game has one top-down village map. Each task happens at a place on the map and is given as a quest by a villager. "
    "Write warm, short, natural lines in plain everyday words a 12-year-old understands: no jargon, no technical or Latin terms, "
    "one sentence per line, the shorter the better. Never state numbers, amounts, settings or the correct answer: the player must discover them."
)


def _task_digest(task: Dict[str, Any], mech: str) -> Dict[str, Any]:
    d = {"task_id": task["id"], "title": task.get("title"), "summary": task.get("summary"), "mechanic": mech,
         "aim": task.get("aim"), "problems": (task.get("problems") or [])[:3]}
    if mech == "converse":
        d["dialogue"] = [{"npc_line": t.get("npc_line"), "options": [o.get("text") for o in t.get("options") or []]}
                         for t in task.get("dialogue") or []]
    return d


def gemini_flavor(client: Any, brief: Dict[str, Any], picked: List[Any], traces: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Asks Gemini for a WorldFlavor. Returns None if Gemini is unavailable or the answer is unusable."""
    if client is None or not client.is_configured():
        return None
    prompt = json.dumps({
        "job": brief.get("job"),
        "setting": brief.get("setting"),
        "title": brief.get("title"),
        "tasks": [_task_digest(t, m) for t, m in picked],
        "researcher_reasoning": [{"task_id": t.get("task_id"), "thought": str(t.get("thought", ""))[:400]} for t in traces[:12]],
    }, ensure_ascii=False)
    prompt = "Write the WorldFlavor JSON for this game.\n" + prompt
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            raw = pool.submit(client.generate_structured, prompt, WorldFlavor, SYSTEM, 0.7).result(timeout=FLAVOR_TIMEOUT_S)
        data = WorldFlavor.model_validate_json(raw).model_dump()
    except Exception as exc:  # network, quota, schema: fall back to the deterministic pack
        print(f"[BuilderAgent] Gemini flavor unavailable, using fallback: {exc}")
        return None
    wanted = {t["id"] for t, _ in picked}
    if {lf["task_id"] for lf in data["levels"]} != wanted:
        print("[BuilderAgent] Gemini flavor did not cover every task, using fallback")
        return None
    return data


def fallback_flavor(brief: Dict[str, Any], picked: List[Any]) -> Dict[str, Any]:
    """Deterministic flavor built only from the brief."""
    rng = seeded(str(brief.get("slug") or brief.get("job")), "flavor")
    names = list(NAMES)
    rng.shuffle(names)
    levels = []
    for i, (task, mech) in enumerate(picked):
        title = str(task.get("title") or task["id"]).strip()
        levels.append({
            "task_id": task["id"],
            "title": title,
            "skill_name": title,
            "location_name": title,
            "location_kind": None,
            "icon": None,
            "npc": {"name": names[i], "role": ROLES[mech]},
            "quest_title": f"{names[i]} needs a hand",
            "aim": None,
            "quest_line": None,
            "chatter": [],
            "pass_line": None,
            "fail_line": None,
            "success_line": None,
            "submit_label": None,
            "metric_name": None,
            "replies": [],
        })
    title = str(brief.get("title") or str(brief.get("job") or "Village").title()).strip()
    return {"title": title, "theme_name": title, "levels": levels}


def merge_flavor(primary: Optional[Dict[str, Any]], fallback: Dict[str, Any]) -> Dict[str, Any]:
    """Fills gaps in Gemini's pack with the fallback and normalises enums."""
    if not primary:
        return fallback
    by_task = {lf["task_id"]: lf for lf in fallback["levels"]}
    levels = []
    used = set()
    for lf in primary["levels"]:
        fb = by_task.get(lf["task_id"], {})
        merged = {k: (v if v not in (None, "", []) else fb.get(k)) for k, v in lf.items()}
        if merged.get("location_kind") not in LOCATION_KINDS:
            merged["location_kind"] = None
        if merged.get("icon") not in ICONS:
            merged["icon"] = None
        name = str((merged.get("npc") or {}).get("name") or "").strip()
        if not name or name.lower() in used:
            merged["npc"] = fb.get("npc")
        used.add(str(merged["npc"]["name"]).lower())
        levels.append(merged)
    return {"title": primary.get("title") or fallback["title"], "theme_name": primary.get("theme_name") or fallback["theme_name"], "levels": levels}
