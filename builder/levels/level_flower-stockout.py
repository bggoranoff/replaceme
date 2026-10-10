"""Generated ReplaceMe environment for florist level: flower-stockout"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "flower-stockout",
        "title": "Resolve Flower Shortage with Harmonious Substitute",
        "skill_name": "Handle out-of-stock premium florals with botanical harmony",
        "instruction": "Explain peony shortage to customer and substitute with open garden roses of matching blush palette",
        "controls": [
                {
                        "id": "cooler_audit",
                        "label": "Verify Peony Stock is 0",
                        "type": "toggle",
                        "default": true
                },
                {
                        "id": "substitute_flower",
                        "label": "Harmonious Palette Substitute",
                        "type": "choice",
                        "options": [
                                "Blush David Austin Roses",
                                "Carnations",
                                "Dried Grasses"
                        ],
                        "default": "Blush David Austin Roses"
                },
                {
                        "id": "seasonal_explanation",
                        "label": "Explain Seasonal Blooming Window",
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
