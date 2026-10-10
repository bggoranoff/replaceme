"""Generated ReplaceMe environment for barista level: steam-microfoam"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'steam-microfoam',
    'title': 'Velvet Vortex',
    'skill_name': 'Milk Steaming & Microfoam Texturing',
    'instruction': 'Steam whole milk into glossy, silky microfoam at 60°C to '
                   '65°C without large surface bubbles.',
    'controls': [   {   'id': 'purge_before_after',
                        'label': 'Wand Purged & Wiped',
                        'type': 'toggle',
                        'default': False},
                    {   'id': 'stretch_duration_sec',
                        'label': 'Air Aeration Duration',
                        'type': 'slider',
                        'default': 8.0,
                        'min': 1.0,
                        'step': 0.5,
                        'targetMin': 3.5,
                        'unit': 's'},
                    {   'id': 'pitcher_angle_vortex',
                        'label': 'Pitcher Angle (Vortex Flow)',
                        'type': 'slider',
                        'default': 10.0,
                        'min': 0.0,
                        'step': 1.0,
                        'targetMin': 25.0,
                        'unit': 'deg'},
                    {   'id': 'shutoff_temp_celsius',
                        'label': 'Shutoff Temperature',
                        'type': 'slider',
                        'default': 75.0,
                        'min': 45.0,
                        'step': 1.0,
                        'targetMin': 60.0,
                        'unit': '°C'}],
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
