"""Generated ReplaceMe environment for waiter level: hot-pass-delivery"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'hot-pass-delivery',
    'title': 'Synchronized Hot Entrée Delivery',
    'skill_name': 'Deliver multi-plate courses simultaneously without food '
                  'cooling',
    'instruction': 'Pick up 2 hot main courses from kitchen pass and serve '
                   'Table 1 from the left within 45 seconds',
    'controls': [   {   'id': 'delivery_time_sec',
                        'label': 'Pass-to-Table Delivery Time',
                        'type': 'slider',
                        'min': 10.0,
                        'max': 90.0,
                        'step': 5.0,
                        'default': 35.0,
                        'unit': 's',
                        'targetMin': 15.0,
                        'targetMax': 45.0},
                    {   'id': 'serve_side',
                        'label': 'Serving Approach Side',
                        'type': 'choice',
                        'options': [   'Serve from Left (Correct)',
                                       'Serve from Right',
                                       'Reach Across Table'],
                        'default': 'Serve from Left (Correct)'},
                    {   'id': 'announce_dish',
                        'label': 'Announce Dish Name & Modifications',
                        'type': 'toggle',
                        'default': True}],
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
