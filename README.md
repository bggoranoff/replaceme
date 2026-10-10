# ReplaceMe

A small multi-agent game that teaches an actor reusable skills for hands-on jobs.

## Three components

- **researcher** takes a job prompt and produces a sourced brief plus 10 level descriptions.
- **builder** turns that brief into a playable game with customer/coworker agents, limited supplies, controls, and fixed scoring rules. Humans and agents use the same actions.
- **actor** plays the levels, evaluates failures, improves procedures, and exports one skill folder per level. Each folder contains SKILL.md plus tool mappings and test evidence for transfer to real-world tools.

Start with a barista game. Add waiter as a second demo. Physical movement and preparation are simulated actions; real deployments need matching tool or device adapters and validation.

## Start here

Coding agents: read [PLATFORMS.md](PLATFORMS.md) for platform choices, access and setup status.

This is a starter repo, not a working app yet. Shared input/output shapes and a small barista fixture are in `shared/` and `fixtures/`.

Use Gemini for reasoning, Gradium for voice, and React/Phaser for the game. Keep model keys on the server. Suggested practice target is 100 rounds per level, but begin with small batches and respect workshop request limits.

## Entire

Repository: https://entire.io/et/replaceme/replaceme

Clone with `entire repo clone /et/replaceme/replaceme`.
Entire project configuration and Codex hooks are installed. Codex reports that the seven hooks need approval in its /hooks panel before session capture is active. On another machine run `entire enable --agent <your-agent>` in this repo. Use `entire status` to check setup. No prior session history was imported.

## Shared contract check

Run `python3 scripts/check_contracts.py` to check the example handoff and skill layout.

## Design

https://docs.google.com/document/d/17rbMJw9svY6GwWtMBj8GJtlIWdR7ELlXjZXmoxaW4Js/edit
