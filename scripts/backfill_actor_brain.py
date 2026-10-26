"""
One-off backfill: stores what the actor already learned (exported skills/<id>/skill.json) in
Entire Brain on branch game/<slug>, as the actor now does after each level (shared/brain.py).

    python3 scripts/backfill_actor_brain.py florist barista
"""

import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from shared import brain

_RUN_RE = re.compile(r"^(.+)-l\d+-a\d+$")


def backfill(slug: str) -> int:
    stored = 0
    for path in sorted((root / "skills").glob(f"{slug}-*/skill.json")):
        skill = json.loads(path.read_text(encoding="utf-8"))
        if skill.get("job") != slug or not skill.get("attempts"):
            continue
        match = _RUN_RE.match(skill["attempts"][0].get("run_id") or "")
        training_id = match.group(1) if match else "unknown"  # run ids are <training_id>-l<n>-a<nn>
        stored += sum(len(ids) for ids in brain.push_actor_skill(slug, training_id, skill).values())
    return stored


if __name__ == "__main__":
    if not brain.brain_bin():
        sys.exit("entire-brain is not installed")
    for slug in sys.argv[1:] or ["florist", "barista"]:
        print(f"{slug}: {backfill(slug)} actor facts on {brain.branch_for(slug)}")
