# Platforms and setup

Use this guide when coding ReplaceMe. These are the agreed choices for the hackathon. The repo is a scaffold, not a working app. Start with one barista level before adding more.

## Platform choices

| Platform | Use it for | Setup |
| --- | --- | --- |
| Google Cloud | Host the web app and backend on Cloud Run | Workshop project `agentic26zrh-2066`. Check access and billing before deploying. |
| Gemini | Researcher, builder and actor reasoning, plus customer and coworker agents | Select a model available in the workshop account. Make the model configurable. |
| Google Search grounding | Research with source links | Use Gemini grounding and keep citations in the research output. |
| Gradium | Speech input and spoken replies | Use the existing account and server-side `GRADIUM_API_KEY`. Keep text controls working without voice. |
| Entire | Git repository and coding session tracking | Already installed and authenticated on this machine. Repo URL below. |
| React + Phaser | App controls and animated multi-agent game | Proposed frontend stack. Dependencies are not installed yet. |
| Coding agent | Implement the app and builder code generation | Use the developer's configured coding agent with Entire tracking. Entire hosts and tracks work; it is not the simulation builder. |

## Pipeline

- Researcher takes a job prompt and produces `research.json` with sources, rules, assumptions and level descriptions.
- Builder takes that research and generates runnable game code, `world.json`, human and agent controls, tests and fixed scoring rules.
- Actor plays the game, reviews failures, improves procedures and exports skill folders containing `SKILL.md`, tool mappings and evaluation evidence.

The builder must generate its own simulation from the brief. For the first demo, constrain generation to a small barista game template. Customers and a coworker are separate agents. The game engine controls time, inventory and scoring. Model responses cannot directly overwrite game state.

Keep exactly these three components. Skill export belongs to actor. Simulation success alone does not prove real-world competence; exported skills need real tool mappings and validation.

## Local setup

```bash
cd ~/workplace/replaceme
entire status
python3 scripts/check_contracts.py
```

Entire and its Git remote helper are installed in `~/.local/bin`. Git clone already worked with the current login. If access expires, run `entire login`. In Codex, approve Entire hooks through `/hooks` to enable session capture.

Repository: https://entire.io/et/replaceme/replaceme

Git remote: `entire://aws-eu-central-1.entire.io/et/replaceme/replaceme`

The ReplaceMe organization exists. Organization invitations have been sent to the teammates. The repo remains personally owned; organization membership does not yet grant repo access.

## Credentials and infrastructure

- `.env.example` lists `GEMINI_API_KEY` and `GRADIUM_API_KEY`. Put actual values in an ignored local environment file. Never commit keys or send them to the browser frontend.
- Confirm whether workshop Gemini access uses an API key or Vertex AI project credentials before implementing the client. Do not assume a Gemini API key uses the workshop's Cloud credits.
- For Google Cloud setup, use `gcloud auth login` and select project `agentic26zrh-2066`. If using local Vertex AI, configure Application Default Credentials as required by its SDK.
- Start with one backend serving the API and built frontend on Cloud Run. Store persistent run logs and skill exports in Cloud Storage when deploying. Local JSON files are enough for the first local demo.
- Google workshop access was provided, but no cash credit amount was confirmed. Treat the account as temporary and verify expiry, quotas and enabled services before using it.
- Gradium showed 45,000 credits during setup. Check the live balance before a large voice run.
- Start with a few short episodes. Add a run limit and stop control before increasing training volume. Voice is for the live demo, not every training episode.

No cloud deployment, model integration or voice integration has been completed yet.

## First coding target

Build one playable barista level with three drinks, limited stock, customer orders and a coworker who can restock. Support the same actions from UI buttons and the actor. Record a replay and export one example skill with its test results. Add waiter only after this works.

Read `shared/contracts.md` and the three component READMEs before changing handoff formats. Run `python3 scripts/check_contracts.py` after changing fixtures. This only checks the scaffold; add game and integration tests as the implementation grows.

## Official references

- Cloud Run deployment: https://docs.cloud.google.com/run/docs/deploying
- Gemini and search grounding: https://ai.google.dev/gemini-api/docs/google-search/
- Gradium API: https://docs.gradium.ai/
- Entire: https://docs.entire.io/overview
- Shared design: https://docs.google.com/document/d/17rbMJw9svY6GwWtMBj8GJtlIWdR7ELlXjZXmoxaW4Js/edit
