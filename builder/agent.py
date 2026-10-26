"""
ReplaceMe Builder Agent.

Turns a research brief (research.json v2, shared/schemas/research.py ResearchBrief) into:
1. One cozy, Stardew-like village world with 4 quest levels (world.json v2,
   shared/schemas/world.schema.json). Each level uses one of the 5 mechanics in
   shared/actions.json and a declarative, deterministic scoring spec. Humans and the
   actor play the same world in the browser.
2. A game branch game/<slug> in Entire with games/<slug>/ committed on it.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from shared.brain import attach_reasoning
from builder.brain_log import record_build
from builder.flavor import fallback_flavor, gemini_flavor, merge_flavor
from builder.graph_check import finalize_world
from builder.world_gen import BuildError, build_world, select_tasks, slugify, validate_world


class BuilderAgent:
    """
    Autonomous Builder Agent that:
    1. Compiles Researcher tasks into a dynamic world.json (village map, NPCs, 4 quest levels).
    2. Self-checks the world against the platform rules on main.
    3. Creates the Entire game branch (game/<slug>) and commits the game to it.
    """

    def __init__(self, workspace_dir: Optional[Path] = None, gemini_client: Optional[Any] = None):
        self.workspace_dir = workspace_dir or WORKSPACE_ROOT
        self.client = gemini_client
        if self.client is None:
            try:
                from builder.gemini_client import GeminiClient
                self.client = GeminiClient()
            except Exception as exc:  # SDK missing: build with the deterministic flavor
                print(f"[BuilderAgent] Gemini client unavailable: {exc}")

    def load_research_brief(self, brief_path: Path) -> Dict[str, Any]:
        with open(brief_path, "r", encoding="utf-8") as f:
            # reasoning_traces come from Entire Brain first (research.json copy as fallback) for the generation prompts
            return attach_reasoning(json.load(f))

    def load_rules(self) -> Dict[str, Any]:
        return json.loads((self.workspace_dir / "shared" / "actions.json").read_text(encoding="utf-8"))

    def build_world(self, brief: Dict[str, Any], commit: bool = True) -> Dict[str, Any]:
        """
        Creates the complete game world for the frontend and the actor, writes
        games/<slug>/world.json and commits it on game/<slug>.
        """
        rules = self.load_rules()
        slug = slugify(brief.get("slug") or brief.get("job") or "game")
        brief = dict(brief, slug=slug)
        picked = select_tasks(brief.get("tasks") or [])
        traces = brief.get("reasoning_traces") or []
        flavor = merge_flavor(gemini_flavor(self.client, brief, picked, traces), fallback_flavor(brief, picked))

        world, notes = build_world(brief, flavor, rules["version"])
        problems = validate_world(world, rules)
        if problems:
            # A flavor pack that breaks the rules is dropped; the deterministic pack always passes.
            print(f"[BuilderAgent] world failed self-check ({problems[:3]}), rebuilding with fallback flavor")
            world, notes = build_world(brief, fallback_flavor(brief, picked), rules["version"])
            problems = validate_world(world, rules)
        if problems:
            raise BuildError(f"generated world breaks the platform rules: {problems}")
        for note in notes:
            print(f"[BuilderAgent] {note}")

        # Entire Graph check against main's rules: writes games/<slug>/world.json + graph_report.json and
        # commits the game on game/<slug>; raises GraphCheckError instead of committing a failing world
        world = finalize_world(world, self.workspace_dir, commit=commit)
        record_build(world)  # design decisions -> Entire Brain game/<slug>, no-op without the CLI
        return world


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ReplaceMe Builder Agent")
    parser.add_argument("--brief", type=str, required=True, help="Path to research.json v2 (games/<slug>/research.json)")
    parser.add_argument("--no-commit", action="store_true", help="Write games/<slug>/world.json without committing a game branch")
    args = parser.parse_args()

    agent = BuilderAgent()
    world = agent.build_world(agent.load_research_brief(Path(args.brief).resolve()), commit=not args.no_commit)
    print(json.dumps({"slug": world["slug"], "branch": world["branch"], "levels": [l["id"] for l in world["levels"]]}))
