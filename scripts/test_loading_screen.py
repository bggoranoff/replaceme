"""
Headless check of the loading screen: dino runner controls and live research progress.

Needs a dev server (`cd frontend && npx vite --port 5181 --strictPort`) and Playwright
(`pip install playwright && python -m playwright install chromium`).

    python3 scripts/test_loading_screen.py [--url http://localhost:5181/] [--shots DIR]

POST /api/research is held open so the loading screen stays up. Progress is driven through the
real GET /api/research/progress by writing pipeline artifacts into games/zz-loading-test/
(gitignored, removed afterwards).
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
GAME_DIR = ROOT / 'games' / 'zz-loading-test'
failures = []


def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        failures.append(msg)


def attr(pg, key):
    return pg.get_attribute('.dino-canvas', f'data-{key}')


def becomes(pg, key, value, timeout=8000):
    try:
        pg.wait_for_selector(f'.dino-canvas[data-{key}="{value}"]', timeout=timeout)
        return True
    except Exception:
        return False


def step_becomes(pg, title, timeout=6000):
    try:
        pg.wait_for_function(
            "t => document.querySelector('.loader-step.current strong')?.textContent === t", arg=title, timeout=timeout
        )
        return True
    except Exception:
        return False


def open_loading(browser, url, held, **ctx):
    context = browser.new_context(**ctx)
    pg = context.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.route('**/api/research', lambda route: held.append(route))
    pg.goto(url)
    pg.fill('input', 'test job')
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.loader .dino-canvas')
    pg.wait_for_timeout(300)
    return context, pg, errors


def shot(pg, shots, name):
    if shots:
        pg.screenshot(path=str(Path(shots) / f'{name}.png'), full_page=True)


def desktop(browser, url, shots):
    held = []
    context, pg, errors = open_loading(browser, url, held, viewport={'width': 1280, 'height': 900})
    check(attr(pg, 'state') == 'ready', 'dino waits in ready state')
    check(step_becomes(pg, 'Researching the job'), 'progress starts at the research step')
    shot(pg, shots, 'desktop-ready')

    pg.keyboard.press('Space')
    check(becomes(pg, 'state', 'running', 2000), 'Space starts the run')
    check(becomes(pg, 'airborne', 'true', 1000), 'Space jumps')
    check(becomes(pg, 'airborne', 'false', 2000), 'dino lands')
    pg.keyboard.down('ArrowDown')
    check(becomes(pg, 'ducking', 'true', 1000), 'ArrowDown ducks')
    pg.keyboard.up('ArrowDown')
    check(becomes(pg, 'ducking', 'false', 1000), 'releasing ArrowDown stands up')

    check(becomes(pg, 'state', 'over', 10000), 'hitting an obstacle ends the game')
    score = int(attr(pg, 'score'))
    check(score > 0, f'score counts up ({score})')
    hi = pg.evaluate("() => localStorage.getItem('replaceme.dino.hi')")
    check(hi is not None and int(hi) >= score, f'hi-score is kept ({hi})')
    pg.wait_for_timeout(150)
    shot(pg, shots, 'desktop-over')

    pg.wait_for_timeout(500)
    pg.keyboard.press('Space')
    check(becomes(pg, 'state', 'running', 1000), 'Space restarts after game over')
    pg.wait_for_timeout(200)
    check(int(attr(pg, 'score')) < score, 'score resets on restart')
    pg.wait_for_selector('.dino-canvas[data-airborne="false"]')
    pg.click('.dino-canvas')
    check(becomes(pg, 'airborne', 'true', 1000), 'mouse click jumps')

    GAME_DIR.mkdir(parents=True, exist_ok=True)
    (GAME_DIR / 'research.json').write_text(json.dumps({'tasks': [{'title': 'Task Alpha'}, {'title': 'Task Beta'}]}))
    check(step_becomes(pg, 'Building the world'), 'research.json moves progress to the build step')
    check('Found: Task Alpha · Task Beta' in pg.inner_text('.loader-step.done'), 'research step lists the tasks found')
    check('2 of 4' in pg.inner_text('.loader-progress-head').lower().replace('step ', ''), 'counter shows step 2 of 4')
    (GAME_DIR / 'world.json').write_text('{}')
    check(step_becomes(pg, 'Checking the rules'), 'world.json moves progress to the rules check')
    (GAME_DIR / 'graph_report.json').write_text('{"ok": true}')
    check(step_becomes(pg, 'Saving the game'), 'graph_report.json moves progress to saving')
    check(attr(pg, 'state') in ('running', 'over'), 'game keeps running while progress updates')
    shot(pg, shots, 'desktop-progress')

    while held:
        held.pop().fulfill(status=200, content_type='application/json', body='{"brief": null, "world": null}')
    pg.wait_for_selector('.loader', state='detached', timeout=5000)
    check(pg.query_selector('.loader') is None, 'loading screen leaves when research returns')
    check(not errors, f'no console errors on desktop {errors[:3]}')
    context.close()


def phone(browser, url, shots):
    held = []
    context, pg, errors = open_loading(
        browser, url, held, viewport={'width': 375, 'height': 812}, has_touch=True, is_mobile=True, device_scale_factor=2
    )
    width = pg.evaluate('() => document.documentElement.scrollWidth')
    check(width <= 375, f'no horizontal scroll at 375px (scrollWidth={width})')
    left, right = pg.eval_on_selector('.loader', 'e => { const r = e.getBoundingClientRect(); return [r.left, r.right] }')
    check(left >= 16 and 375 - right >= 16, f'16px side gutters at 375px ({left}, {375 - right})')
    shot(pg, shots, 'phone-ready')

    box = pg.query_selector('.dino-canvas').bounding_box()
    tap = (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    pg.touchscreen.tap(*tap)
    check(becomes(pg, 'state', 'running', 1500), 'tap starts the run')
    check(becomes(pg, 'airborne', 'true', 1000), 'tap jumps')
    check(becomes(pg, 'state', 'over', 10000), 'hitting an obstacle ends the game on a phone')
    pg.wait_for_timeout(650)
    shot(pg, shots, 'phone-over')
    pg.touchscreen.tap(*tap)
    check(becomes(pg, 'state', 'running', 1000), 'tap restarts after game over')
    check(not errors, f'no console errors on phone {errors[:3]}')
    while held:
        held.pop().abort()
    context.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://localhost:5181/')
    ap.add_argument('--shots', help='directory for screenshots')
    args = ap.parse_args()
    shutil.rmtree(GAME_DIR, ignore_errors=True)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            desktop(browser, args.url, args.shots)
            phone(browser, args.url, args.shots)
            browser.close()
    finally:
        shutil.rmtree(GAME_DIR, ignore_errors=True)
    print(f'\n{len(failures)} FAILED' if failures else '\nALL PASSED')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
