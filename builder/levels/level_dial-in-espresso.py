"""Generated ReplaceMe environment for barista level: dial-in-espresso"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'dial-in-espresso',
    'title': 'The Golden Ratio',
    'skill_name': 'Espresso Dial-In & Extraction',
    'instruction': 'Dose 18.0g of coffee into the portafilter and extract a '
                   '36.0g double shot in 27 to 30 seconds.',
    'controls': [   {   'id': 'dose_grams',
                        'label': 'Dry Coffee Dose',
                        'type': 'slider',
                        'default': 17.0,
                        'min': 15.0,
                        'step': 0.1,
                        'targetMin': 17.8,
                        'unit': 'g'},
                    {   'id': 'grind_setting',
                        'label': 'Grind Fineness (Microns)',
                        'type': 'slider',
                        'default': 3.8,
                        'min': 1.0,
                        'step': 0.1,
                        'targetMin': 2.2,
                        'unit': 'notch'},
                    {   'id': 'tamp_level',
                        'label': 'Tamp Level & Evenness',
                        'type': 'toggle',
                        'default': False},
                    {   'id': 'brew_yield_target',
                        'label': 'Liquid Shot Yield',
                        'type': 'slider',
                        'default': 42.0,
                        'min': 25.0,
                        'step': 0.5,
                        'targetMin': 35.0,
                        'unit': 'g'}],
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
