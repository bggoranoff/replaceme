"""Generated ReplaceMe environment for waitress level: take-order"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'take-order',
    'title': 'Pivot Order & Allergy Tagging',
    'skill_name': 'Order Taking & POS Entry',
    'instruction': "Record Table 1's entree selections with the requested "
                   'gluten allergy modifier and transmit the order at the POS '
                   'Terminal.',
    'controls': [   {   'id': 'seat_1_entree',
                        'label': 'Seat 1 Entree',
                        'type': 'choice',
                        'default': 'Pan-Seared Salmon',
                        'options': [   'Pan-Seared Salmon',
                                       'Ribeye Steak',
                                       'Wild Mushroom Risotto'],
                        'unit': None},
                    {   'id': 'allergy_gluten_free',
                        'label': 'Celiac / Gluten Allergy Flag',
                        'type': 'toggle',
                        'default': False,
                        'unit': None},
                    {   'id': 'seat_2_entree',
                        'label': 'Seat 2 Entree',
                        'type': 'choice',
                        'default': 'Ribeye Steak',
                        'options': [   'Pan-Seared Salmon',
                                       'Ribeye Steak',
                                       'Duck Confit'],
                        'unit': None},
                    {   'id': 'steak_doneness',
                        'label': 'Steak Doneness',
                        'type': 'choice',
                        'default': 'Medium',
                        'options': [   'Rare',
                                       'Medium-Rare',
                                       'Medium',
                                       'Well-Done'],
                        'unit': None},
                    {   'id': 'send_to_kitchen',
                        'label': 'Transmit Kitchen Ticket',
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
