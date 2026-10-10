"""
Cache a finished training as a game's prebuilt training (generic, keyed by slug).

Copies runs/<training_id>/ (run events, status.json, learning records) and the skills that training
exported (skills/<level_id>/skill.json + SKILL.md) into games/<slug>/training/, plus training.json.
POST /api/train restores it instead of training live (frontend/server/api/prebuilt.ts).

    python3 scripts/cache_training.py --slug <slug> [--training-id <id>]   # default: runs/latest.json
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def cache_training(slug: str, training_id: str, root: Path = ROOT) -> Path:
    runs = root / "runs" / training_id
    status = json.loads((runs / "status.json").read_text(encoding="utf-8"))
    if status.get("slug") != slug or status.get("status") != "done" or not status.get("skills_ready"):
        raise SystemExit(f"{training_id} is not a finished training of {slug} (status {status.get('status')})")
    out = root / "games" / slug / "training"
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(runs, out / "runs" / training_id, ignore=shutil.ignore_patterns("*.tmp", "actor.log"))
    levels = [lvl["level_id"] for lvl in status.get("levels", [])]
    for level_id in levels:
        src = root / "skills" / level_id
        skill = json.loads((src / "skill.json").read_text(encoding="utf-8"))
        if not any(str(a.get("run_id", "")).startswith(f"{training_id}-") for a in skill.get("attempts", [])):
            raise SystemExit(f"skills/{level_id} was not exported by {training_id}")
        shutil.copytree(src, out / "skills" / level_id, ignore=shutil.ignore_patterns("*.tmp"))
    (out / "training.json").write_text(json.dumps({"training_id": training_id, "slug": slug, "levels": levels}, indent=2) + "\n",
                                       encoding="utf-8")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--slug", required=True)
    parser.add_argument("--training-id", default=None, help="default: runs/latest.json")
    args = parser.parse_args()
    training_id = args.training_id or json.loads((ROOT / "runs" / "latest.json").read_text())["training_id"]
    out = cache_training(args.slug, training_id)
    print(f"cached {training_id} -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
