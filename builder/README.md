# Builder Agent

The **Builder Agent** is an autonomous AI agent powered by Google Gemini (configured via `GOOGLE_API_KEY` or `GEMINI_API_KEY` in `.env`). It transforms high-level job scenarios and competencies emitted by the Researcher Agent into runnable, stochastic Python mini-games (state machines).

## Core Philosophy: Dynamic Synthesis, No Hardcoded Levels

Instead of static, manually written levels, the Builder Agent dynamically synthesizes complete environment modules on the fly for whatever role or scenario the Researcher produces:

1. **Input**: A list of level scenarios (`research.json` or streamed curriculum) containing goals, customer profiles, initial inventory, actions, and success conditions.
2. **Environment Synthesis**: The Builder uses Gemini to write pure Python state machines inheriting from `shared.base_env.BaseLevelEnv`.
3. **Dual Execution Guarantee**:
   - **Headless Actor Execution**: Pure standard library / deterministic math with seeded entropy, capable of running 100+ simulation episodes in milliseconds for automated agent training.
   - **Interactive Human UI**: Exposes rich metadata via `get_spec()` for sliders, toggles, gauges, and real-time Gradium voice cues (`voice_narrative`).
4. **Self-Healing Verification Loop**: Before saving any level, the Builder loads the synthesized module in a sandbox, verifies contract conformance with `validate_level_contract()`, runs test rollouts, and automatically re-prompts the LLM with error context if any check fails.
5. **Entire Platform Checkpoints**: Checkpoints code, AST structure, and reasoning traces to Entire (`entire.io`).

## Architecture & Contract

Every generated level implements the `BaseLevelEnv` contract (`shared/base_env.py`):

```python
class LevelEnvironment(BaseLevelEnv):
    def get_spec(self) -> Dict[str, Any]:
        """UI controls (sliders/toggles/units), telemetry, and voice mappings."""
        ...

    def reset(self, seed: int = None) -> Dict[str, Any]:
        """Injects stochastic entropy (ambient factors, customer patience, supply variations)."""
        ...

    def get_observation(self) -> Dict[str, Any]:
        """Returns observable state to players/actors."""
        ...

    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        """Executes transition, returns (observation, score_0_to_100, is_done, feedback_info)."""
        ...
```

## Running the Builder Agent

```bash
# 1. Provide Gemini API key in .env
cp .env.example .env
# Edit .env and set GOOGLE_API_KEY

# 2. Run the Builder Agent against a research brief
python3 -m builder.agent --brief fixtures/barista-research.json
```
