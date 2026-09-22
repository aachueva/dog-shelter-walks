#!/usr/bin/env python3
"""Small, dependency-free web server for the shelter walk dashboard."""

from __future__ import annotations

import json
import base64
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

from walk_stats import (
    build_dashboard,
    parse_current_dogs_csv,
    parse_current_dogs_xlsx,
    parse_walk_csv,
)

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
SAMPLE_CSV = ROOT / "sample-data.csv"
_CACHE: dict[str, tuple[float, object]] = {}
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
        "sharepoint_roster_url": os.environ.get("SHAREPOINT_ROSTER_URL", "").strip() or None,
        "microsoft_tenant_id": os.environ.get("MICROSOFT_TENANT_ID", "").strip() or None,
        "microsoft_client_id": os.environ.get("MICROSOFT_CLIENT_ID", "").strip() or None,
        "microsoft_client_secret": os.environ.get("MICROSOFT_CLIENT_SECRET", "").strip() or None,
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
            return str(cached[1])
    request = urllib.request.Request(url, headers={"User-Agent": "dog-shelter-walk-dashboard/2.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            text = response.read().decode("utf-8-sig")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not load the Google Sheet: {exc}") from exc
    with _CACHE_LOCK:
        _CACHE[url] = (now, text)
    return text


def fetch_bytes(url: str, cache_seconds: int, headers: dict[str, str] | None = None) -> bytes:
    cache_key = f"bytes:{url}"
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached and now - cached[0] < cache_seconds and isinstance(cached[1], bytes):
            return cached[1]
    request_headers = {"User-Agent": "dog-shelter-walk-dashboard/2.0"}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, headers=request_headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            content = response.read()
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not load the SharePoint roster: {exc}") from exc
    with _CACHE_LOCK:
        _CACHE[cache_key] = (now, content)
    return content


def microsoft_graph_token(config: dict) -> str:
    tenant = config["microsoft_tenant_id"]
    client_id = config["microsoft_client_id"]
    client_secret = config["microsoft_client_secret"]
    if not all((tenant, client_id, client_secret)):
        raise RuntimeError("Microsoft 365 roster credentials are not configured")
    body = urllib.parse.urlencode(
        {
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        }
    ).encode()
    request = urllib.request.Request(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))["access_token"]
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not authenticate with Microsoft 365: {exc}") from exc


def sharepoint_roster_bytes(config: dict, cache_seconds: int) -> bytes:
    share_url = config["sharepoint_roster_url"]
    encoded = base64.urlsafe_b64encode(share_url.encode()).decode().rstrip("=")
    content_url = f"https://graph.microsoft.com/v1.0/shares/u!{encoded}/driveItem/content"
    token = microsoft_graph_token(config)
    return fetch_bytes(
        content_url,
        cache_seconds,
        headers={"Authorization": f"Bearer {token}"},
    )


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
        if parsed.path == "/api/roster":
            self._handle_roster()
            return
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def _handle_dashboard(self) -> None:
        try:
            query = urllib.parse.parse_qs(urlparse(self.path).query)
            cache_seconds = 0 if query.get("refresh") == ["1"] else self.config["cache_seconds"]
            walks_url = self.config["walks_url"]
            dogs_url = self.config["dogs_url"]
            walks_csv = (
                fetch_text(walks_url, cache_seconds)
                if walks_url
                else SAMPLE_CSV.read_text(encoding="utf-8")
            )
            shelter_today = datetime.now(ZoneInfo(self.config["timezone"])).date()
            walks = parse_walk_csv(walks_csv, reference=shelter_today)
            if self.config["sharepoint_roster_url"]:
                current_dogs = parse_current_dogs_xlsx(
                    sharepoint_roster_bytes(self.config, cache_seconds)
                )
            elif dogs_url:
                dogs_csv = fetch_text(dogs_url, cache_seconds)
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
            payload["currentDogsConfigured"] = bool(
                dogs_url or self.config["sharepoint_roster_url"]
            )
            payload["rosterSource"] = (
                "sharepoint" if self.config["sharepoint_roster_url"] else "google_sheet"
            )
            self._send_json(payload)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=500)

    def _handle_roster(self) -> None:
        try:
            query = urllib.parse.parse_qs(urlparse(self.path).query)
            cache_seconds = 0 if query.get("refresh") == ["1"] else self.config["cache_seconds"]
            if self.config["sharepoint_roster_url"]:
                dogs = parse_current_dogs_xlsx(
                    sharepoint_roster_bytes(self.config, cache_seconds)
                )
                source = "sharepoint"
            elif self.config["dogs_url"]:
                dogs = parse_current_dogs_csv(
                    fetch_text(self.config["dogs_url"], cache_seconds)
                )
                source = "google_sheet"
            else:
                raise RuntimeError("No current-dog roster is configured")
            self._send_json(
                {
                    "dogs": dogs,
                    "source": source,
                    "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
                }
            )
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
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.send_header("Access-Control-Allow-Origin", "*")
        if path == "/" or path.endswith(".html") or path == "/sw.js":
            self.send_header("Cache-Control", "no-cache")
        elif not path.startswith("/api/"):
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
