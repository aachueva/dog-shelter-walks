"""Parse walk log CSV and aggregate walks per dog per week."""

from __future__ import annotations

import csv
import io
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Iterable


@dataclass
class WalkEntry:
    dog: str
    walker: str
    walk_date: date
    checkout_time: str
    checkin_time: str


@dataclass
class DogWeekStats:
    dog: str
    walk_count: int
    walks: list[WalkEntry] = field(default_factory=list)


COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "dog": ("dog", "dog name", "dog_name", "name", "canine"),
    "walker": ("walker", "walker name", "walker_name", "volunteer", "staff"),
    "date": ("date", "date of walk", "walk date", "walk_date", "day"),
    "checkout": (
        "checkout",
        "check out",
        "check-out",
        "checking out",
        "checking_out",
        "time out",
        "time_out",
        "out time",
        "out_time",
    ),
    "checkin": (
        "checkin",
        "check in",
        "check-in",
        "checking in",
        "checking_in",
        "time in",
        "time_in",
        "in time",
        "in_time",
    ),
}


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

    missing = [field_name for field_name in ("dog", "date") if field_name not in mapping]
    if missing:
        raise ValueError(
            "Could not find required columns in the sheet. "
            f"Missing: {', '.join(missing)}. "
            f"Found headers: {', '.join(headers)}"
        )

    return mapping


def _infer_year_for_month_day(month: int, day: int, reference: date | None = None) -> date:
    reference = reference or date.today()
    candidates: list[date] = []

    for year_offset in range(3):
        year = reference.year - year_offset
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if candidate <= reference:
            candidates.append(candidate)

    if candidates:
        return max(candidates)

    return date(reference.year, month, day)


def _parse_date(value: str, *, reference: date | None = None) -> date:
    value = value.strip()
    if not value:
        raise ValueError("Empty date value")

    formats = (
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m/%d/%y",
        "%d/%m/%Y",
        "%d/%m/%y",
        "%Y/%m/%d",
        "%b %d, %Y",
        "%B %d, %Y",
        "%m-%d-%Y",
        "%d-%m-%Y",
        "%b %d %Y",
        "%B %d %Y",
    )

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    month_day_formats = ("%b %d", "%B %d", "%b %d %y", "%B %d %y")
    for fmt in month_day_formats:
        try:
            parsed = datetime.strptime(value, fmt)
            if "%y" in fmt or "%Y" in fmt:
                return parsed.date()
            return _infer_year_for_month_day(parsed.month, parsed.day, reference)
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError as exc:
        raise ValueError(f"Unrecognized date format: {value}") from exc


def _looks_like_walk_date(value: str) -> bool:
    try:
        _parse_date(value)
        return True
    except ValueError:
        return False


def _is_wide_matrix_header(headers: Iterable[str]) -> bool:
    headers = list(headers)
    if len(headers) < 2:
        return False

    first = _normalize_header(headers[0])
    if first in COLUMN_ALIASES["dog"] or first in COLUMN_ALIASES["date"]:
        return False

    return any(_looks_like_walk_date(header) for header in headers[1:])


def _parse_wide_matrix_rows(rows: list[list[str]]) -> list[WalkEntry]:
    walks: list[WalkEntry] = []

    for row in rows:
        if not row:
            continue

        dog = row[0].strip()
        if not dog:
            continue

        for cell in row[1:]:
            cell = cell.strip()
            if not cell:
                continue
            try:
                walk_date = _parse_date(cell)
            except ValueError:
                continue

            walks.append(
                WalkEntry(
                    dog=dog,
                    walker="",
                    walk_date=walk_date,
                    checkout_time="",
                    checkin_time="",
                )
            )

    return walks


def _parse_standard_csv(csv_text: str) -> list[WalkEntry]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")

    mapping = _map_headers(reader.fieldnames)
    walks: list[WalkEntry] = []

    for row in reader:
        dog = (row.get(mapping["dog"]) or "").strip()
        if not dog:
            continue

        try:
            walk_date = _parse_date(row.get(mapping["date"]) or "")
        except ValueError:
            continue

        walker = (row.get(mapping.get("walker", ""), "") or "").strip()
        checkout = (row.get(mapping.get("checkout", ""), "") or "").strip()
        checkin = (row.get(mapping.get("checkin", ""), "") or "").strip()

        walks.append(
            WalkEntry(
                dog=dog,
                walker=walker,
                walk_date=walk_date,
                checkout_time=checkout,
                checkin_time=checkin,
            )
        )

    return walks


def parse_walk_csv(csv_text: str) -> list[WalkEntry]:
    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")

    if _is_wide_matrix_header(reader.fieldnames):
        raw_rows = list(csv.reader(io.StringIO(csv_text)))
        walks = _parse_wide_matrix_rows(raw_rows)
        if walks:
            return walks

    try:
        return _parse_standard_csv(csv_text)
    except ValueError:
        raw_rows = list(csv.reader(io.StringIO(csv_text)))
        walks = _parse_wide_matrix_rows(raw_rows)
        if walks:
            return walks
        raise ValueError(
            "Could not parse the sheet. Expected either "
            "'Dog Name' + 'Date of Walk' columns or a wide matrix with dog names in column A."
        )


def week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def week_end(value: date) -> date:
    return week_start(value) + timedelta(days=6)


def aggregate_by_week(
    walks: list[WalkEntry],
    *,
    week: date | None = None,
    underwalked_threshold: int = 1,
) -> dict:
    target_week = week_start(week or date.today())
    week_end_date = week_end(target_week)

    walks_in_week = [walk for walk in walks if week_start(walk.walk_date) == target_week]

    by_dog: dict[str, DogWeekStats] = {}
    for walk in walks_in_week:
        stats = by_dog.setdefault(walk.dog, DogWeekStats(dog=walk.dog, walk_count=0))
        stats.walk_count += 1
        stats.walks.append(walk)

    all_dogs = sorted({walk.dog for walk in walks} | set(by_dog.keys()))
    dogs_payload = []

    for dog in all_dogs:
        stats = by_dog.get(dog, DogWeekStats(dog=dog, walk_count=0))
        dogs_payload.append(
            {
                "dog": dog,
                "walkCount": stats.walk_count,
                "underwalked": stats.walk_count < underwalked_threshold,
                "walks": [
                    {
                        "walker": walk.walker,
                        "date": walk.walk_date.isoformat(),
                        "checkoutTime": walk.checkout_time,
                        "checkinTime": walk.checkin_time,
                    }
                    for walk in sorted(stats.walks, key=lambda item: (item.walk_date, item.checkout_time))
                ],
            }
        )

    dogs_payload.sort(key=lambda item: (item["underwalked"], item["walkCount"], item["dog"]), reverse=True)
    underwalked_count = sum(1 for dog in dogs_payload if dog["underwalked"])

    return {
        "weekStart": target_week.isoformat(),
        "weekEnd": week_end_date.isoformat(),
        "underwalkedThreshold": underwalked_threshold,
        "summary": {
            "totalDogs": len(dogs_payload),
            "dogsWalked": sum(1 for dog in dogs_payload if dog["walkCount"] > 0),
            "totalWalks": sum(dog["walkCount"] for dog in dogs_payload),
            "underwalkedCount": underwalked_count,
        },
        "dogs": dogs_payload,
    }


def available_weeks(walks: list[WalkEntry]) -> list[str]:
    if not walks:
        return [week_start(date.today()).isoformat()]

    weeks = {week_start(walk.walk_date) for walk in walks}
    weeks.add(week_start(date.today()))
    return [week.isoformat() for week in sorted(weeks, reverse=True)]


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def build_monthly_stats(walks: list[WalkEntry]) -> dict:
    if not walks:
        return {"months": [], "dogs": [], "counts": {}}

    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    month_set: set[str] = set()

    for walk in walks:
        month = _month_key(walk.walk_date)
        month_set.add(month)
        counts[walk.dog][month] += 1

    months = sorted(month_set)
    dogs = sorted(counts.keys())

    return {
        "months": months,
        "dogs": dogs,
        "counts": {dog: dict(counts[dog]) for dog in dogs},
    }
