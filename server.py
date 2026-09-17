#!/usr/bin/env python3
"""Small, dependency-free web server for the shelter walk dashboard."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from walk_stats import build_dashboard, parse_current_dogs_csv, parse_walk_csv

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
SAMPLE_CSV = ROOT / "sample-data.csv"
_CACHE: dict[str, tuple[float, str]] = {}
_CACHE_LOCK = threading.Lock()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def sheet_csv_url(spreadsheet_id: str, tab_name: str) -> str:
    query = urllib.parse.urlencode({"tqx": "out:csv", "sheet": tab_name})
    return f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?{query}"


def get_config() -> dict:
    load_env_file(ROOT / ".env")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID", "").strip()
    legacy_walk_url = os.environ.get("GOOGLE_SHEET_CSV_URL", "").strip()
    walks_url = os.environ.get("GOOGLE_SHEET_WALKS_CSV_URL", "").strip()
    dogs_url = os.environ.get("GOOGLE_SHEET_CURRENT_DOGS_CSV_URL", "").strip()
    if sheet_id:
        walks_url = walks_url or sheet_csv_url(sheet_id, os.environ.get("WALKS_TAB", "Walks"))
        dogs_url = dogs_url or sheet_csv_url(
            sheet_id, os.environ.get("CURRENT_DOGS_TAB", "Current Dogs")
        )
    return {
        "walks_url": walks_url or legacy_walk_url or None,
        "dogs_url": dogs_url or None,
        "priority_count": max(1, int(os.environ.get("DAILY_PRIORITY_COUNT", "3"))),
        "cache_seconds": max(0, int(os.environ.get("DATA_CACHE_SECONDS", "300"))),
        "timezone": os.environ.get("SHELTER_TIMEZONE", "America/Los_Angeles"),
        "port": int(os.environ.get("PORT", "8080")),
        "host": os.environ.get("HOST", "0.0.0.0"),
    }


def fetch_text(url: str, cache_seconds: int) -> str:
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get(url)
        if cached and now - cached[0] < cache_seconds:
            return cached[1]
    request = urllib.request.Request(url, headers={"User-Agent": "dog-shelter-walk-dashboard/2.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            text = response.read().decode("utf-8-sig")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not load the Google Sheet: {exc}") from exc
    with _CACHE_LOCK:
        _CACHE[url] = (now, text)
    return text


class DashboardHandler(SimpleHTTPRequestHandler):
    config: dict = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json({"ok": True})
            return
        if parsed.path == "/api/dashboard":
            self._handle_dashboard()
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def _handle_dashboard(self) -> None:
        try:
            walks_url = self.config["walks_url"]
            dogs_url = self.config["dogs_url"]
            walks_csv = (
                fetch_text(walks_url, self.config["cache_seconds"])
                if walks_url
                else SAMPLE_CSV.read_text(encoding="utf-8")
            )
            shelter_today = datetime.now(ZoneInfo(self.config["timezone"])).date()
            walks = parse_walk_csv(walks_csv, reference=shelter_today)
            if dogs_url:
                dogs_csv = fetch_text(dogs_url, self.config["cache_seconds"])
                current_dogs = parse_current_dogs_csv(dogs_csv)
            else:
                current_dogs = sorted({walk.dog for walk in walks}, key=str.casefold)
            payload = build_dashboard(
                walks,
                current_dogs,
                today=shelter_today,
                priority_count=self.config["priority_count"],
            )
            payload["source"] = "google_sheet" if walks_url else "sample_data"
            payload["currentDogsConfigured"] = bool(dogs_url)
            self._send_json(payload)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=500)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        if self.path in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        elif not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def guess_type(self, path: str) -> str:
        mime_type, _ = mimetypes.guess_type(path)
        return mime_type or "application/octet-stream"


def main() -> None:
    config = get_config()
    DashboardHandler.config = config
    server = ThreadingHTTPServer((config["host"], config["port"]), DashboardHandler)
    print(f"Dog Shelter Walk Dashboard: http://{config['host']}:{config['port']}")
    print(f"Data source: {'Google Sheet' if config['walks_url'] else 'sample data'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
