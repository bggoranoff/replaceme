"""
ReplaceMe Researcher Agent.

An autonomous AI agent powered by Google Gemini that analyzes a job/task prompt,
identifies the critical competencies and procedures needed for that role, and
synthesizes a complete curriculum of self-contained game scenarios (levels)
with interactive station definitions and clear human objectives to hand off to the Builder Agent.
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from builder.gemini_client import GeminiClient

RESEARCHER_SYSTEM_PROMPT = """
You are the RESEARCHER AGENT in the ReplaceMe ecosystem.
Your mission is to research a real-world human job or task prompt (e.g. barista, florist, waiter, cashier, bartender)
and break it down into a structured curriculum of 3 to 4 progressive, self-contained game scenarios (levels).

Each scenario MUST represent a single level with a clear, measurable objective that a human player or autonomous agent can complete.
Each level must define:
- id: slug
- level: 1..N
- title: catchy scenario title
- goal: clear single objective (e.g. "Steam whole milk to 60-65°C without large bubbles")
- instruction: actionable human prompt (e.g. "Walk to the Steam Wand, press [SPACE] or click to set valve and aerate until 62°C")
- stations: interactive stations involved in this scenario (e.g. Grinder, Steam Wand, Refrigerator, Counter)
- controls: sliders, toggles, or choices for the human player
- successConditions: verifiable criteria for passing the level
- steps: procedural steps

Output MUST be a single valid JSON object matching the ReplaceMe research.json schema.
DO NOT output any markdown commentary outside the JSON block.
"""

FALLBACK_CURRICULA: Dict[str, Dict[str, Any]] = {
    "barista": {
        "version": 1,
        "role": "barista",
        "title": "Specialty Espresso Bar",
        "theme": {
            "name": "Artisan Café",
            "floorType": "planks",
            "floorColor1": "#c99b6d",
            "floorColor2": "#bf9063",
            "wallColor": "#f3e2c7",
            "wallpaperColor": "#ead2b0",
            "trimColor": "#a97d55",
            "accentColor": "#6b4a33"
        },
        "sources": ["Specialty Coffee Association (SCA) Barista Skills Standards", "World Barista Championship Rules"],
        "rules": [
            "Always purge steam wand before and after steaming",
            "Steam milk to 60-65°C; never exceed 70°C to avoid scorching",
            "Confirm alternative milks or decaf substitutions before preparing"
        ],
        "assumptions": ["Commercial dual-boiler espresso machine, calibrated conical grinder, fresh dairy and plant milks"],
        "stations": [
            {"id": "station-grinder", "name": "Conical Grinder", "icon": "grinder", "tile": [4, 2], "w": 2, "h": 1, "color": "#4a3424", "accent": "#c9ced6", "description": "Dose and grind fresh coffee beans into portafilter."},
            {"id": "station-espresso", "name": "Espresso Machine", "icon": "espresso", "tile": [2, 2], "w": 2, "h": 1, "color": "#8e96a3", "accent": "#ff4a3a", "description": "Tamp grounds and extract 1:2 ratio espresso."},
            {"id": "station-steamer", "name": "Steam Wand Station", "icon": "steamer", "tile": [6, 2], "w": 2, "h": 1, "color": "#7a8a9e", "accent": "#9fdfc4", "description": "Aerate and texture silky microfoam at 60-65°C."},
            {"id": "station-fridge", "name": "Milk Refrigerator", "icon": "fridge", "tile": [1, 7], "w": 2, "h": 2, "color": "#6f8fc9", "accent": "#fbf6ea", "description": "Select whole milk, oat milk, or almond milk."},
            {"id": "station-pickup", "name": "Order Pickup Counter", "icon": "register", "tile": [6, 4], "w": 3, "h": 1, "color": "#a8714b", "accent": "#ffd877", "description": "Assemble drink and hand off to waiting customer."}
        ],
        "levels": [
            {
                "id": "steam-milk",
                "level": 1,
                "title": "Milk Steaming & Microfoam Texturing",
                "skill_name": "Steam milk to optimal silky microfoam",
                "goal": "Steam whole milk to 60–65°C with glossy microfoam suitable for latte art",
                "instruction": "Walk over to the Steam Wand Station (top right counter) and press [SPACE] to purge, texture, and shut off at 62°C.",
                "targetStationId": "station-steamer",
                "customerProfiles": ["Flat white enthusiast who inspects foam density and temperature"],
                "initialSupplies": {"coldWholeMilk_ml": 250, "pitcher": 1, "steamWand": 1, "thermometer": 1},
                "actions": ["purgeWand", "steamToTemp", "wipeAndPurge"],
                "controls": [
                    {"id": "purge_wand", "label": "Purge Condensation", "type": "toggle", "default": True},
                    {"id": "temp_celsius", "label": "Target Steam Temperature", "type": "slider", "min": 40.0, "max": 80.0, "step": 1.0, "default": 63.0, "unit": "°C", "targetMin": 60.0, "targetMax": 65.0},
                    {"id": "vortex_whirlpool", "label": "Whirlpool Vortex Roll", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "Milk temperature finishes strictly between 60°C and 65°C",
                    "Velvety wet-paint microfoam texture with zero large bubbles",
                    "Steam wand wiped and purged immediately after steaming"
                ],
                "steps": [
                    "Walk to the Steam Wand Station",
                    "Purge steam wand for 1 second to clear moisture",
                    "Submerge tip 1cm, tilt pitcher 15° for rolling vortex",
                    "Shut off valve at 60-65°C and wipe wand clean"
                ],
                "checks": [
                    "Final temperature between 60°C and 65°C",
                    "Glossy microfoam with micro-bubbles < 0.5mm",
                    "Steam wand clean and purged"
                ]
            },
            {
                "id": "dial-espresso",
                "level": 2,
                "title": "Dial in Espresso Extraction",
                "skill_name": "Calibrate grind size, dose, and extraction ratio",
                "goal": "Dose 18g and extract a 36g double shot in 28 seconds with rich golden crema",
                "instruction": "First visit the Conical Grinder to dose 18g, then move to the Espresso Machine to lock portafilter and extract 36g.",
                "targetStationId": "station-espresso",
                "customerProfiles": ["Espresso purist sensitive to under-extracted sourness or over-extracted bitterness"],
                "initialSupplies": {"beans_g": 250, "portafilter": 1, "tamper": 1, "scale": 1, "timer": 1},
                "actions": ["weighDose18g", "distributeGrounds", "tampLevel15kg", "pullShot"],
                "controls": [
                    {"id": "dose_grams", "label": "Bean Dose Weight", "type": "slider", "min": 14.0, "max": 22.0, "step": 0.5, "default": 18.0, "unit": "g", "targetMin": 17.5, "targetMax": 18.5},
                    {"id": "tamp_force_kg", "label": "Tamping Pressure", "type": "slider", "min": 5.0, "max": 25.0, "step": 1.0, "default": 15.0, "unit": "kg", "targetMin": 12.0, "targetMax": 18.0},
                    {"id": "shot_yield_g", "label": "Liquid Shot Yield", "type": "slider", "min": 25.0, "max": 45.0, "step": 1.0, "default": 36.0, "unit": "g", "targetMin": 35.0, "targetMax": 37.0}
                ],
                "successConditions": [
                    "Yield strictly 36g (+/- 1g) from 18g dose",
                    "Extraction time between 27 and 30 seconds",
                    "Thick hazelnut crema without pale blonding or channeling"
                ],
                "steps": [
                    "Dose exactly 18.0g of coffee at the Grinder Station",
                    "Tamp firmly with 15kg pressure and lock into Grouphead",
                    "Engage 9-bar pump and stop extraction precisely at 36g"
                ],
                "checks": [
                    "Dose 18g, yield 36g (1:2 ratio)",
                    "Shot run time 27-30 seconds",
                    "Balanced TDS and rich crema"
                ]
            },
            {
                "id": "stockout-resolution",
                "level": 3,
                "title": "Handle Milk Stockout & Order Substitution",
                "skill_name": "Resolve unavailable supplies with clear customer communication",
                "goal": "Verify oat milk shortage in fridge, offer almond alternative, and secure customer confirmation",
                "instruction": "Check the Milk Refrigerator to confirm oat milk stockout (0 cartons), then walk to the Pickup Counter to offer fresh almond milk.",
                "targetStationId": "station-fridge",
                "customerProfiles": ["Busy morning commuter with dietary preference willing to accept alternative if offered kindly"],
                "initialSupplies": {"oatMilk_cartons": 0, "almondMilk_cartons": 3, "wholeMilk_cartons": 6},
                "actions": ["checkStock", "explainShortage", "offerAlmondOrSoy", "confirmChoice"],
                "controls": [
                    {"id": "fridge_check", "label": "Inspect Inventory Count", "type": "toggle", "default": True},
                    {"id": "chosen_alternative", "label": "Offered Alternative Milk", "type": "choice", "options": ["Organic Almond Milk", "Soy Milk", "Lactose-Free Dairy"], "default": "Organic Almond Milk"},
                    {"id": "customer_confirmation", "label": "Obtain Explicit Customer Consent", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "Customer explicitly confirms acceptable alternative before preparation",
                    "Zero unauthorized substitutions served",
                    "Inventory accurately updated"
                ],
                "steps": [
                    "Inspect Milk Refrigerator and record 0 cartons of oat milk",
                    "Approach customer at counter: explain shortage politely",
                    "Offer organic almond milk alternative and await agreement",
                    "Confirm agreed selection before steaming"
                ],
                "checks": [
                    "Shortage detected before pulling shot",
                    "Customer consent explicitly received",
                    "No negative inventory allowed"
                ]
            },
            {
                "id": "rush-workflow",
                "level": 4,
                "title": "Multi-Order Barista Rush Prioritization",
                "skill_name": "Parallel workflow and ticket sequencing during peak morning rush",
                "goal": "Queue and prepare 3 concurrent espresso tickets in under 120 seconds while keeping stations clean",
                "instruction": "Visit Grinder, Steamer, and Pickup Counter in rapid sequence to dispatch Americano, Flat White, and Cortado.",
                "targetStationId": "station-pickup",
                "customerProfiles": ["Queue of 3 office workers ordering Americano, Latte, and Cortado"],
                "initialSupplies": {"coffee_g": 500, "milk_ml": 1000, "cups": 3},
                "actions": ["grindNextDose", "steamMilk", "pourSimultaneously", "wipeStations"],
                "controls": [
                    {"id": "sequence_order", "label": "Ticket Execution Order", "type": "choice", "options": ["Americano -> Cortado -> Latte", "Latte -> Americano -> Cortado"], "default": "Americano -> Cortado -> Latte"},
                    {"id": "parallel_steaming", "label": "Steam Milk During Extraction", "type": "toggle", "default": True},
                    {"id": "station_wipe", "label": "Wipe Counter Between Drinks", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "All 3 drinks served at peak temperature within 120 seconds",
                    "Zero cross-contamination between dairy pitchers",
                    "Bar station maintained clean and wiped between tickets"
                ],
                "steps": [
                    "Sequence tickets: Americano (hot water first), Cortado, then Latte",
                    "Extract shot 1 while steaming milk for drink 2",
                    "Assemble drinks, wipe steam wand, and hand off with ticket numbers"
                ],
                "checks": [
                    "Total time under 120 seconds",
                    "Clean workstation between drinks",
                    "All drinks served hot and fresh"
                ]
            }
        ]
    },

    "florist": {
        "version": 1,
        "role": "florist",
        "title": "Botanical Floral Studio",
        "theme": {
            "name": "Garden Atelier",
            "floorType": "garden",
            "floorColor1": "#d8ebd5",
            "floorColor2": "#c7dec3",
            "wallColor": "#edf7ec",
            "wallpaperColor": "#dbeed9",
            "trimColor": "#5f9e5f",
            "accentColor": "#3d6e3d"
        },
        "sources": ["American Institute of Floral Designers (AIFD) Manual", "European Floristry Standards"],
        "rules": [
            "Cut stems underwater or at a 45-degree angle to prevent air embolisms",
            "Strip foliage below the waterline to prevent bacterial rot",
            "Maintain floral cooler temperature between 2°C and 4°C"
        ],
        "assumptions": ["Commercial floral shears, thorn strippers, fresh botanical stems, chilled display cooler"],
        "stations": [
            {"id": "station-flowers", "name": "Fresh Flower Cooler", "icon": "flowers", "tile": [2, 2], "w": 3, "h": 1, "color": "#7aa874", "accent": "#f7a6b8", "description": "Select garden roses, eucalyptus, and ranunculus stems."},
            {"id": "station-cutting", "name": "Pruning & Cutting Bench", "icon": "knife", "tile": [6, 2], "w": 2, "h": 1, "color": "#8a6d52", "accent": "#ffd877", "description": "Cut stems at 45° angle and remove bottom foliage."},
            {"id": "station-vases", "name": "Vase & Nutrient Station", "icon": "water", "tile": [2, 5], "w": 2, "h": 1, "color": "#8fc6ee", "accent": "#fff8e8", "description": "Fill clean glass vases with flower food solution."},
            {"id": "station-wrapping", "name": "Kraft Paper & Ribbon Table", "icon": "ribbon", "tile": [6, 5], "w": 3, "h": 1, "color": "#d9b48a", "accent": "#bfaef0", "description": "Wrap arrangement with sustainable craft wrap and tied ribbon."},
            {"id": "station-register", "name": "Florist Checkout Counter", "icon": "register", "tile": [6, 8], "w": 3, "h": 1, "color": "#a8714b", "accent": "#9fdfc4", "description": "Tag arrangement and hand off to happy client."}
        ],
        "levels": [
            {
                "id": "stem-preparation",
                "level": 1,
                "title": "Stem Trimming & 45° Angle Cut",
                "skill_name": "Condition fresh flower stems for maximum vase life",
                "goal": "Prune thorns and cut 5 garden rose stems strictly at a 45° angle with clean floral shears",
                "instruction": "Walk to the Pruning & Cutting Bench and press [SPACE] to set cut angle to 45° and strip lower foliage.",
                "targetStationId": "station-cutting",
                "customerProfiles": ["Bride inspecting stem hydration for wedding centerpiece"],
                "initialSupplies": {"rose_stems": 5, "shears": 1, "stripper": 1},
                "actions": ["stripThorns", "cutAt45Deg", "submergeInHydration"],
                "controls": [
                    {"id": "cut_angle_deg", "label": "Shears Cutting Angle", "type": "slider", "min": 0.0, "max": 90.0, "step": 5.0, "default": 45.0, "unit": "°", "targetMin": 40.0, "targetMax": 50.0},
                    {"id": "strip_foliage_cm", "label": "Foliage Stripped From Bottom", "type": "slider", "min": 0.0, "max": 20.0, "step": 1.0, "default": 10.0, "unit": "cm", "targetMin": 8.0, "targetMax": 15.0},
                    {"id": "crush_stem_check", "label": "Clean Razor Cut (No Stem Crushing)", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "All 5 stems sliced cleanly at 40°–50° without vascular crushing",
                    "Bottom 10cm stripped of foliage to prevent waterline bacteria",
                    "Stems immediately immersed in fresh floral preservative"
                ],
                "steps": [
                    "Take fresh rose stems from cooler to cutting bench",
                    "Gently strip lower leaves and thorns using thorn stripper",
                    "Position floral shears at 45° angle and make a clean diagonal slice",
                    "Place trimmed stems into prepared hydration bucket"
                ],
                "checks": [
                    "Cut angle between 40° and 50°",
                    "No submerged foliage",
                    "Hydration solution absorbed"
                ]
            },
            {
                "id": "spiral-bouquet",
                "level": 2,
                "title": "Spiral Hand-Tied Bouquet Composition",
                "skill_name": "Assemble botanical balance using the Dutch spiral technique",
                "goal": "Rotate stems in a continuous spiral to create a domed bouquet with focal garden roses and eucalyptus foliage",
                "instruction": "Visit Flower Cooler to gather focal flowers and greenery, then arrange them at the Kraft Wrapping Table.",
                "targetStationId": "station-wrapping",
                "customerProfiles": ["Customer seeking romantic hand-tied anniversary bouquet"],
                "initialSupplies": {"roses": 7, "eucalyptus": 5, "ranunculus": 3, "twine": 1},
                "actions": ["selectFocalStems", "spiralStemsClockwise", "bindWithTwine"],
                "controls": [
                    {"id": "focal_ratio", "label": "Focal Flowers to Filler Ratio", "type": "slider", "min": 0.2, "max": 0.8, "step": 0.05, "default": 0.6, "unit": "%", "targetMin": 0.5, "targetMax": 0.7},
                    {"id": "spiral_direction", "label": "Spiral Rotation Angle", "type": "choice", "options": ["Clockwise Spiral", "Counter-Clockwise Spiral", "Crossed Stems (Incorrect)"], "default": "Clockwise Spiral"},
                    {"id": "binding_tension", "label": "Twine Binding Tension", "type": "slider", "min": 1.0, "max": 10.0, "step": 0.5, "default": 7.0, "unit": "N", "targetMin": 6.0, "targetMax": 8.0}
                ],
                "successConditions": [
                    "Stems form a balanced 360° self-standing spiral",
                    "Focal flowers distributed at varied heights",
                    "Bouquet securely tied without bruising delicate stems"
                ],
                "steps": [
                    "Select primary focal roses and secondary textural eucalyptus",
                    "Add stems one by one at a consistent 30° angle in a clockwise spiral",
                    "Check balance from all sides in mirror",
                    "Secure binding point firmly with natural jute twine"
                ],
                "checks": [
                    "Spiral technique validated (no crossed stems)",
                    "Self-standing test passed",
                    "Binding point neat and secure"
                ]
            },
            {
                "id": "flower-stockout",
                "level": 3,
                "title": "Resolve Flower Shortage with Harmonious Substitute",
                "skill_name": "Handle out-of-stock premium florals with botanical harmony",
                "goal": "Explain peony shortage to customer and substitute with open garden roses of matching blush palette",
                "instruction": "Check Flower Cooler to confirm zero peonies, then propose blush garden roses at the Checkout Counter.",
                "targetStationId": "station-flowers",
                "customerProfiles": ["Client requesting peonies in late autumn when out of season"],
                "initialSupplies": {"peonies": 0, "garden_roses_blush": 12, "ranunculus": 6},
                "actions": ["inspectCooler", "explainSeasonalShortage", "offerGardenRoses", "confirmWithCustomer"],
                "controls": [
                    {"id": "cooler_audit", "label": "Verify Peony Stock is 0", "type": "toggle", "default": True},
                    {"id": "substitute_flower", "label": "Harmonious Palette Substitute", "type": "choice", "options": ["Blush David Austin Roses", "Carnations", "Dried Grasses"], "default": "Blush David Austin Roses"},
                    {"id": "seasonal_explanation", "label": "Explain Seasonal Blooming Window", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "Customer educated courteously on seasonal availability",
                    "Equivalent premium bloom substitution approved",
                    "Arrangement aesthetics and value preserved"
                ],
                "steps": [
                    "Check inventory cooler and verify peony stockout",
                    "Explain: 'Peonies are out of season, but our David Austin garden roses offer the same lush, ruffled petal count'",
                    "Present fresh blush garden rose blooms for client approval",
                    "Receive confirmation and construct arrangement"
                ],
                "checks": [
                    "Zero unapproved substitutions",
                    "Customer delighted with alternative",
                    "Palette color harmony maintained"
                ]
            }
        ]
    },

    "waiter": {
        "version": 1,
        "role": "waiter",
        "title": "Fine Dining Bistro Floor",
        "theme": {
            "name": "Bistro Floor",
            "floorType": "tile",
            "floorColor1": "#f5ece1",
            "floorColor2": "#ebd8c4",
            "wallColor": "#faf4eb",
            "wallpaperColor": "#edd9c0",
            "trimColor": "#7a5035",
            "accentColor": "#54331e"
        },
        "sources": ["Michelin Guide Service Standards", "WSET Hospitality Service Guidelines"],
        "rules": [
            "Serve food from the left and clear from the right",
            "Verify all guest dietary allergies prior to ringing order",
            "Deliver hot dishes within 60 seconds of kitchen pass bell"
        ],
        "assumptions": ["Active kitchen pass, POS order entry terminal, 4 dining tables with reserved parties"],
        "stations": [
            {"id": "station-kitchen", "name": "Kitchen Pickup Pass", "icon": "dish", "tile": [3, 2], "w": 4, "h": 1, "color": "#7a8a9e", "accent": "#ffd877", "description": "Inspect and collect piping hot plated entrees."},
            {"id": "station-pos", "name": "POS Terminal", "icon": "register", "tile": [8, 2], "w": 2, "h": 1, "color": "#4a5a6e", "accent": "#9fdfc4", "description": "Enter table orders, special modifications, and allergy alerts."},
            {"id": "station-table-1", "name": "Table 1 (Booth)", "icon": "table", "tile": [12, 5], "w": 2, "h": 2, "color": "#c48b5f", "accent": "#fff8e8", "description": "Party of 2: Anniversary dinner."},
            {"id": "station-table-2", "name": "Table 2 (Window)", "icon": "table", "tile": [16, 5], "w": 2, "h": 2, "color": "#c48b5f", "accent": "#fff8e8", "description": "Party of 4: Business lunch with shellfish allergy."},
            {"id": "station-bussing", "name": "Bussing & Glassware Station", "icon": "water", "tile": [1, 7], "w": 2, "h": 2, "color": "#8fc6ee", "accent": "#d9b48a", "description": "Tray staging, clean cutlery, and sparkling water carafe."}
        ],
        "levels": [
            {
                "id": "order-allergy",
                "level": 1,
                "title": "Allergy Verification & Order Entry",
                "skill_name": "Inquire, flag, and route dietary restrictions safely",
                "goal": "Verify shellfish allergy at Table 2 and enter modified order into POS terminal with kitchen allergy alert",
                "instruction": "Walk to Table 2 (Window), take the guest's order, then walk to the POS Terminal to enter the allergy alert.",
                "targetStationId": "station-table-2",
                "customerProfiles": ["Guest with severe shellfish anaphylaxis dining with business associates"],
                "initialSupplies": {"orderPad": 1, "pen": 1},
                "actions": ["askDietaryRestrictions", "enterPosTicket", "flagAllergyToChef"],
                "controls": [
                    {"id": "allergy_prompt", "label": "Ask Dietary & Allergy Question", "type": "toggle", "default": True},
                    {"id": "flagged_allergen", "label": "POS Allergen Modifier", "type": "choice", "options": ["SEVERE SHELLFISH ALLERGY", "Gluten-Free", "Vegan"], "default": "SEVERE SHELLFISH ALLERGY"},
                    {"id": "verbal_chef_check", "label": "Verbal Kitchen Pass Confirmation", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "Allergy recorded and highlighted in red on kitchen ticket",
                    "Verbal confirmation received from head chef",
                    "Table marked with allergen alert token"
                ],
                "steps": [
                    "Approach Table 2 with a warm professional greeting",
                    "Ask: 'Are there any allergies or dietary preferences we should accommodate today?'",
                    "Note severe shellfish allergy clearly on pad",
                    "Walk to POS Terminal and input order with SEVERE ALLERGY red modifier"
                ],
                "checks": [
                    "Allergy question asked prior to menu finalization",
                    "POS kitchen ticket flagged",
                    "Chef acknowledgment verified"
                ]
            },
            {
                "id": "hot-pass-delivery",
                "level": 2,
                "title": "Synchronized Hot Entrée Delivery",
                "skill_name": "Deliver multi-plate courses simultaneously without food cooling",
                "goal": "Pick up 2 hot main courses from kitchen pass and serve Table 1 from the left within 45 seconds",
                "instruction": "Walk to Kitchen Pickup Pass, check temperature and garnishes, then deliver to Table 1 from the guest's left.",
                "targetStationId": "station-kitchen",
                "customerProfiles": ["Anniversary couple expecting synchronized service"],
                "initialSupplies": {"hotPlates": 2, "tray": 1},
                "actions": ["inspectPlateGarnish", "carryTwoPlatesBalanced", "serveFromLeft"],
                "controls": [
                    {"id": "delivery_time_sec", "label": "Pass-to-Table Delivery Time", "type": "slider", "min": 10.0, "max": 90.0, "step": 5.0, "default": 35.0, "unit": "s", "targetMin": 15.0, "targetMax": 45.0},
                    {"id": "serve_side", "label": "Serving Approach Side", "type": "choice", "options": ["Serve from Left (Correct)", "Serve from Right", "Reach Across Table"], "default": "Serve from Left (Correct)"},
                    {"id": "announce_dish", "label": "Announce Dish Name & Modifications", "type": "toggle", "default": True}
                ],
                "successConditions": [
                    "Food served hot at table within 45 seconds of pickup",
                    "Plates placed from the guest's left side quietly",
                    "Entrées described accurately with sauce drizzle facing guest"
                ],
                "steps": [
                    "Hear pass bell and immediately approach Kitchen Pass",
                    "Inspect plate rim cleanliness and sauce placement",
                    "Balance plates and proceed smoothly to Table 1",
                    "Serve each guest from their left side, stating dish name"
                ],
                "checks": [
                    "Delivery time under 45 seconds",
                    "Correct left-side approach",
                    "Plates clean with zero spills"
                ]
            }
        ]
    }
}


class ResearcherAgent:
    """
    Autonomous AI Agent that converts user job prompts into structured training scenarios
    with interactive station definitions and clear objectives for the Builder Agent.
    """

    def __init__(self, gemini_client: Optional[GeminiClient] = None):
        self.client = gemini_client or GeminiClient()

    def research(self, prompt: str) -> Dict[str, Any]:
        """
        Researches the competencies and produces a full curriculum with levels and stations.
        """
        clean_prompt = prompt.strip()
        role_slug = re.sub(r"[^a-zA-Z0-9]+", "-", clean_prompt.lower()).strip("-")

        # 1. If Gemini API key is configured, generate dynamic tailored curriculum
        if self.client.is_configured():
            try:
                user_msg = (
                    f"User target job/task prompt: '{clean_prompt}'.\n"
                    f"Synthesize a 3 to 4 level training curriculum for this specific role. "
                    f"Include interactive stations (with x, y tile coords in a 20x13 room), clear 1-sentence goals, "
                    f"and actionable human controls (sliders, toggles)."
                )
                raw_response = self.client.generate(
                    prompt=user_msg,
                    system_instruction=RESEARCHER_SYSTEM_PROMPT,
                    temperature=0.3
                )
                clean_json = self._extract_json(raw_response)
                curriculum = json.loads(clean_json)
                if "levels" in curriculum and len(curriculum["levels"]) > 0:
                    self._save_brief(curriculum)
                    return curriculum
            except Exception as exc:
                print(f"[ResearcherAgent] Gemini generation failed, falling back to heuristics: {exc}")

        # 2. Check preset curricula
        matched = self._match_or_adapt_curriculum(clean_prompt, role_slug)
        self._save_brief(matched)
        return matched

    def _extract_json(self, text: str) -> str:
        match = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        match = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return text[start:end + 1]
        return text.strip()

    def _match_or_adapt_curriculum(self, prompt: str, role_slug: str) -> Dict[str, Any]:
        lowered = prompt.lower()
        if any(w in lowered for w in ["barista", "coffee", "steam", "latte", "espresso"]):
            return FALLBACK_CURRICULA["barista"]
        if any(w in lowered for w in ["florist", "flower", "bouquet", "plant", "botanical"]):
            return FALLBACK_CURRICULA["florist"]
        if any(w in lowered for w in ["waiter", "waitress", "server", "restaurant", "dining", "bistro"]):
            return FALLBACK_CURRICULA["waiter"]

        # Adapt generic professional curriculum
        title_case_role = " ".join(word.capitalize() for word in prompt.split())
        return {
            "version": 1,
            "role": role_slug or "craftsman",
            "title": f"{title_case_role} Workshop",
            "theme": {
                "name": f"{title_case_role} Environment",
                "floorType": "planks",
                "floorColor1": "#e0d5c1",
                "floorColor2": "#d4c7b0",
                "wallColor": "#f5ede0",
                "wallpaperColor": "#e8dcce",
                "trimColor": "#8a7360",
                "accentColor": "#5a4636"
            },
            "sources": [f"Standard Operational Procedures for {title_case_role}"],
            "rules": [
                f"Verify requirements and specifications before starting {prompt} tasks",
                "Enforce strict quality checks and safety margins on all tools",
                "Ensure clean handoff and customer confirmation"
            ],
            "assumptions": [f"Standard workplace equipment and supplies for {title_case_role}"],
            "stations": [
                {"id": "station-input", "name": "Raw Supply Buffer", "icon": "crate", "tile": [3, 2], "w": 2, "h": 1, "color": "#7a8a9e", "accent": "#ffd877", "description": "Select and inspect input supplies."},
                {"id": "station-workbench", "name": "Primary Workstation", "icon": "tool", "tile": [6, 2], "w": 3, "h": 1, "color": "#8a6d52", "accent": "#9fdfc4", "description": f"Execute core {prompt} operations."},
                {"id": "station-inspection", "name": "Quality Inspection Zone", "icon": "check", "tile": [3, 5], "w": 2, "h": 1, "color": "#6f8fc9", "accent": "#fbf6ea", "description": "Verify tolerances and standards."},
                {"id": "station-handoff", "name": "Client Handover Desk", "icon": "register", "tile": [6, 5], "w": 3, "h": 1, "color": "#a8714b", "accent": "#ffd877", "description": "Deliver verified work to customer."}
            ],
            "levels": [
                {
                    "id": f"{role_slug}-foundations",
                    "level": 1,
                    "title": f"Core Foundations of {title_case_role}",
                    "skill_name": f"Execute basic {prompt} operations",
                    "goal": f"Complete essential setup, calibration, and tool preparation for {prompt}",
                    "instruction": f"Walk to the Primary Workstation and press [SPACE] to calibrate tools and set operating parameters.",
                    "targetStationId": "station-workbench",
                    "customerProfiles": ["Supervisor inspecting standard compliance"],
                    "initialSupplies": {"supplies": 10, "toolSet": 1},
                    "actions": ["calibrateTools", "runBasicProcess", "verifyOutput"],
                    "controls": [
                        {"id": "calibration_tolerance", "label": "Calibration Tolerance", "type": "slider", "min": 0.0, "max": 10.0, "step": 0.5, "default": 2.0, "unit": "%", "targetMin": 0.0, "targetMax": 3.0},
                        {"id": "safety_check", "label": "Safety Checklist Completed", "type": "toggle", "default": True}
                    ],
                    "successConditions": [
                        "All calibration thresholds strictly met",
                        "Zero equipment faults or safety violations",
                        "Clean handover protocol followed"
                    ],
                    "steps": [
                        "Perform pre-operational safety and cleanliness check",
                        "Calibrate operating parameters according to guidelines",
                        "Verify output against visual and metric tolerance checks"
                    ],
                    "checks": [
                        "Tolerance within +/- 2%",
                        "Safety checklist confirmed"
                    ]
                },
                {
                    "id": f"{role_slug}-exception-handling",
                    "level": 2,
                    "title": f"Handle Supply Shortages & Anomalies in {title_case_role}",
                    "skill_name": f"Resolve exceptions during {prompt}",
                    "goal": f"Detect missing materials or equipment anomalies and recover smoothly",
                    "instruction": f"Inspect the Raw Supply Buffer, identify missing inventory, and offer pre-approved alternatives at the Handover Desk.",
                    "targetStationId": "station-input",
                    "customerProfiles": ["Client experiencing unexpected delay"],
                    "initialSupplies": {"supplies": 0, "backupSupplies": 5},
                    "actions": ["detectShortage", "proposeAlternative", "fulfillOrder"],
                    "controls": [
                        {"id": "inventory_check", "label": "Confirm Zero Inventory", "type": "toggle", "default": True},
                        {"id": "alternative_choice", "label": "Selected Pre-Approved Alternative", "type": "choice", "options": ["Certified Equivalent", "Premium Upgrade"], "default": "Certified Equivalent"}
                    ],
                    "successConditions": [
                        "Shortage communicated before wasted processing",
                        "Alternative agreed upon with stakeholder",
                        "No negative inventory"
                    ],
                    "steps": [
                        "Inspect input buffer and register material stockout",
                        "Present pre-approved alternative with matching specifications",
                        "Obtain explicit confirmation before proceeding"
                    ],
                    "checks": [
                        "Zero unconfirmed substitutions",
                        "Shortage logged in system"
                    ]
                }
            ]
        }

    def _save_brief(self, brief: Dict[str, Any]):
        role = brief.get("role", "custom")
        fixtures_dir = WORKSPACE_ROOT / "fixtures"
        fixtures_dir.mkdir(parents=True, exist_ok=True)
        brief_path = fixtures_dir / f"{role}-research.json"
        with open(brief_path, "w", encoding="utf-8") as f:
            json.dump(brief, f, indent=2)
        with open(WORKSPACE_ROOT / "research.json", "w", encoding="utf-8") as f:
            json.dump(brief, f, indent=2)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ReplaceMe Researcher Agent")
    parser.add_argument("prompt", type=str, default="florist", nargs="?", help="Job or task prompt")
    args = parser.parse_args()

    agent = ResearcherAgent()
    print(f"Researcher Agent researching role: '{args.prompt}'...")
    result = agent.research(args.prompt)
    print(f"Synthesized curriculum for '{result.get('role')}' with {len(result.get('levels', []))} levels:")
    for lvl in result.get("levels", []):
        print(f"  Level {lvl.get('level')}: {lvl.get('title')} -> Goal: {lvl.get('goal')}")
