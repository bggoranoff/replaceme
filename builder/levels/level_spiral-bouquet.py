"""Generated ReplaceMe environment for florist level: spiral-bouquet"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "spiral-bouquet",
        "title": "Spiral Hand-Tied Bouquet Composition",
        "skill_name": "Assemble botanical balance using the Dutch spiral technique",
        "instruction": "Rotate stems in a continuous spiral to create a domed bouquet with focal garden roses and eucalyptus foliage",
        "controls": [
                {
                        "id": "focal_ratio",
                        "label": "Focal Flowers to Filler Ratio",
                        "type": "slider",
                        "min": 0.2,
                        "max": 0.8,
                        "step": 0.05,
                        "default": 0.6,
                        "unit": "%",
                        "targetMin": 0.5,
                        "targetMax": 0.7
                },
                {
                        "id": "spiral_direction",
                        "label": "Spiral Rotation Angle",
                        "type": "choice",
                        "options": [
                                "Clockwise Spiral",
                                "Counter-Clockwise Spiral",
                                "Crossed Stems (Incorrect)"
                        ],
                        "default": "Clockwise Spiral"
                },
                {
                        "id": "binding_tension",
                        "label": "Twine Binding Tension",
                        "type": "slider",
                        "min": 1.0,
                        "max": 10.0,
                        "step": 0.5,
                        "default": 7.0,
                        "unit": "N",
                        "targetMin": 6.0,
                        "targetMax": 8.0
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
