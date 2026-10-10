"""Generated ReplaceMe environment for barista level: rush-order-multi-drink"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'rush-order-multi-drink',
    'title': 'Morning Rush Hour',
    'skill_name': 'Multi-Ticket Sequencing & Speed Bar',
    'instruction': 'Coordinate grinder, steam wand, and espresso station to '
                   'craft an Oat Cortado and an Iced Americano within 90 '
                   'seconds.',
    'controls': [   {   'id': 'recipe_sequencing',
                        'label': 'Prep Sequencing Order',
                        'type': 'choice',
                        'default': 'Americano Water First -> Pull Shots Back '
                                   'to Back -> Steam Oat Milk',
                        'options': [   'Steam Oat Milk First -> Pull Both '
                                       'Shots -> Add Ice Later',
                                       'Americano Water First -> Pull Shots '
                                       'Back to Back -> Steam Oat Milk',
                                       'Pull Cortado Shot First -> Steam Milk '
                                       '-> Pull Americano Shot -> Add Ice']},
                    {   'id': 'oat_milk_temp_target',
                        'label': 'Oat Milk Steaming Temp',
                        'type': 'slider',
                        'default': 70.0,
                        'min': 45.0,
                        'step': 1.0,
                        'targetMin': 55.0,
                        'unit': '°C'},
                    {   'id': 'cortado_ratio_check',
                        'label': 'Cortado Ratio (Espresso : Milk)',
                        'type': 'choice',
                        'default': '1:1 Equal Parts',
                        'options': [   '1:1 Equal Parts',
                                       '1:2 Milky',
                                       '1:3 Latte Style']},
                    {   'id': 'clean_as_you_go_complete',
                        'label': 'Knockbox & Grouphead Flushed',
                        'type': 'toggle',
                        'default': False}],
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
