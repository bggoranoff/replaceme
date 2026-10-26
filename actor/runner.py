"""
Parallel training runner (shared/game_contract.md section d).

Opens one headless Chromium session per level at
`<game_url>/?slug=<slug>&level=<levelId>&run=<runId>&agent=1`, drives `window.__replaceme`
and runs the 4 levels concurrently (attempts within a level are sequential). Streams RunEvents to
`POST /api/runs/:id/events` and keeps `runs/<training_id>/status.json` (TrainStatus) up to date.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from actor.agent import WORKSPACE_ROOT, ActorAgent, LevelLearner, public_level, write_json
from builder.gemini_client import GeminiClient
from shared import brain

STEP_DELAY_S = float(os.getenv("ACTOR_STEP_DELAY_MS", "150")) / 1000.0
PAGE_TIMEOUT_MS = int(os.getenv("ACTOR_PAGE_TIMEOUT_MS", "60000"))


class PageBridge:
    """Async wrapper around window.__replaceme in a Playwright page."""

    def __init__(self, page):
        self.page = page

    async def wait_ready(self) -> None:
        await self.page.wait_for_function("() => !!(window.__replaceme && window.__replaceme.act)", timeout=PAGE_TIMEOUT_MS)

    async def list_actions(self) -> List[str]:
        infos = await self.page.evaluate("() => window.__replaceme.listActions()")
        return [i["action"] if isinstance(i, dict) else str(i) for i in infos or []]

    async def observe(self) -> Dict[str, Any]:
        return await self.page.evaluate("() => window.__replaceme.observe()")

    async def act(self, action: Dict[str, Any]) -> Dict[str, Any]:
        return await self._settle(self.page.evaluate("(a) => window.__replaceme.act(a)", action), "act")

    async def reset_level(self, level_id: str) -> Dict[str, Any]:
        return await self._settle(self.page.evaluate("(id) => window.__replaceme.resetLevel(id)", level_id), "resetLevel")

    @staticmethod
    async def _settle(call, what: str) -> Dict[str, Any]:
        """A bridge promise that never resolves fails the level instead of hanging the training."""
        try:
            return await asyncio.wait_for(call, PAGE_TIMEOUT_MS / 1000)
        except asyncio.TimeoutError:
            raise RuntimeError(f"__replaceme.{what}() did not resolve within {PAGE_TIMEOUT_MS} ms")


def load_world(slug: str, world_path: Optional[str]) -> Optional[Dict[str, Any]]:
    candidates = [Path(world_path)] if world_path else []
    candidates.append(WORKSPACE_ROOT / "games" / slug / "world.json")
    for path in candidates:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    try:
        out = subprocess.run(["git", "show", f"game/{slug}:games/{slug}/world.json"], cwd=WORKSPACE_ROOT,
                             capture_output=True, text=True, check=True)
        return json.loads(out.stdout)
    except (subprocess.CalledProcessError, ValueError, FileNotFoundError):
        return None


class Trainer:
    def __init__(self, agent: ActorAgent, world: Dict[str, Any], slug: str, training_id: str, attempts: int, api,
                 game_url: str):
        self.agent = agent
        self.game_url = game_url
        self.world = world
        self.slug = slug
        self.training_id = training_id
        self.attempts = attempts
        self.api = api
        self.dir = agent.runs_dir / training_id
        self.status: Dict[str, Any] = {"training_id": training_id, "status": "running", "slug": slug, "levels": [],
                                       "skills_ready": False}
        self.skills: List[Dict[str, Any]] = []
        self.errors: Dict[str, str] = {}
        self.post_failures = 0

    def save_status(self) -> None:
        write_json(self.dir / "status.json", self.status)

    def level_status(self, level_id: str) -> Dict[str, Any]:
        return next(lv for lv in self.status["levels"] if lv["level_id"] == level_id)

    async def emit(self, run_id: str, event: Dict[str, Any]) -> None:
        try:
            res = await self.api.post(f"/api/runs/{run_id}/events", data={"events": [event]})
            if not res.ok:
                raise RuntimeError(f"HTTP {res.status}")
        except Exception as exc:
            self.post_failures += 1
            if self.post_failures <= 3:
                print(f"[actor] could not post run event ({exc}); training continues", file=sys.stderr)

    def on_progress(self, learner: LevelLearner, attempt: int) -> None:
        lv = self.level_status(learner.level["id"])
        lv["attempts_done"] = attempt
        lv["best_score"] = max(a["score"] for a in learner.attempts)
        self.save_status()

    async def train_level(self, browser, level: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        lv = self.level_status(level["id"])
        lv["status"] = "running"
        self.save_status()
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        try:
            page = await context.new_page()
            page.on("pageerror", lambda err: print(f"[actor] page error ({level['id']}): {err}", file=sys.stderr))
            first_run = f"{self.training_id}-l{level['index']}-a01"
            url = f"{self.game_url}/?slug={self.slug}&level={level['id']}&run={first_run}&agent=1"
            await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
            bridge = PageBridge(page)
            await bridge.wait_ready()
            learner = LevelLearner(self.agent, public_level(level), self.world.get("job", self.slug), self.training_id,
                                   self.attempts, bridge, self.emit, self.on_progress, STEP_DELAY_S)
            skill = await learner.play()
            lv["status"] = "done"
            self.skills.append(skill)
            await asyncio.to_thread(brain.push_actor_skill, self.slug, self.training_id, skill)
            return skill
        except Exception as exc:
            lv["status"] = "error"
            self.errors[level["id"]] = str(exc)[:300]
            print(f"[actor] level {level['id']} failed: {exc}", file=sys.stderr)
            return None
        finally:
            self.save_status()
            await context.close()


async def train(slug: str, training_id: str, base_url: str, game_url: str, attempts: int,
                world_path: Optional[str] = None, level_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    from playwright.async_api import async_playwright

    agent = ActorAgent()
    async with async_playwright() as p:
        api = await p.request.new_context(base_url=base_url)
        world = load_world(slug, world_path)
        if world is None:
            res = await api.get(f"/api/world?slug={slug}")
            world = await res.json() if res.ok else None
        levels = [lvl for lvl in (world or {}).get("levels") or []  # v2 levels only (a legacy world has none)
                  if isinstance(lvl, dict) and lvl.get("id") and "index" in lvl and lvl.get("mechanic") in agent.allowlist.mechanics
                  and (not level_ids or lvl["id"] in level_ids)]
        trainer = Trainer(agent, world or {}, slug, training_id, attempts, api, game_url)
        trainer.status["levels"] = [{"level_id": lvl["id"], "level_title": lvl.get("title", lvl["id"]), "attempts_done": 0,
                                     "attempts_total": attempts, "best_score": None, "status": "queued"} for lvl in levels]
        write_json(agent.runs_dir / "latest.json", {"training_id": training_id, "slug": slug})
        if not levels:
            trainer.status.update(status="error", error=f"No v2 world with levels found for slug '{slug}'")
            trainer.save_status()
            await api.dispose()
            return {**trainer.status, "skills": []}
        trainer.save_status()
        llm = GeminiClient()
        gemini = os.getenv("ACTOR_USE_GEMINI", "1") != "0" and llm.is_configured()
        print(f"[actor] training {training_id}: {len(levels)} levels x {attempts} attempts, "
              f"model {f'{llm.provider}/{llm.model}' if gemini else 'off (deterministic search)'}", file=sys.stderr)
        browser = await p.chromium.launch(headless=True)
        try:
            await asyncio.gather(*(trainer.train_level(browser, lvl) for lvl in levels))
        finally:
            await browser.close()
            await api.dispose()
    skills = sorted(trainer.skills, key=lambda s: s["level_index"])
    trainer.status["skills_ready"] = bool(skills)
    trainer.status["status"] = "done" if skills else "error"
    if trainer.errors:
        trainer.status["error"] = "; ".join(f"{lid}: {msg}" for lid, msg in trainer.errors.items())
    trainer.save_status()
    return {**trainer.status, "job": (world or {}).get("job", slug), "skills": skills,
            "training_logs": [{"level_id": s["level_id"], "attempts": s["trained_attempts"], "best_score": s["best_score"],
                               "final_score": s["final_score"]} for s in skills]}
