"""Sync pipeline for Nexon Open API -> analysis/cache artifacts."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .analytics import compute_manager_mode_summary
from .cache import JsonFileCache, atomic_write_json
from .client import NexonOpenApiClient


KST = timezone(timedelta(hours=9))
DAILY_FILE_NAME_RE = re.compile(r"^(?P<player_id>\d+)_(?P<yymmdd>\d{6})\.json$")
MANAGER_PLAYER_ID_PATTERNS = [
    r"/popup/(\d+)",
    r"/TeamInfo/(\d+)",
    r"n8NexonSN=(\d+)",
    r"(\d{6,})",
]


class OpenApiSyncError(RuntimeError):
    """Raised when sync preconditions or Open API sync steps fail."""


def analysis_dir(data_base_dir: str, season: str, user_id: str) -> Path:
    return Path(data_base_dir) / season / "user" / str(user_id) / "analysis"


def analysis_file_path(data_base_dir: str, season: str, user_id: str) -> Path:
    return analysis_dir(data_base_dir, season, user_id) / "manager_mode_52_summary.json"


def _player_user_dir(data_base_dir: str, season: str, player_id: str) -> Path:
    return Path(data_base_dir) / str(season) / "user" / str(player_id)


def _find_latest_daily_file(data_base_dir: str, season: str, player_id: str) -> Path:
    user_dir = _player_user_dir(data_base_dir, season, player_id)
    if not user_dir.is_dir():
        raise OpenApiSyncError(
            f"해당 시즌에 일일 크롤링 데이터가 없어 nickname 추출 불가: "
            f"season={season}, id={player_id}"
        )

    latest_path: Path | None = None
    latest_token = ""
    for path in user_dir.iterdir():
        if not path.is_file():
            continue
        match = DAILY_FILE_NAME_RE.match(path.name)
        if not match:
            continue
        if match.group("player_id") != str(player_id):
            continue
        token = match.group("yymmdd")
        if token > latest_token:
            latest_token = token
            latest_path = path

    if latest_path is None:
        raise OpenApiSyncError(
            f"해당 시즌에 일일 크롤링 데이터가 없어 nickname 추출 불가: "
            f"season={season}, id={player_id}"
        )
    return latest_path


def _extract_rows_from_daily_file(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as exc:
        raise OpenApiSyncError(f"일일 데이터 파일 읽기 실패: {path}") from exc

    rows: list[Any]
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict) and isinstance(payload.get("results"), list):
        rows = payload["results"]
    else:
        raise OpenApiSyncError(f"일일 데이터 포맷 오류(리스트 아님): {path}")

    if not rows or not isinstance(rows[0], dict):
        raise OpenApiSyncError(f"일일 데이터 포맷 오류(첫 row 없음): {path}")
    return [row for row in rows if isinstance(row, dict)]


def _extract_manager_player_id(manager: dict[str, Any]) -> str:
    candidates = [
        manager.get("player_id"),
        manager.get("playerId"),
        manager.get("stat_url"),
        manager.get("squad_url"),
    ]
    for raw in candidates:
        text = str(raw or "").strip()
        if not text:
            continue
        for pattern in MANAGER_PLAYER_ID_PATTERNS:
            matched = re.search(pattern, text)
            if matched:
                return matched.group(1)
    return ""


def _resolve_nickname_from_managers_file(player_id: str, managers_file: str = "managers.json") -> str:
    path = Path(managers_file)
    if not path.is_file():
        return ""
    try:
        with path.open("r", encoding="utf-8") as f:
            managers = json.load(f)
    except Exception:
        return ""
    if not isinstance(managers, list):
        return ""
    for manager in managers:
        if not isinstance(manager, dict):
            continue
        if _extract_manager_player_id(manager) != str(player_id):
            continue
        name = str(manager.get("name", "")).strip()
        if name:
            return name
    return ""


def _dedupe_nickname_candidates(candidates: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for candidate in candidates:
        nick = str(candidate or "").strip()
        if not nick:
            continue
        if nick in seen:
            continue
        seen.add(nick)
        result.append(nick)
    return result


def resolve_nickname_candidates(
    season: str,
    player_id: str,
    data_base_dir: str = "data",
    *,
    nickname_hint: str | None = None,
    managers_file: str = "managers.json",
) -> list[str]:
    candidates: list[str] = []

    hinted = str(nickname_hint or "").strip()
    if hinted:
        candidates.append(hinted)

    from_managers = _resolve_nickname_from_managers_file(str(player_id), managers_file=managers_file)
    if from_managers:
        candidates.append(from_managers)

    latest_error: OpenApiSyncError | None = None
    try:
        latest_path = _find_latest_daily_file(data_base_dir, season, str(player_id))
        rows = _extract_rows_from_daily_file(latest_path)
        first = rows[0]
        for key in ("구단주명", "구단주", "닉네임", "name"):
            value = str(first.get(key, "")).strip()
            if value:
                candidates.append(value)
    except OpenApiSyncError as exc:
        latest_error = exc

    deduped = _dedupe_nickname_candidates(candidates)
    if deduped:
        return deduped

    if latest_error is not None:
        raise latest_error
    raise OpenApiSyncError(f"nickname 후보를 찾을 수 없습니다: season={season}, id={player_id}")


def resolve_nickname_for_player(
    season: str,
    player_id: str,
    data_base_dir: str = "data",
    *,
    nickname_hint: str | None = None,
    managers_file: str = "managers.json",
) -> str:
    """Resolve the best nickname candidate for a player."""
    candidates = resolve_nickname_candidates(
        season=season,
        player_id=player_id,
        data_base_dir=data_base_dir,
        nickname_hint=nickname_hint,
        managers_file=managers_file,
    )
    return candidates[0]


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _resolve_refresh_budget(default: int = 200) -> int:
    raw = str(os.environ.get("OPENAPI_REFRESH_BUDGET_PER_RUN", "")).strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def refresh_stale_match_details(
    client: NexonOpenApiClient,
    stale_ids: list[str],
    *,
    budget: int | None = None,
    data_base_dir: str = "data",
    cache: JsonFileCache | None = None,
) -> dict[str, Any]:
    cache = cache or JsonFileCache(data_base_dir=data_base_dir)
    effective_budget = budget if (budget is not None and budget > 0) else _resolve_refresh_budget()
    targets = _dedupe_preserve_order([str(x).strip() for x in (stale_ids or []) if str(x).strip()])
    selected = targets[:effective_budget]

    refreshed = 0
    errors = 0
    skipped = 0
    for match_id in selected:
        try:
            detail = client.get_match_detail(match_id)
        except Exception:
            errors += 1
            continue
        if isinstance(detail, dict) and detail:
            cache.set_match_detail(match_id, detail)
            refreshed += 1
        else:
            skipped += 1

    return {
        "staleFound": len(targets),
        "selected": len(selected),
        "budget": int(effective_budget),
        "refreshed": refreshed,
        "skipped": skipped,
        "errors": errors,
    }


def sync_user_manager_mode(
    season: str,
    player_id: str,
    matchtype: int = 52,
    max_matches: int = 1200,
    data_base_dir: str = "data",
    refresh_ouid: bool = False,
    nickname_hint: str | None = None,
    api_client: NexonOpenApiClient | None = None,
    cache: JsonFileCache | None = None,
) -> dict[str, Any]:
    """Incrementally sync manager-mode matches and details into cache."""
    if max_matches <= 0:
        raise OpenApiSyncError("max_matches는 1 이상이어야 합니다.")

    nickname_candidates = resolve_nickname_candidates(
        season,
        str(player_id),
        data_base_dir=data_base_dir,
        nickname_hint=nickname_hint,
    )
    nickname = nickname_candidates[0]
    cache = cache or JsonFileCache(data_base_dir=data_base_dir)
    api_client = api_client or NexonOpenApiClient()

    ouid = None
    if not refresh_ouid:
        for candidate in nickname_candidates:
            cached = cache.get_ouid(candidate)
            if cached:
                ouid = str(cached)
                nickname = candidate
                break

    if not ouid:
        last_exc: Exception | None = None
        attempted: list[str] = []
        for candidate in nickname_candidates:
            attempted.append(candidate)
            try:
                ouid = str(api_client.get_ouid(candidate))
                nickname = candidate
                cache.set_ouid(candidate, ouid)
                break
            except Exception as exc:
                last_exc = exc
                continue

        if not ouid:
            attempted_text = ", ".join(attempted)
            if refresh_ouid:
                raise OpenApiSyncError(
                    f"ouid 조회 실패: nickname candidates=[{attempted_text}]. "
                    f"닉네임 오타/변경 여부를 확인하세요. 원인: {last_exc}"
                ) from last_exc
            raise OpenApiSyncError(
                f"ouid 조회 실패: nickname candidates=[{attempted_text}]. "
                "닉네임 변경/캐시 불일치 가능성이 있습니다. "
                "--refresh-ouid 옵션으로 재시도하세요."
            ) from last_exc

    existing_index = cache.get_user_match_index(str(ouid), matchtype) or []
    existing_set = set(existing_index)

    new_match_ids: list[str] = []
    stop_on_known = False
    offset = 0
    page_size = 100
    while offset < max_matches:
        limit = min(page_size, max_matches - offset)
        try:
            page = api_client.get_user_match_ids(
                ouid=str(ouid),
                matchtype=matchtype,
                offset=offset,
                limit=limit,
            )
        except Exception as exc:
            raise OpenApiSyncError(
                f"match index 조회 실패: ouid={ouid}, offset={offset}, limit={limit}. 원인: {exc}"
            ) from exc

        if not page:
            break

        reached_known = False
        for raw_match_id in page:
            match_id = str(raw_match_id).strip()
            if not match_id:
                continue
            if match_id in existing_set:
                stop_on_known = True
                reached_known = True
                break
            new_match_ids.append(match_id)

        if reached_known:
            break
        if len(page) < limit:
            break
        offset += limit

    new_match_ids = _dedupe_preserve_order(new_match_ids)
    merged_index = _dedupe_preserve_order(new_match_ids + existing_index)
    if merged_index != existing_index:
        cache.set_user_match_index(str(ouid), matchtype, merged_index)

    fetched_detail_count = 0
    skipped_count = 0
    for match_id in new_match_ids:
        if cache.get_match_detail(match_id) is not None:
            skipped_count += 1
            continue

        try:
            detail = api_client.get_match_detail(match_id)
        except Exception as exc:
            raise OpenApiSyncError(
                f"match-detail 조회 실패: matchId={match_id}. 원인: {exc}"
            ) from exc

        if isinstance(detail, dict):
            cache.set_match_detail(match_id, detail)
            fetched_detail_count += 1
        else:
            skipped_count += 1

    return {
        "season": str(season),
        "playerId": str(player_id),
        "nickname": nickname,
        "ouid": str(ouid),
        "newMatchCount": len(new_match_ids),
        "totalIndexCount": len(merged_index),
        "fetchedDetailCount": fetched_detail_count,
        "skippedCount": skipped_count,
        "stoppedOnKnownMatch": stop_on_known,
    }


def sync_manager_mode_analysis(
    *,
    data_base_dir: str,
    season: str,
    user_id: str,
    nickname: str,
    api_client: NexonOpenApiClient,
    cache: JsonFileCache | None = None,
    max_matches: int = 100,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Builds one manager-mode analysis artifact for a given user."""

    cache = cache or JsonFileCache(data_base_dir=data_base_dir)
    now_kst = now or datetime.now(KST)

    ouid = cache.get_ouid(nickname)
    if not ouid:
        ouid = api_client.get_ouid(nickname)
        cache.set_ouid(nickname, str(ouid))

    match_ids = api_client.get_match_ids(
        str(ouid),
        matchtype=52,
        offset=0,
        limit=max_matches,
    )

    deduped_match_ids = _dedupe_preserve_order([str(x) for x in match_ids])

    match_details: list[dict[str, Any]] = []
    for match_id in deduped_match_ids:
        detail = cache.get_match_detail(match_id)
        if detail is None:
            detail = api_client.get_match_detail(match_id)
            if isinstance(detail, dict):
                cache.set_match_detail(match_id, detail)
        if isinstance(detail, dict):
            match_details.append(detail)

    summary = compute_manager_mode_summary(
        match_details,
        ouid=str(ouid),
        generated_at=now_kst,
    )

    output = {
        "schema_version": "0.1.0",
        "source": "nexon_open_api",
        "matchtype": 52,
        "season": season,
        "user_id": str(user_id),
        "nickname": nickname,
        "ouid": str(ouid),
        "generated_at": now_kst.isoformat(),
        "analysis": summary,
        "meta": {
            "max_matches": max_matches,
            "resolved_match_count": len(match_details),
        },
    }

    output_path = analysis_file_path(data_base_dir, season, user_id)
    atomic_write_json(output_path, output)
    return {
        "status": "success",
        "path": str(output_path),
        "resolved_match_count": len(match_details),
    }
