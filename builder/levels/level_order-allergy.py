"""Generated ReplaceMe environment for waiter level: order-allergy"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'order-allergy',
    'title': 'Allergy Verification & Order Entry',
    'skill_name': 'Inquire, flag, and route dietary restrictions safely',
    'instruction': 'Verify shellfish allergy at Table 2 and enter modified '
                   'order into POS terminal with kitchen allergy alert',
    'controls': [   {   'id': 'allergy_prompt',
                        'label': 'Ask Dietary & Allergy Question',
                        'type': 'toggle',
                        'default': True},
                    {   'id': 'flagged_allergen',
                        'label': 'POS Allergen Modifier',
                        'type': 'choice',
                        'options': [   'SEVERE SHELLFISH ALLERGY',
                                       'Gluten-Free',
                                       'Vegan'],
                        'default': 'SEVERE SHELLFISH ALLERGY'},
                    {   'id': 'verbal_chef_check',
                        'label': 'Verbal Kitchen Pass Confirmation',
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
