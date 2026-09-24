"""The browser side of the bot: open the portal, find the mess, click it."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

from .config import OUTPUT_DIR, PROFILE_DIR
from .network import NetworkWatcher
from .page_js import FIND_NEXT_STEP_JS, FIND_TARGET_JS
from .util import log

HEAVY_RESOURCES = {"image", "media", "font"}
LOGIN_URL_HINTS = ("login", "signin", "sign-in", "/auth")
NAME_PRESENT_JS = """(n) => (document.body && document.body.innerText || '')
    .toLowerCase().replace(/[^a-z0-9]/g, '').includes(n)"""


def _norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalnum())


class MessBot:
    def __init__(self, cfg: dict, headless: bool | None = None, fast: bool = False):
        self.cfg = cfg
        self.headless = (not cfg["show_browser"]) if headless is None else headless
        self.fast = fast and cfg.get("block_heavy_resources", True)
        self.net = NetworkWatcher(cfg)
        self._pw = None
        self.ctx = None
        self.page = None

    # ---- lifecycle ---------------------------------------------------------
    def __enter__(self):
        PROFILE_DIR.mkdir(exist_ok=True)
        OUTPUT_DIR.mkdir(exist_ok=True)
        self._pw = sync_playwright().start()
        self._launch()
        return self

    def __exit__(self, *exc):
        try:
            if self.ctx:
                self.ctx.close()
        except PlaywrightError:
            pass
        finally:
            self._pw.stop()

    def _launch(self) -> None:
        opts = dict(
            user_data_dir=str(PROFILE_DIR),
            headless=self.headless,
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
        )
        exe = (self.cfg.get("browser_executable") or os.environ.get("MESSBOT_BROWSER") or "").strip()
        if exe:
            opts["executable_path"] = exe
        try:
            self.ctx = self._pw.chromium.launch_persistent_context(**opts)
        except PlaywrightError as e:
            if "Executable doesn't exist" in str(e):
                print("\n[!] The bot's browser isn't installed. Run:  python -m playwright install chromium\n")
                sys.exit(1)
            if "ProcessSingleton" in str(e) or "SingletonLock" in str(e):
                print("\n[!] The bot's browser is already open in another window. Close it and try again.\n")
                sys.exit(1)
            raise
        self.net.attach(self.ctx)
        if self.fast:
            self.ctx.route("**/*", self._route)
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        self.page.on("dialog", self._on_dialog)

    def relaunch(self) -> None:
        """Recover from a crashed/closed browser without losing the login."""
        log("Browser was closed or crashed - reopening it...")
        try:
            self.ctx.close()
        except PlaywrightError:
            pass
        self._launch()

    def alive(self) -> bool:
        try:
            return not self.page.is_closed() and self.page.evaluate("1") == 1
        except PlaywrightError:
            return False

    def _route(self, route) -> None:
        try:
            if route.request.resource_type in HEAVY_RESOURCES:
                route.abort()
            else:
                route.continue_()
        except PlaywrightError:
            pass

    def _on_dialog(self, dialog) -> None:
        log(f"Browser popup: '{dialog.message}' -> clicking OK")
        try:
            dialog.accept()
        except PlaywrightError:
            pass

    # ---- time -----------------------------------------------------------------
    def server_now(self) -> datetime:
        """Local time corrected by the portal's own clock (if known)."""
        off = self.net.clock_offset
        return datetime.now() + timedelta(seconds=off or 0)

    # ---- page helpers ---------------------------------------------------------
    def open_portal(self) -> None:
        try:
            self.page.goto(self.cfg["portal_url"], wait_until="domcontentloaded", timeout=30_000)
        except PlaywrightTimeout:
            log("Portal is slow to load (continuing)...")

    def looks_logged_out(self) -> bool:
        url = self.page.url.lower()
        if any(k in url for k in LOGIN_URL_HINTS):
            return True
        try:
            return self.page.locator("input[type=password]:visible").count() > 0
        except PlaywrightError:
            return False

    def run_pre_clicks(self) -> None:
        for text in self.cfg.get("pre_clicks") or []:
            try:
                self.page.get_by_text(text, exact=False).first.click(timeout=4_000)
                self.page.wait_for_timeout(500)
            except (PlaywrightTimeout, PlaywrightError):
                log(f"(couldn't find '{text}' to click yet)")

    def name_on_page(self, name: str) -> bool:
        try:
            return bool(self.page.evaluate(NAME_PRESENT_JS, _norm(name)))
        except PlaywrightError:
            return False

    def wait_ready(self, name: str, max_s: float = 6.0) -> bool:
        """Return as soon as the mess name is on the page. If it isn't there,
        return shortly after the portal's API calls finish (instead of always
        waiting max_s), so the next refresh comes sooner."""
        start = time.monotonic()
        while time.monotonic() - start < max_s:
            if self.name_on_page(name):
                return True
            last = self.net.last_api_response_at
            if last > start and time.monotonic() - last > 0.8:
                self.page.wait_for_timeout(150)
                return self.name_on_page(name)
            self.page.wait_for_timeout(120)
        return False

    def find_target(self, name: str) -> dict:
        return self.page.evaluate(FIND_TARGET_JS, {
            "messName": name,
            "actionWords": self.cfg["action_words"],
            "avoidWords": self.cfg["avoid_words"],
        })

    def is_full(self, found: dict) -> bool:
        text = (found.get("itemText") or "").lower()
        # whole words only ("full" must not match "successfully")
        return any(re.search(rf"(?<![a-z]){re.escape(w.lower())}(?![a-z])", text) for w in self.cfg["full_words"])

    def page_text(self) -> str:
        try:
            return self.page.evaluate("() => document.body ? document.body.innerText : ''")
        except PlaywrightError:
            return ""

    def new_message(self, before: str) -> tuple[str, str] | None:
        """('success'|'error', line) for a new success/error line on the page."""
        old = set(before.splitlines())
        for line in self.page_text().splitlines():
            low = line.strip().lower()
            if not low or line in old:
                continue
            if any(w in low for w in self.cfg["error_words"]):
                return "error", line.strip()[:160]
            if any(w in low for w in self.cfg["success_words"]):
                return "success", line.strip()[:160]
        return None

    def screenshot(self, name: str) -> Path:
        path = OUTPUT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{name}.png"
        try:
            self.page.screenshot(path=str(path), full_page=True)
        except PlaywrightError:
            pass
        return path

    def highlight_target(self) -> None:
        self.page.evaluate("""() => { const e = document.querySelector('[data-messbot=target]');
            if (e) { e.style.outline = '4px solid red'; e.style.outlineOffset = '2px'; } }""")

    # ---- booking --------------------------------------------------------------
    def book(self, found: dict, name: str) -> tuple[bool, str, list[dict]]:
        """Click the mess, then walk through Submit/Confirm popups.
        Returns (success, message, API write requests made by the page)."""
        before = self.page_text()
        net_index = len(self.net.entries)
        target = self.page.locator("[data-messbot=target]").first
        if found["kind"] == "select":
            target.select_option(value=found["value"])
            log(f"Selected '{found['label']}' in the dropdown")
        else:
            target.click(timeout=5_000)
            log(f"Clicked '{found['label'] or name}'")

        clicked: list[str] = []
        args = {"messName": name,
                "confirmWords": self.cfg["confirm_words"] + self.cfg["action_words"],
                "avoidWords": self.cfg["avoid_words"]}
        for _ in range(6):  # at most 6 follow-up clicks (submit, confirm, ok...)
            nxt = None
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:  # poll quickly for a popup/next button
                self.page.wait_for_timeout(150)
                msg = self.new_message(before)
                if msg:
                    return msg[0] == "success", msg[1], self.net.writes_since(net_index)
                nxt = self.page.evaluate(FIND_NEXT_STEP_JS, {**args, "clicked": clicked})
                if nxt.get("found"):
                    break
            if not nxt or not nxt.get("found"):
                break
            clicked.append(nxt["key"])
            try:
                self.page.locator("[data-messbot-next=yes]").first.click(timeout=5_000)
                log(f"Clicked '{nxt['label']}'" + (" in popup" if nxt["inDialog"] else ""))
            except (PlaywrightTimeout, PlaywrightError) as e:
                log(f"(couldn't click '{nxt['label']}': {e.__class__.__name__})")

        # Wait a little for the server's answer to show up.
        deadline = time.monotonic() + 4.0
        while time.monotonic() < deadline:
            msg = self.new_message(before)
            if msg:
                return msg[0] == "success", msg[1], self.net.writes_since(net_index)
            self.page.wait_for_timeout(200)
        writes = self.net.writes_since(net_index)
        errors = self.cfg["error_words"]
        if writes and all(200 <= w["status"] < 300 and
                          not any(e in json.dumps(w["response"]).lower() for e in errors) for w in writes):
            return True, f"Server accepted the request (HTTP {writes[-1]['status']}) - verify on the portal", writes
        return False, "Clicked through, but didn't see a success message", writes
