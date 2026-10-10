"""
ReplaceMe Shared Level Environment Interface.

Every level dynamically synthesized by the Builder Agent must inherit from
BaseLevelEnv and implement its contract. This guarantees compatibility with:
1. Fast headless rollouts for the Actor Agent (100+ runs in milliseconds).
2. Dynamic UI rendering (sliders, toggles, gauges, Gradium voice prompts).
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple
import random


class BaseLevelEnv(ABC):
    """
    Standard ReplaceMe Mini-Environment Abstract Base Class.
    """

    def __init__(self, seed: int = None):
        self.rng = random.Random(seed)
        self.state: Dict[str, Any] = {}
        self.hidden_factors: Dict[str, Any] = {}
        self.reset(seed)

    @abstractmethod
    def get_spec(self) -> Dict[str, Any]:
        """
        Metadata for rendering UI controls and Gradium voice mappings.
        Expected keys:
          - level_id: str
          - title: str
          - skill_name: str
          - instruction: str
          - controls: list of {id, label, type, min, max, step, default, unit, options}
          - telemetry: list of {id, label, unit, target_range}
        """
        raise NotImplementedError

    @abstractmethod
    def reset(self, seed: int = None) -> Dict[str, Any]:
        """
        Resets environment state and introduces stochastic entropy.
        Returns:
          Initial observation dictionary.
        """
        raise NotImplementedError

    @abstractmethod
    def get_observation(self) -> Dict[str, Any]:
        """
        Returns the current observable state dictionary (excluding hidden entropy).
        """
        raise NotImplementedError

    @abstractmethod
    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        """
        Executes an action transition.
        Args:
            actions: Dictionary mapping control IDs to selected values.
        Returns:
            Tuple of:
              - observation: Dict[str, Any]
              - score: float (0.0 to 100.0)
              - is_done: bool
              - feedback_info: Dict[str, Any] containing at least:
                  * "voice_narrative": str (Gradium-compatible prompt)
                  * "breakdown": Dict[str, float]
        """
        raise NotImplementedError


def validate_level_contract(env_instance: BaseLevelEnv) -> Tuple[bool, str]:
    """
    Validates that a generated LevelEnvironment satisfies the interface contract
    and can run headless simulation steps without error.
    """
    try:
        spec = env_instance.get_spec()
        required_spec_keys = {"level_id", "title", "skill_name", "instruction", "controls", "telemetry"}
        missing_spec = required_spec_keys - set(spec.keys())
        if missing_spec:
            return False, f"Missing get_spec() keys: {missing_spec}"

        # Check reset
        obs = env_instance.reset(seed=42)
        if not isinstance(obs, dict):
            return False, f"reset() must return dict, got {type(obs)}"

        # Check default actions derived from spec
        default_actions = {}
        for control in spec.get("controls", []):
            cid = control.get("id")
            if "default" in control:
                default_actions[cid] = control["default"]
            elif control.get("type") == "toggle":
                default_actions[cid] = False
            elif control.get("type") == "slider":
                default_actions[cid] = control.get("min", 0.0)
            elif control.get("type") == "choice":
                opts = control.get("options", [])
                default_actions[cid] = opts[0] if opts else ""

        # Test 10 headless steps
        for step_i in range(10):
            obs, score, done, info = env_instance.step(default_actions)
            if not isinstance(obs, dict):
                return False, f"step() obs must be dict, got {type(obs)}"
            if not isinstance(score, (int, float)):
                return False, f"step() score must be numeric, got {type(score)}"
            if not (0.0 <= score <= 100.0):
                return False, f"step() score must be between 0 and 100, got {score}"
            if not isinstance(done, bool):
                return False, f"step() is_done must be bool, got {type(done)}"
            if not isinstance(info, dict):
                return False, f"step() feedback_info must be dict, got {type(info)}"
            if "voice_narrative" not in info:
                return False, "feedback_info missing 'voice_narrative'"
            if "breakdown" not in info:
                return False, "feedback_info missing 'breakdown'"
            if done:
                env_instance.reset(seed=step_i + 100)

        return True, "Contract validated successfully"
    except Exception as exc:
        return False, f"Contract validation failed with exception: {exc}"
