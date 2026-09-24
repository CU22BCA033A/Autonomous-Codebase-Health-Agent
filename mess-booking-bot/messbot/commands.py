"""User-facing commands: login, test, discover, run, settings, menu."""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout

from .browser import MessBot
from .config import DEFAULT_CONFIG, OUTPUT_DIR, load_config, save_config
from .network import scan_bundles
from .page_js import PAGE_SUMMARY_JS
from .util import fmt_delta, log, notify, parse_when, start_log_file, status


def _stamp() -> str:
    return f"{datetime.now():%Y%m%d-%H%M%S}"


def _report_session(bot: MessBot, start: datetime | None = None) -> bool:
    """Print clock/session health. Returns False if the session will expire
    before `start` (so the user can log in again before leaving)."""
    off = bot.net.clock_offset
    if off is not None:
        drift = "in sync" if abs(off) < 1.5 else f"{'behind' if off > 0 else 'ahead of'} the portal by {abs(off):.1f}s"
        log(f"Your clock is {drift}. Timing uses the portal's clock.")
    exp = bot.net.session_expires
    if exp:
        log(f"Your SpaceBasic session is valid until {exp:%d %b %H:%M}.")
        if start and exp < start + timedelta(minutes=5):
            return False
    return True


# ---------------------------------------------------------------------------
def cmd_login(cfg: dict) -> None:
    print("\nA browser window will open.")
    print("  1. Log in to SpaceBasic like you normally do.")
    print("  2. Open Mess Manager -> Allocations.")
    print("  3. Come back here and press ENTER.\n")
    with MessBot(cfg, headless=False) as bot:
        bot.open_portal()
        input(">>> Press ENTER after you have logged in... ")
        bot.open_portal()
        bot.page.wait_for_timeout(2_500)
        if bot.looks_logged_out():
            print("\n[!] It still looks like the login page. Run 'login' again.")
            return
        print("\n[OK] Logged in! Your session is saved in the 'browser-profile' folder.")
        _report_session(bot)


def cmd_test(cfg: dict) -> None:
    """Dry run: find the mess and outline it in red, but don't click."""
    name = cfg["mess_name"]
    with MessBot(cfg) as bot:
        bot.open_portal()
        bot.page.wait_for_timeout(1_000)
        if bot.looks_logged_out():
            print("\n[!] Not logged in. Run the 'login' step first.")
            return
        bot.run_pre_clicks()
        bot.wait_ready(name, 8)
        found = bot.find_target(name)
        print()
        if not found.get("found"):
            shot = bot.screenshot("test-not-found")
            print(f"[..] '{name}' is not bookable on the page right now ({found.get('reason')}).")
            print("     Normal if booking hasn't opened yet: 'run' keeps refreshing until it appears.")
            print(f"     What the bot sees: {shot}")
        else:
            bot.highlight_target()
            shot = bot.screenshot("test-found")
            state = "DISABLED (not open yet)" if found["disabled"] else "ready to click"
            if bot.is_full(found):
                state += ", looks FULL"
            print(f"[OK] Found it! The bot would click: '{found['label'] or name}' ({found['kind']}, {state})")
            print(f"     Outlined in RED here: {shot}")
            print("     Nothing was clicked (test only).")
        mentions = bot.net.mentions(name)
        if mentions:
            print(f"\n     The portal's API data also mentions {name} ({len(mentions)}x). Good sign.")
        _report_session(bot)
        if not bot.headless:
            input("\nPress ENTER to close the browser... ")


def cmd_discover(cfg: dict) -> None:
    """Learn how this college's portal works and save a shareable report."""
    name = cfg["mess_name"]
    with MessBot(cfg, headless=False) as bot:
        bot.open_portal()
        print("\nThe bot is now LISTENING to the portal (read-only).")
        print("  1. In the browser, go to the page where you choose the mess.")
        print("  2. Click around normally (tabs, months, 'View' buttons). Do NOT book anything.")
        input("  3. Press ENTER here when the mess list (or 'booking not open') is showing... ")
        bot.page.wait_for_timeout(1_000)

        stamp = _stamp()
        shot = bot.screenshot("discover")
        summary = bot.page.evaluate(PAGE_SUMMARY_JS)
        print("\nScanning the portal's JavaScript for mess API endpoints...")
        bundle_endpoints = scan_bundles(bot.page)
        report = {
            "page": {k: summary[k] for k in ("url", "title", "buttons", "radios", "selects")},
            "api_calls_seen": [f"{m} {p} (x{n})" for m, p, n in bot.net.endpoints()],
            "api_endpoints_in_app_code": bundle_endpoints,
            "mess_mentions_in_api": [{"endpoint": p, "json_path": jp, "object": d}
                                     for p, jp, d in bot.net.mentions(name)][:20],
            "time_fields_in_api": [f"{p} {jp} = {dt:%Y-%m-%d %H:%M}" for p, jp, dt in bot.net.time_fields()][:40],
            "clock_offset_seconds": bot.net.clock_offset,
            "session_expires": str(bot.net.session_expires or "unknown"),
        }
        rpt = OUTPUT_DIR / f"{stamp}-discovery.json"
        rpt.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        bot.net.save(OUTPUT_DIR / f"{stamp}-network.json")
        (OUTPUT_DIR / f"{stamp}-page.txt").write_text(summary["text"], encoding="utf-8")

        print(f"\nPage: {summary['url']}")
        print(f"Buttons on page: {summary['buttons'][:20]}")
        print(f"\nAPI calls the page made ({len(report['api_calls_seen'])}):")
        for line in report["api_calls_seen"][:25]:
            print("   ", line)
        if bundle_endpoints:
            print(f"\nMess endpoints in the app code: {len(bundle_endpoints)} "
                  f"(e.g. {', '.join(bundle_endpoints[:6])})")
        if report["mess_mentions_in_api"]:
            m = report["mess_mentions_in_api"][0]
            print(f"\n{name} found in API data at {m['endpoint']} -> {m['json_path']}:")
            print("   ", json.dumps(m["object"], default=str)[:400])
        if report["time_fields_in_api"]:
            print("\nDates/times in the mess data (one may be the booking OPENING time):")
            for line in report["time_fields_in_api"][:12]:
                print("   ", line)
        _report_session(bot)
        print(f"\nSaved:\n   {rpt}\n   {shot}\n   {OUTPUT_DIR / (stamp + '-network.json')}")
        print("Tokens, cookies and passwords are removed from these files.")
        print("Share the discovery.json + screenshot if you want the bot tuned for your portal.")


def cmd_notify_test(cfg: dict) -> None:
    if not (cfg.get("ntfy_topic") or (cfg.get("telegram_bot_token") and cfg.get("telegram_chat_id"))):
        print("No ntfy_topic or Telegram settings in config.json. See the guide, 'Phone notifications'.")
        return
    notify(cfg, "Mess bot test", f"Notifications work! You'll be pinged when {cfg['mess_name']} is booked.")
    print("Sent! Check your phone.")


# ---------------------------------------------------------------------------
def cmd_run(cfg: dict, at: str | None) -> int:
    name = cfg["mess_name"]
    backups = [b for b in cfg.get("backup_messes") or [] if b]
    start = parse_when(at) if at else None
    logfile = start_log_file("run")

    with MessBot(cfg, fast=True) as bot:
        bot.open_portal()
        bot.page.wait_for_timeout(1_500)
        if bot.looks_logged_out():
            notify(cfg, "Mess bot: login needed", "You're logged out of SpaceBasic. Run the login step.", urgent=True)
            print("\n[!] Not logged in. Run the 'login' step first.")
            return 2
        log(f"Logged in. Target: {name}" + (f" (backups: {', '.join(backups)})" if backups else ""))
        log(f"Log file: {logfile}")
        if not _report_session(bot, start):
            # The portal may renew the token by itself, so warn instead of stopping;
            # the keep-alive check below still catches a real logout.
            notify(cfg, "Mess bot: session may expire before booking",
                   f"Your SpaceBasic login token expires at {bot.net.session_expires:%H:%M}, before booking "
                   "opens. Safest: run the login step again now and restart the bot.", urgent=True)
            log("[!] Your login token expires BEFORE booking opens. Safest: log in again (option 1) and restart.")

        # ---- Phase 1: sleep until shortly before opening ------------------
        if start:
            wake = start - timedelta(seconds=float(cfg["start_early_seconds"]))
            log(f"Booking opens {start:%d %b %H:%M:%S} (portal time). Refreshing starts {wake:%H:%M:%S}.")
            log("Keep the laptop plugged in, awake and online. Ctrl+C stops the bot.")
            last_keepalive = time.monotonic()
            while bot.server_now() < wake:
                left = (wake - bot.server_now()).total_seconds()
                status(f"sleeping... refresh starts in {fmt_delta(left)}")
                time.sleep(min(20, max(0.2, left)))
                if time.monotonic() - last_keepalive > 600:  # keep the session warm
                    last_keepalive = time.monotonic()
                    try:
                        if not bot.alive():
                            bot.relaunch()
                        bot.open_portal()
                        bot.page.wait_for_timeout(2_000)
                        if bot.looks_logged_out():
                            print()
                            notify(cfg, "Mess bot: logged out!",
                                   "SpaceBasic logged you out before booking opened. Log in again!", urgent=True)
                            log("[!] Session expired. Run 'login' again, then restart the bot.")
                            return 2
                    except (PlaywrightError, PlaywrightTimeout) as e:
                        log(f"(keep-alive hiccup: {str(e).splitlines()[0][:90]})")
            print()

        # ---- Phase 2: refresh until bookable, then book ------------------------
        deadline = (start or bot.server_now()) + timedelta(minutes=float(cfg["give_up_after_minutes"]))
        burst_from = start - timedelta(seconds=float(cfg["start_early_seconds"])) if start else None
        burst_to = start + timedelta(seconds=float(cfg["burst_window_seconds"])) if start else None
        log(f"Watching for {name} (every {cfg['refresh_every_seconds']}s"
            + (f", {cfg['burst_every_seconds']}s around opening time" if start else "")
            + f"; give up at {deadline:%H:%M}).")
        attempts = failures = 0
        while bot.server_now() < deadline:
            cycle_start = time.monotonic()
            attempts += 1
            try:
                if not bot.alive():
                    bot.relaunch()
                if attempts > 1 or start:
                    bot.open_portal()
                if bot.looks_logged_out():
                    bot.page.wait_for_timeout(1_500)
                    if bot.looks_logged_out():
                        print()
                        notify(cfg, "Mess bot: logged out!", "Logged out during booking. Book manually NOW!", urgent=True)
                        log("[!] Logged out during booking.")
                        return 2
                bot.run_pre_clicks()
                result = _try_book(bot, cfg, [name] + backups, attempts)
                if result == "success":
                    return 0
                if result == "failed":
                    failures += 1
                    if failures >= 3:
                        notify(cfg, "Mess bot needs you",
                               f"Tried to book {name} 3 times but couldn't confirm. Check the portal NOW.", urgent=True)
                        log("Stopping so I don't keep clicking. Check the portal and the screenshots in output/.")
                        return 1
            except (PlaywrightError, PlaywrightTimeout) as e:
                print()
                log(f"(page hiccup: {str(e).splitlines()[0][:100]}) - retrying")
            in_burst = burst_from and burst_from <= bot.server_now() <= burst_to
            interval = float(cfg["burst_every_seconds"] if in_burst else cfg["refresh_every_seconds"])
            time.sleep(max(0.0, interval - (time.monotonic() - cycle_start)))

        print()
        notify(cfg, "Mess bot gave up", f"{name} never became bookable before {deadline:%H:%M}.", urgent=True)
        log("Gave up (time limit reached). Check the portal manually.")
        return 1


def _try_book(bot: MessBot, cfg: dict, names: list[str], attempt: int) -> str:
    """One refresh cycle. Returns 'success', 'failed' or 'waiting'."""
    main = names[0]
    bot.wait_ready(main, 6)
    main_found = bot.find_target(main)
    if main_found.get("found") and not main_found["disabled"] and not bot.is_full(main_found):
        return _book(bot, cfg, main, main_found)

    # Main mess missing, disabled or full: maybe book a backup (only if the
    # main one is actually full, or visible-but-not-offered while backups are open).
    if main_found.get("found") and bot.is_full(main_found):
        for backup in names[1:]:
            f = bot.find_target(backup)
            if f.get("found") and not f["disabled"] and not bot.is_full(f):
                print()
                log(f"{main} looks FULL -> trying backup {backup}")
                return _book(bot, cfg, backup, f)
        state = "is FULL" + (" (and no backup is open)" if names[1:] else "")
    elif not main_found.get("found"):
        state = "not listed yet"
    else:
        state = "listed but not open yet"
    status(f"try #{attempt} {datetime.now():%H:%M:%S}: {main} {state}")
    return "waiting"


def _book(bot: MessBot, cfg: dict, name: str, found: dict) -> str:
    print()
    t0 = time.monotonic()
    log(f"{name} is OPEN - booking now!")
    ok, msg, writes = bot.book(found, name)
    took = time.monotonic() - t0
    shot = bot.screenshot("booked" if ok else "attempt")
    if writes:
        path = OUTPUT_DIR / f"{_stamp()}-booking-requests.json"
        bot.net.save(path, writes)
        log(f"Booking API request(s) recorded (secrets removed): {path.name}")
    if ok:
        log(f"[SUCCESS] {msg}  ({took:.1f}s from open to done)")
        log(f"Screenshot: {shot}")
        notify(cfg, f"{name} booked!", f"{msg}\nOpen SpaceBasic to double-check.", urgent=True)
        return "success"
    log(f"[?] {msg}. Screenshot: {shot}")
    return "failed"


# ---------------------------------------------------------------------------
def cmd_settings(cfg: dict) -> None:
    print("\nPress ENTER to keep the current value.\n")
    for key, prompt in [("mess_name", "Mess to book"),
                        ("refresh_every_seconds", "Refresh every N seconds (normal)"),
                        ("burst_every_seconds", "Refresh every N seconds (around opening time)"),
                        ("give_up_after_minutes", "Give up after N minutes"),
                        ("ntfy_topic", "ntfy phone topic (blank = off)")]:
        val = input(f"{prompt} [{cfg[key]}]: ").strip()
        if val:
            try:
                cfg[key] = val if isinstance(DEFAULT_CONFIG[key], str) else float(val)
            except ValueError:
                print(f"  '{val}' is not a number, keeping {cfg[key]}")
    val = input(f"Backup messes if {cfg['mess_name']} is full, comma separated "
                f"[{', '.join(cfg['backup_messes']) or 'none'}] (type - for none): ").strip()
    if val:
        cfg["backup_messes"] = [] if val == "-" else [v.strip() for v in val.split(",") if v.strip()]
    val = input(f"Show browser window? (y/n) [{'y' if cfg['show_browser'] else 'n'}]: ").strip().lower()
    if val in ("y", "n"):
        cfg["show_browser"] = val == "y"
    save_config(cfg)
    print("\nSaved to config.json")


def menu(cfg: dict) -> None:
    while True:
        print(f"""
==================================================
   SpaceBasic Mess Booking Bot  ->  {cfg['mess_name']}
==================================================
  1) First-time login (do this once)
  2) Learn my portal (records how booking works - do once)
  3) Test: can the bot find {cfg['mess_name']}? (no clicking)
  4) START at a time (e.g. 18:00) - recommended
  5) START now: book as soon as it opens
  6) Settings (mess name, backups, phone alerts, speed)
  7) Send a test phone notification
  0) Exit
""")
        choice = input("Choose an option: ").strip()
        try:
            if choice == "1":
                cmd_login(cfg)
            elif choice == "2":
                cmd_discover(cfg)
            elif choice == "3":
                cmd_test(cfg)
            elif choice == "4":
                when = input("When does booking open? (18:00, 6pm, tomorrow 09:00, 2026-09-25 18:00): ")
                cmd_run(cfg, when)
            elif choice == "5":
                cmd_run(cfg, None)
            elif choice == "6":
                cmd_settings(cfg)
                cfg = load_config()
            elif choice == "7":
                cmd_notify_test(cfg)
            elif choice == "0":
                return
        except ValueError as e:
            print(f"\n[!] {e}")
        except KeyboardInterrupt:
            print("\nStopped.")
