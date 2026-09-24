#!/usr/bin/env python3
"""
SpaceBasic Mess Booking Bot
===========================

Waits for mess booking to open on the SpaceBasic portal and picks your
preferred caterer (default: Sagarfoods) as soon as it becomes available.

Run it with no arguments for a friendly menu:

    python mess_bot.py

Or use a command directly:

    python mess_bot.py login                       # one-time: log in and save the session
    python mess_bot.py test                        # find Sagarfoods on the page, don't click
    python mess_bot.py run                         # start watching and book immediately when open
    python mess_bot.py run --at "2026-09-25 18:00" # sleep until 18:00, then start watching
    python mess_bot.py inspect                     # save screenshot + page dump for debugging
    python mess_bot.py notify-test                 # send a test notification to your phone

Everything runs in YOUR browser session on YOUR computer, using YOUR account.
The bot never sees or stores your password.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - friendly message for first-time users
    print("\n[!] Playwright is not installed yet.")
    print("    Run the setup first:  pip install -r requirements.txt")
    print("                          python -m playwright install chromium\n")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
PROFILE_DIR = HERE / "browser-profile"
OUTPUT_DIR = HERE / "output"

DEFAULT_CONFIG = {
    # What to book
    "mess_name": "Sagarfoods",
    # Where to book it
    "portal_url": "https://portal.spacebasic.com/module/messmanager/allocations",
    # Optional: texts of buttons/tabs to click (in order) before the mess list
    # shows up, e.g. ["Book Mess", "October"]. Leave empty if the list is
    # visible directly on the allocations page.
    "pre_clicks": [],
    # How often to refresh while waiting for booking to open (seconds).
    # Keep this >= 2 so you don't hammer the portal (and don't get flagged).
    "refresh_every_seconds": 3,
    # With --at, start refreshing this many seconds BEFORE the given time
    # (in case your clock is a bit off).
    "start_early_seconds": 90,
    # Give up after this many minutes of trying.
    "give_up_after_minutes": 45,
    # Show the browser window (true) or run invisibly (false).
    "show_browser": True,
    # Optional phone notifications via the free ntfy app (https://ntfy.sh).
    # Pick a hard-to-guess topic name, e.g. "messbot-ravi-8f3k2", subscribe to
    # it in the ntfy app, and paste it here. Leave empty to disable.
    "ntfy_topic": "",
    # Optional: path to Chrome/Edge if you don't want to use Playwright's Chromium.
    "browser_executable": "",
    # Words on buttons that mean "book/select this" (case-insensitive).
    "action_words": ["book", "select", "choose", "opt", "apply", "allocate", "register",
                     "submit", "save", "confirm", "proceed", "continue", "subscribe", "join", "enroll"],
    # Words in a confirmation popup that mean "yes, do it".
    "confirm_words": ["yes", "ok", "okay", "confirm", "submit", "book", "proceed",
                      "continue", "sure", "agree", "done", "save"],
    # Buttons with these words are NEVER clicked.
    "avoid_words": ["cancel", "no", "close", "back", "view", "menu", "details", "detail",
                    "logout", "log out", "sign out", "delete", "remove", "reject", "decline",
                    "withdraw", "change", "history", "download", "print", "feedback"],
    # Text that means the booking went through.
    "success_words": ["success", "successfully", "booked", "allocated", "confirmed",
                      "request submitted", "already", "registered"],
}


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


def beep(times: int = 3) -> None:
    for _ in range(times):
        print("\a", end="", flush=True)
        time.sleep(0.25)


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except json.JSONDecodeError as e:
            print(f"[!] config.json has a mistake (line {e.lineno}): {e.msg}")
            print("    Fix it, or delete config.json to go back to defaults.")
            sys.exit(1)
    else:
        save_config(cfg)
    cfg["refresh_every_seconds"] = max(1.0, float(cfg["refresh_every_seconds"]))
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def notify(cfg: dict, title: str, message: str, urgent: bool = False) -> None:
    """Beep locally and (optionally) push to the phone via ntfy.sh."""
    beep(5 if urgent else 2)
    topic = (cfg.get("ntfy_topic") or "").strip()
    if not topic:
        return
    try:
        req = urllib.request.Request(
            f"https://ntfy.sh/{topic}",
            data=message.encode("utf-8"),
            headers={"Title": title, "Priority": "urgent" if urgent else "default",
                     "Tags": "fork_and_knife"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:  # never let a notification failure stop the bot
        log(f"(could not send phone notification: {e})")


def parse_when(text: str) -> datetime:
    """Accept '18:00', '6pm', '2026-09-25 18:00', 'tomorrow 18:00'."""
    text = text.strip().lower()
    now = datetime.now()
    day = now.date()
    if text.startswith("tomorrow"):
        day = day + timedelta(days=1)
        text = text[len("tomorrow"):].strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            pass
    for fmt in ("%H:%M", "%H:%M:%S", "%I%p", "%I:%M%p", "%I %p", "%I:%M %p"):
        try:
            t = datetime.strptime(text.upper(), fmt).time()
            when = datetime.combine(day, t)
            # "18:00" typed after 18:00 today means tomorrow
            if when < now and day == now.date():
                when += timedelta(days=1)
            return when
        except ValueError:
            pass
    raise ValueError(f"Couldn't understand the time '{text}'. Try e.g. 18:00 or 2026-09-25 18:00")


# --------------------------------------------------------------------------- #
# In-page logic (runs inside the browser, so it is fast)
# --------------------------------------------------------------------------- #

# Shared helpers injected into every in-page script.
#
# The key idea is the "item": the row/card/list entry that holds the mess
# name. We start at the element with the name and climb up until we reach an
# element that has look-alike siblings (the other messes in the same list).
# Anything clickable INSIDE that item belongs to our mess; buttons outside it
# (another mess's "Book", a page-level "Submit") are never mistaken for it.
COMMON_JS = r"""
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(args.messName);
  const isVisible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const labelOf = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
  const hasWord = (text, words) => {
    const t = norm(text);
    return words.map(norm).some(w => w && (t === w || t.startsWith(w) || t.endsWith(w)));
  };
  const isDisabled = el => !!(el.disabled || el.getAttribute('aria-disabled') === 'true' ||
                              el.closest('fieldset[disabled]') || /(^|\s)disabled(\s|$)/i.test(el.className || ''));
  const signature = el => el.tagName + '.' + [...el.classList].filter(c => !/active|selected|checked/i.test(c)).sort().join('.');

  // Smallest visible elements whose text contains the mess name.
  const nameElements = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      let el = node.parentElement;
      // The name may be split across tags (<b>Sagar</b>foods): climb a little.
      for (let i = 0; el && i < 4 && !norm(el.innerText).includes(target); i++) el = el.parentElement;
      if (!el || seen.has(el) || !norm(el.innerText).includes(target) || !isVisible(el)) continue;
      if (['SCRIPT', 'STYLE', 'OPTION', 'TITLE'].includes(el.tagName)) continue;
      seen.add(el);
      out.push(el);
    }
    // keep only the innermost ones
    return out.filter(a => !out.some(b => b !== a && a.contains(b)));
  };

  // Climb from the name to the list item that represents this mess.
  // Items found as one entry of a repeated list are remembered in listItems:
  // those are trustworthy. Anything else (e.g. a "Your current mess: X"
  // heading) is only used when the page has no list at all.
  const listItems = new WeakSet();
  const itemOf = nameEl => {
    let el = nameEl;
    for (let depth = 0; depth < 8 && el.parentElement && el.parentElement !== document.body; depth++) {
      const sig = signature(el);
      const twins = [...el.parentElement.children].filter(c => c !== el && signature(c) === sig && norm(c.innerText).length > 0);
      if (twins.length > 0 && depth > 0) { listItems.add(el); return el; }
      if (el.matches('tr, li, label, [role=row], [role=listitem], [role=option], [role=radio], mat-card, ion-item')) {
        listItems.add(el); return el;
      }
      el = el.parentElement;
    }
    return el;
  };

  // Among candidates inside `item`, keep the one that sits closest to the
  // name (deepest common ancestor). If several tie, it's ambiguous: none.
  const depthOf = el => { let d = 0; while (el) { d++; el = el.parentElement; } return d; };
  const commonAncestor = (a, b) => { while (a && !a.contains(b)) a = a.parentElement; return a; };
  const closest = (nameEl, cands) => {
    if (cands.length <= 1) return cands[0] || null;
    const scored = cands.map(c => ({ c, d: depthOf(commonAncestor(nameEl, c)) }));
    const best = Math.max(...scored.map(x => x.d));
    const top = scored.filter(x => x.d === best);
    return top.length === 1 ? top[0].c : null;
  };

  const inAnyItem = (btn, items) => items.some(it => it.contains(btn) || btn.contains(it));
"""

# Finds the control that belongs to the mess we want. Works for the common
# layouts: a card/row per mess with its own button, a radio list + Submit,
# a <select> dropdown, or a clickable card. Marks the element with
# data-messbot="target" so Python can click it with a real mouse click.
FIND_TARGET_JS = r"""
(args) => {
""" + COMMON_JS + r"""
  document.querySelectorAll('[data-messbot]').forEach(e => e.removeAttribute('data-messbot'));
  const bodyText = norm(document.body ? document.body.innerText : '');

  // 1) <select> dropdowns
  for (const sel of document.querySelectorAll('select')) {
    for (const opt of sel.options) {
      if (norm(opt.textContent).includes(target)) {
        sel.setAttribute('data-messbot', 'target');
        return { found: true, kind: 'select', value: opt.value, label: opt.textContent.trim(),
                 disabled: sel.disabled || opt.disabled };
      }
    }
  }
  if (!bodyText.includes(target)) return { found: false, reason: 'name-not-on-page' };

  const names = nameElements();
  if (!names.length) return { found: false, reason: 'name-not-visible' };

  const BUTTONS = 'button, input[type=button], input[type=submit], [role=button], a';
  const CHOICES = 'input[type=radio], input[type=checkbox], [role=radio], [role=checkbox], [role=option], label';
  const mark = (el, kind) => {
    // Hidden radio/checkbox (custom styled)? Click its label instead.
    if (el.matches('input') && !isVisible(el)) {
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      if (lab && isVisible(lab)) el = lab;
    }
    el.setAttribute('data-messbot', 'target');
    return { found: true, kind, label: labelOf(el).replace(/\s+/g, ' ').slice(0, 80), disabled: isDisabled(el) };
  };

  const pairs = names.map(n => ({ nameEl: n, item: itemOf(n) }));
  const inLists = pairs.filter(p => listItems.has(p.item));
  for (const { nameEl, item } of (inLists.length ? inLists : pairs)) {
    // a) A "Book/Select/Opt" button inside this mess's card/row
    const actions = [...item.querySelectorAll(BUTTONS)].filter(isVisible)
      .filter(b => hasWord(labelOf(b), args.actionWords) && !hasWord(labelOf(b), args.avoidWords));
    const enabledActions = actions.filter(b => !isDisabled(b));
    const action = closest(nameEl, enabledActions.length ? enabledActions : actions);
    if (action) return mark(action, 'action');
    if (actions.length) continue;  // ambiguous: several buttons, none clearly ours
    // b) A radio/checkbox/label for this mess
    const choice = item.matches(CHOICES) ? item : closest(nameEl, [...item.querySelectorAll(CHOICES)]);
    if (choice) return mark(choice, 'choice');
    // c) The card itself is clickable (or sits inside a clickable wrapper)
    const wrapper = nameEl.closest('a, button, [role=button], [role=option], [onclick], label');
    if (wrapper && !hasWord(labelOf(wrapper), args.avoidWords)) return mark(wrapper, 'choice');
  }
  // d) Fallback: a card that looks clickable (pointer cursor), e.g. a React div with onClick
  for (const { nameEl, item } of (inLists.length ? inLists : pairs)) {
    if ([nameEl, item].some(e => getComputedStyle(e).cursor === 'pointer')) return mark(item, 'choice');
  }
  return { found: false, reason: 'no-button-for-it-yet' };
}
"""

# After the first click, finds the next "Submit/Confirm/Yes" button to press.
# Only picks buttons inside a popup, buttons inside our mess's own card/row,
# or a page-level button that belongs to NO mess card. So it can never book
# a different mess by mistake.
FIND_NEXT_STEP_JS = r"""
(args) => {
""" + COMMON_JS + r"""
  const alreadyClicked = new Set(args.clicked);
  document.querySelectorAll('[data-messbot-next]').forEach(e => e.removeAttribute('data-messbot-next'));
  const DIALOG = '[role=dialog], [role=alertdialog], [aria-modal=true], .modal, .modal-dialog, .swal2-popup, ' +
                 '.swal-modal, .MuiDialog-root, .ant-modal, .ant-popover, .cdk-overlay-pane, .mat-dialog-container, ' +
                 'ion-alert, ion-modal, .v-dialog, .popup, [class*="Dialog"], [class*="dialog"], [class*="modal"]';

  // All mess cards on the page = look-alike siblings of our card.
  let ours = nameElements().map(itemOf);
  if (ours.some(it => listItems.has(it))) ours = ours.filter(it => listItems.has(it));
  const allItems = [];
  for (const it of ours) {
    allItems.push(it);
    if (it.parentElement) for (const c of it.parentElement.children) if (c !== it && signature(c) === signature(it)) allItems.push(c);
  }

  const buttons = [...document.querySelectorAll('button, input[type=submit], input[type=button], [role=button], a.btn, a.button')]
    .filter(isVisible).filter(b => !isDisabled(b));
  const candidates = [];
  for (const b of buttons) {
    const text = labelOf(b);
    if (!text || hasWord(text, args.avoidWords) || !hasWord(text, args.confirmWords)) continue;
    const key = norm(text) + '|' + Math.round(b.getBoundingClientRect().top);
    if (alreadyClicked.has(key)) continue;
    if (b.getAttribute('data-messbot') === 'target') continue;  // our first click, don't repeat it
    const inDialog = !!b.closest(DIALOG);
    const inOurItem = inAnyItem(b, ours);
    const inOtherItem = !inOurItem && inAnyItem(b, allItems);
    candidates.push({ b, text, key, inDialog, inOurItem, inOtherItem });
  }
  const pick = candidates.find(c => c.inDialog) ||
               candidates.find(c => c.inOurItem) ||
               candidates.find(c => !c.inOtherItem);
  if (!pick) return { found: false };
  pick.b.setAttribute('data-messbot-next', 'yes');
  return { found: true, label: pick.text.replace(/\s+/g, ' ').slice(0, 60), key: pick.key, inDialog: pick.inDialog };
}
"""

PAGE_SUMMARY_JS = r"""
() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const t = el => (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return {
    title: document.title,
    url: location.href,
    buttons: [...document.querySelectorAll('button, [role=button], input[type=submit], input[type=button], a.btn')].filter(vis).map(t).filter(Boolean),
    radios: [...document.querySelectorAll('input[type=radio], [role=radio]')].map(r => (r.closest('label') ? t(r.closest('label')) : r.value || r.id)).slice(0, 40),
    selects: [...document.querySelectorAll('select')].map(s => [...s.options].map(o => o.textContent.trim())),
    text: (document.body ? document.body.innerText : '').slice(0, 6000),
  };
}
"""


# --------------------------------------------------------------------------- #
# The bot
# --------------------------------------------------------------------------- #

class MessBot:
    def __init__(self, cfg: dict, headless: bool | None = None):
        self.cfg = cfg
        self.headless = (not cfg["show_browser"]) if headless is None else headless
        self._pw = None
        self.ctx = None
        self.page = None

    # -- browser lifecycle --------------------------------------------------
    def __enter__(self):
        PROFILE_DIR.mkdir(exist_ok=True)
        OUTPUT_DIR.mkdir(exist_ok=True)
        self._pw = sync_playwright().start()
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
            if "ProcessSingleton" in str(e) or "profile" in str(e).lower():
                print("\n[!] The bot's browser is already open in another window. Close it and try again.\n")
                sys.exit(1)
            raise
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        # Accept native "Are you sure?" browser popups automatically.
        self.page.on("dialog", self._on_dialog)
        return self

    def __exit__(self, *exc):
        try:
            self.ctx.close()
        finally:
            self._pw.stop()

    def _on_dialog(self, dialog):
        log(f"Browser popup: '{dialog.message}' -> clicking OK")
        try:
            dialog.accept()
        except PlaywrightError:
            pass

    # -- page helpers -------------------------------------------------------
    def open_portal(self) -> None:
        try:
            self.page.goto(self.cfg["portal_url"], wait_until="domcontentloaded", timeout=30_000)
        except PlaywrightTimeout:
            log("Portal is slow to load (still continuing)...")
        try:
            self.page.wait_for_load_state("networkidle", timeout=6_000)
        except PlaywrightTimeout:
            pass  # SPAs often never go fully idle; that's fine

    def looks_logged_out(self) -> bool:
        url = self.page.url.lower()
        if any(k in url for k in ("login", "signin", "sign-in", "auth")):
            return True
        try:
            return self.page.locator("input[type=password]:visible").count() > 0
        except PlaywrightError:
            return False

    def run_pre_clicks(self) -> None:
        for text in self.cfg.get("pre_clicks") or []:
            try:
                loc = self.page.get_by_text(text, exact=False).first
                loc.click(timeout=4_000)
                log(f"Clicked '{text}'")
                self.page.wait_for_timeout(700)
            except (PlaywrightTimeout, PlaywrightError):
                log(f"(couldn't find '{text}' to click yet)")

    def wait_for_name(self, timeout_ms: int) -> bool:
        """Wait (up to timeout) until the mess name appears on the page."""
        try:
            self.page.wait_for_function(
                "(n) => (document.body && document.body.innerText || '').toLowerCase().replace(/[^a-z0-9]/g,'')"
                ".includes(n)",
                arg="".join(c for c in self.cfg["mess_name"].lower() if c.isalnum()),
                timeout=timeout_ms,
            )
            return True
        except PlaywrightTimeout:
            return False

    def find_target(self) -> dict:
        return self.page.evaluate(FIND_TARGET_JS, {
            "messName": self.cfg["mess_name"],
            "actionWords": self.cfg["action_words"],
            "avoidWords": self.cfg["avoid_words"],
        })

    def page_text(self) -> str:
        try:
            return self.page.evaluate("() => document.body ? document.body.innerText : ''")
        except PlaywrightError:
            return ""

    def success_text(self, before: str) -> str | None:
        """Return a success sentence that wasn't on the page before our click."""
        now = self.page_text()
        old_lines = set(before.splitlines())
        for line in now.splitlines():
            low = line.strip().lower()
            if (low and line not in old_lines and any(w in low for w in self.cfg["success_words"])
                    and not any(w in low for w in ("error", "fail", "wrong", "not ", "unable", "invalid"))):
                return line.strip()[:160]
        return None

    def screenshot(self, name: str) -> Path:
        path = OUTPUT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{name}.png"
        try:
            self.page.screenshot(path=str(path), full_page=True)
        except PlaywrightError:
            pass
        return path

    # -- the actual booking -------------------------------------------------
    def book(self, found: dict) -> tuple[bool, str]:
        """Click our mess, then walk through Submit/Confirm popups."""
        before = self.page_text()
        target = self.page.locator("[data-messbot=target]").first
        if found["kind"] == "select":
            target.select_option(value=found["value"])
            log(f"Selected '{found['label']}' in the dropdown")
        else:
            target.scroll_into_view_if_needed(timeout=3_000)
            target.click(timeout=5_000)
            log(f"Clicked '{found['label'] or self.cfg['mess_name']}'")

        clicked: list[str] = []
        for _ in range(6):  # at most 6 follow-up clicks (submit, confirm, ok...)
            self.page.wait_for_timeout(600)
            msg = self.success_text(before)
            if msg:
                return True, msg
            nxt = self.page.evaluate(FIND_NEXT_STEP_JS, {
                "messName": self.cfg["mess_name"],
                "confirmWords": self.cfg["confirm_words"] + self.cfg["action_words"],
                "avoidWords": self.cfg["avoid_words"],
                "clicked": clicked,
            })
            if not nxt.get("found"):
                # give slow popups one more chance
                self.page.wait_for_timeout(1_200)
                nxt = self.page.evaluate(FIND_NEXT_STEP_JS, {
                    "messName": self.cfg["mess_name"],
                    "confirmWords": self.cfg["confirm_words"] + self.cfg["action_words"],
                    "avoidWords": self.cfg["avoid_words"],
                    "clicked": clicked,
                })
                if not nxt.get("found"):
                    break
            clicked.append(nxt["key"])
            try:
                self.page.locator("[data-messbot-next=yes]").first.click(timeout=5_000)
                log(f"Clicked '{nxt['label']}'" + (" in popup" if nxt["inDialog"] else ""))
            except (PlaywrightTimeout, PlaywrightError) as e:
                log(f"(couldn't click '{nxt['label']}': {e.__class__.__name__})")

        self.page.wait_for_timeout(1_500)
        msg = self.success_text(before)
        if msg:
            return True, msg
        return False, "Clicked through, but didn't see a success message"


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #

def cmd_login(cfg: dict) -> None:
    print("\nA browser window will open.")
    print("  1. Log in to SpaceBasic like you normally do.")
    print("  2. Make sure you can see the Mess Manager -> Allocations page.")
    print("  3. Come back here and press ENTER.\n")
    with MessBot(cfg, headless=False) as bot:
        bot.open_portal()
        input(">>> Press ENTER after you have logged in... ")
        bot.open_portal()
        if bot.looks_logged_out():
            print("\n[!] It still looks like you're on the login page. Run 'login' again.")
        else:
            print("\n[OK] Logged in! Your session is saved in the 'browser-profile' folder.")
            print("     You won't need to log in again until SpaceBasic logs you out.")


def cmd_test(cfg: dict) -> None:
    """Dry run: find the mess and highlight it, but do not click."""
    with MessBot(cfg) as bot:
        bot.open_portal()
        if bot.looks_logged_out():
            print("\n[!] Not logged in. Run the 'login' step first.")
            return
        bot.run_pre_clicks()
        bot.wait_for_name(8_000)
        found = bot.find_target()
        if not found.get("found"):
            shot = bot.screenshot("test-not-found")
            print(f"\n[..] '{cfg['mess_name']}' is not on the page right now ({found.get('reason')}).")
            print("     That's normal if booking hasn't opened yet. The bot will keep")
            print("     refreshing until it appears when you use 'run'.")
            print(f"     Screenshot of what the bot sees: {shot}")
        else:
            bot.page.evaluate("""() => { const e = document.querySelector('[data-messbot=target]');
                if (e) { e.style.outline = '4px solid red'; e.style.outlineOffset = '2px'; } }""")
            shot = bot.screenshot("test-found")
            state = "DISABLED (booking probably not open yet)" if found["disabled"] else "ready to click"
            print(f"\n[OK] Found it! The bot would click: '{found['label'] or cfg['mess_name']}' "
                  f"({found['kind']}, {state})")
            print(f"     It is outlined in RED in this screenshot: {shot}")
            print("     Nothing was clicked (this was only a test).")
        if not bot.headless:
            input("\nPress ENTER to close the browser... ")


def cmd_inspect(cfg: dict) -> None:
    with MessBot(cfg, headless=False) as bot:
        bot.open_portal()
        input("Open the page where you normally pick the mess, then press ENTER... ")
        summary = bot.page.evaluate(PAGE_SUMMARY_JS)
        shot = bot.screenshot("inspect")
        html_path = OUTPUT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-inspect.html"
        html_path.write_text(bot.page.content(), encoding="utf-8")
        json_path = html_path.with_suffix(".json")
        json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"\nPage URL:  {summary['url']}")
        print(f"Buttons:   {summary['buttons'][:25]}")
        if summary["radios"]:
            print(f"Radios:    {summary['radios']}")
        if summary["selects"]:
            print(f"Dropdowns: {summary['selects']}")
        print(f"\nSaved: {shot}\n       {html_path}\n       {json_path}")
        print("Share the .json + screenshot (NOT the browser-profile folder) if you need help tuning the bot.")


def cmd_notify_test(cfg: dict) -> None:
    if not cfg.get("ntfy_topic"):
        print("No ntfy_topic set in config.json. See the guide, section 'Phone notifications'.")
        return
    notify(cfg, "Mess bot test", f"Notifications work! The bot will ping you when {cfg['mess_name']} is booked.")
    print("Sent! Check your phone.")


def cmd_run(cfg: dict, at: str | None) -> int:
    name = cfg["mess_name"]
    start = parse_when(at) if at else None
    deadline = (start or datetime.now()) + timedelta(minutes=float(cfg["give_up_after_minutes"]))

    with MessBot(cfg) as bot:
        bot.open_portal()
        if bot.looks_logged_out():
            notify(cfg, "Mess bot: login needed", "You're logged out of SpaceBasic. Run the login step.", urgent=True)
            print("\n[!] Not logged in. Run the 'login' step first.")
            return 2
        log(f"Logged in. Target mess: {name}")

        # ---- Phase 1: sleep until shortly before the opening time ----------
        if start:
            wake = start - timedelta(seconds=float(cfg["start_early_seconds"]))
            log(f"Booking opens at {start:%d %b %H:%M}. I'll start refreshing at {wake:%H:%M:%S}.")
            log("Keep this window open and your laptop plugged in and awake. Ctrl+C to stop.")
            last_keepalive = time.monotonic()
            while datetime.now() < wake:
                left = wake - datetime.now()
                print(f"\r    waiting... {str(left).split('.')[0]} left   ", end="", flush=True)
                time.sleep(min(30, max(0.5, left.total_seconds())))
                # Every 10 minutes, touch the portal so the session doesn't expire.
                if time.monotonic() - last_keepalive > 600:
                    last_keepalive = time.monotonic()
                    bot.open_portal()
                    if bot.looks_logged_out():
                        print()
                        notify(cfg, "Mess bot: logged out!",
                               "SpaceBasic logged you out before booking opened. Log in again!", urgent=True)
                        log("[!] Session expired. Run 'login' again, then restart the bot.")
                        return 2
            print()

        # ---- Phase 2: refresh until the mess is bookable, then book -------
        log(f"Watching for {name} (refresh every {cfg['refresh_every_seconds']}s, "
            f"give up at {deadline:%H:%M})...")
        attempts = 0
        failures = 0
        while datetime.now() < deadline:
            attempts += 1
            try:
                if attempts > 1:
                    bot.open_portal()
                if bot.looks_logged_out():
                    notify(cfg, "Mess bot: logged out!", "Logged out during booking. Log in manually NOW!", urgent=True)
                    return 2
                bot.run_pre_clicks()
                bot.wait_for_name(4_000)
                found = bot.find_target()
                if not found.get("found"):
                    print(f"\r    try #{attempts}: {name} not listed yet   ", end="", flush=True)
                elif found["disabled"]:
                    print(f"\r    try #{attempts}: {name} is there but not open yet   ", end="", flush=True)
                else:
                    print()
                    log(f"{name} is OPEN - booking now!")
                    ok, msg = bot.book(found)
                    shot = bot.screenshot("booked" if ok else "attempt")
                    if ok:
                        log(f"[SUCCESS] {msg}")
                        log(f"Screenshot saved: {shot}")
                        notify(cfg, f"{name} booked!", f"{msg}\nOpen SpaceBasic to double-check.", urgent=True)
                        return 0
                    failures += 1
                    log(f"[?] {msg}. Screenshot: {shot}")
                    if failures >= 3:
                        notify(cfg, "Mess bot needs you",
                               f"Tried to book {name} 3 times but couldn't confirm. Check the portal NOW.",
                               urgent=True)
                        log("Stopping so I don't click things repeatedly. Check the portal / screenshots.")
                        return 1
            except (PlaywrightTimeout, PlaywrightError) as e:
                print()
                log(f"(page hiccup: {str(e).splitlines()[0][:100]}) - retrying")
            time.sleep(float(cfg["refresh_every_seconds"]))

        print()
        notify(cfg, "Mess bot gave up", f"{name} never became bookable before {deadline:%H:%M}.", urgent=True)
        log("Gave up (time limit reached). Check the portal manually.")
        return 1


def cmd_settings(cfg: dict) -> None:
    print("\nPress ENTER to keep the current value.\n")
    for key, prompt in [("mess_name", "Mess to book"),
                        ("refresh_every_seconds", "Refresh every N seconds"),
                        ("give_up_after_minutes", "Give up after N minutes"),
                        ("ntfy_topic", "ntfy phone topic (blank = off)")]:
        val = input(f"{prompt} [{cfg[key]}]: ").strip()
        if val:
            try:
                cfg[key] = val if isinstance(DEFAULT_CONFIG[key], str) else float(val)
            except ValueError:
                print(f"  '{val}' is not a number, keeping {cfg[key]}")
    val = input(f"Show browser window? (y/n) [{'y' if cfg['show_browser'] else 'n'}]: ").strip().lower()
    if val in ("y", "n"):
        cfg["show_browser"] = val == "y"
    save_config(cfg)
    print("\nSaved to config.json")


def menu(cfg: dict) -> None:
    while True:
        print(f"""
==============================================
   SpaceBasic Mess Booking Bot  ->  {cfg['mess_name']}
==============================================
  1) First-time login (do this once)
  2) Test: can the bot find {cfg['mess_name']}? (no clicking)
  3) START: book as soon as booking opens
  4) START at a time (e.g. 18:00) - sleep until then
  5) Settings (mess name, phone alerts, speed)
  6) Send a test phone notification
  7) Inspect page (for troubleshooting)
  0) Exit
""")
        choice = input("Choose an option: ").strip()
        try:
            if choice == "1":
                cmd_login(cfg)
            elif choice == "2":
                cmd_test(cfg)
            elif choice == "3":
                cmd_run(cfg, None)
            elif choice == "4":
                when = input("When does booking open? (e.g. 18:00, 6pm, tomorrow 09:00, 2026-09-25 18:00): ")
                cmd_run(cfg, when)
            elif choice == "5":
                cmd_settings(cfg)
                cfg = load_config()
            elif choice == "6":
                cmd_notify_test(cfg)
            elif choice == "7":
                cmd_inspect(cfg)
            elif choice == "0":
                return
        except ValueError as e:
            print(f"\n[!] {e}")
        except KeyboardInterrupt:
            print("\nStopped.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-book your mess on SpaceBasic.")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("login", help="log in once and save the session")
    sub.add_parser("test", help="check the bot can find your mess (no clicking)")
    run = sub.add_parser("run", help="watch the portal and book as soon as it opens")
    run.add_argument("--at", help="booking opening time, e.g. 18:00 or '2026-09-25 18:00'")
    run.add_argument("--headless", action="store_true", help="don't show the browser window")
    sub.add_parser("inspect", help="save a screenshot + page dump for troubleshooting")
    sub.add_parser("notify-test", help="send a test phone notification")
    sub.add_parser("settings", help="change settings interactively")
    args = parser.parse_args()

    cfg = load_config()
    try:
        if args.cmd is None:
            menu(cfg)
        elif args.cmd == "login":
            cmd_login(cfg)
        elif args.cmd == "test":
            cmd_test(cfg)
        elif args.cmd == "run":
            if args.headless:
                cfg["show_browser"] = False
            return cmd_run(cfg, args.at)
        elif args.cmd == "inspect":
            cmd_inspect(cfg)
        elif args.cmd == "notify-test":
            cmd_notify_test(cfg)
        elif args.cmd == "settings":
            cmd_settings(cfg)
    except ValueError as e:
        print(f"[!] {e}")
        return 1
    except KeyboardInterrupt:
        print("\nStopped by you.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
