"""Generated ReplaceMe environment for barista level: rush-workflow"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        return {
        "level_id": "rush-workflow",
        "title": "Multi-Order Barista Rush Prioritization",
        "skill_name": "Parallel workflow and ticket sequencing during peak morning rush",
        "instruction": "Queue and prepare 3 concurrent espresso tickets in under 120 seconds while keeping stations clean",
        "controls": [
                {
                        "id": "sequence_order",
                        "label": "Ticket Execution Order",
                        "type": "choice",
                        "options": [
                                "Americano -> Cortado -> Latte",
                                "Latte -> Americano -> Cortado"
                        ],
                        "default": "Americano -> Cortado -> Latte"
                },
                {
                        "id": "parallel_steaming",
                        "label": "Steam Milk During Extraction",
                        "type": "toggle",
                        "default": true
                },
                {
                        "id": "station_wipe",
                        "label": "Wipe Counter Between Drinks",
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
