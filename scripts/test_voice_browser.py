"""
Headless browser checks for the voice feature (shared/game_contract.md sections g and h):
- a 'replaceme:dialogue' event is voiced through POST /api/tts only when detail.manual === true,
  with a distinct voice per speaker, and a new bubble interrupts the line still loading;
- the mic next to the job input records, posts WAV to POST /api/stt and fills the input
  (click to toggle, or hold to talk);
- a blocked microphone shows a message and typing keeps working.

Starts the Vite dev server on port 5184 unless one is already running there.
Run: python3 scripts/test_voice_browser.py  (needs `pip install playwright && python -m playwright install chromium`)
"""

import asyncio
import json
import os
import signal
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright, expect

root = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get("VOICE_TEST_PORT", "5184"))
BASE = f"http://127.0.0.1:{PORT}"

# Counts HTMLMediaElement.play() calls and remembers what was played.
PLAY_SPY = """
window.__plays = [];
const realPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  window.__plays.push(this.src);
  return realPlay.call(this).catch(() => {});
};
"""


def wav(seconds: float, rate: int = 24000) -> bytes:
    n = int(seconds * rate)
    header = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 1, 1, rate, rate * 2, 2, 16)
    return header + b"data" + struct.pack("<I", n * 2) + b"\x00\x00" * n


def server_up() -> bool:
    try:
        urllib.request.urlopen(BASE, timeout=1)
        return True
    except Exception:
        return False


def start_server():
    if server_up():
        return None
    proc = subprocess.Popen(
        ["npx", "vite", "--port", str(PORT), "--strictPort", "--host", "127.0.0.1"],
        cwd=root / "frontend",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    deadline = time.time() + 30
    while time.time() < deadline:
        if server_up():
            return proc
        time.sleep(0.3)
    os.killpg(proc.pid, signal.SIGTERM)
    raise RuntimeError(f"Vite dev server did not start on {BASE}")


def check_routes_are_served():
    """The voice routes answer from the dev server: 400 (key set) or 503 (no key), never the SPA."""
    req = urllib.request.Request(f"{BASE}/api/tts", data=b'{"text": ""}', method="POST", headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=10)
        raise AssertionError("empty text must not succeed")
    except urllib.error.HTTPError as err:
        assert err.code in (400, 503), err.code
        assert "error" in json.loads(err.read())
    print("ok  /api/tts is served by the dev server")


async def until(check, timeout=5.0):
    """Waits until check() (sync or async) returns truthy."""
    deadline = time.time() + timeout
    while True:
        value = check()
        if asyncio.iscoroutine(value):
            value = await value
        if value:
            return
        if time.time() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.05)


async def plays_are(page, n: int) -> bool:
    return await page.evaluate("window.__plays.length") == n


async def dispatch(page, detail):
    await page.evaluate("d => window.dispatchEvent(new CustomEvent('replaceme:dialogue', { detail: d }))", detail)


async def test_dialogue_voice_over(browser):
    page = await browser.new_page()
    await page.add_init_script(PLAY_SPY)
    requests = []

    async def on_tts(route):
        body = json.loads(route.request.post_data or "{}")
        requests.append(body)
        if body["text"].startswith("Slow"):
            await asyncio.sleep(0.8)
        try:
            await route.fulfill(status=200, content_type="audio/wav", body=wav(3 if body["text"].startswith("Fast") else 2))
        except Exception:
            pass  # the page aborted this request

    await page.route("**/api/tts", on_tts)
    await page.goto(BASE)
    await page.mouse.click(5, 5)  # a user gesture, as when a human is playing

    line = {"text": "Could you water the north field for me?", "speaker": "Ada", "npcId": "npc-ada"}
    await dispatch(page, {**line, "manual": False})
    await dispatch(page, {k: v for k, v in line.items()})
    await dispatch(page, {**line, "manual": "true"})
    await page.wait_for_timeout(600)
    assert requests == [], f"/api/tts must not be called unless manual === true, got {requests}"
    print("ok  dialogue with manual false/missing/non-boolean is not voiced")

    await dispatch(page, {**line, "manual": True})
    await until(lambda: len(requests) == 1)
    assert requests[0]["text"] == line["text"]
    ada_voice = requests[0]["voice"]
    await until(lambda: plays_are(page, 1))
    print("ok  manual dialogue fetches /api/tts and plays it")

    await dispatch(page, {"text": "The bridge is fixed.", "speaker": "Bo", "npcId": "npc-bo", "manual": True})
    await until(lambda: len(requests) == 2)
    assert requests[1]["voice"] != ada_voice, "each speaker gets its own voice"
    await dispatch(page, {"text": "Thanks again!", "speaker": "Ada", "npcId": "npc-ada", "manual": True})
    await until(lambda: len(requests) == 3)
    assert requests[2]["voice"] == ada_voice, "a speaker keeps the same voice"
    await dispatch(page, {"text": "Hello there.", "speaker": "Cy", "npcId": "npc-cy", "voice": "WorldVoice_01", "manual": True})
    await until(lambda: len(requests) == 4)
    assert requests[3]["voice"] == "WorldVoice_01", "the world's voice id is used when given"
    print("ok  distinct voice per speaker; world voice ids are honoured")

    await until(lambda: plays_are(page, 4))
    await dispatch(page, {"text": "Slow line that gets interrupted", "speaker": "Ada", "npcId": "npc-ada", "manual": True})
    await page.wait_for_timeout(100)
    await dispatch(page, {"text": "Fast line that wins", "speaker": "Bo", "npcId": "npc-bo", "manual": True})
    await page.wait_for_timeout(1500)
    played = await page.evaluate("window.__plays")
    assert len(played) == 5, f"only the newest bubble is played, got {len(played) - 4} plays"
    size = await page.evaluate("src => fetch(src).then(r => r.arrayBuffer()).then(b => b.byteLength)", played[-1])
    assert size == len(wav(3)), "the interrupting line is the one that plays"
    print("ok  a new bubble interrupts the previous line")
    await page.close()


async def test_mic_fills_input(browser):
    context = await browser.new_context(permissions=["microphone"])
    page = await context.new_page()
    uploads = []

    async def on_stt(route):
        req = route.request
        uploads.append((req.headers.get("content-type"), req.post_data_buffer))
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"text": "lighthouse keeper"}))

    await page.route("**/api/stt", on_stt)
    await page.goto(BASE)
    mic = page.locator(".prompt .mic")
    field = page.locator(".prompt input")

    await mic.click()
    await expect(mic).to_have_class("mic listening")
    await expect(field).to_have_attribute("placeholder", "Listening…")
    await page.wait_for_timeout(1200)
    await mic.click()
    await expect(field).to_have_value("lighthouse keeper")
    await expect(mic).to_have_class("mic")
    await expect(field).to_be_focused()
    await expect(page.locator(".prompt-send")).to_be_enabled()
    ctype, body = uploads[0]
    assert ctype == "audio/wav", ctype
    assert body[:4] == b"RIFF" and body[8:12] == b"WAVE"
    channels, rate = struct.unpack("<HI", body[22:28])
    assert (channels, rate) == (1, 24000), (channels, rate)
    assert len(body) > 44 + 24000, "about a second of audio was recorded"
    print("ok  click to record, click to stop: WAV posted to /api/stt and the transcript fills the input")

    await field.fill("edited by hand")
    box = await mic.bounding_box()
    await page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    await page.mouse.down()
    await expect(mic).to_have_class("mic listening")
    await page.wait_for_timeout(900)
    await page.mouse.up()
    await expect(field).to_have_value("lighthouse keeper")
    assert len(uploads) == 2
    print("ok  hold to talk, release to stop")
    await context.close()


async def test_blocked_mic_keeps_typing(browser):
    page = await browser.new_page()
    await page.add_init_script(
        "navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))"
    )
    await page.goto(BASE)
    await page.locator(".prompt .mic").click()
    await expect(page.locator(".hero .hint")).to_contain_text("Microphone access is blocked")
    await page.locator(".prompt input").fill("beekeeper")
    await expect(page.locator(".prompt-send")).to_be_enabled()
    print("ok  blocked microphone shows a message and typing still works")
    await page.close()


async def test_voice_unavailable(browser):
    context = await browser.new_context(permissions=["microphone"])
    page = await context.new_page()
    await page.route("**/api/stt", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error": "Voice is not configured"}'))
    await page.goto(BASE)
    mic = page.locator(".prompt .mic")
    await mic.click()
    await page.wait_for_timeout(400)
    await mic.click()
    await expect(page.locator(".hero .hint")).to_contain_text("isn't set up")
    await expect(mic).to_be_disabled()
    await page.locator(".prompt input").fill("beekeeper")
    await expect(page.locator(".prompt-send")).to_be_enabled()
    print("ok  without a Gradium key the mic disables itself and typing still works")

    tts_requests = []

    async def on_tts(route):
        tts_requests.append(route.request.post_data)
        await route.fulfill(status=503, content_type="application/json", body='{"error": "Voice is not configured"}')

    await page.route("**/api/tts", on_tts)
    for text in ("First line.", "Second line.", "Third line."):
        await dispatch(page, {"text": text, "speaker": "Ada", "npcId": "npc-ada", "manual": True})
        await page.wait_for_timeout(300)
    assert len(tts_requests) == 1, f"after a 503 the voice-over stops asking, got {len(tts_requests)} requests"
    print("ok  without a Gradium key the voice-over stays silent after one request")
    await context.close()


async def test_second_press_cancels_pending_mic(browser):
    context = await browser.new_context(permissions=["microphone"])
    page = await context.new_page()
    # The microphone answers slowly, as while the browser's permission prompt is open.
    await page.add_init_script(
        """
        const realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (c) => new Promise((r) => setTimeout(() => r(realGetUserMedia(c)), 800));
        """
    )
    uploads = []
    await page.route("**/api/stt", lambda route: (uploads.append(1), route.fulfill(status=200, content_type="application/json", body='{"text": "x"}'))[1])
    await page.goto(BASE)
    mic = page.locator(".prompt .mic")
    await mic.click()
    await page.wait_for_timeout(200)
    await mic.click()
    await page.wait_for_timeout(1500)
    await expect(mic).to_have_class("mic")
    assert uploads == [], "a cancelled press records nothing"
    await mic.click()
    await expect(mic).to_have_class("mic listening", timeout=3000)
    print("ok  pressing again while the mic is starting cancels it")
    await context.close()


async def test_autoplay_blocked_plays_on_next_gesture(browser):
    page = await browser.new_page()
    # Headless Chromium ignores the autoplay policy, so play() acts as if blocked until the first key press or click.
    await page.add_init_script(
        """
        window.__plays = [];
        let gestured = false;
        addEventListener('keydown', () => { gestured = true }, true);
        addEventListener('pointerdown', () => { gestured = true }, true);
        const realPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (!gestured) {
            window.__plays.push('blocked');
            return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'));
          }
          window.__plays.push('played');
          return realPlay.call(this).catch(() => {});
        };
        """
    )
    await page.route("**/api/tts", lambda route: route.fulfill(status=200, content_type="audio/wav", body=wav(1)))
    await page.goto(BASE)
    await dispatch(page, {"text": "Morning!", "speaker": "Ada", "npcId": "npc-ada", "manual": True})
    await until(lambda: page.evaluate("window.__plays.length === 1"))
    assert await page.evaluate("window.__plays[0]") == "blocked"
    await page.keyboard.press("ArrowRight")
    await until(lambda: page.evaluate("window.__plays.includes('played')"))
    print("ok  a line blocked by autoplay plays on the next key press")
    await page.close()


async def main():
    proc = start_server()
    try:
        check_routes_are_served()
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
            )
            await test_dialogue_voice_over(browser)
            await test_mic_fills_input(browser)
            await test_blocked_mic_keeps_typing(browser)
            await test_voice_unavailable(browser)
            await test_second_press_cancels_pending_mic(browser)
            await test_autoplay_blocked_plays_on_next_gesture(browser)
            await browser.close()
    finally:
        if proc:
            os.killpg(proc.pid, signal.SIGTERM)
    print("Voice browser checks passed")


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(0)
