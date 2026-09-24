#!/usr/bin/env python3
"""
Offline self-test against a fake SpaceBasic-like portal + API.

    python test_site/run_mock_tests.py           # run all scenarios
    python test_site/run_mock_tests.py --serve   # just start the fake portal (manual testing)

Each scenario checks what the fake SERVER actually booked, so a test only
passes if the bot booked the right mess, exactly once.
Your real config.json, login and output folder are left untouched.
"""
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
BOT_ROOT = HERE.parent

STATE = {"opens_at": 0.0, "full": set(), "bookings": []}
CATERERS = [{"id": 11, "name": "Annapurna Caterers"}, {"id": 22, "name": "Sagarfoods"},
            {"id": 33, "name": "Royal Kitchen"}]

# (name, layout, opens_in_seconds, full_messes, backup_messes, expected_booking)
SCENARIOS = [
    ("cards + confirm popup", "cards", 5, [], [], "Sagarfoods"),
    ("radio + Submit + native confirm()", "radio", 5, [], [], "Sagarfoods"),
    ("dropdown + Save + popup", "select", 5, [], [], "Sagarfoods"),
    ("table with 'current mess' decoy", "table", 5, [], [], "Sagarfoods"),
    ("clickable div cards + Proceed", "divclick", 5, [], [], "Sagarfoods"),
    ("Sagarfoods FULL -> backup", "cards", 3, ["Sagarfoods"], ["Royal Kitchen"], "Royal Kitchen"),
    ("Sagarfoods FULL, no backup -> book nothing", "cards", 3, ["Sagarfoods"], [], None),
]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(HERE), **k)

    def log_message(self, *args):
        pass

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/v3/messmanager/allocations":
            time.sleep(0.2)  # server latency
            opens = datetime.fromtimestamp(STATE["opens_at"])
            return self._json({"result": {
                "isOpen": time.time() >= STATE["opens_at"],
                "bookingStartDate": opens.isoformat(timespec="seconds"),
                "caterers": [{**c, "availableSeats": 0 if c["name"] in STATE["full"] else 120} for c in CATERERS],
            }})
        return super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path == "/api/v3/messmanager/allocate":
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            cat = next((c for c in CATERERS if c["id"] == body.get("catererId")), None)
            if time.time() < STATE["opens_at"] or not cat:
                return self._json({"status": "error", "message": "Booking not open"}, 400)
            if cat["name"] in STATE["full"]:
                return self._json({"status": "error", "message": "Seats full, unable to allocate"})
            STATE["bookings"].append(cat["name"])
            return self._json({"status": "success", "message": f"Mess allocated successfully: {cat['name']}"})
        self.send_error(404)


def start_server() -> int:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server.server_address[1]


def run_scenario(port, name, layout, opens_in, full, backups, expected) -> bool:
    STATE.update(opens_at=time.time() + opens_in, full=set(full), bookings=[])
    work = Path(tempfile.mkdtemp())
    try:
        shutil.copy(BOT_ROOT / "mess_bot.py", work)
        shutil.copytree(BOT_ROOT / "messbot", work / "messbot", ignore=shutil.ignore_patterns("__pycache__"))
        (work / "config.json").write_text(json.dumps({
            "portal_url": f"http://127.0.0.1:{port}/index.html?layout={layout}",
            "backup_messes": backups, "refresh_every_seconds": 2, "burst_every_seconds": 1,
            "give_up_after_minutes": 0.5, "start_early_seconds": 5, "show_browser": False,
        }))
        at = (datetime.now() + timedelta(seconds=opens_in)).strftime("%Y-%m-%d %H:%M:%S")
        proc = subprocess.run([sys.executable, str(work / "mess_bot.py"), "run", "--at", at],
                              capture_output=True, text=True, timeout=150)
        out = proc.stdout.replace("\r", "\n")
        ok = STATE["bookings"] == ([expected] if expected else [])
        ok = ok and (proc.returncode == 0) == bool(expected)
        took = next((line.split("(")[-1].rstrip(")") for line in out.splitlines() if "[SUCCESS]" in line), "")
        print(f"{'PASS' if ok else 'FAIL'}  {name:<45} server booked: {STATE['bookings'] or 'nothing'}  {took}")
        if not ok:
            print("\n".join(l for l in out.splitlines() if l.strip())[-2500:])
        return ok
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    port = start_server()
    if "--serve" in sys.argv:
        STATE["opens_at"] = time.time() + 60
        print(f"Fake portal: http://127.0.0.1:{port}/index.html?layout=cards  (booking opens in 60s; Ctrl+C to stop)")
        threading.Event().wait()
    failed = sum(not run_scenario(port, *s) for s in SCENARIOS)
    print("\nAll scenarios passed!" if not failed else f"\n{failed} scenario(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
