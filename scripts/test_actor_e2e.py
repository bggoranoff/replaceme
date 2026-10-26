"""
End-to-end check of actor training in headless browsers (shared/game_contract.md section d):

- starts the test-only mock game page (actor/mock) and the Vite dev server with the /api routes
- clicks "Train agent" in the app, which POSTs /api/train; the server spawns `python3 -m actor.agent`
- 4 levels train concurrently in separate headless Chromium sessions (ACTOR_ATTEMPTS attempts, default 3 here)
- checks: every logged action is allowlisted and schema-valid, scores are recorded, the SSE stream replays
  events, Left/Right keys and the on-screen arrows switch runs, the UI moves to the skills view, and one
  skill.json + SKILL.md per level is exported with learned parameters and evidence.

    python3 scripts/test_actor_e2e.py
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from actor.mock.serve import serve_in_thread  # noqa: E402
from actor.rules import Allowlist  # noqa: E402

FIXTURE = ROOT / "fixtures" / "example-world.v2.json"
ATTEMPTS = int(os.getenv("ACTOR_ATTEMPTS", "3"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def get_json(url: str):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def wait_for(fn, timeout: float, what: str):
    end = time.time() + timeout
    while time.time() < end:
        try:
            value = fn()
            if value:
                return value
        except Exception:
            pass
        time.sleep(0.3)
    raise AssertionError(f"timed out waiting for {what}")


def main() -> None:
    world = json.loads(FIXTURE.read_text())
    slug = world["slug"]
    game_dir = ROOT / "games" / slug
    created_game = not (game_dir / "world.json").exists()
    if created_game:
        game_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURE, game_dir / "world.json")
    skills_dir = Path(tempfile.mkdtemp(prefix="actor-skills-"))
    mock = serve_in_thread(FIXTURE)
    port = int(os.getenv("ACTOR_E2E_PORT") or free_port())
    base = f"http://localhost:{port}"
    env = {**os.environ, "ACTOR_GAME_URL": f"http://127.0.0.1:{mock.server_address[1]}", "ACTOR_ATTEMPTS": str(ATTEMPTS),
           "ACTOR_USE_GEMINI": os.getenv("ACTOR_USE_GEMINI", "0"), "ACTOR_STEP_DELAY_MS": os.getenv("ACTOR_STEP_DELAY_MS", "250"),
           "ACTOR_SKILLS_DIR": str(skills_dir)}
    vite = subprocess.Popen(["npx", "vite", "--port", str(port), "--strictPort"], cwd=ROOT / "frontend", env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    training_id = None
    try:
        wait_for(lambda: get_json(f"{base}/api/train/status"), 30, "the dev server")
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 860})
            legacy_world = json.loads((ROOT / "world.json").read_text())
            # The research pipeline is out of scope here: answer it with a world that carries the fixture's slug.
            page.route("**/api/research", lambda route: route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"brief": None, "world": {**legacy_world, "slug": slug}, "slug": slug})))
            page.goto(base + "/")
            page.fill("input[aria-label='Who do you want to replace?']", world["job"])
            page.keyboard.press("Enter")
            page.get_by_role("button", name="Train agent").click()

            indicator = page.locator(".runs-indicator")
            wait_for(lambda: "Run 1/4" in indicator.inner_text() and "attempt" in indicator.inner_text(), 60, "the runs viewer")
            status = get_json(f"{base}/api/train/status")
            training_id = status["training_id"]
            assert status["status"] == "running" and len(status["levels"]) == 4, status

            # all 4 levels run at the same time
            wait_for(lambda: len({r["level_id"] for r in get_json(f"{base}/api/runs")["runs"] if r["status"] == "running"}) >= 3,
                     60, "concurrent runs")
            titles = [lv["level_title"] for lv in status["levels"]]
            page.keyboard.press("ArrowRight")
            wait_for(lambda: f"Run 2/4: {titles[1]}" in indicator.inner_text(), 5, "ArrowRight to switch runs")
            page.get_by_role("button", name="Next run").click()
            wait_for(lambda: f"Run 3/4: {titles[2]}" in indicator.inner_text(), 5, "the next-run arrow")
            page.keyboard.press("ArrowLeft")
            page.keyboard.press("ArrowLeft")
            page.keyboard.press("ArrowLeft")
            wait_for(lambda: f"Run 4/4: {titles[3]}" in indicator.inner_text(), 5, "ArrowLeft wrapping around")
            page.get_by_role("button", name="Previous run").click()
            wait_for(lambda: f"Run 3/4" in indicator.inner_text(), 5, "the previous-run arrow")
            wait_for(lambda: page.locator(".spec-aim").count() > 0, 30, "the spectator to render a streamed observation")
            buttons = [b.get_attribute("aria-label") or b.inner_text() for b in page.locator(".runs button").all()]
            assert buttons == ["Previous run", "Next run"], f"only the two arrows on the training screen: {buttons}"

            # SSE replays stored events
            first_run = get_json(f"{base}/api/runs")["runs"][0]["id"]
            with urllib.request.urlopen(f"{base}/api/runs/{first_run}/stream", timeout=10) as r:
                head = b""
                while head.count(b"\n\n") < 3:
                    head += r.read1(4096)
            assert head.startswith(b"event: run_event\ndata: ") and b'"type":"run_started"' in head, head[:200]

            wait_for(lambda: page.locator("section.skills").count() > 0, 240, "the hand-off to the skills view")
            browser.close()

        status = get_json(f"{base}/api/train/status")
        assert status["status"] == "done" and status["skills_ready"], status
        assert all(lv["attempts_done"] == ATTEMPTS and lv["best_score"] is not None for lv in status["levels"]), status

        rules = Allowlist.load()
        run_dir = ROOT / "runs" / training_id
        runs = get_json(f"{base}/api/runs?training_id={training_id}")["runs"]
        assert len(runs) == 4 * ATTEMPTS, len(runs)
        assert [(r["level_index"], r["attempt"]) for r in runs] == sorted((r["level_index"], r["attempt"]) for r in runs)
        actions = 0
        for r in runs:
            assert r["status"] in ("passed", "failed") and isinstance(r["score"], (int, float)), r
            events = [json.loads(line) for line in (run_dir / f"{r['id']}.jsonl").read_text().splitlines()]
            assert events[0]["type"] == "run_started" and events[-1]["type"] == "run_finished", r["id"]
            assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
            for e in (e for e in events if e["type"] == "action"):
                actions += 1
                assert rules.validate(e["action"]) == e["action"], e["action"]  # allowlisted and already schema-valid
                assert e["result"]["ok"], e
        for level in world["levels"]:
            learning = json.loads((run_dir / "learning" / f"{level['id']}.json").read_text())
            assert len(learning["attempts"]) == ATTEMPTS
            skill = json.loads((skills_dir / level["id"] / "skill.json").read_text())
            from shared.schemas.skill import LearnedSkill

            LearnedSkill.model_validate(skill)
            assert skill["trained_attempts"] == ATTEMPTS and len(skill["score_history"]) == ATTEMPTS
            assert skill["learned_parameters"] and all(p["evidence"] for p in skill["learned_parameters"])
            if level["mechanic"] == "converse":  # every answered turn, keyed by its turn id (also the last one)
                assert {p["variable"] for p in skill["learned_parameters"]} == {t["id"] for t in level["params"]["turns"]}, \
                    skill["learned_parameters"]
            md = (skills_dir / level["id"] / "SKILL.md").read_text()
            assert md.startswith("---\nname: ") and "## Learned parameters" in md
        print(f"ok  {len(runs)} runs, {actions} actions all allowlisted, 4 skills exported, viewer switching and SSE work")
    finally:
        vite.terminate()
        mock.shutdown()
        shutil.rmtree(skills_dir, ignore_errors=True)
        if training_id:
            shutil.rmtree(ROOT / "runs" / training_id, ignore_errors=True)
        if created_game:
            shutil.rmtree(game_dir, ignore_errors=True)


def variant_world() -> dict:
    """The fixture with a two-phase 'stop' timing level and a deliver level, to cover every mechanic."""
    world = json.loads(FIXTURE.read_text())
    timing = world["levels"][1]
    timing["params"]["phases"] = [
        {"id": "first_stop", "label": "First stop", "unit": "%", "min": 0, "max": 100, "mode": "stop", "period_ms": 2000},
        {"id": "second_stop", "label": "Second stop", "unit": "%", "min": 0, "max": 100, "mode": "stop", "period_ms": 1600},
    ]
    fb = {"too_low": "Too early.", "too_high": "Too late."}
    timing["scoring"]["variables"] = {
        "first_stop": {"target": 62, "tolerance": 10, "weight": 1, "curve": "gaussian", "feedback": fb},
        "second_stop": {"range": [20, 30], "tolerance": 8, "weight": 1, "curve": "linear", "feedback": fb},
    }
    world["levels"][3] = {
        "id": f"{world['slug']}-deliver-orders", "index": 4, "title": "Morning Round", "task_id": "deliver-orders",
        "skill_name": "Delivering orders", "mechanic": "deliver",
        "quest": {"npc_id": world["npcs"][2]["id"], "location_id": world["map"]["locations"][4]["id"], "title": "Orders to deliver"},
        "aim": "Deliver every order to the right place quickly.", "controls_hint": "Arrows walk, Enter picks up or hands over.",
        "metric": {"name": "Service", "description": "Right place and speed"}, "time_limit_ms": 60000,
        "params": {"start_tile": world["map"]["spawn"], "capacity": 2, "par_ms": 6000, "orders": [
            {"id": "o1", "item": "a", "label": "First parcel", "from": f"location:{world['map']['locations'][3]['id']}", "to": f"npc:{world['npcs'][2]['id']}"},
            {"id": "o2", "item": "b", "label": "Second parcel", "from": f"location:{world['map']['locations'][1]['id']}", "to": f"npc:{world['npcs'][3]['id']}"},
            {"id": "o3", "item": "c", "label": "Third parcel", "from": f"location:{world['map']['locations'][2]['id']}", "to": f"npc:{world['npcs'][1]['id']}"},
        ]},
        "scoring": {"pass_threshold": 70, "weights": {"accuracy": 3, "time": 1},
                    "feedback": {"wrong_target": "Wrong person.", "late": "Too slow.", "missed": "Orders left behind."}},
    }
    return world


def check_all_mechanics() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="actor-variant-"))
    path = tmp / "world.json"
    world = variant_world()
    path.write_text(json.dumps(world))
    mock = serve_in_thread(path)
    attempts = 5
    try:
        env = {**os.environ, "ACTOR_USE_GEMINI": os.getenv("ACTOR_USE_GEMINI", "0"), "ACTOR_STEP_DELAY_MS": "0",
               "ACTOR_SKILLS_DIR": str(tmp / "skills")}
        url = f"http://127.0.0.1:{mock.server_address[1]}"
        out = subprocess.run([sys.executable, "-m", "actor.agent", "--slug", world["slug"], "--world", str(path), "--training-id",
                              "variant-test", "--base-url", url, "--attempts", str(attempts)],
                             cwd=ROOT, env=env, capture_output=True, text=True, timeout=600)
        result = json.loads(out.stdout)
        assert result["status"] == "done" and len(result["skills"]) == 4, out.stderr[-2000:]
        rules = Allowlist.load()
        events = mock.events
        assert len(events) == 4 * attempts
        for run_id, evs in events.items():
            for e in evs:
                if e["type"] == "action":
                    assert rules.validate(e["action"]) == e["action"], e["action"]
        by_level = {s["level_id"]: s for s in result["skills"]}
        timing = by_level[world["levels"][1]["id"]]
        deliver = by_level[world["levels"][3]["id"]]
        assert timing["best_score"] >= 90, timing["score_history"]
        assert deliver["best_score"] >= 70 and all(a["score"] > 0 for a in deliver["attempts"]), deliver["score_history"]
        print(f"ok  stop-mode timing best {timing['best_score']}, deliver best {deliver['best_score']}")
    finally:
        mock.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.rmtree(ROOT / "runs" / "variant-test", ignore_errors=True)


if __name__ == "__main__":
    main()
    check_all_mechanics()
    print("Actor end-to-end test passed")
