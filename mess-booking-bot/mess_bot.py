#!/usr/bin/env python3
"""
SpaceBasic Mess Booking Bot
===========================

Waits for mess booking to open on the SpaceBasic portal and books your
preferred caterer (default: Sagarfoods) the moment it becomes available.

    python mess_bot.py                       # friendly menu
    python mess_bot.py login                 # one-time: log in, session is saved
    python mess_bot.py discover              # learn how your portal works (read-only)
    python mess_bot.py test                  # find the mess, outline it, don't click
    python mess_bot.py run --at 18:00        # sleep until 18:00 (portal clock), then book
    python mess_bot.py run                   # start watching now
    python mess_bot.py notify-test           # test phone notifications

Everything runs in YOUR browser session on YOUR computer. The bot never sees
your password and never writes tokens or cookies to its report files.
"""

import argparse
import sys

try:
    import playwright  # noqa: F401
except ImportError:
    print("\n[!] Playwright is not installed yet. Run the setup first:")
    print("      pip install -r requirements.txt")
    print("      python -m playwright install chromium\n")
    sys.exit(1)

from messbot.commands import (cmd_discover, cmd_login, cmd_notify_test, cmd_run,
                              cmd_settings, cmd_test, menu)
from messbot.config import load_config


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-book your mess on SpaceBasic.")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("login", help="log in once and save the session")
    sub.add_parser("discover", aliases=["inspect"], help="learn how your portal's booking works (read-only)")
    sub.add_parser("test", help="check the bot can find your mess (no clicking)")
    run = sub.add_parser("run", help="watch the portal and book as soon as it opens")
    run.add_argument("--at", help="booking opening time, e.g. 18:00 or '2026-09-25 18:00'")
    run.add_argument("--headless", action="store_true", help="don't show the browser window")
    sub.add_parser("notify-test", help="send a test phone notification")
    sub.add_parser("settings", help="change settings interactively")
    args = parser.parse_args()

    cfg = load_config()
    try:
        if args.cmd is None:
            menu(cfg)
        elif args.cmd == "login":
            cmd_login(cfg)
        elif args.cmd in ("discover", "inspect"):
            cmd_discover(cfg)
        elif args.cmd == "test":
            cmd_test(cfg)
        elif args.cmd == "run":
            if args.headless:
                cfg["show_browser"] = False
            return cmd_run(cfg, args.at)
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
