"""
ReplaceMe Researcher Agent.

An autonomous AI agent powered by Google Gemini that analyzes a job/task prompt,
identifies the critical competencies and procedures needed for that role, and
synthesizes a complete curriculum of self-contained game scenarios (levels)
to hand off to the Builder Agent.
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
Your mission is to research a real-world human job or task prompt (e.g. barista, waiter, steam the coffee, florist, cashier)
and break it down into a structured curriculum of 3 to 5 progressive, self-contained game scenarios (levels).

Each scenario must teach a specific, high-value competency that an autonomous agent or human player can practice and master.
Include realistic operational constraints, equipment parameters (e.g. exact temperatures, pressures, quantities),
failure modes (e.g. stockouts, customer impatience, equipment quirks), and strict success criteria.

Output MUST be a single valid JSON object with the following schema:
{
  "version": 1,
  "role": "<canonical_role_slug_e_g_barista>",
  "sources": ["<source or standard reference e.g. Specialty Coffee Association Barista Standards>"],
  "rules": ["<core domain rule 1>", "<core domain rule 2>"],
  "assumptions": ["<operational assumption>"],
  "levels": [
    {
      "id": "<level_slug_e_g_steam-milk>",
      "level": 1,
      "title": "<Catchy Title e.g. Milk Steaming & Microfoam Texturing>",
      "skill_name": "<Target Skill Name>",
      "goal": "<Clear 1-2 sentence goal e.g. Steam whole milk to 60-65°C with silky microfoam and no large bubbles>",
      "description": "<Concise description of the task and why it matters>",
      "customerProfiles": ["<customer profile e.g. Flat white drinker who notices bubbly or scorched foam>"],
      "initialSupplies": {
        "<item1>": <number>,
        "<item2>": <number>
      },
      "actions": ["<action1>", "<action2>", "<action3>"],
      "successConditions": [
        "<Strict condition 1 with exact numbers e.g. Final milk temperature between 60°C and 65°C>",
        "<Strict condition 2 e.g. Silky microfoam texture with glossy sheen>"
      ],
      "steps": [
        "<Step 1 with specific technique or setting e.g. Purge steam wand to remove condensation>",
        "<Step 2 e.g. Submerge wand tip 1cm below surface and tilt pitcher 15 degrees to initiate whirlpool vortex>",
        "<Step 3 e.g. Aerate until pitcher reaches body temperature (37°C), then submerge deeper to roll>",
        "<Step 4 e.g. Shut off steam valve immediately when thermometer hits 60-65°C>",
        "<Step 5 e.g. Purge wand and wipe with damp dedicated cloth>"
      ],
      "checks": [
        "<Check 1 e.g. Temperature between 60°C and 65°C>",
        "<Check 2 e.g. No large surface bubbles>",
        "<Check 3 e.g. Steam wand purged immediately after use>"
      ]
    }
  ]
}

DO NOT output any markdown commentary outside the JSON block.
"""

# High-fidelity curated default scenarios for common demo jobs (used if API key is not yet set or as fallback)
FALLBACK_CURRICULA: Dict[str, Dict[str, Any]] = {
    "barista": {
        "version": 1,
        "role": "barista",
        "sources": ["Specialty Coffee Association (SCA) Barista Skills Standards", "World Barista Championship Rules"],
        "rules": [
            "Always purge steam wand before and after steaming",
            "Steam milk to 60-65°C (140-150°F); never exceed 70°C to avoid scorching",
            "Confirm alternative milks or decaf substitutions before preparing"
        ],
        "assumptions": ["Commercial dual-boiler espresso machine, calibrated conical grinder, fresh dairy and plant milks"],
        "levels": [
            {
                "id": "steam-milk",
                "level": 1,
                "title": "Milk Steaming & Microfoam Texturing",
                "skill_name": "Steam milk to optimal silky microfoam",
                "goal": "Steam whole milk to 60–65°C with glossy microfoam suitable for latte art",
                "description": "Master aeration, whirlpool vortex texturing, and precise thermal cutoff to create silky microfoam without large bubbles.",
                "customerProfiles": ["Flat white enthusiast who inspects foam density and temperature"],
                "initialSupplies": {"coldWholeMilk_ml": 250, "pitcher": 1, "steamWand": 1, "thermometer": 1},
                "actions": ["purgeWand", "insertWandTip", "tiltPitcher15deg", "openSteamValve", "rollVortex", "stopAt65C", "wipeAndPurge"],
                "successConditions": [
                    "Milk temperature finishes strictly between 60°C and 65°C",
                    "Velvety wet-paint microfoam texture with zero large bubbles",
                    "Steam wand wiped and purged immediately after steaming"
                ],
                "steps": [
                    "Purge steam wand for 1 second over drip tray to clear condensation",
                    "Submerge wand tip 1cm below surface and tilt pitcher 15 degrees to establish whirlpool",
                    "Open steam valve fully; introduce air gently until pitcher reaches body temp (37°C)",
                    "Submerge wand slightly deeper to incorporate microfoam in a silent rolling vortex",
                    "Shut off steam valve as thermometer passes 60°C so thermal momentum settles at 62-65°C",
                    "Wipe wand thoroughly with damp cloth and purge steam immediately"
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
                "goal": "Extract a 1:2 ratio espresso (18g in, 36g out) in 27–30 seconds with rich crema",
                "description": "Adjust grind setting and distribution to eliminate channeling, achieving balanced sweetness and acidity.",
                "customerProfiles": ["Espresso purist sensitive to under-extracted sourness or over-extracted bitterness"],
                "initialSupplies": {"beans_g": 250, "portafilter": 1, "tamper": 1, "scale": 1, "timer": 1},
                "actions": ["weighDose18g", "distributeGrounds", "tampLevel15kg", "flushGroupHead", "lockPortafilter", "startShot", "stopAt36g"],
                "successConditions": [
                    "Yield strictly 36g (+/- 1g) from 18g dose",
                    "Extraction time between 27 and 30 seconds",
                    "Thick hazelnut crema without pale blonding or channeling"
                ],
                "steps": [
                    "Dose exactly 18.0g of coffee beans and grind into dry portafilter basket",
                    "Use WDT needle tool or tap to distribute grounds evenly without clumps",
                    "Tamp firmly and level with 15kg pressure",
                    "Flush group head for 2 seconds to stabilize brew temperature at 93°C",
                    "Insert and lock portafilter; immediately tare cup and scale under spouts",
                    "Engage 9-bar brew pump and stop shot at 36g yield (target: 28 seconds)"
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
                "goal": "Politely resolve an oat milk latte order when oat milk is out of stock without delaying queue",
                "description": "Check inventory, communicate shortage courteously, present delicious alternatives (almond/soy/dairy), and confirm choice before preparing.",
                "customerProfiles": ["Busy morning commuter with dietary preference willing to accept alternative if offered kindly"],
                "initialSupplies": {"oatMilk_cartons": 0, "almondMilk_cartons": 3, "wholeMilk_cartons": 6, "coffeeBeans_g": 500},
                "actions": ["checkStock", "explainShortage", "offerAlmondOrSoy", "confirmChoice", "prepareDrink", "serveWithApology"],
                "successConditions": [
                    "Customer explicitly confirms acceptable alternative or cancellation",
                    "No unauthorized substitution prepared",
                    "Transaction resolved within 45 seconds"
                ],
                "steps": [
                    "Check milk fridge and verify oat milk supply is at 0 cartons",
                    "Politely notify customer: 'I apologize, we are out of oat milk this morning'",
                    "Offer immediate alternatives: 'We have fresh almond milk or organic soy which pair great with this roast'",
                    "Wait for customer agreement before steaming",
                    "Prepare selected alternative and serve with a warm smile and discount token"
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
                "goal": "Queue and prepare 3 concurrent espresso drinks in under 120 seconds while maintaining standards",
                "description": "Interleave grinding, milk steaming, and espresso extraction so that milk and espresso finish simultaneously for each cup.",
                "customerProfiles": ["Queue of 3 office workers ordering Americano, Latte, and Cortado"],
                "initialSupplies": {"coffee_g": 500, "milk_ml": 1000, "cups": 3},
                "actions": ["grindNextDose", "steamMilk", "pourSimultaneously", "rinsePitcher", "cleanPortafilter", "handOffDrink"],
                "successConditions": [
                    "All 3 drinks served at peak temperature within 120 seconds",
                    "Zero cross-contamination between dairy and allergen pitchers",
                    "Bar station maintained clean and wiped between tickets"
                ],
                "steps": [
                    "Review ticket sequence: Americano (hot water first), then Cortado, then Latte",
                    "Dose and lock espresso for drink 1; while shot extracts, steam milk for drink 2",
                    "Pour drink 1, rinse pitcher immediately, and stage cup 2",
                    "Grind dose 2, start extraction, and steam milk for drink 3",
                    "Serve all completed drinks and wipe steam wand and prep counter"
                ],
                "checks": [
                    "Total time under 120 seconds",
                    "Clean workstation between drinks",
                    "All drinks served hot and fresh"
                ]
            }
        ]
    }
}


class ResearcherAgent:
    """
    Autonomous AI Agent that converts user job prompts into structured training scenarios.
    """

    def __init__(self, gemini_client: Optional[GeminiClient] = None):
        self.client = gemini_client or GeminiClient()

    def research(self, prompt: str) -> Dict[str, Any]:
        """
        Researches the competencies and produces a full curriculum with levels.
        """
        role_slug = re.sub(r"[^a-zA-Z0-9]+", "-", prompt.strip().lower()).strip("-")

        # If Gemini is configured, generate dynamic tailored curriculum
        if self.client.is_configured():
            try:
                user_msg = f"User target job/task prompt: '{prompt}'.\nSynthesize a 3 to 5 level training curriculum for this specific role."
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

        # Fallback to curated curriculum if matching, or dynamically tailor default
        matched = self._match_or_adapt_curriculum(prompt, role_slug)
        self._save_brief(matched)
        return matched

    def _extract_json(self, text: str) -> str:
        """Strips markdown code blocks to isolate JSON."""
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
        """Returns preset if available or adapts template."""
        lowered = prompt.lower()
        if "barista" in lowered or "coffee" in lowered or "steam" in lowered or "latte" in lowered:
            return FALLBACK_CURRICULA["barista"]

        # Adapt generic professional curriculum
        title_case_role = " ".join(word.capitalize() for word in prompt.split())
        return {
            "version": 1,
            "role": role_slug or "craftsman",
            "sources": [f"Standard Operational Procedures for {title_case_role}"],
            "rules": [
                f"Verify requirements and specifications before starting {prompt} tasks",
                "Enforce strict quality checks and safety margins on all tools",
                "Ensure clean handoff and customer confirmation"
            ],
            "assumptions": [f"Standard workplace equipment and supplies for {title_case_role}"],
            "levels": [
                {
                    "id": f"{role_slug}-foundations",
                    "level": 1,
                    "title": f"Core Foundations of {title_case_role}",
                    "skill_name": f"Execute basic {prompt} operations",
                    "goal": f"Complete essential setup, calibration, and tool preparation for {prompt}",
                    "description": f"Master the foundational inspection, supply checklist, and basic procedure for {prompt}.",
                    "customerProfiles": ["Supervisor inspecting standard compliance"],
                    "initialSupplies": {"supplies": 10, "toolSet": 1},
                    "actions": ["inspectEquipment", "measureInput", "calibrateTools", "runBasicProcess", "verifyOutput"],
                    "successConditions": [
                        "All calibration thresholds strictly met",
                        "Zero equipment faults or safety violations",
                        "Clean handover protocol followed"
                    ],
                    "steps": [
                        "Perform pre-operational safety and cleanliness check on primary tools",
                        "Measure input materials to specified tolerance",
                        "Calibrate operating parameters according to environmental conditions",
                        "Execute core operational sequence smoothly",
                        "Verify output against visual and metric tolerance checks"
                    ],
                    "checks": [
                        "Tolerance within +/- 2%",
                        "Safety and hygiene checklist completed",
                        "Standard operating procedure confirmed"
                    ]
                },
                {
                    "id": f"{role_slug}-exception-handling",
                    "level": 2,
                    "title": f"Handle Supply Shortages & Anomalies in {title_case_role}",
                    "skill_name": f"Resolve exceptions during {prompt}",
                    "goal": f"Detect missing materials or equipment anomalies and recover smoothly",
                    "description": "Diagnose deviations, communicate with stakeholders, and execute approved contingency plans.",
                    "customerProfiles": ["Client experiencing unexpected delay"],
                    "initialSupplies": {"supplies": 0, "backupSupplies": 5},
                    "actions": ["detectShortage", "notifyStakeholder", "proposeAlternative", "confirmApproval", "fulfillOrder"],
                    "successConditions": [
                        "Shortage communicated before wasted processing",
                        "Alternative agreed upon with stakeholder",
                        "No negative inventory"
                    ],
                    "steps": [
                        "Inspect input buffer and register material stockout",
                        "Immediately halt consumption and notify customer/supervisor",
                        "Present pre-approved alternative with matching specifications",
                        "Obtain explicit confirmation before proceeding",
                        "Complete task with alternative and document adjustment"
                    ],
                    "checks": [
                        "Zero unconfirmed substitutions",
                        "Shortage logged in system",
                        "Customer satisfaction preserved"
                    ]
                },
                {
                    "id": f"{role_slug}-peak-throughput",
                    "level": 3,
                    "title": f"High-Throughput Optimization in {title_case_role}",
                    "skill_name": f"Optimize multi-task execution for {prompt}",
                    "goal": f"Complete multiple consecutive tasks under tight deadlines without degrading quality",
                    "description": "Pipeline subtasks, eliminate idle wait times, and maintain precision under time pressure.",
                    "customerProfiles": ["Queue of urgent client requests"],
                    "initialSupplies": {"supplies": 50, "orders": 3},
                    "actions": ["pipelineTasks", "monitorTolerances", "batchOperations", "qualityGate", "dispatchOutputs"],
                    "successConditions": [
                        "All tasks completed within designated time window",
                        "Zero defects on final quality gate",
                        "Workstation remains organized and safe"
                    ],
                    "steps": [
                        "Batch common setup operations across incoming orders",
                        "Pipeline non-blocking steps to keep primary tools utilized",
                        "Apply rapid quality checks at each handover milestone",
                        "Final inspection and dispatch to customer"
                    ],
                    "checks": [
                        "Time target achieved",
                        "100% quality gate pass rate",
                        "Station returned to ready state"
                    ]
                }
            ]
        }

    def _save_brief(self, brief: Dict[str, Any]):
        """Persists the research brief to fixtures for downstream builder use."""
        role = brief.get("role", "custom")
        fixtures_dir = WORKSPACE_ROOT / "fixtures"
        fixtures_dir.mkdir(parents=True, exist_ok=True)
        brief_path = fixtures_dir / f"{role}-research.json"
        with open(brief_path, "w", encoding="utf-8") as f:
            json.dump(brief, f, indent=2)
        # Also update default research.json in root for active pipeline
        with open(WORKSPACE_ROOT / "research.json", "w", encoding="utf-8") as f:
            json.dump(brief, f, indent=2)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ReplaceMe Researcher Agent")
    parser.add_argument("prompt", type=str, default="barista", nargs="?", help="Job or task prompt")
    args = parser.parse_args()

    agent = ResearcherAgent()
    print(f"Researcher Agent researching role: '{args.prompt}'...")
    result = agent.research(args.prompt)
    print(f"Synthesized curriculum for '{result.get('role')}' with {len(result.get('levels', []))} levels:")
    for lvl in result.get("levels", []):
        print(f"  Level {lvl.get('level')}: {lvl.get('title')} -> Goal: {lvl.get('goal')}")
