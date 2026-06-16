#!/usr/bin/env python3
"""Dog shelter walk dashboard server."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from walk_stats import aggregate_by_week, available_weeks, build_monthly_stats, parse_walk_csv

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
SAMPLE_CSV = ROOT / "sample-data.csv"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def get_config() -> tuple[str | None, int, int, str]:
    load_env_file(ROOT / ".env")
    sheet_url = os.environ.get("GOOGLE_SHEET_CSV_URL") or None
    threshold = int(os.environ.get("UNDERWALKED_THRESHOLD", "1"))
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    return sheet_url, threshold, port, host


def fetch_csv(source: str | None) -> str:
    if source:
        request = urllib.request.Request(
            source,
            headers={"User-Agent": "dog-shelter-walk-dashboard/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return response.read().decode("utf-8-sig")
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Failed to fetch Google Sheet CSV: {exc}") from exc

    if SAMPLE_CSV.exists():
        return SAMPLE_CSV.read_text(encoding="utf-8")

    raise RuntimeError(
        "No GOOGLE_SHEET_CSV_URL configured and sample-data.csv is missing."
    )


class DashboardHandler(SimpleHTTPRequestHandler):
    sheet_url: str | None = None
    underwalked_threshold: int = 1

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self._send_json({"ok": True})
            return

        if parsed.path == "/api/walks":
            self._handle_walks(parsed)
            return

        if parsed.path == "/":
            self.path = "/index.html"

        return super().do_GET()

    def _handle_walks(self, parsed) -> None:
        params = parse_qs(parsed.query)
        week_param = params.get("week", [None])[0]

        try:
            csv_text = fetch_csv(self.sheet_url)
            walks = parse_walk_csv(csv_text)

            selected_week = None
            if week_param:
                selected_week = datetime.strptime(week_param, "%Y-%m-%d").date()

            payload = aggregate_by_week(
                walks,
                week=selected_week,
                underwalked_threshold=self.underwalked_threshold,
            )
            payload["availableWeeks"] = available_weeks(walks)
            payload["monthlyStats"] = build_monthly_stats(walks)
            payload["source"] = "google_sheet" if self.sheet_url else "sample_data"
            self._send_json(payload)
        except Exception as exc:  # noqa: BLE001 - return error to client
            self._send_json({"error": str(exc)}, status=500)

    def _send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path: str) -> str:
        mime_type, _ = mimetypes.guess_type(path)
        return mime_type or "application/octet-stream"


def main() -> None:
    sheet_url, threshold, port, host = get_config()

    DashboardHandler.sheet_url = sheet_url
    DashboardHandler.underwalked_threshold = threshold

    server = ThreadingHTTPServer((host, port), DashboardHandler)

    print("Dog Shelter Walk Dashboard")
    print(f"  URL:        http://{host}:{port}")
    if host == "0.0.0.0":
        print(f"  Local URL:  http://127.0.0.1:{port}")
    print(f"  Data source: {'Google Sheet' if sheet_url else 'sample-data.csv (demo)'}")
    print(f"  Underwalked threshold: fewer than {threshold} walk(s) per week")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
