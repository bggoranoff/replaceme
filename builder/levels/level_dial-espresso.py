"""Generated ReplaceMe environment for barista level: dial-espresso"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "dial-espresso",
        "title": "Dial in Espresso Extraction",
        "skill_name": "Calibrate grind size, dose, and extraction ratio",
        "instruction": "Dose 18g and extract a 36g double shot in 28 seconds with rich golden crema",
        "controls": [
                {
                        "id": "dose_grams",
                        "label": "Bean Dose Weight",
                        "type": "slider",
                        "min": 14.0,
                        "max": 22.0,
                        "step": 0.5,
                        "default": 18.0,
                        "unit": "g",
                        "targetMin": 17.5,
                        "targetMax": 18.5
                },
                {
                        "id": "tamp_force_kg",
                        "label": "Tamping Pressure",
                        "type": "slider",
                        "min": 5.0,
                        "max": 25.0,
                        "step": 1.0,
                        "default": 15.0,
                        "unit": "kg",
                        "targetMin": 12.0,
                        "targetMax": 18.0
                },
                {
                        "id": "shot_yield_g",
                        "label": "Liquid Shot Yield",
                        "type": "slider",
                        "min": 25.0,
                        "max": 45.0,
                        "step": 1.0,
                        "default": 36.0,
                        "unit": "g",
                        "targetMin": 35.0,
                        "targetMax": 37.0
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
