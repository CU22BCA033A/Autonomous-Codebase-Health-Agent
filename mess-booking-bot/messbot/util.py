"""Logging, beeps, notifications and time parsing."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from .config import OUTPUT_DIR

_log_file: Path | None = None


def start_log_file(name: str) -> Path:
    """Mirror everything log() prints into output/<timestamp>-<name>.log."""
    global _log_file
    OUTPUT_DIR.mkdir(exist_ok=True)
    _log_file = OUTPUT_DIR / f"{datetime.now():%Y%m%d-%H%M%S}-{name}.log"
    return _log_file


def log(msg: str) -> None:
    line = f"[{datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    if _log_file:
        with _log_file.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def status(msg: str) -> None:
    """One-line status that overwrites itself (not written to the log file)."""
    print(f"\r    {msg:<70}", end="", flush=True)


def beep(times: int = 3) -> None:
    for _ in range(times):
        print("\a", end="", flush=True)
        time.sleep(0.25)


def _post(url: str, data: bytes, headers: dict) -> None:
    urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method="POST"),
                           timeout=10).read()


def notify(cfg: dict, title: str, message: str, urgent: bool = False) -> None:
    """Beep locally and push to phone (ntfy and/or Telegram) if configured.
    A failed notification never stops the bot."""
    beep(5 if urgent else 2)
    topic = (cfg.get("ntfy_topic") or "").strip()
    if topic:
        try:
            _post(f"https://ntfy.sh/{urllib.parse.quote(topic)}", message.encode("utf-8"),
                  {"Title": title.encode("ascii", "ignore").decode(),
                   "Priority": "urgent" if urgent else "default", "Tags": "fork_and_knife"})
        except Exception as e:
            log(f"(ntfy notification failed: {e})")
    token = (cfg.get("telegram_bot_token") or "").strip()
    chat = str(cfg.get("telegram_chat_id") or "").strip()
    if token and chat:
        try:
            _post(f"https://api.telegram.org/bot{token}/sendMessage",
                  json.dumps({"chat_id": chat, "text": f"{title}\n{message}"}).encode(),
                  {"Content-Type": "application/json"})
        except Exception as e:
            log(f"(Telegram notification failed: {e})")


def parse_when(text: str, now: datetime | None = None) -> datetime:
    """Accept '18:00', '6pm', '6:30 pm', '2026-09-25 18:00', 'tomorrow 18:00'."""
    text = text.strip().lower()
    now = now or datetime.now()
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
        except ValueError:
            continue
        when = datetime.combine(day, t)
        if when < now and day == now.date():  # "18:00" typed after 18:00 means tomorrow
            when += timedelta(days=1)
        return when
    raise ValueError(f"Couldn't understand the time '{text}'. Try 18:00, 6pm or 2026-09-25 18:00")


def fmt_delta(seconds: float) -> str:
    seconds = int(max(0, seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m {s:02d}s" if h else f"{m}m {s:02d}s"
