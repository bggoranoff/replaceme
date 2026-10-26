---
name: run-locally
description: Set up and run ReplaceMe on this machine with a Google Gemini, Anthropic, OpenAI or AWS Bedrock API key, then check that it works. Use when someone wants to install, configure, start, reproduce or demo the project locally, or switch the model provider.
---

# Run ReplaceMe locally

ReplaceMe is a Vite dev server (React game plus a `/api` middleware in `frontend/server/`) that spawns the Python agents (`researcher/`, `builder/`, `actor/`). Everything runs from one `npm run dev`. The server reads the repo-root `.env` and passes it to the Python processes.

## 1. Prerequisites

- Python 3.11 or newer, Node 22 or newer, git
- One API key from one provider (table below). Without a key the app still runs: prebuilt games load, training uses the deterministic search, and skill chat answers from the training evidence.

## 2. Install

From the repo root:

```bash
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium        # the actor trains in headless Chromium
(cd frontend && npm install)
cp .env.example .env
```

## 3. Pick a provider

Fill in one key in `.env`. `LLM_PROVIDER` picks the provider explicitly. When it is empty, the first provider with a key wins, in the order google, anthropic, openai, bedrock. `LLM_MODEL` overrides the default model.

| Provider | `.env` | Default model | Web search for research |
| --- | --- | --- | --- |
| Google Gemini | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | `gemini-3.8-flash` | Google Search grounding |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-opus-5-5` | `web_search` server tool |
| OpenAI | `OPENAI_API_KEY` | `gpt-6-luna` | `web_search` tool (Responses API) |
| AWS Bedrock | `AWS_BEARER_TOKEN_BEDROCK` (a Bedrock API key), `AWS_REGION` (default `us-east-1`) | `openai.gpt-6-luna` | `web_search` tool via `bedrock-mantle`, if your account offers it |

Bedrock example:

```bash
LLM_PROVIDER=bedrock
AWS_BEARER_TOKEN_BEDROCK=<Bedrock API key from the Bedrock console, API keys page>
AWS_REGION=us-east-1
LLM_MODEL=openai.gpt-6-luna
```

Bedrock calls go through the OpenAI SDK against `https://bedrock-mantle.<region>.api.aws/openai/v1`. Set `BEDROCK_BASE_URL` to use another endpoint, such as `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` with model `us.openai.gpt-6-luna`.

Researching a new job needs web search with citations: a task whose research cites no sources is dropped, and fewer than 4 tasks is an error. If the provider has no web search (some Bedrock setups), use a prebuilt game (step 5) or switch providers for research.

`GRADIUM_API_KEY` is optional and enables speech input and spoken NPC lines.

## 4. Check the setup before starting

The dev server loads `.env` itself. Shell commands do not, so export it first:

```bash
set -a; source .env; set +a
python3 scripts/check_contracts.py
python3 -c "from builder.gemini_client import GeminiClient as C; c = C(); print(c.provider, c.model, 'key ok' if c.is_configured() else 'NO KEY')"
python3 -c "from builder.gemini_client import GeminiClient as C; print(C().generate('Say ok in one word.'))"
```

The last command makes one real model call. An error there is a key, model or region problem, not a problem with the app.

## 5. Run

```bash
cd frontend && npm run dev
```

Open the URL Vite prints (usually http://localhost:5173), then:

1. Type a job. `barista` is prebuilt: it loads after the loading screen without any model calls. Any other job runs the researcher and builder (about 12 model calls, 2-4 minutes).
2. Walk with the arrow keys, talk to NPCs, play the 4 quest levels.
3. Press **Train agent**. For `barista` this replays a recorded training. Set `PREBUILT_GAMES=0` in `.env` to force a live run with your provider.
4. Open the learned skills and chat with them. Chat uses the same provider.

Command-line equivalents (after exporting `.env` as in step 4):

```bash
python3 -m researcher.agent "florist"                          # writes games/florist/research.json
python3 -m builder.agent --brief games/florist/research.json   # writes games/florist/world.json, commits game/florist
python3 -m actor.agent --slug florist --base-url http://localhost:5173 --attempts 10   # dev server must be running
```

## 6. Tests

```bash
for t in check_contracts test_world_builder test_brain test_builder_brain test_builder_contract test_graph_check test_actor; do python3 scripts/$t.py || echo "FAILED: $t"; done
(cd frontend && npm run build)
```

These run offline. The `live Gradium` test in `frontend/server/api/voice.test.ts` needs a valid `GRADIUM_API_KEY`.

## Troubleshooting

- `No API key for provider ...`: `LLM_PROVIDER` names a provider whose key is empty.
- Actor log says `model off (deterministic search)`: no key was found, or `ACTOR_USE_GEMINI=0` is set.
- Bedrock 403 or model not found: the key's IAM identity needs `bedrock:InvokeModel` on the model in that region, and `openai.gpt-6-luna` on `bedrock-mantle` is offered only in `us-east-1`.
- `entire` or `entire-brain` not installed: fine. Reasoning traces fall back to `research.json` and the local rules validator still checks every world.
- Playwright cannot launch Chromium: run `python3 -m playwright install chromium` again.
