"""Read-only watcher for the portal's own API traffic.

The SpaceBasic web app talks to https://api.spacebasic.com/api/v3/messmanager/...
with a JWT "Authorization: Bearer ..." header. By listening to that traffic
(never sending requests of its own) the bot can:

  * learn the SERVER clock (HTTP Date header) and schedule against it,
  * read your session expiry from the JWT, so it can warn you before class,
  * see the raw mess/caterer data the page is built from,
  * record exactly which request books a mess (saved, with secrets removed,
    so the flow can be analysed and made even faster next cycle).

Nothing secret is ever written to disk: tokens, cookies and passwords are
redacted before saving.
"""

from __future__ import annotations

import base64
import json
import re
import statistics
import time
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SECRET_KEY_RE = re.compile(r"pass|token|jwt|otp|secret|auth|cookie|session|pin", re.I)
TIME_KEY_RE = re.compile(r"(start|open|from|begin|end|close|till|to|deadline|expiry|valid).*"
                         r"(date|time|at|on)?$|^(date|time)", re.I)
MAX_BODY = 2_000_000


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def redact(obj):
    """Recursively replace values of secret-looking keys with '***'."""
    if isinstance(obj, dict):
        return {k: ("***" if SECRET_KEY_RE.search(str(k)) and v not in (None, "") else redact(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


def redact_url(url: str) -> str:
    parts = urlsplit(url)
    q = [(k, "***" if SECRET_KEY_RE.search(k) else v) for k, v in parse_qsl(parts.query, keep_blank_values=True)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(q, safe="*"), ""))


def decode_jwt(token: str) -> dict:
    """Decode a JWT payload WITHOUT verifying it (we only read exp/uid)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def _looks_like_time(value) -> datetime | None:
    if isinstance(value, (int, float)) and 1_500_000_000 < value < 4_000_000_000_000:
        return datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value)
    if isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?", value):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt.astimezone().replace(tzinfo=None) if dt.tzinfo else dt
        except ValueError:
            return None
    return None


def walk(obj, path=""):
    """Yield (path, dict) for every dict inside a JSON value."""
    if isinstance(obj, dict):
        yield path, obj
        for k, v in obj.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


class NetworkWatcher:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.entries: list[dict] = []
        self._clock_samples: list[float] = []
        self.jwt_claims: dict = {}
        self.last_api_response_at = 0.0
        self.last_json_by_path: dict[str, object] = {}

    # ---- wiring -------------------------------------------------------------
    def attach(self, context) -> None:
        context.on("response", self._on_response)

    def _matches(self, url: str) -> bool:
        return any(part in url for part in self.cfg.get("api_url_contains") or [])

    def _on_response(self, response) -> None:
        try:
            url = response.url
            if "spacebasic" in url or self._matches(url):
                self._clock_sample(response.headers.get("date"))
            if not self._matches(url):
                return
            req = response.request
            if req.resource_type not in ("xhr", "fetch"):
                return
            self.last_api_response_at = time.monotonic()
            auth = req.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                claims = decode_jwt(auth.split(" ", 1)[1].strip())
                if claims:
                    self.jwt_claims = claims

            body = None
            try:
                raw = response.body()
                if len(raw) <= MAX_BODY:
                    body = json.loads(raw)
            except Exception:
                body = None
            req_body = None
            if req.post_data:
                try:
                    req_body = redact(json.loads(req.post_data))
                except (ValueError, TypeError):
                    req_body = "<non-JSON body, not saved>"
            path = urlsplit(url).path
            if body is not None and req.method == "GET":
                self.last_json_by_path[path] = body
            self.entries.append({
                "time": datetime.now().isoformat(timespec="milliseconds"),
                "method": req.method,
                "url": redact_url(url),
                "status": response.status,
                "request_body": req_body,
                "response": redact(body) if body is not None else None,
            })
            del self.entries[:-400]  # keep memory bounded
        except Exception:
            pass  # a watcher must never break the page

    # ---- server clock -------------------------------------------------------
    def _clock_sample(self, date_hdr: str | None) -> None:
        if not date_hdr:
            return
        try:
            server = parsedate_to_datetime(date_hdr).timestamp() + 0.5  # header has 1s resolution
        except (TypeError, ValueError):
            return
        self._clock_samples.append(server - time.time())
        del self._clock_samples[:-50]

    @property
    def clock_offset(self) -> float | None:
        """server_time - local_time in seconds (None until we have samples)."""
        if len(self._clock_samples) < 2:
            return None
        return statistics.median(self._clock_samples)

    # ---- session ------------------------------------------------------------
    @property
    def session_expires(self) -> datetime | None:
        exp = self.jwt_claims.get("exp")
        return datetime.fromtimestamp(exp) if isinstance(exp, (int, float)) else None

    # ---- data insight -------------------------------------------------------
    def mentions(self, name: str) -> list[tuple[str, str, dict]]:
        """Objects in recent API JSON that mention the mess name."""
        target = _norm(name)
        out = []
        for path, body in self.last_json_by_path.items():
            for jpath, d in walk(body):
                own = [v for v in d.values() if isinstance(v, str)]
                if any(target in _norm(v) for v in own):
                    out.append((path, jpath, redact(d)))
        return out

    def time_fields(self) -> list[tuple[str, str, datetime]]:
        """Date/time-looking fields (e.g. startDate) in messmanager responses."""
        out = []
        for path, body in self.last_json_by_path.items():
            for jpath, d in walk(body):
                for k, v in d.items():
                    if TIME_KEY_RE.search(str(k)):
                        dt = _looks_like_time(v)
                        if dt:
                            out.append((path, f"{jpath}.{k}" if jpath else k, dt))
        return out

    def endpoints(self) -> list[tuple[str, str, int]]:
        seen: dict[tuple[str, str], int] = {}
        for e in self.entries:
            key = (e["method"], urlsplit(e["url"]).path)
            seen[key] = seen.get(key, 0) + 1
        return [(m, p, n) for (m, p), n in sorted(seen.items())]

    def writes_since(self, index: int) -> list[dict]:
        return [e for e in self.entries[index:] if e["method"] in ("POST", "PUT", "PATCH")]

    def save(self, path, entries: list[dict] | None = None) -> None:
        path.write_text(json.dumps(entries if entries is not None else self.entries,
                                   indent=2, default=str), encoding="utf-8")


ENDPOINT_RE = re.compile(r"""["'`]([^"'`\s]{0,80}messmanager/[A-Za-z0-9_\-/${}.?=&]*)["'`]""")


def scan_bundles(page) -> list[str]:
    """Find messmanager API paths mentioned in the web app's JavaScript files."""
    scripts = page.evaluate("""() => [...new Set([
        ...[...document.scripts].map(s => s.src),
        ...performance.getEntriesByType('resource').filter(e => e.initiatorType === 'script').map(e => e.name)
    ].filter(Boolean))]""")
    found: set[str] = set()
    for text in page.evaluate("() => [...document.scripts].filter(s => !s.src).map(s => s.textContent)"):
        found.update(m.group(1) for m in ENDPOINT_RE.finditer(text))
    for src in scripts:
        try:
            resp = page.request.get(src, timeout=15_000)
            if resp.ok:
                found.update(m.group(1) for m in ENDPOINT_RE.finditer(resp.text()))
        except Exception:
            continue
    return sorted(found)
