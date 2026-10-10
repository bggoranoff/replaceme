"""
Test to verify BaseLevelEnv and validate_level_contract functionality.
"""

import sys
from pathlib import Path
root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from shared.base_env import BaseLevelEnv, validate_level_contract
from typing import Dict, Any, Tuple


class MockLevelEnv(BaseLevelEnv):
    def get_spec(self) -> Dict[str, Any]:
        return {
            "level_id": "test_mock",
            "title": "Mock Level",
            "skill_name": "Testing",
            "instruction": "Test instructions",
            "controls": [
                {
                    "id": "slider_action",
                    "label": "Slider Action",
                    "type": "slider",
                    "min": 0.0,
                    "max": 10.0,
                    "step": 1.0,
                    "default": 5.0,
                    "unit": "units"
                }
            ],
            "telemetry": [
                {
                    "id": "progress",
                    "label": "Progress",
                    "unit": "%",
                    "target_range": [0, 100]
                }
            ]
        }

    def reset(self, seed: int = None) -> Dict[str, Any]:
        if seed is not None:
            self.rng.seed(seed)
        self.state = {"step_count": 0}
        self.hidden_factors = {"entropy": self.rng.uniform(0.9, 1.1)}
        return self.get_observation()

    def get_observation(self) -> Dict[str, Any]:
        return {"step_count": self.state["step_count"]}

    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        self.state["step_count"] += 1
        done = self.state["step_count"] >= 5
        score = 85.0
        feedback = {
            "voice_narrative": "Step executed successfully.",
            "breakdown": {"accuracy": 85.0}
        }
        return self.get_observation(), score, done, feedback


if __name__ == "__main__":
    env = MockLevelEnv(seed=42)
    is_valid, msg = validate_level_contract(env)
    assert is_valid, f"Validation failed: {msg}"
    print("Contract test passed successfully:", msg)
