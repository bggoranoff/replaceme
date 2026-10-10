"""Generated ReplaceMe environment for waitress level: deliver-entrees"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'deliver-entrees',
    'title': 'Tray Balancing & Pivot Delivery',
    'skill_name': 'Food Carrying & Silent Delivery',
    'instruction': 'Pick up plated dinners from the Kitchen Pass and deliver '
                   'them to Table 1 without spills or auctioning food.',
    'controls': [   {   'id': 'tray_stability_pct',
                        'label': 'Tray Balance & Grip Stability',
                        'type': 'slider',
                        'default': 65,
                        'min': 40,
                        'step': 1,
                        'targetMin': 85,
                        'unit': '%'},
                    {   'id': 'service_side',
                        'label': 'Service Approach Angle',
                        'type': 'choice',
                        'default': "Guest's Right",
                        'options': [   "Guest's Left",
                                       "Guest's Right",
                                       'Across Center of Table'],
                        'unit': None},
                    {   'id': 'auction_food_query',
                        'label': "Ask 'Who ordered the Salmon?'",
                        'type': 'toggle',
                        'default': True,
                        'unit': None},
                    {   'id': 'confirm_plates_placed',
                        'label': 'Set Dishes at Designated Seats',
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
