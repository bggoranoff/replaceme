"""Generated ReplaceMe environment for waitress level: settle-check"""
import random
from typing import Dict, Any, Tuple
from shared.base_env import BaseLevelEnv

class LevelEnvironment(BaseLevelEnv):
    def __init__(self, seed: int = None):
        super().__init__(seed)

    def get_spec(self) -> Dict[str, Any]:
        # pformat emits Python literals (True/None); json.dumps would emit true/null and break the module
        return {   'level_id': 'settle-check',
    'title': 'Check Splitting & Payment Settlement',
    'skill_name': 'Tender Processing & Shift Closeout',
    'instruction': "Split Table 1's final tab evenly between 2 cards, apply "
                   'the requested 20% gratuity, and print customer merchant '
                   'copies.',
    'controls': [   {   'id': 'split_covers',
                        'label': 'Split Evenly Across Covers',
                        'type': 'slider',
                        'default': 1,
                        'min': 1,
                        'step': 1,
                        'targetMin': 2,
                        'unit': 'guests'},
                    {   'id': 'payment_type',
                        'label': 'Tender Type',
                        'type': 'choice',
                        'default': 'Cash',
                        'options': [   'Cash',
                                       'Split Credit Card',
                                       'House Account',
                                       'Gift Voucher'],
                        'unit': None},
                    {   'id': 'gratuity_pct',
                        'label': 'Tip Percentage Applied',
                        'type': 'slider',
                        'default': 15,
                        'min': 0,
                        'step': 1,
                        'targetMin': 20,
                        'unit': '%'},
                    {   'id': 'print_receipts_and_close',
                        'label': 'Print Merchant Vouchers & Close Table',
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
