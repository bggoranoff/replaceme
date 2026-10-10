"""
Environment templates for the game map: where the job happens.

A small fixed library (like the 5 mechanics): each template says whether the map is an interior
(walls, door, floor) or the outdoor village, which furniture the 4 quest locations become, which
props fill the room, and its palette. Gemini flavor picks one id from ENVIRONMENT_IDS; without
Gemini, pick_environment() scores the brief's own words against each template's vocabulary.
Nothing here knows about a particular job; "village" is the final default.

The renderer (frontend/src/game/render/environments.ts) draws each id procedurally.
"""

import re
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_ENVIRONMENT = "village"

# mech -> preferred (kind, icon) list; the first icon not yet used in the world wins.
# props: decor placed after the quest locations: icon, w, h, cap, wall (True: against any wall, "back": against the
# back wall, for tall furniture), solid.
ENVIRONMENTS: Dict[str, Dict[str, Any]] = {
    "village": {
        "interior": False,
        "fits": "outdoor work: farms, gardens, animals, orchards, markets, outdoor trades, anything with no clear indoor venue",
        "words": "field farm crop harvest garden orchard animal barn hive bee sheep cow outdoor meadow plant soil seed tractor fence pasture forest river",
        "kinds": {},
        "spot": "sign",
        "props": [],
        "palette": {},
    },
    "cafe": {
        "interior": True,
        "fits": "coffee shops, cafes, tea rooms, juice bars, bars serving drinks at a counter",
        "words": "coffee espresso latte cappuccino brew grind grinder bean roast milk froth steam crema pour-over cafe café tea cup mug drink beverage bar menu",
        "kinds": {
            "mix": [("station", "espresso"), ("station", "grinder"), ("station", "brewbar")],
            "timing": [("station", "espresso"), ("station", "brewbar"), ("station", "grinder")],
            "sort": [("stall", "pastry"), ("station", "shelf")],
            "deliver": [("stall", "counter")],
            "converse": [("stall", "till"), ("stall", "counter")],
        },
        "spot": "cafe_table",
        "props": [
            {"icon": "bookcase", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "sofa", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "cafe_table", "w": 1, "h": 1, "cap": 4},
            {"icon": "plant", "w": 1, "h": 1, "cap": 5},
            {"icon": "sacks", "w": 1, "h": 1, "cap": 2, "wall": True},
            {"icon": "chalkboard", "w": 1, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "rug", "w": 3, "h": 2, "cap": 1, "solid": False},
        ],
        "palette": {"floors": ["#b07a4c", "#a8714a", "#b88456"], "walls": ["#ecd6ac", "#e6cfa0", "#f0dcc0"], "trim": "#6e4426", "accent": "#d9734e"},
    },
    "kitchen": {
        "interior": True,
        "fits": "bakeries, restaurant kitchens, catering, food preparation, cooking",
        "words": "bake baking bread dough loaf oven flour pastry cake recipe cook cooking kitchen restaurant dish plate meal food knife chop stove pan sauce soup dining menu proof crust yeast",
        "kinds": {
            "mix": [("station", "prep"), ("station", "pot"), ("station", "mixer")],
            "timing": [("station", "oven"), ("station", "stove")],
            "sort": [("station", "pantry"), ("station", "shelf")],
            "deliver": [("stall", "pass")],
            "converse": [("stall", "counter"), ("stall", "till")],
        },
        "spot": "dining_table",
        "props": [
            {"icon": "pantry", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "sacks", "w": 1, "h": 1, "cap": 3, "wall": True},
            {"icon": "dining_table", "w": 1, "h": 1, "cap": 3},
            {"icon": "plant", "w": 1, "h": 1, "cap": 3},
            {"icon": "barrel", "w": 1, "h": 1, "cap": 2, "wall": True},
            {"icon": "bin", "w": 1, "h": 1, "cap": 1, "wall": True},
        ],
        "palette": {"floors": ["#e7dfcf", "#e2d8c4", "#ede4d2"], "walls": ["#f3ecdc", "#efe5cf", "#e9e2d3"], "trim": "#8a6040", "accent": "#d8574a"},
    },
    "shop": {
        "interior": True,
        "fits": "shops and retail: florists, grocers, boutiques, bookshops, market stores, anything selling goods over a counter",
        "words": "shop store retail customer sale sell till stock shelf shelves display product price flower flowers bouquet bloom stem vase floral arrangement boutique grocery goods merchandise inventory market",
        "kinds": {
            "mix": [("station", "workbench_shop"), ("station", "display")],
            "timing": [("station", "workbench_shop"), ("station", "sink")],
            "sort": [("station", "shelf"), ("station", "cooler")],
            "deliver": [("stall", "till"), ("stall", "counter")],
            "converse": [("stall", "till"), ("stall", "counter")],
        },
        "spot": "display",
        "props": [
            {"icon": "cooler", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "shelf", "w": 2, "h": 1, "cap": 2, "wall": "back"},
            {"icon": "buckets", "w": 1, "h": 1, "cap": 4},
            {"icon": "plant", "w": 1, "h": 1, "cap": 5},
            {"icon": "crate", "w": 1, "h": 1, "cap": 2, "wall": True},
            {"icon": "rug", "w": 3, "h": 2, "cap": 1, "solid": False},
        ],
        "palette": {"floors": ["#c79a66", "#c29262", "#cfa572"], "walls": ["#d7e6cf", "#e3ecd6", "#f1e2c8"], "trim": "#5f6f45", "accent": "#e86f8e"},
    },
    "garage": {
        "interior": True,
        "fits": "vehicle work: car and motorbike repair, bicycle workshops, tyre fitting, servicing engines",
        "words": "car vehicle engine motor tyre tire wheel brake brakes oil bike bicycle cycle chain gear spoke derailleur repair garage service diagnostic bolt torque wrench fluid bleed hydraulic exhaust battery lift rig axle hub",
        "kinds": {
            "mix": [("station", "workbench"), ("station", "parts_washer")],
            "timing": [("station", "lift"), ("station", "repair_stand")],
            "sort": [("station", "toolwall"), ("station", "drawers")],
            "deliver": [("stall", "counter")],
            "converse": [("stall", "counter"), ("station", "repair_stand")],
        },
        "spot": "bay",
        "props": [
            {"icon": "car", "w": 2, "h": 1, "cap": 1},
            {"icon": "toolwall", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "tyres", "w": 1, "h": 1, "cap": 3, "wall": True},
            {"icon": "drum", "w": 1, "h": 1, "cap": 2, "wall": True},
            {"icon": "toolbox", "w": 1, "h": 1, "cap": 2},
            {"icon": "cone", "w": 1, "h": 1, "cap": 2},
            {"icon": "oil", "w": 1, "h": 1, "cap": 4, "solid": False},
        ],
        "palette": {"floors": ["#a3a39c", "#9b9c97", "#a8a69e"], "walls": ["#c7b9a0", "#b8b4aa", "#c9bfa8"], "trim": "#4f5560", "accent": "#e2b84a"},
    },
    "office": {
        "interior": True,
        "fits": "desk work: offices, banks, accounting, admin, call centres, design and software studios, data entry",
        "words": "office desk computer email spreadsheet data entry report meeting client account accounts bank loan finance invoice document file filing phone call admin schedule software code manager budget presentation policy contract tax payroll",
        "kinds": {
            "mix": [("station", "desk"), ("station", "computer")],
            "timing": [("station", "computer"), ("station", "printer")],
            "sort": [("station", "filing"), ("station", "shelf")],
            "deliver": [("stall", "reception"), ("stall", "printer")],
            "converse": [("table", "meeting"), ("stall", "reception")],
        },
        "spot": "desk_small",
        "props": [
            {"icon": "filing", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "bookcase", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "cooler_water", "w": 1, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "desk_small", "w": 1, "h": 1, "cap": 4},
            {"icon": "plant", "w": 1, "h": 1, "cap": 5},
            {"icon": "copier", "w": 1, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "rug", "w": 3, "h": 2, "cap": 1, "solid": False},
        ],
        "palette": {"floors": ["#7d8ea3", "#8295a6", "#77889c"], "walls": ["#e6e1d6", "#dfe3e6", "#ece6da"], "trim": "#5b6577", "accent": "#5e8fc9"},
    },
    "clinic": {
        "interior": True,
        "fits": "care work: clinics, pharmacies, vets, dentists, hospitals, care homes, salons and spas",
        "words": "patient clinic hospital care medicine medical dose drug pharmacy prescription wound bandage health animal pet treatment therapy injection blood pressure temperature symptom hygiene sterile salon spa hair skin massage dental tooth",
        "kinds": {
            "mix": [("station", "medcart"), ("station", "sink")],
            "timing": [("station", "bed"), ("station", "medcart")],
            "sort": [("station", "cabinet"), ("station", "shelf")],
            "deliver": [("stall", "reception")],
            "converse": [("station", "bed"), ("stall", "reception")],
        },
        "spot": "chair",
        "props": [
            {"icon": "cabinet", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "bed", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "curtain", "w": 1, "h": 1, "cap": 2},
            {"icon": "chair", "w": 1, "h": 1, "cap": 3, "wall": True},
            {"icon": "plant", "w": 1, "h": 1, "cap": 4},
            {"icon": "bin", "w": 1, "h": 1, "cap": 1, "wall": True},
        ],
        "palette": {"floors": ["#dfe9e6", "#e3ece8", "#d9e6e3"], "walls": ["#f4f6f2", "#eef3f0", "#f1f1ea"], "trim": "#4f9a94", "accent": "#4fa59a"},
    },
    "workshop": {
        "interior": True,
        "fits": "making things by hand: carpentry, crafts, pottery, tailoring, printing, art studios, labs, smithing",
        "words": "wood wooden timber saw plane sand sanding glue joint carpentry craft pottery clay kiln glaze sew sewing fabric stitch paint painting canvas brush art studio print press forge metal weld solder lab sample experiment furniture build",
        "kinds": {
            "mix": [("station", "workbench"), ("station", "easel")],
            "timing": [("station", "kiln"), ("station", "anvil")],
            "sort": [("station", "drawers"), ("station", "shelf")],
            "deliver": [("stall", "counter")],
            "converse": [("stall", "counter"), ("table", "worktable")],
        },
        "spot": "worktable",
        "props": [
            {"icon": "toolwall", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "shelf", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "planks", "w": 2, "h": 1, "cap": 1, "wall": "back"},
            {"icon": "crate", "w": 1, "h": 1, "cap": 3},
            {"icon": "barrel", "w": 1, "h": 1, "cap": 2, "wall": True},
            {"icon": "plant", "w": 1, "h": 1, "cap": 2},
            {"icon": "shavings", "w": 1, "h": 1, "cap": 3, "solid": False},
        ],
        "palette": {"floors": ["#a27a52", "#9c7450", "#a8825a"], "walls": ["#d9c29a", "#d2bb92", "#dcc8a4"], "trim": "#5b3a1e", "accent": "#c27a2c"},
    },
    "warehouse": {
        "interior": True,
        "fits": "logistics: warehouses, depots, post rooms, couriers, stockrooms, shipping and receiving",
        "words": "warehouse pallet forklift shipment shipping parcel package dispatch depot logistics loading dock freight stockroom picking packing label carton box truck route storage",
        "kinds": {
            "mix": [("station", "packing"), ("station", "workbench")],
            "timing": [("station", "conveyor"), ("station", "packing")],
            "sort": [("station", "rack"), ("station", "conveyor")],
            "deliver": [("stall", "dock"), ("stall", "counter")],
            "converse": [("stall", "counter"), ("stall", "dock")],
        },
        "spot": "pallet",
        "props": [
            {"icon": "rack", "w": 2, "h": 1, "cap": 2, "wall": "back"},
            {"icon": "pallet", "w": 1, "h": 1, "cap": 4},
            {"icon": "crate", "w": 1, "h": 1, "cap": 3},
            {"icon": "forklift", "w": 1, "h": 1, "cap": 1},
            {"icon": "cone", "w": 1, "h": 1, "cap": 2},
            {"icon": "drum", "w": 1, "h": 1, "cap": 1, "wall": True},
        ],
        "palette": {"floors": ["#b3ab9b", "#aca596", "#b8b0a0"], "walls": ["#9fb0b8", "#a7b4b0", "#b2aea2"], "trim": "#46525c", "accent": "#e2b84a"},
    },
}

ENVIRONMENT_IDS: Tuple[str, ...] = tuple(ENVIRONMENTS)

# Quest furniture footprints (w, h) that differ from the kind's default size.
ICON_SIZE = {"lift": (4, 3), "bed": (3, 2), "rack": (4, 2), "conveyor": (4, 2), "meeting": (4, 2), "dock": (4, 2),
             "toolwall": (4, 2), "cooler": (4, 2), "pantry": (4, 2), "brewbar": (4, 2)}

ENV_ICONS = sorted({icon for env in ENVIRONMENTS.values() for opts in env["kinds"].values() for _, icon in opts})


def describe_environments() -> str:
    def furniture(env: Dict[str, Any]) -> str:
        icons = list(dict.fromkeys(icon for opts in env["kinds"].values() for _, icon in opts))
        return f" (furniture: {', '.join(icons)})" if icons else ""
    return "; ".join(f"{eid} = {env['fits']}{furniture(env)}" for eid, env in ENVIRONMENTS.items())


def _words(text: str) -> List[str]:
    return re.findall(r"[a-zé\-]+", text.lower())


def _stem(w: str) -> str:
    for suf in ("ing", "es", "s"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def environment_scores(brief: Dict[str, Any]) -> Dict[str, float]:
    """How strongly the brief's own words point at each environment. Job and title count most, then tasks, then setting."""
    fields: List[Tuple[str, float]] = [(str(brief.get("job") or ""), 4.0), (str(brief.get("title") or ""), 2.0),
                                       (str(brief.get("setting") or ""), 1.0)]
    for t in brief.get("tasks") or []:
        if isinstance(t, dict):
            fields.append((" ".join(str(t.get(k) or "") for k in ("title", "summary", "aim")), 1.0))
    vocab = {eid: {_stem(w) for w in env["words"].split()} for eid, env in ENVIRONMENTS.items()}
    scores = {eid: 0.0 for eid in ENVIRONMENTS}
    for text, weight in fields:
        stems = [_stem(w) for w in _words(text)]
        for eid, words in vocab.items():
            hits = sum(1 for s in stems if s in words)
            scores[eid] += weight * min(hits, 4)
    return scores


def pick_environment(brief: Dict[str, Any]) -> str:
    """Deterministic fallback: the best-scoring template, or the village when nothing clearly fits."""
    scores = environment_scores(brief)
    best = max(ENVIRONMENT_IDS, key=lambda e: (scores[e], e == DEFAULT_ENVIRONMENT))
    return best if scores[best] >= 3 and best != DEFAULT_ENVIRONMENT else DEFAULT_ENVIRONMENT


def resolve_environment(flavor_choice: Optional[str], brief: Dict[str, Any]) -> str:
    return flavor_choice if flavor_choice in ENVIRONMENTS else pick_environment(brief)
