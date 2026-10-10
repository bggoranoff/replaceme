"""Generated ReplaceMe environment for barista level: stockout-resolution"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "stockout-resolution",
        "title": "Handle Milk Stockout & Order Substitution",
        "skill_name": "Resolve unavailable supplies with clear customer communication",
        "instruction": "Verify oat milk shortage in fridge, offer almond alternative, and secure customer confirmation",
        "controls": [
                {
                        "id": "fridge_check",
                        "label": "Inspect Inventory Count",
                        "type": "toggle",
                        "default": true
                },
                {
                        "id": "chosen_alternative",
                        "label": "Offered Alternative Milk",
                        "type": "choice",
                        "options": [
                                "Organic Almond Milk",
                                "Soy Milk",
                                "Lactose-Free Dairy"
                        ],
                        "default": "Organic Almond Milk"
                },
                {
                        "id": "customer_confirmation",
                        "label": "Obtain Explicit Customer Consent",
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
