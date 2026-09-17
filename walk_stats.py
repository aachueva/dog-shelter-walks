"""Parse shelter walk data and build a mobile-friendly dashboard payload."""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable


@dataclass(frozen=True)
class WalkEntry:
    dog: str
    walker: str
    walk_date: date
    checkout_time: str
    checkin_time: str


COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "dog": ("dog", "dog name", "dog_name", "name", "canine"),
    "walker": ("walker", "walker name", "walker_name", "volunteer", "staff"),
    "date": ("date", "date of walk", "walk date", "walk_date", "day"),
    "checkout": ("checkout", "check out", "check-out", "checking out", "time out"),
    "checkin": ("checkin", "check in", "check-in", "checking in", "time in"),
}


def normalize_dog_name(value: str) -> str:
    """Return the stable join key used across the Current Dogs and Walks tabs."""
    return " ".join(value.strip().casefold().split())


def display_dog_name(value: str) -> str:
    return " ".join(value.strip().split())


def _normalize_header(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())


def _map_headers(headers: Iterable[str]) -> dict[str, str]:
    normalized = {_normalize_header(header): header for header in headers}
    mapping: dict[str, str] = {}
    for field_name, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                mapping[field_name] = normalized[alias]
                break
    missing = [field for field in ("dog", "date") if field not in mapping]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    return mapping


def _infer_year_for_month_day(month: int, day: int, reference: date | None = None) -> date:
    reference = reference or date.today()
    candidates = []
    for year_offset in range(3):
        try:
            candidate = date(reference.year - year_offset, month, day)
        except ValueError:
            continue
        if candidate <= reference:
            candidates.append(candidate)
    return max(candidates) if candidates else date(reference.year, month, day)


def _parse_date(value: str, *, reference: date | None = None) -> date:
    value = value.strip()
    if not value:
        raise ValueError("Empty date")
    for fmt in (
        "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%d/%m/%y",
        "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y", "%m-%d-%Y", "%d-%m-%Y",
        "%b %d %Y", "%B %d %Y",
    ):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    for fmt in ("%b %d", "%B %d"):
        try:
            parsed = datetime.strptime(value, fmt)
            return _infer_year_for_month_day(parsed.month, parsed.day, reference)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError as exc:
        raise ValueError(f"Unrecognized date format: {value}") from exc


def _looks_like_date(value: str) -> bool:
    try:
        _parse_date(value)
        return True
    except ValueError:
        return False


def _is_wide_matrix(rows: list[list[str]]) -> bool:
    if not rows or len(rows[0]) < 2:
        return False
    first = _normalize_header(rows[0][0])
    if first in COLUMN_ALIASES["dog"] or first in COLUMN_ALIASES["date"]:
        return False
    return any(_looks_like_date(cell) for cell in rows[0][1:])


def _parse_wide_matrix(rows: list[list[str]], *, reference: date | None = None) -> list[WalkEntry]:
    walks: list[WalkEntry] = []
    for row in rows:
        if not row or not row[0].strip():
            continue
        dog = display_dog_name(row[0])
        for cell in row[1:]:
            try:
                walk_date = _parse_date(cell, reference=reference)
            except ValueError:
                continue
            walks.append(WalkEntry(dog, "", walk_date, "", ""))
    return walks


def _parse_standard_csv(csv_text: str, *, reference: date | None = None) -> list[WalkEntry]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    mapping = _map_headers(reader.fieldnames)
    walks: list[WalkEntry] = []
    for row in reader:
        dog = display_dog_name(row.get(mapping["dog"]) or "")
        if not dog:
            continue
        try:
            walk_date = _parse_date(row.get(mapping["date"]) or "", reference=reference)
        except ValueError:
            continue
        walks.append(
            WalkEntry(
                dog=dog,
                walker=(row.get(mapping.get("walker", ""), "") or "").strip(),
                walk_date=walk_date,
                checkout_time=(row.get(mapping.get("checkout", ""), "") or "").strip(),
                checkin_time=(row.get(mapping.get("checkin", ""), "") or "").strip(),
            )
        )
    return walks


def parse_walk_csv(csv_text: str, *, reference: date | None = None) -> list[WalkEntry]:
    rows = list(csv.reader(io.StringIO(csv_text)))
    if not rows:
        return []
    if _is_wide_matrix(rows):
        return _parse_wide_matrix(rows, reference=reference)
    try:
        return _parse_standard_csv(csv_text, reference=reference)
    except ValueError:
        walks = _parse_wide_matrix(rows, reference=reference)
        if walks:
            return walks
        raise ValueError("Expected a walk log or a wide matrix with dog names in column A.")


def parse_current_dogs_csv(csv_text: str) -> list[str]:
    """Parse a one-column tab, tolerating a header and blank rows."""
    rows = list(csv.reader(io.StringIO(csv_text)))
    dogs: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not row:
            continue
        dog = display_dog_name(row[0])
        key = normalize_dog_name(dog)
        if not key or key in COLUMN_ALIASES["dog"] or key in seen:
            continue
        seen.add(key)
        dogs.append(dog)
    return dogs


def _priority_key(item: dict) -> tuple:
    last_walk = item["lastWalkDate"] or "0000-00-00"
    return (item["walkedToday"], item["walksLast14Days"], last_walk, item["dog"].casefold())


def build_dashboard(
    walks: list[WalkEntry],
    current_dogs: list[str],
    *,
    today: date | None = None,
    priority_count: int = 3,
    history_days: int = 14,
) -> dict:
    today = today or date.today()
    start = today - timedelta(days=history_days - 1)
    dates = [start + timedelta(days=offset) for offset in range(history_days)]
    display_by_key = {normalize_dog_name(dog): display_dog_name(dog) for dog in current_dogs}
    walks_by_key: dict[str, list[WalkEntry]] = defaultdict(list)
    for walk in walks:
        key = normalize_dog_name(walk.dog)
        if key in display_by_key and walk.walk_date <= today:
            walks_by_key[key].append(walk)

    dogs_payload = []
    for key, dog in display_by_key.items():
        dog_walks = sorted(walks_by_key.get(key, []), key=lambda walk: walk.walk_date)
        recent = [walk for walk in dog_walks if start <= walk.walk_date <= today]
        daily_counts = {day.isoformat(): 0 for day in dates}
        for walk in recent:
            daily_counts[walk.walk_date.isoformat()] += 1
        last_walk = dog_walks[-1].walk_date if dog_walks else None
        dogs_payload.append(
            {
                "dog": dog,
                "walkedToday": daily_counts[today.isoformat()] > 0,
                "walksToday": daily_counts[today.isoformat()],
                "walksLast14Days": len(recent),
                "lastWalkDate": last_walk.isoformat() if last_walk else None,
                "daysSinceWalk": (today - last_walk).days if last_walk else None,
                "dailyCounts": daily_counts,
            }
        )

    ranked = sorted(dogs_payload, key=_priority_key)
    eligible = [dog for dog in ranked if not dog["walkedToday"]]
    priority_keys = {normalize_dog_name(dog["dog"]) for dog in eligible[:priority_count]}
    for dog in dogs_payload:
        dog["priority"] = normalize_dog_name(dog["dog"]) in priority_keys
    priority = [dog for dog in ranked if dog["priority"]]
    others = [dog for dog in ranked if not dog["priority"]]
    return {
        "today": today.isoformat(),
        "historyStart": start.isoformat(),
        "historyEnd": today.isoformat(),
        "dates": [day.isoformat() for day in dates],
        "summary": {
            "totalDogs": len(dogs_payload),
            "walkedToday": sum(1 for dog in dogs_payload if dog["walkedToday"]),
            "walksToday": sum(dog["walksToday"] for dog in dogs_payload),
            "needWalkToday": sum(1 for dog in dogs_payload if not dog["walkedToday"]),
        },
        "priorityDogs": priority,
        "otherDogs": others,
        "dogs": priority + others,
        "updatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
