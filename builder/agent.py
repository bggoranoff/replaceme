"""
ReplaceMe Builder Agent.

An autonomous AI agent powered by Google Gemini that turns high-level job
scenarios identified by the Researcher Agent into fully runnable, stochastic
Python mini-game environments conforming to BaseLevelEnv.

Workflow:
1. Loads scenario specifications from Researcher (e.g. research.json).
2. Synthesizes executable Python simulation code via Gemini API.
3. Automatically validates the code using headless simulation rollouts.
4. Generates world.json describing all synthesized levels and action schemas.
5. Commits and checkpoints changes to the Entire repository.
"""

import os
import sys
import json
import re
import importlib.util
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# Ensure workspace root is in sys.path
WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from shared.base_env import BaseLevelEnv, validate_level_contract
from builder.gemini_client import GeminiClient


SYSTEM_PROMPT = """
You are the BUILDER AGENT in the ReplaceMe ecosystem.
Your mission is to transform a job scenario and competency description into a self-contained, runnable, stochastic Python mini-game (state machine).

The environment must satisfy two critical requirements:
1. Headlessly runnable at high speeds for the automated Actor Agent (100+ simulation trials in milliseconds). Use pure Python standard library and random.Random.
2. Nicely playable by human users via an interactive UI, exposing clean metadata for sliders, toggles, gauges, and Gradium voice feedback cues.

CRITICAL IMPLEMENTATION CONTRACT:
You must return ONLY executable Python code defining a class named `LevelEnvironment` that inherits from `BaseLevelEnv`.
Do not include explanations or markdown outside the code block.

The code must look like:
```python
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
            "level_id": "<level_id>",
            "title": "<Catchy Title>",
            "skill_name": "<Target Skill>",
            "instruction": "<Clear 1-2 sentence goal for a player or voice prompt>",
            "controls": [
                {
                    "id": "<action_id>",
                    "label": "<Human readable label>",
                    "type": "slider", # "slider", "toggle", or "choice"
                    "min": 0.0,
                    "max": 100.0,
                    "step": 1.0,
                    "default": 50.0,
                    "unit": "<unit>"
                }
            ],
            "telemetry": [
                {
                    "id": "<metric_id>",
                    "label": "<Metric Label>",
                    "unit": "<unit>",
                    "target_range": [80, 100]
                }
            ]
        }

    def reset(self, seed: int = None) -> Dict[str, Any]:
        if seed is not None:
            self.rng.seed(seed)
        # Introduce stochastic entropy (e.g. ambient factors, customer patience, supply variations)
        self.hidden_factors = { ... }
        self.state = { ... }
        return self.get_observation()

    def get_observation(self) -> Dict[str, Any]:
        # Return visible state (excluding hidden factors)
        return { ... }

    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        # Apply actions, update state with domain physics / logic and hidden entropy
        # Calculate score (0.0 to 100.0)
        # Determine if terminal (done)
        # Construct feedback_info with:
        #   "voice_narrative": A snappy Gradium TTS-ready sentence
        #   "breakdown": Dictionary of scoring components
        return self.get_observation(), score, done, feedback_info
```
"""


class BuilderAgent:
    """
    Autonomous Builder Agent that dynamically generates and tests ReplaceMe mini-game environments.
    """

    def __init__(
        self,
        gemini_client: Optional[GeminiClient] = None,
        workspace_dir: Optional[Path] = None
    ):
        self.client = gemini_client or GeminiClient()
        self.workspace_dir = workspace_dir or WORKSPACE_ROOT
        self.levels_dir = self.workspace_dir / "builder" / "levels"
        self.levels_dir.mkdir(parents=True, exist_ok=True)

    def load_research_brief(self, brief_path: Path) -> Dict[str, Any]:
        """Loads research specification from JSON file."""
        with open(brief_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def generate_level_code(
        self,
        role: str,
        level_spec: Dict[str, Any],
        rules: List[str],
        assumptions: List[str],
        repair_context: Optional[str] = None
    ) -> str:
        """
        Calls Gemini to synthesize a complete Python LevelEnvironment implementation.
        """
        user_prompt = f"""
Role: {role}
General Rules: {json.dumps(rules, indent=2)}
Assumptions: {json.dumps(assumptions, indent=2)}

Target Level Scenario Specification:
{json.dumps(level_spec, indent=2)}

Synthesize a complete, robust, stochastic Python `LevelEnvironment` class conforming to `BaseLevelEnv`.
Ensure all actions listed in the scenario are mapped to intuitive UI controls in `get_spec()`.
Ensure the success conditions in the scenario are rigorously scored between 0 and 100.
Include realistic entropy in `reset()` and Gradium-compatible `voice_narrative` feedback in `step()`.
"""
        if repair_context:
            user_prompt += f"\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n{repair_context}\nPlease fix the implementation so it compiles, passes all contract checks, and executes without error."

        raw_response = self.client.generate(
            prompt=user_prompt,
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2
        )
        return self._extract_python_code(raw_response)

    def _extract_python_code(self, response_text: str) -> str:
        """Extracts python code from markdown fence blocks if present."""
        code_match = re.search(r"```python\s*(.*?)\s*```", response_text, re.DOTALL)
        if code_match:
            return code_match.group(1).strip()
        code_match = re.search(r"```\s*(.*?)\s*```", response_text, re.DOTALL)
        if code_match:
            return code_match.group(1).strip()
        return response_text.strip()

    def test_and_validate_code(self, code_str: str, level_id: str) -> Tuple[bool, str, Optional[Any]]:
        """
        Dynamically loads the synthesized code string and validates the contract.
        """
        module_name = f"dynamic_level_{level_id}"
        spec = importlib.util.spec_from_loader(module_name, loader=None)
        module = importlib.util.module_from_spec(spec)
        module.__file__ = f"<dynamic_level_{level_id}>"

        try:
            exec(code_str, module.__dict__)
        except Exception as exc:
            return False, f"Syntax or execution error while loading module: {exc}", None

        if not hasattr(module, "LevelEnvironment"):
            return False, "Module does not define 'LevelEnvironment' class", None

        env_class = getattr(module, "LevelEnvironment")
        try:
            instance = env_class(seed=42)
        except Exception as exc:
            return False, f"Failed to instantiate LevelEnvironment(seed=42): {exc}", None

        is_valid, message = validate_level_contract(instance)
        return is_valid, message, env_class

    def build_level(
        self,
        role: str,
        level_spec: Dict[str, Any],
        rules: List[str],
        assumptions: List[str],
        max_retries: int = 2
    ) -> Path:
        """
        Synthesizes, self-validates, and writes the level code to disk.
        """
        level_id = level_spec.get("id", "unnamed_level")
        repair_context = None

        for attempt in range(max_retries + 1):
            code_str = self.generate_level_code(
                role=role,
                level_spec=level_spec,
                rules=rules,
                assumptions=assumptions,
                repair_context=repair_context
            )

            is_valid, validation_msg, _ = self.test_and_validate_code(code_str, level_id)
            if is_valid:
                target_file = self.levels_dir / f"level_{level_id}.py"
                target_file.write_text(code_str, encoding="utf-8")
                return target_file

            repair_context = f"Attempt {attempt + 1} validation failed: {validation_msg}"

        raise RuntimeError(f"Failed to generate valid LevelEnvironment for '{level_id}' after {max_retries} attempts. Last error: {repair_context}")

    def build_all(self, brief_path: Path) -> Dict[str, Any]:
        """
        Processes a full research brief, generates all levels, and outputs world.json.
        """
        brief = self.load_research_brief(brief_path)
        role = brief.get("role", "general")
        rules = brief.get("rules", [])
        assumptions = brief.get("assumptions", [])
        levels_specs = brief.get("levels", [])

        generated_levels = []
        for level_spec in levels_specs:
            level_path = self.build_level(role, level_spec, rules, assumptions)
            generated_levels.append({
                "id": level_spec["id"],
                "file": str(level_path.relative_to(self.workspace_dir)),
                "goal": level_spec.get("goal")
            })

        # Generate world.json
        world_metadata = {
            "version": 1,
            "researchVersion": brief.get("version", 1),
            "role": role,
            "entrypoint": "builder.levels",
            "levels": generated_levels,
            "rules": rules
        }
        world_file = self.workspace_dir / "world.json"
        with open(world_file, "w", encoding="utf-8") as f:
            json.dump(world_metadata, f, indent=2)

        return world_metadata

    def commit_to_entire(self, commit_message: str):
        """
        Commits generated levels to the repository so Entire captures the checkpoint.
        """
        try:
            subprocess.run(["git", "add", "builder/levels", "world.json"], cwd=self.workspace_dir, check=True)
            subprocess.run(["git", "commit", "-m", commit_message], cwd=self.workspace_dir, check=False)
        except Exception as exc:
            print(f"Entire commit note: {exc}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ReplaceMe AI Builder Agent")
    parser.add_argument("--brief", type=str, default="fixtures/barista-research.json", help="Path to research brief JSON")
    args = parser.parse_args()

    agent = BuilderAgent()
    brief_file = Path(args.brief).resolve()
    print(f"Starting Builder Agent with brief: {brief_file}")
    if not agent.client.is_configured():
        print("Note: GOOGLE_API_KEY / GEMINI_API_KEY is not set. Please provide it in .env to run live generation.")
    else:
        results = agent.build_all(brief_file)
        agent.commit_to_entire(f"feat: AI-generated environment for {results.get('role')} via Entire")
        print("Build complete:", json.dumps(results, indent=2))
