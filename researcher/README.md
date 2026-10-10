# Researcher Agent

The **Researcher Agent** is an autonomous AI agent powered by Google Gemini that receives a job or task prompt (e.g., `barista`, `waiter`, `steam the coffee`), investigates the relevant domain standards and competencies, and outputs structured, progressive game scenarios.

## Overview

- **Input**: Human job prompt (e.g. `"barista"`, `"specialty coffee barista"`, `"steam the coffee"`).
- **Core Function**: Identifies real-world standards (e.g. Specialty Coffee Association parameters, equipment specifications, exact temperatures, ratios, and stockout conditions) and translates them into self-contained mission scenarios.
- **Output**: `research.json` (and saved in `fixtures/<role>-research.json`), containing:
  - Role definition, verified domain rules, and assumptions.
  - Progressive levels with goals, customer profiles, initial inventory, available actions, and strict success conditions.

## Usage

```bash
# Run the Researcher Agent from the command line:
python3 -m researcher.agent "barista"

# Or with custom roles:
python3 -m researcher.agent "cocktail bartender"
```
