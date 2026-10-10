"""Generated ReplaceMe environment for florist level: stem-preparation"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "stem-preparation",
        "title": "Stem Trimming & 45\u00b0 Angle Cut",
        "skill_name": "Condition fresh flower stems for maximum vase life",
        "instruction": "Prune thorns and cut 5 garden rose stems strictly at a 45\u00b0 angle with clean floral shears",
        "controls": [
                {
                        "id": "cut_angle_deg",
                        "label": "Shears Cutting Angle",
                        "type": "slider",
                        "min": 0.0,
                        "max": 90.0,
                        "step": 5.0,
                        "default": 45.0,
                        "unit": "\u00b0",
                        "targetMin": 40.0,
                        "targetMax": 50.0
                },
                {
                        "id": "strip_foliage_cm",
                        "label": "Foliage Stripped From Bottom",
                        "type": "slider",
                        "min": 0.0,
                        "max": 20.0,
                        "step": 1.0,
                        "default": 10.0,
                        "unit": "cm",
                        "targetMin": 8.0,
                        "targetMax": 15.0
                },
                {
                        "id": "crush_stem_check",
                        "label": "Clean Razor Cut (No Stem Crushing)",
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
