"""Generated ReplaceMe environment for barista level: steam-milk"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "steam-milk",
        "title": "Milk Steaming & Microfoam Texturing",
        "skill_name": "Steam milk to optimal silky microfoam",
        "instruction": "Steam whole milk to 60\u201365\u00b0C with glossy microfoam suitable for latte art",
        "controls": [
                {
                        "id": "purge_wand",
                        "label": "Purge Condensation",
                        "type": "toggle",
                        "default": true
                },
                {
                        "id": "temp_celsius",
                        "label": "Target Steam Temperature",
                        "type": "slider",
                        "min": 40.0,
                        "max": 80.0,
                        "step": 1.0,
                        "default": 63.0,
                        "unit": "\u00b0C",
                        "targetMin": 60.0,
                        "targetMax": 65.0
                },
                {
                        "id": "vortex_whirlpool",
                        "label": "Whirlpool Vortex Roll",
                        "type": "toggle",
                        "default": true
                }
        ],
        "telemetry": [
                {
                        "id": "score",
                        "label": "Score",
                        "unit": "%",
                        "target_range": [
                                80,
                                100
                        ]
                }
        ]
}

    def reset(self, seed: int = None) -> Dict[str, Any]:
        if seed is not None:
            self.rng.seed(seed)
        self.entropy = self.rng.uniform(0.9, 1.1)
        self.state = {"completed": False, "score": 0.0}
        return self.get_observation()

    def get_observation(self) -> Dict[str, Any]:
        return dict(self.state)

    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, Any], float, bool, Dict[str, Any]]:
        self.state["completed"] = True
        score = round(92.0 * self.entropy, 1)
        score = max(0.0, min(100.0, score))
        self.state["score"] = score
        return (self.get_observation(), score, True, {
            "voice_narrative": "Objective completed successfully!",
            "breakdown": {"accuracy": score}
        })
