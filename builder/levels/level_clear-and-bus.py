"""Generated ReplaceMe environment for waitress level: clear-and-bus"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'clear-and-bus',
    'title': 'Pre-Bussing & Table Maintenance',
    'skill_name': 'Table Bussing & Station Sanitation',
    'instruction': 'Clear finished plates and used silverware from Table 1, '
                   'then scrape and sort ware into the Side Service Station '
                   'bus tub.',
    'controls': [   {   'id': 'stacked_plate_count',
                        'label': 'Stacked Plates Carried',
                        'type': 'slider',
                        'default': 1,
                        'min': 1,
                        'step': 1,
                        'targetMin': 2,
                        'unit': 'plates'},
                    {   'id': 'scrape_food_remnants',
                        'label': 'Scrape Scraps into Trash Chute',
                        'type': 'toggle',
                        'default': False,
                        'unit': None},
                    {   'id': 'separate_flatware',
                        'label': 'Sort Cutlery in Soak Cylinders',
                        'type': 'toggle',
                        'default': False,
                        'unit': None},
                    {   'id': 'crumb_table_cleared',
                        'label': 'Crumb Table and Reset Linens',
                        'type': 'toggle',
                        'default': False,
                        'unit': None}],
    'telemetry': [   {   'id': 'score',
                         'label': 'Score',
                         'unit': '%',
                         'target_range': [80, 100]}]}

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
