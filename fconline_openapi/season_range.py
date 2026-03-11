"""Season range helpers shared by Open API sync logic."""

from __future__ import annotations

from datetime import datetime, time as dt_time, timedelta, timezone
from typing import Any


KST = timezone(timedelta(hours=9))


def sort_seasons_desc(seasons: list[str]) -> list[str]:
    def season_key(season: str) -> tuple[int, int]:
        parts = str(season).split("-")
        if len(parts) != 2:
            return (0, 0)
        try:
            return (int(parts[0]), int(parts[1]))
        except ValueError:
            return (0, 0)

    return sorted(set(seasons), key=season_key, reverse=True)


def _parse_date(date_text: str | None) -> datetime | None:
    if not date_text:
        return None
    try:
        return datetime.strptime(date_text, "%Y-%m-%d")
    except ValueError:
        return None


def _parse_hour_time(time_text: str | None, fallback_hour: int) -> dt_time:
    if not time_text:
        return dt_time(hour=fallback_hour, minute=0, second=0)
    try:
        parsed = datetime.strptime(time_text, "%H:%M").time()
        return dt_time(hour=parsed.hour, minute=0, second=0)
    except ValueError:
        return dt_time(hour=fallback_hour, minute=0, second=0)


def parse_range_datetime(meta: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    start_date = _parse_date(meta.get("startDate") or meta.get("start_date"))
    end_date = _parse_date(meta.get("endDate") or meta.get("end_date"))
    if not start_date or not end_date:
        return None, None

    start_time = _parse_hour_time(
        meta.get("startTime") or meta.get("start_time"), fallback_hour=0
    )
    end_time = _parse_hour_time(
        meta.get("endTime") or meta.get("end_time"), fallback_hour=23
    )

    start_dt = datetime.combine(start_date.date(), start_time).replace(tzinfo=KST)
    end_dt = datetime.combine(end_date.date(), end_time).replace(
        tzinfo=KST, minute=59, second=59
    )
    return start_dt, end_dt


def resolve_season_for_datetime(
    season_config: dict[str, Any],
    target_dt: datetime,
    *,
    fallback_current: bool = True,
) -> str:
    if target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=KST)

    seasons = sort_seasons_desc(season_config.get("seasons", []))
    ranges = season_config.get("season_ranges", {}) or {}

    in_range: list[str] = []
    for season in seasons:
        start_dt, end_dt = parse_range_datetime(ranges.get(season, {}))
        if start_dt is None or end_dt is None:
            continue
        if start_dt <= target_dt <= end_dt:
            in_range.append(season)

    if in_range:
        return sort_seasons_desc(in_range)[0]

    if fallback_current:
        return str(season_config.get("current_season", "")).strip()
    return ""
