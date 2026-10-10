"""Generated ReplaceMe environment for barista level: latte-art-assembly"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'latte-art-assembly',
    'title': 'Canvas in a Cup',
    'skill_name': 'Integration & Free-Pour Latte Art',
    'instruction': 'Integrate espresso crema with microfoam and execute a '
                   'centered 3-tier tulip latte art design.',
    'controls': [   {   'id': 'cup_tilt_start_deg',
                        'label': 'Cup Tilt Angle (Start)',
                        'type': 'slider',
                        'default': 10.0,
                        'min': 0.0,
                        'step': 5.0,
                        'targetMin': 40.0,
                        'unit': 'deg'},
                    {   'id': 'canvas_pour_height_cm',
                        'label': 'Canvas Pour Height',
                        'type': 'slider',
                        'default': 3.0,
                        'min': 1.0,
                        'step': 0.5,
                        'targetMin': 7.0,
                        'unit': 'cm'},
                    {   'id': 'surface_drop_height_cm',
                        'label': 'Pattern Deposition Height',
                        'type': 'slider',
                        'default': 5.0,
                        'min': 0.5,
                        'step': 0.5,
                        'targetMin': 0.5,
                        'unit': 'cm'},
                    {   'id': 'pattern_selection',
                        'label': 'Latte Art Pattern',
                        'type': 'choice',
                        'default': 'Tulip',
                        'options': [   "Monk's Head",
                                       'Heart',
                                       'Tulip',
                                       'Rosetta']}],
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
