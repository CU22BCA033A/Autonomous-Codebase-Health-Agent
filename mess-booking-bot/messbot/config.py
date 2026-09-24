"""Settings, file locations and config.json handling."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
PROFILE_DIR = ROOT / "browser-profile"
OUTPUT_DIR = ROOT / "output"

DEFAULT_CONFIG: dict = {
    # ---- What to book --------------------------------------------------
    "mess_name": "Sagarfoods",
    # Optional fallbacks, tried in order ONLY if the main mess shows as
    # full/closed. Leave empty to only ever book the main mess.
    "backup_messes": [],

    # ---- Where ------------------------------------------------------------
    "portal_url": "https://portal.spacebasic.com/module/messmanager/allocations",
    # Optional: texts of buttons/tabs to click (in order) before the mess
    # list shows up, e.g. ["New Allocation", "October"].
    "pre_clicks": [],

    # ---- Timing -----------------------------------------------------------
    # Normal refresh interval while waiting for booking to open (seconds).
    "refresh_every_seconds": 3,
    # Faster interval used only in the "burst window" around the opening
    # time you give with --at (never below 1s, to stay fair to the server).
    "burst_every_seconds": 1.5,
    "burst_window_seconds": 120,
    # With --at, start refreshing this many seconds BEFORE the given time.
    "start_early_seconds": 90,
    # Give up after this many minutes of trying.
    "give_up_after_minutes": 45,

    # ---- Browser ----------------------------------------------------------
    "show_browser": True,
    # Skip images/fonts/videos while refreshing: pages load noticeably faster.
    "block_heavy_resources": True,
    # Optional: path to Chrome/Edge instead of Playwright's Chromium.
    "browser_executable": "",

    # ---- Notifications ------------------------------------------------------
    # ntfy app (https://ntfy.sh): subscribe to a hard-to-guess topic name.
    "ntfy_topic": "",
    # Telegram: create a bot with @BotFather, paste its token, and your chat id
    # (send /start to your bot, then open api.telegram.org/bot<TOKEN>/getUpdates).
    "telegram_bot_token": "",
    "telegram_chat_id": "",

    # ---- API watching (read-only) ----------------------------------------
    # The portal talks to https://api.spacebasic.com/api/v3/messmanager/...
    # The bot watches these responses (it never sends its own requests) to
    # learn the server clock, your session expiry and the mess list data.
    "api_url_contains": ["api.spacebasic.com", "/messmanager/"],

    # ---- Click rules --------------------------------------------------------
    "action_words": ["book", "select", "choose", "opt", "apply", "allocate", "register",
                     "submit", "save", "confirm", "proceed", "continue", "subscribe", "join", "enroll"],
    "confirm_words": ["yes", "ok", "okay", "confirm", "submit", "book", "proceed",
                      "continue", "sure", "agree", "done", "save"],
    "avoid_words": ["cancel", "no", "close", "back", "view", "menu", "details", "detail",
                    "logout", "log out", "sign out", "delete", "remove", "reject", "decline",
                    "withdraw", "change", "history", "download", "print", "feedback"],
    "success_words": ["success", "successfully", "booked", "allocated", "confirmed",
                      "request submitted", "already", "registered"],
    "error_words": ["error", "fail", "wrong", "unable", "invalid", "not allowed", "try again"],
    # Words near a mess that mean it can't be booked (used for backup_messes).
    "full_words": ["full", "sold out", "no seats", "no seat", "closed", "unavailable", "capacity reached"],
}


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
    # Guard rails: never hammer the portal.
    cfg["refresh_every_seconds"] = max(1.0, float(cfg["refresh_every_seconds"]))
    cfg["burst_every_seconds"] = max(1.0, float(cfg["burst_every_seconds"]))
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
