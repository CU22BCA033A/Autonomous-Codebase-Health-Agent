#!/usr/bin/env python3
"""
Offline self-test: runs the bot against a fake mess page in 5 different
layouts and checks it always books Sagarfoods (never another mess).

    python test_site/run_mock_tests.py

Your real config.json and login are left untouched.
"""
import http.server
import json
import shutil
import subprocess
import sys
import tempfile
import threading
from functools import partial
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOT = HERE.parent / "mess_bot.py"
LAYOUTS = ["cards", "radio", "select", "table", "divclick"]


def main() -> int:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = partial(Quiet, directory=str(HERE))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]

    failed = 0
    for layout in LAYOUTS:
        work = Path(tempfile.mkdtemp())
        shutil.copy(BOT, work / "mess_bot.py")  # separate copy = separate config/profile
        (work / "config.json").write_text(json.dumps({
            "portal_url": f"http://127.0.0.1:{port}/index.html?layout={layout}&opensIn=5",
            "refresh_every_seconds": 2, "give_up_after_minutes": 1, "show_browser": False,
        }))
        out = subprocess.run([sys.executable, str(work / "mess_bot.py"), "run"],
                             capture_output=True, text=True, timeout=120).stdout
        ok = "[SUCCESS] Mess allocated successfully: Sagarfoods" in out
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'}  {layout}")
        if not ok:
            print(out[-1500:])
        shutil.rmtree(work, ignore_errors=True)
    server.shutdown()
    print("\nAll good!" if not failed else f"\n{failed} layout(s) failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
