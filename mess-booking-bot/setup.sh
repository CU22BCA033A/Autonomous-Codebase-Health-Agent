#!/usr/bin/env bash
# One-time setup for macOS / Linux
set -e
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
python3 -m playwright install chromium
echo
echo "Done! Now run:  ./start.sh"
