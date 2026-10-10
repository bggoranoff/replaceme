"""
Publish the platform rules on main into Entire Graph.

Takes shared/actions.json and shared/schemas/world.schema.json from `git show <ref>:...`,
indexes them with `entire graph index` and stores a compact snapshot that
builder/graph_check.py queries (`entire graph snapshot-query`) for every generated game.
The builder publishes on demand too; run this to register new rules right after they land on main.

Run: python3 scripts/publish_rules_graph.py [--ref main]
"""

import argparse
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

from builder.graph_check import RULES_REF, publish_rules  # noqa: E402

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--ref", default=RULES_REF, help="git ref holding the rules (default: main)")
    args = parser.parse_args()
    manifest = publish_rules(root, args.ref)
    print(json.dumps(manifest, indent=2))
