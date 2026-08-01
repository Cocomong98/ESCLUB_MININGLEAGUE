"""Analytics builders for manager-mode (matchtype=52) summaries."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from itertools import combinations
import json
import math
import os
from pathlib import Path
import re
from typing import Any

import requests

from .cache import JsonFileCache, atomic_write_json
from .client import NexonFconlineClient
from .season_range import parse_range_datetime


KST = timezone(timedelta(hours=9))
MINING_POLICY_VERSION = "self_division_win_fc_v1"
MINING_FC_BY_DIVISION_WIN = {
    800: 20,
    900: 15,
}
DIVISION_NAME_FALLBACK = {
    "1700": "마스터1",
    "1800": "마스터2",
    "1900": "마스터3",
}
UTC = timezone.utc
GOAL_TIME_SEGMENT = 1 << 24
DAILY_FILE_NAME_RE = re.compile(r"^(?P<player_id>\d+)_(?P<yymmdd>\d{6})\.json$")
SNAPSHOT_FILE_NAME_RE = re.compile(
    r"^(?P<player_id>\d+)_(?P<yymmdd>\d{6})(?:_(?P<hhmm>\d{4}))?\.json$"
)
GOAL_TIME_BINS = [
    "0-15",
    "16-30",
    "31-45",
    "46-60",
    "61-75",
    "76-90",
    "91-105",
    "106-120",
    "120+",
]
SHOT_TYPE_NAMES = {
    1: "normal",
    2: "finesse",
    3: "header",
    4: "volley",
    5: "freekick",
    6: "penalty",
}
PUBLIC_ANALYSIS_INCLUDE_MATCH_ID_ENV = "PUBLIC_ANALYSIS_INCLUDE_MATCH_ID"
LONG_SHOT_X_THRESHOLD = 0.79
LONG_SHOT_DISTANCE_THRESHOLD = 0.21


class OpenApiAnalyticsError(RuntimeError):
    """Raised when manager-mode analytics preconditions or processing fail."""


def _include_public_match_id() -> bool:
    return str(os.environ.get(PUBLIC_ANALYSIS_INCLUDE_MATCH_ID_ENV, "")).strip() == "1"


def _short_match_key(match_id: Any) -> str:
    token = str(match_id).strip()
    if not token:
        return ""
    return sha256(token.encode("utf-8")).hexdigest()[:12]


def _privacy_meta(include_match_id: bool) -> dict[str, str]:
    return {
        "matchId": "raw" if include_match_id else "hashed",
        "ouid": "omitted",
    }


def _safe_error_message(exc: Exception) -> str:
    text = str(exc).strip()
    if not text:
        return exc.__class__.__name__
    return re.sub(r"live_[A-Za-z0-9]+", "live_***", text)


def goal_time_to_seconds(goalTime: int) -> int:
    """Convert Nexon ShootDetailDTO.goalTime to elapsed seconds.

    Rules follow Nexon Open API notice:
    - [0, 2^24) => as-is
    - [2^24, 2*2^24) => +45:00 offset
    - [2*2^24, 3*2^24) => +90:00 offset
    - [3*2^24, 4*2^24) => +105:00 offset
    - [4*2^24, 5*2^24) => +120:00 offset
    """
    try:
        value = int(goalTime)
    except (TypeError, ValueError):
        return 0

    if value <= 0:
        return 0
    if value < GOAL_TIME_SEGMENT:
        return value
    if value < GOAL_TIME_SEGMENT * 2:
        return value - GOAL_TIME_SEGMENT + (45 * 60)
    if value < GOAL_TIME_SEGMENT * 3:
        return value - (GOAL_TIME_SEGMENT * 2) + (90 * 60)
    if value < GOAL_TIME_SEGMENT * 4:
        return value - (GOAL_TIME_SEGMENT * 3) + (105 * 60)
    if value < GOAL_TIME_SEGMENT * 5:
        return value - (GOAL_TIME_SEGMENT * 4) + (120 * 60)
    return (value % GOAL_TIME_SEGMENT) + (120 * 60)


def clamp01(v: float) -> float:
    """Clamp numeric value into [0, 1] range."""
    try:
        value = float(v)
    except (TypeError, ValueError):
        return 0.0
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return int(value)
        if value is None or value == "":
            return default
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _nested_get(obj: Any, *path: str) -> Any:
    current = obj
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _ratio(numerator: float, denominator: float, *, scale: float = 1.0, ndigits: int = 4) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * scale, ndigits)


def _avg(total: float, count: int, *, ndigits: int = 2) -> float:
    if count <= 0:
        return 0.0
    return round(total / count, ndigits)


def _summarize_recent_rows(rows: list[dict[str, Any]], period: int) -> dict[str, Any]:
    selected = rows[:period]
    count = len(selected)
    wins = len([row for row in selected if row.get("result") == "승"])
    draws = len([row for row in selected if row.get("result") == "무"])
    losses = len([row for row in selected if row.get("result") == "패"])
    goals_for = sum(_to_int(row.get("gf"), 0) for row in selected)
    goals_against = sum(_to_int(row.get("ga"), 0) for row in selected)
    shots = sum(_to_int(row.get("shots"), 0) for row in selected)
    shots_on_target = sum(_to_int(row.get("sot"), 0) for row in selected)
    possession_values = [
        float(row.get("possession"))
        for row in selected
        if _to_float(row.get("possession")) is not None
    ]
    pass_values = [
        float(row.get("passAcc"))
        for row in selected
        if _to_float(row.get("passAcc")) is not None
    ]

    return {
        "period": int(period),
        "sampleSize": int(count),
        "w": int(wins),
        "d": int(draws),
        "l": int(losses),
        "winRate": _ratio(wins, count, scale=100.0, ndigits=2),
        "goalsPerMatch": _avg(goals_for, count, ndigits=3),
        "goalsConcededPerMatch": _avg(goals_against, count, ndigits=3),
        "goalDifferencePerMatch": _avg(goals_for - goals_against, count, ndigits=3),
        "shotsPerMatch": _avg(shots, count, ndigits=3),
        "shotsOnTargetPerMatch": _avg(shots_on_target, count, ndigits=3),
        "shotAccuracy": _ratio(shots_on_target, shots, scale=100.0, ndigits=2),
        "goalConversion": _ratio(goals_for, shots, scale=100.0, ndigits=2),
        "averagePossession": _avg(sum(possession_values), len(possession_values), ndigits=3),
        "passSuccessRate": _avg(sum(pass_values), len(pass_values), ndigits=4) * 100.0
        if pass_values
        else 0.0,
    }


def _new_performance_bucket() -> dict[str, Any]:
    return {
        "matches": 0,
        "w": 0,
        "d": 0,
        "l": 0,
        "gf": 0,
        "ga": 0,
        "shots": 0,
        "sot": 0,
        "possessionSum": 0.0,
        "possessionCount": 0,
        "passSuccess": 0,
        "passTry": 0,
        "cleanSheets": 0,
        "concedeTwoPlus": 0,
        "lastMatchDateKst": None,
    }


def _add_match_to_bucket(
    bucket: dict[str, Any],
    *,
    result_label: str,
    gf: int,
    ga: int,
    shots: int,
    sot: int,
    possession: float | None,
    pass_success: int,
    pass_try: int,
    date_kst: datetime,
) -> None:
    bucket["matches"] += 1
    if result_label == "승":
        bucket["w"] += 1
    elif result_label == "무":
        bucket["d"] += 1
    elif result_label == "패":
        bucket["l"] += 1
    bucket["gf"] += int(gf)
    bucket["ga"] += int(ga)
    bucket["shots"] += int(shots)
    bucket["sot"] += int(sot)
    bucket["passSuccess"] += int(pass_success)
    bucket["passTry"] += int(pass_try)
    if possession is not None:
        bucket["possessionSum"] += float(possession)
        bucket["possessionCount"] += 1
    if ga == 0:
        bucket["cleanSheets"] += 1
    if ga >= 2:
        bucket["concedeTwoPlus"] += 1
    current_last = bucket.get("lastMatchDateKst")
    if current_last is None or date_kst > current_last:
        bucket["lastMatchDateKst"] = date_kst


def _finalize_performance_bucket(
    key: str,
    bucket: dict[str, Any],
    *,
    label: str | None = None,
) -> dict[str, Any]:
    matches = int(bucket.get("matches") or 0)
    shots = int(bucket.get("shots") or 0)
    sot = int(bucket.get("sot") or 0)
    gf = int(bucket.get("gf") or 0)
    ga = int(bucket.get("ga") or 0)
    pass_try = int(bucket.get("passTry") or 0)
    last_dt = bucket.get("lastMatchDateKst")
    return {
        "key": key,
        "label": label or key,
        "matches": matches,
        "w": int(bucket.get("w") or 0),
        "d": int(bucket.get("d") or 0),
        "l": int(bucket.get("l") or 0),
        "winRate": _ratio(bucket.get("w") or 0, matches, scale=100.0, ndigits=2),
        "goalsPerMatch": _avg(gf, matches, ndigits=3),
        "goalsConcededPerMatch": _avg(ga, matches, ndigits=3),
        "goalDifferencePerMatch": _avg(gf - ga, matches, ndigits=3),
        "shotAccuracy": _ratio(sot, shots, scale=100.0, ndigits=2),
        "goalConversion": _ratio(gf, shots, scale=100.0, ndigits=2),
        "averagePossession": _avg(
            float(bucket.get("possessionSum") or 0.0),
            int(bucket.get("possessionCount") or 0),
            ndigits=3,
        ),
        "passSuccessRate": _ratio(bucket.get("passSuccess") or 0, pass_try, scale=100.0, ndigits=2),
        "cleanSheetRate": _ratio(bucket.get("cleanSheets") or 0, matches, scale=100.0, ndigits=2),
        "concedeTwoPlusRate": _ratio(
            bucket.get("concedeTwoPlus") or 0,
            matches,
            scale=100.0,
            ndigits=2,
        ),
        "lastMatchDateKst": last_dt.isoformat() if isinstance(last_dt, datetime) else None,
    }


def _formation_shape_from_positions(position_values: list[int]) -> str:
    defenders = len([pos for pos in position_values if 1 <= pos <= 8])
    midfielders = len([pos for pos in position_values if 9 <= pos <= 19])
    forwards = len([pos for pos in position_values if 20 <= pos <= 27])
    if defenders + midfielders + forwards == 0:
        return "UNKNOWN"
    return f"{defenders}-{midfielders}-{forwards}"


def _time_slot_label(hour: int) -> str:
    if 0 <= hour < 6:
        return "새벽"
    if 6 <= hour < 12:
        return "오전"
    if 12 <= hour < 18:
        return "오후"
    return "야간"


def _classify_match_flow(
    *,
    result_label: str,
    gf: int,
    ga: int,
    possession: float | None,
    shots: int,
    opp_shots: int,
) -> str:
    goal_diff = gf - ga
    possession_value = float(possession) if possession is not None else 0.0
    if result_label == "승" and goal_diff >= 3:
        return "압도적 승리"
    if result_label == "패" and ga >= 3:
        return "수비 불안"
    if gf + ga >= 5:
        return "난타전"
    if gf + ga <= 1:
        return "저득점 접전"
    if result_label == "패" and possession_value >= 55:
        return "점유율 우세 패배"
    if result_label == "패" and shots > opp_shots:
        return "슈팅 우세 패배"
    if result_label == "승" and possession_value <= 45 and gf >= ga:
        return "역습형 승리"
    if shots >= 7 and gf <= 1:
        return "결정력 부족"
    return "균형형 경기"


def _style_profile(summary: dict[str, Any]) -> dict[str, Any]:
    win_rate = float(summary.get("winRate") or 0)
    goals = float(summary.get("goalsPerMatch") or 0)
    conceded = float(summary.get("goalsConcededPerMatch") or 0)
    shots = float(summary.get("shotsPerMatch") or 0)
    possession = float(summary.get("averagePossession") or 0)
    pass_rate = float(summary.get("passSuccessRate") or 0)
    conversion = float(summary.get("goalConversion") or 0)
    clean_sheet = float(summary.get("cleanSheetRate") or 0)

    scores = {
        "점유형": possession,
        "다득점형": goals * 25.0,
        "수비형": max(0.0, 70.0 - conceded * 25.0) + clean_sheet * 0.35,
        "고효율형": conversion + win_rate * 0.35,
        "다슈팅형": shots * 10.0,
        "안정형": pass_rate * 0.4 + win_rate * 0.4 + clean_sheet * 0.2,
    }
    primary = max(scores.items(), key=lambda item: item[1])[0] if scores else "균형형"
    return {
        "primary": primary,
        "scores": {key: round(float(value), 2) for key, value in scores.items()},
    }


def _expanded_manager_mode_insights(
    summary: dict[str, Any],
    expanded: dict[str, Any],
) -> list[dict[str, Any]]:
    insights: list[dict[str, Any]] = []
    sample_size = int(summary.get("sampleSize") or 0)
    if sample_size < 20:
        return insights

    baseline_win_rate = float(summary.get("winRate") or 0)
    baseline_concede_two_plus = float(summary.get("concedeTwoPlusRate") or 0)

    style = expanded.get("styleProfile") if isinstance(expanded.get("styleProfile"), dict) else {}
    primary_style = str(style.get("primary") or "").strip()
    if primary_style:
        insights.append(
            {
                "code": "STYLE_PROFILE_DETECTED",
                "category": "STYLE",
                "severity": "info",
                "title": f"{primary_style} 프로필",
                "description": "최근 감독모드 경기 지표에서 가장 강하게 관찰된 운영 성향입니다.",
                "sampleSize": sample_size,
                "evidence": style,
            }
        )

    formations = expanded.get("formationPerformance")
    if isinstance(formations, list):
        for row in formations:
            if not isinstance(row, dict) or int(row.get("matches") or 0) < 15:
                continue
            if float(row.get("concedeTwoPlusRate") or 0) >= baseline_concede_two_plus + 12:
                insights.append(
                    {
                        "code": "FORMATION_DEFENSIVE_RISK",
                        "category": "FORMATION",
                        "severity": "warning",
                        "title": f"{row.get('label')} 형태 수비 변동",
                        "description": "해당 포메이션 형태 사용 경기에서 다실점 경기 비율이 전체 평균보다 높게 관찰되었습니다.",
                        "sampleSize": int(row.get("matches") or 0),
                        "evidence": row,
                    }
                )
                break

    time_slots = expanded.get("timeSlotPerformance")
    if isinstance(time_slots, list):
        weak_slots = [
            row
            for row in time_slots
            if isinstance(row, dict)
            and int(row.get("matches") or 0) >= 10
            and float(row.get("winRate") or 0) <= baseline_win_rate - 12
        ]
        if weak_slots:
            weak_slots.sort(key=lambda row: (float(row.get("winRate") or 0), -int(row.get("matches") or 0)))
            row = weak_slots[0]
            insights.append(
                {
                    "code": "TIME_SLOT_UNDERPERFORMANCE",
                    "category": "TIME",
                    "severity": "warning",
                    "title": f"{row.get('label')} 시간대 성과 저하",
                    "description": "해당 시간대 경기의 승률이 전체 평균보다 낮게 관찰되었습니다.",
                    "sampleSize": int(row.get("matches") or 0),
                    "evidence": row,
                }
            )

    combos = expanded.get("playerCombinations") if isinstance(expanded.get("playerCombinations"), dict) else {}
    pairs = combos.get("pairs") if isinstance(combos.get("pairs"), list) else []
    for row in pairs:
        if not isinstance(row, dict) or int(row.get("matches") or 0) < 10:
            continue
        if float(row.get("winRate") or 0) >= baseline_win_rate + 12:
            names = [str(player.get("name") or player.get("spId")) for player in row.get("players", [])]
            insights.append(
                {
                    "code": "PLAYER_PAIR_HIGH_EFFICIENCY",
                    "category": "SQUAD",
                    "severity": "positive",
                    "title": "선수 2인 조합 고효율 관찰",
                    "description": f"{' · '.join(names)} 동시 출전 경기에서 전체 평균보다 높은 승률이 관찰되었습니다.",
                    "sampleSize": int(row.get("matches") or 0),
                    "evidence": row,
                }
            )
            break

    return insights[:4]


def _diff_value(current: float, baseline: float, ndigits: int = 3) -> float:
    return round(float(current) - float(baseline), ndigits)


def _percent_change(current: float, baseline: float, ndigits: int = 2) -> float | None:
    if baseline == 0:
        return None
    return round(((float(current) - float(baseline)) / abs(float(baseline))) * 100.0, ndigits)


def _manager_mode_insights(
    summary: dict[str, Any],
    recent_20: dict[str, Any],
    previous_20: dict[str, Any],
) -> list[dict[str, Any]]:
    insights: list[dict[str, Any]] = []
    sample_size = int(summary.get("sampleSize") or 0)
    if sample_size < 20:
        return insights

    shots_per_match = float(summary.get("shotsPerMatch") or 0)
    goals_per_match = float(summary.get("goalsPerMatch") or 0)
    average_possession = float(summary.get("averagePossession") or 0)
    shot_accuracy = float(summary.get("shotAccuracy") or 0)
    goal_conversion = float(summary.get("goalConversion") or 0)
    win_rate = float(summary.get("winRate") or 0)

    if average_possession >= 52 and shots_per_match >= 7 and goals_per_match < 1.3:
        insights.append(
            {
                "code": "LOW_ATTACK_CONVERSION",
                "category": "ATTACK",
                "severity": "warning",
                "title": "공격 전환 효율 저하",
                "description": "점유율과 슈팅 수에 비해 득점 전환이 낮게 나타났습니다.",
                "sampleSize": sample_size,
                "evidence": {
                    "averagePossession": average_possession,
                    "shotsPerMatch": shots_per_match,
                    "goalsPerMatch": goals_per_match,
                },
            }
        )

    if shots_per_match >= 6 and shot_accuracy < 35:
        insights.append(
            {
                "code": "LOW_SHOT_ACCURACY",
                "category": "ATTACK",
                "severity": "warning",
                "title": "슈팅 정확도 저하",
                "description": "슈팅 시도 대비 유효 슈팅 비율이 낮게 나타났습니다.",
                "sampleSize": sample_size,
                "evidence": {
                    "shotsPerMatch": shots_per_match,
                    "shotAccuracy": shot_accuracy,
                },
            }
        )

    if average_possession >= 55 and win_rate < float(recent_20.get("winRate") or win_rate):
        insights.append(
            {
                "code": "POSSESSION_WITHOUT_RESULT",
                "category": "CONTROL",
                "severity": "neutral",
                "title": "점유율 우세 미전환",
                "description": "높은 점유 비중이 최근 승률 우위로 충분히 연결되지는 않았습니다.",
                "sampleSize": sample_size,
                "evidence": {
                    "averagePossession": average_possession,
                    "winRate": win_rate,
                    "recent20WinRate": recent_20.get("winRate"),
                },
            }
        )

    if average_possession <= 47 and goal_conversion >= 18 and win_rate >= 50:
        insights.append(
            {
                "code": "LOW_POSSESSION_HIGH_EFFICIENCY",
                "category": "CONTROL",
                "severity": "positive",
                "title": "낮은 점유율 고효율",
                "description": "낮은 점유 비중에서도 평균 이상의 득점 전환과 승률이 관찰되었습니다.",
                "sampleSize": sample_size,
                "evidence": {
                    "averagePossession": average_possession,
                    "goalConversion": goal_conversion,
                    "winRate": win_rate,
                },
            }
        )

    if int(recent_20.get("sampleSize") or 0) >= 20 and int(previous_20.get("sampleSize") or 0) >= 20:
        goals_change = _percent_change(
            float(recent_20.get("goalsPerMatch") or 0),
            float(previous_20.get("goalsPerMatch") or 0),
        )
        win_rate_diff = _diff_value(
            float(recent_20.get("winRate") or 0),
            float(previous_20.get("winRate") or 0),
            ndigits=2,
        )
        conceded_change = _percent_change(
            float(recent_20.get("goalsConcededPerMatch") or 0),
            float(previous_20.get("goalsConcededPerMatch") or 0),
        )

        if goals_change is not None and goals_change >= 20 and win_rate_diff >= 5:
            insights.append(
                {
                    "code": "RECENT_ATTACK_IMPROVEMENT",
                    "category": "ATTACK",
                    "severity": "positive",
                    "title": "최근 득점 성과 상승",
                    "description": "최근 20경기의 경기당 득점이 직전 20경기보다 높게 나타났습니다.",
                    "sampleSize": int(recent_20.get("sampleSize")),
                    "evidence": {
                        "recentGoalsPerMatch": recent_20.get("goalsPerMatch"),
                        "previousGoalsPerMatch": previous_20.get("goalsPerMatch"),
                        "changePercent": goals_change,
                        "winRateDifference": win_rate_diff,
                    },
                }
            )

        if conceded_change is not None and conceded_change >= 20:
            insights.append(
                {
                    "code": "RECENT_DEFENSE_DECLINE",
                    "category": "DEFENSE",
                    "severity": "warning",
                    "title": "최근 수비 성과 하락",
                    "description": "최근 경기의 평균 실점이 이전 비교 구간보다 높게 나타났습니다.",
                    "sampleSize": int(recent_20.get("sampleSize")),
                    "evidence": {
                        "recentGoalsConcededPerMatch": recent_20.get("goalsConcededPerMatch"),
                        "previousGoalsConcededPerMatch": previous_20.get(
                            "goalsConcededPerMatch"
                        ),
                        "changePercent": conceded_change,
                    },
                }
            )

    return insights[:5]


def _manager_mode_analysis_from_last200(
    last200: dict[str, Any],
    *,
    season: str,
    player_id: str,
    nickname: str,
    matchtype: int,
    privacy_meta: dict[str, str],
    generated_at: datetime,
) -> dict[str, Any] | None:
    if not isinstance(last200, dict):
        return None

    kpi = last200.get("kpi") if isinstance(last200.get("kpi"), dict) else {}
    recent_matches = last200.get("recentMatches")
    if not isinstance(recent_matches, list):
        recent_matches = []

    sample_size = int(_nested_get(last200, "window", "actual") or len(recent_matches) or 0)
    if sample_size <= 0:
        return None

    goals_per_match = float(kpi.get("avgGoalsFor") or 0)
    goals_conceded_per_match = float(kpi.get("avgGoalsAgainst") or 0)
    shots_per_match = float(kpi.get("avgShots") or 0)
    shots_on_target_per_match = float(kpi.get("avgShotsOnTarget") or 0)
    average_possession = float(kpi.get("avgPossession") or 0)
    pass_success_rate = float(kpi.get("avgPassAcc") or 0)

    performance_summary = {
        "sampleSize": sample_size,
        "w": int(kpi.get("w") or 0),
        "d": int(kpi.get("d") or 0),
        "l": int(kpi.get("l") or 0),
        "winRate": float(kpi.get("winRate") or 0),
        "goalsPerMatch": goals_per_match,
        "goalsConcededPerMatch": goals_conceded_per_match,
        "goalDifferencePerMatch": round(goals_per_match - goals_conceded_per_match, 3),
        "shotsPerMatch": shots_per_match,
        "shotsOnTargetPerMatch": shots_on_target_per_match,
        "shotAccuracy": _ratio(shots_on_target_per_match, shots_per_match, scale=100.0, ndigits=2),
        "goalConversion": _ratio(goals_per_match, shots_per_match, scale=100.0, ndigits=2),
        "shotOnTargetConversion": _ratio(
            goals_per_match,
            shots_on_target_per_match,
            scale=100.0,
            ndigits=2,
        ),
        "averagePossession": average_possession,
        "passSuccessRate": pass_success_rate,
        "tackleSuccessRate": float(kpi.get("avgTackleAcc") or 0),
        "cleanSheetRate": float(_nested_get(last200, "advanced", "cleanSheetRate") or 0),
        "concedeTwoPlusRate": float(_nested_get(last200, "advanced", "concedeTwoPlusRate") or 0),
    }
    recent_form = [_summarize_recent_rows(recent_matches, 20)] if recent_matches else []
    recent_20 = _summarize_recent_rows(recent_matches, 20)
    previous_20 = _summarize_recent_rows(recent_matches[20:40], 20)

    return {
        "schemaVersion": "0.1.0",
        "status": "SUCCESS_FROM_LAST200",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "matchtype": int(matchtype),
            "matchtypeName": "감독모드" if int(matchtype) == 52 else str(matchtype),
            "fallback": "last200.json",
            "season": season,
        },
        "privacy": privacy_meta,
        "player": {
            "playerId": player_id,
            "nickname": nickname,
        },
        "sample": {
            "requested": int(_nested_get(last200, "window", "n") or sample_size),
            "valid": sample_size,
            "excluded": 0,
            "minimumForInsights": 20,
        },
        "period": last200.get("period") if isinstance(last200.get("period"), dict) else {},
        "summary": performance_summary,
        "recentForm": recent_form,
        "comparisons": {
            "recent20VsPrevious20": {
                "recent": recent_20,
                "previous": previous_20,
                "winRateDifference": _diff_value(
                    float(recent_20.get("winRate") or 0),
                    float(previous_20.get("winRate") or 0),
                    ndigits=2,
                ),
                "goalsPerMatchChangePercent": _percent_change(
                    float(recent_20.get("goalsPerMatch") or 0),
                    float(previous_20.get("goalsPerMatch") or 0),
                ),
                "goalsConcededPerMatchChangePercent": _percent_change(
                    float(recent_20.get("goalsConcededPerMatch") or 0),
                    float(previous_20.get("goalsConcededPerMatch") or 0),
                ),
            }
        },
        "insights": _manager_mode_insights(performance_summary, recent_20, previous_20),
    }


def _has_player_activity(status: dict[str, Any]) -> bool:
    # 벤치 더미(spPosition=28) 제외를 위한 최소 활동 판정.
    for key in (
        "goal",
        "assist",
        "shoot",
        "effectiveShoot",
        "passSuccess",
        "passTry",
        "dribbleSuccess",
        "dribbleTry",
        "aerialSuccess",
        "aerialTry",
        "tackle",
        "tackleTry",
        "block",
        "blockTry",
        "defending",
        "intercept",
    ):
        if _to_int(status.get(key), 0) > 0:
            return True
    rating = _to_float(status.get("spRating"))
    return rating is not None and rating > 0


def _parse_match_date_to_kst(value: Any) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None

    normalized = text.replace("Z", "+00:00")
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue

    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(KST)


def _normalize_result(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"승", "win", "w"}:
        return "win"
    if text in {"무", "draw", "d"}:
        return "draw"
    if text in {"패", "lose", "loss", "l"}:
        return "lose"
    return "unknown"


def _result_label(value: Any) -> str:
    normalized = _normalize_result(value)
    if normalized == "win":
        return "승"
    if normalized == "draw":
        return "무"
    if normalized == "lose":
        return "패"
    return "-"


def extract_side(match_detail_payload: dict[str, Any], target_ouid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Extract my/opp side from matchInfo by target ouid."""
    match_info = match_detail_payload.get("matchInfo")
    if not isinstance(match_info, list):
        return {}, {}

    rows = [row for row in match_info if isinstance(row, dict)]
    if not rows:
        return {}, {}

    my: dict[str, Any] | None = None
    target = str(target_ouid).strip()
    if target:
        for row in rows:
            if str(row.get("ouid", "")).strip() == target:
                my = row
                break
    if my is None:
        my = rows[0]

    opp: dict[str, Any] = {}
    for row in rows:
        if row is not my:
            opp = row
            break
    return my, opp


def _safe_possession_percent(value: Any) -> float | None:
    parsed = _to_float(value)
    if parsed is None:
        return None
    if 0 <= parsed <= 1:
        return round(parsed * 100, 2)
    return round(parsed, 2)


def _side_goal_total(side: dict[str, Any]) -> int:
    for path in (
        ("shoot", "goalTotal"),
        ("shoot", "goal"),
        ("matchDetail", "goal"),
        ("goalTotal",),
    ):
        value = _to_float(_nested_get(side, *path))
        if value is not None:
            return int(round(value))
    return 0


def _side_shots(side: dict[str, Any]) -> int:
    for path in (("shoot", "shootTotal"), ("shoot", "shoot"), ("shootTotal",)):
        value = _to_float(_nested_get(side, *path))
        if value is not None:
            return int(round(value))
    return 0


def _side_shots_on_target(side: dict[str, Any]) -> int:
    for path in (
        ("shoot", "effectiveShootTotal"),
        ("shoot", "effectiveShoot"),
        ("shoot", "shootOnTarget"),
        ("shoot", "validShoot"),
    ):
        value = _to_float(_nested_get(side, *path))
        if value is not None:
            return int(round(value))
    return 0


def _side_pass_totals(side: dict[str, Any]) -> tuple[int, int]:
    success = _to_int(_nested_get(side, "pass", "passSuccess"), 0)
    attempt = _to_int(_nested_get(side, "pass", "passTry"), 0)
    if attempt <= 0:
        alt_success = _to_int(_nested_get(side, "pass", "passSuccessRate"), -1)
        if alt_success >= 0:
            return alt_success, 100
    return success, attempt


def _side_tackle_totals(side: dict[str, Any]) -> tuple[int, int]:
    success = _to_int(_nested_get(side, "defence", "tackleSuccess"), 0)
    attempt = _to_int(_nested_get(side, "defence", "tackleTry"), 0)
    return success, attempt


def _side_detail_metrics(side: dict[str, Any]) -> dict[str, int | str]:
    detail = side.get("matchDetail") if isinstance(side.get("matchDetail"), dict) else {}
    shoot = side.get("shoot") if isinstance(side.get("shoot"), dict) else {}
    defence = side.get("defence") if isinstance(side.get("defence"), dict) else {}
    pass_row = side.get("pass") if isinstance(side.get("pass"), dict) else {}
    return {
        "matchEndType": _to_int(detail.get("matchEndType"), 0),
        "controller": str(detail.get("controller") or ""),
        "foul": _to_int(detail.get("foul"), 0),
        "injury": _to_int(detail.get("injury"), 0),
        "redCards": _to_int(detail.get("redCards"), 0),
        "yellowCards": _to_int(detail.get("yellowCards"), 0),
        "cornerKick": _to_int(detail.get("cornerKick"), 0),
        "offside": _to_int(detail.get("OffsideCount"), 0),
        "passTry": _to_int(pass_row.get("passTry"), 0),
        "passSuccess": _to_int(pass_row.get("passSuccess"), 0),
        "shortPassTry": _to_int(pass_row.get("shortPassTry"), 0),
        "shortPassSuccess": _to_int(pass_row.get("shortPassSuccess"), 0),
        "longPassTry": _to_int(pass_row.get("longPassTry"), 0),
        "longPassSuccess": _to_int(pass_row.get("longPassSuccess"), 0),
        "throughPassTry": _to_int(pass_row.get("throughPassTry"), 0),
        "throughPassSuccess": _to_int(pass_row.get("throughPassSuccess"), 0),
        "blockTry": _to_int(defence.get("blockTry"), 0),
        "blockSuccess": _to_int(defence.get("blockSuccess"), 0),
        "tackleTry": _to_int(defence.get("tackleTry"), 0),
        "tackleSuccess": _to_int(defence.get("tackleSuccess"), 0),
        "ownGoal": _to_int(shoot.get("ownGoal"), 0),
        "shootHeading": _to_int(shoot.get("shootHeading"), 0),
        "goalHeading": _to_int(shoot.get("goalHeading"), 0),
        "shootInPenalty": _to_int(shoot.get("shootInPenalty"), 0),
        "goalInPenalty": _to_int(shoot.get("goalInPenalty"), 0),
        "shootOutPenalty": _to_int(shoot.get("shootOutPenalty"), 0),
        "goalOutPenalty": _to_int(shoot.get("goalOutPenalty"), 0),
    }


def _extract_shoot_details(side: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = [
        _nested_get(side, "shoot", "shootDetail"),
        _nested_get(side, "shoot", "shootDetailList"),
        _nested_get(side, "shootDetail"),
        _nested_get(side, "shootDetailList"),
    ]
    for candidate in candidates:
        if isinstance(candidate, list):
            return [row for row in candidate if isinstance(row, dict)]
    return []


def _coerce_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    text = str(value or "").strip().lower()
    if not text:
        return None
    if text in {"1", "true", "y", "yes"}:
        return True
    if text in {"0", "false", "n", "no"}:
        return False
    return None


def _shot_type_value(shot: dict[str, Any]) -> int | str:
    for key in ("shootType", "type", "shotType", "shootTypeCode"):
        raw = shot.get(key)
        if raw is None or raw == "":
            continue
        as_int = _to_int(raw, default=-1)
        if as_int >= 0:
            return as_int
        return str(raw)
    return "unknown"


def _shot_result_value(shot: dict[str, Any]) -> str:
    for key in ("result", "shootResult", "goalResult", "resultType"):
        raw = shot.get(key)
        if raw is None or raw == "":
            continue
        return str(raw)
    return ""


def _is_goal_shot(shot: dict[str, Any]) -> bool:
    for key in ("isGoal", "goal", "goalFlag", "scored"):
        if key in shot:
            parsed = _coerce_bool(shot.get(key))
            if parsed is not None:
                return parsed

    result_text = _shot_result_value(shot).strip().lower()
    # FC Online match-detail 실데이터 기준:
    # result 3=goal, 2=saved/on-target, 1=miss
    if result_text in {"3", "goal", "g", "score", "scored", "true"}:
        return True
    if result_text in {"1", "2", "miss", "save", "saved", "blocked", "post", "false", "0"}:
        return False
    return False


def _guess_in_penalty(shot: dict[str, Any], x: float, y: float) -> bool:
    for key in ("inPenalty", "isInPenalty", "penalty", "insidePenalty"):
        if key in shot:
            parsed = _coerce_bool(shot.get(key))
            if parsed is not None:
                return parsed
    return x >= 0.79 and 0.21 <= y <= 0.79


def _is_long_shot_by_distance(x: float, y: float, in_penalty: bool) -> bool:
    if in_penalty:
        return False
    distance_to_goal_center = math.sqrt(((1.0 - x) ** 2) + ((y - 0.5) ** 2))
    return distance_to_goal_center >= LONG_SHOT_DISTANCE_THRESHOLD


def _goal_time_bin(seconds: int) -> str:
    if seconds < 15 * 60:
        return "0-15"
    if seconds < 30 * 60:
        return "16-30"
    if seconds < 45 * 60:
        return "31-45"
    if seconds < 60 * 60:
        return "46-60"
    if seconds < 75 * 60:
        return "61-75"
    if seconds < 90 * 60:
        return "76-90"
    if seconds < 105 * 60:
        return "91-105"
    if seconds < 120 * 60:
        return "106-120"
    return "120+"


def _counter_to_ordered_bins(counter: Counter[str]) -> list[dict[str, Any]]:
    return [{"bin": key, "count": int(counter.get(key, 0))} for key in GOAL_TIME_BINS]


def _percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    ratio_clamped = max(0.0, min(1.0, float(ratio)))
    index = ratio_clamped * (len(sorted_values) - 1)
    lower = int(math.floor(index))
    upper = int(math.ceil(index))
    if lower == upper:
        return float(sorted_values[lower])
    fraction = index - lower
    return float(sorted_values[lower] + (sorted_values[upper] - sorted_values[lower]) * fraction)


def _lead_and_concede_flags(my_goal_times: list[int], opp_goal_times: list[int]) -> tuple[bool, bool]:
    per_second: dict[int, dict[str, int]] = {}
    for sec in my_goal_times:
        key = int(sec)
        bucket = per_second.setdefault(key, {"my": 0, "opp": 0})
        bucket["my"] += 1
    for sec in opp_goal_times:
        key = int(sec)
        bucket = per_second.setdefault(key, {"my": 0, "opp": 0})
        bucket["opp"] += 1

    my_score = 0
    opp_score = 0
    led_during_match = False
    conceded_while_ahead = False

    seconds = sorted(per_second.keys())
    for sec in seconds:
        bucket = per_second.get(sec) or {"my": 0, "opp": 0}
        my_inc = int(bucket.get("my", 0))
        opp_inc = int(bucket.get("opp", 0))

        if my_score > opp_score and opp_inc > 0:
            conceded_while_ahead = True

        my_score += my_inc
        opp_score += opp_inc

        if my_score > opp_score:
            led_during_match = True

    return led_during_match, conceded_while_ahead


def _player_user_dir(data_base_dir: str, season: str, player_id: str) -> Path:
    return Path(data_base_dir) / str(season) / "user" / str(player_id)


def _resolve_manager_row_for_player(player_id: str) -> dict[str, Any] | None:
    manager_config_path = Path("config") / "managers.json"
    if not manager_config_path.is_file():
        return None

    try:
        with manager_config_path.open("r", encoding="utf-8") as f:
            managers = json.load(f)
    except Exception:
        return None

    if not isinstance(managers, list):
        return None

    player_token = str(player_id)
    for manager in managers:
        if not isinstance(manager, dict):
            continue
        candidates = [manager.get("player_id"), manager.get("playerId")]
        if any(player_token == str(candidate or "").strip() for candidate in candidates):
            return manager
        if str(manager.get("name") or "").strip() == player_token:
            return manager

    return None


def _resolve_nickname_for_player(data_base_dir: str, season: str, player_id: str) -> str:
    manager = _resolve_manager_row_for_player(player_id)
    if manager:
        nickname = str(manager.get("name") or "").strip()
        if nickname:
            return nickname

    user_dir = _player_user_dir(data_base_dir, season, player_id)
    if not user_dir.is_dir():
        raise OpenApiAnalyticsError(
            f"해당 시즌에 일일 크롤링 데이터가 없어 nickname 추출 불가: season={season}, id={player_id}"
        )

    latest_path: Path | None = None
    latest_token = ""
    for path in user_dir.iterdir():
        if not path.is_file():
            continue
        matched = DAILY_FILE_NAME_RE.match(path.name)
        if not matched:
            continue
        if matched.group("player_id") != str(player_id):
            continue
        token = matched.group("yymmdd")
        if token > latest_token:
            latest_token = token
            latest_path = path

    if latest_path is None:
        raise OpenApiAnalyticsError(
            f"해당 시즌에 일일 크롤링 데이터가 없어 nickname 추출 불가: season={season}, id={player_id}"
        )

    try:
        with latest_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as exc:
        raise OpenApiAnalyticsError(f"nickname 추출용 일일 파일 읽기 실패: {latest_path}") from exc

    rows: list[Any]
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict) and isinstance(payload.get("results"), list):
        rows = payload.get("results", [])
    else:
        raise OpenApiAnalyticsError(f"일일 데이터 포맷 오류(리스트 아님): {latest_path}")

    if not rows or not isinstance(rows[0], dict):
        raise OpenApiAnalyticsError(f"일일 데이터 포맷 오류(첫 row 없음): {latest_path}")

    first = rows[0]
    for key in ("구단주명", "구단주", "닉네임", "name"):
        value = str(first.get(key, "")).strip()
        if value:
            return value

    raise OpenApiAnalyticsError(f"최신 일일 데이터에 구단주명 필드가 없습니다: {latest_path}")


def _format_fc_club_value(value: Any) -> str:
    try:
        numeric = int(float(str(value).replace(",", "").strip()))
    except (TypeError, ValueError):
        return "-"

    if numeric <= 0:
        return "-"

    jo_unit = 1_000_000_000_000
    gyeong_unit = jo_unit * 10_000
    if numeric < jo_unit:
        return "1조 미만"

    gyeong = numeric // gyeong_unit
    remain_jo = (numeric % gyeong_unit) // jo_unit
    if gyeong > 0 and remain_jo > 0:
        return f"{gyeong}경 {remain_jo:,}조"
    if gyeong > 0:
        return f"{gyeong}경"
    return f"{remain_jo:,}조"


def _normalize_squad_player_rows(players: Any) -> list[dict[str, Any]]:
    if not isinstance(players, list):
        return []

    rows: list[dict[str, Any]] = []
    for index, player in enumerate(players):
        if not isinstance(player, dict):
            continue
        spid = _to_int(player.get("spid", player.get("spId")), -1)
        if spid < 0:
            continue
        price = _to_int(str(player.get("price") or "").replace(",", ""), 0)
        rows.append(
            {
                "spId": spid,
                "name": str(player.get("name") or "").strip(),
                "role": str(player.get("role") or player.get("position") or "").strip(),
                "position": str(player.get("position") or "").strip(),
                "pay": _to_int(player.get("pay"), 0),
                "price": price,
                "priceText": _format_fc_club_value(price),
                "order": index,
                "starter": index < 11,
            }
        )
    return rows


def _split_team_color_skills(value: Any) -> list[dict[str, Any]]:
    tokens = [token.strip() for token in str(value or "").split("|") if token.strip()]
    skills: list[dict[str, Any]] = []
    for token in tokens:
        match = re.match(r"^(?P<name>.+?)\s*\+(?P<amount>[0-9.]+)$", token)
        if match:
            skills.append(
                {
                    "name": match.group("name").strip(),
                    "amount": _to_int(match.group("amount"), 0),
                    "label": token,
                }
            )
        else:
            skills.append({"name": token, "amount": None, "label": token})
    return skills


def _normalize_team_color_rows(total_team_color: Any) -> list[dict[str, Any]]:
    if not isinstance(total_team_color, dict):
        return []

    group_labels = {
        "affiliation": "소속",
        "enhance": "강화",
        "feature": "특성",
    }
    rows: list[dict[str, Any]] = []
    for group_key in ("affiliation", "enhance", "feature"):
        group_payload = total_team_color.get(group_key)
        if not isinstance(group_payload, dict):
            continue
        for team_color_id, item in group_payload.items():
            if not isinstance(item, dict):
                continue
            player_list = item.get("playerlist")
            if not isinstance(player_list, list):
                player_list = []
            rows.append(
                {
                    "id": str(team_color_id),
                    "group": group_key,
                    "groupLabel": group_labels.get(group_key, group_key),
                    "level": _to_int(item.get("lv"), 0),
                    "name": str(item.get("name") or "").strip(),
                    "playerCount": _to_int(item.get("playercnt"), len(player_list)),
                    "skills": _split_team_color_skills(item.get("skill")),
                    "image": str(item.get("image") or "").strip(),
                }
            )

    rows.sort(
        key=lambda row: (
            {"affiliation": 0, "enhance": 1, "feature": 2}.get(str(row["group"]), 9),
            -int(row["playerCount"]),
            str(row["name"]),
        )
    )
    return rows


def _metadata_team_color_rows(match_players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Calculate active team colors from Open API spId/spGrade values."""
    from .teamcolor_metadata import load_teamcolor_metadata

    loaded = load_teamcolor_metadata()
    if loaded.get("status") != "READY":
        return []
    data = loaded.get("data") or {}
    team_rows = data.get("team_colors") or []
    stage_rows = data.get("activation_stages") or []
    effect_rows = data.get("effects") or []
    relation_rows = data.get("teamcolor_players") or []
    player_rows = data.get("players") or []
    if not all(isinstance(rows, list) for rows in (team_rows, stage_rows, effect_rows, relation_rows, player_rows)):
        return []

    player_meta = {str(row.get("spid")): row for row in player_rows if isinstance(row, dict)}
    match_spids = {str(row.get("spId")) for row in match_players if row.get("spId") is not None}
    grades = {str(row.get("spId")): _to_int(row.get("spGrade"), 0) for row in match_players}
    relation_map: dict[str, set[str]] = {}
    for row in relation_rows:
        if not isinstance(row, dict):
            continue
        relation_map.setdefault(str(row.get("teamcolor_id")), set()).add(str(row.get("spid")))
    stages_map: dict[str, list[dict[str, Any]]] = {}
    for row in stage_rows:
        if isinstance(row, dict):
            stages_map.setdefault(str(row.get("teamcolor_id")), []).append(row)
    effects_map: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for row in effect_rows:
        if isinstance(row, dict):
            effects_map.setdefault((str(row.get("teamcolor_id")), _to_int(row.get("stage"), 0)), []).append(row)

    category_map = {"소속 팀컬러": ("affiliation", "소속"), "특성 팀컬러": ("feature", "특성"), "강화 팀컬러": ("enhance", "강화")}
    enhancement_rules = {
        "10001": (8, lambda spid, grade: grade >= 8),
        "10002": (5, lambda spid, grade: grade >= 5),
        "10003": (3, lambda spid, grade: grade >= 3),
        "10004": (11, lambda spid, grade: grade >= 11),
        "10005": (0, lambda spid, grade: grade == 0 and str(player_meta.get(spid, {}).get("season", "")).upper().startswith("LIVE")),
    }
    active_enhancement: dict[str, tuple[dict[str, Any], int, int]] = {}
    for team in team_rows:
        if not isinstance(team, dict):
            continue
        team_id = str(team.get("teamcolor_id"))
        rule_entry = enhancement_rules.get(team_id)
        if rule_entry is None:
            continue
        threshold, rule = rule_entry
        eligible_count = sum(1 for spid, grade in grades.items() if rule(spid, grade))
        active_stages = [row for row in stages_map.get(team_id, []) if _to_int(row.get("required_players"), 0) <= eligible_count and eligible_count >= 6]
        if active_stages:
            active_enhancement[team_id] = (max(active_stages, key=lambda row: _to_int(row.get("stage"), 0)), eligible_count, threshold)

    assigned_enhancement: dict[str, int] = {}
    for spid, grade in grades.items():
        eligible = [(team_id, entry[2]) for team_id, entry in active_enhancement.items() if enhancement_rules[team_id][1](spid, grade)]
        if eligible:
            selected_team_id = max(eligible, key=lambda item: item[1])[0]
            assigned_enhancement[selected_team_id] = assigned_enhancement.get(selected_team_id, 0) + 1

    result: list[dict[str, Any]] = []
    for team in team_rows:
        if not isinstance(team, dict):
            continue
        team_id = str(team.get("teamcolor_id"))
        category = str(team.get("category") or "")
        group, group_label = category_map.get(category, ("feature", category or "팀컬러"))
        rule_entry = enhancement_rules.get(team_id)
        if rule_entry:
            active_entry = active_enhancement.get(team_id)
            if active_entry is None:
                continue
            active_stage, activation_count, _ = active_entry
            player_count = assigned_enhancement.get(team_id, 0)
            if player_count <= 0:
                continue
        else:
            player_count = len(match_spids & relation_map.get(team_id, set()))
            activation_count = player_count
        active_stages = [row for row in stages_map.get(team_id, []) if _to_int(row.get("required_players"), 0) <= activation_count and activation_count >= 6]
        if not active_stages:
            continue
        active_stage = max(active_stages, key=lambda row: _to_int(row.get("stage"), 0))
        level = _to_int(active_stage.get("stage"), 0)
        skills = []
        for effect in effects_map.get((team_id, level), []):
            value = _to_float(effect.get("value")) or 0.0
            skills.append({"name": str(effect.get("stat_name") or effect.get("stat_code") or "").strip(), "amount": int(value) if value.is_integer() else value, "label": str(effect.get("raw_effect") or "").strip()})
        result.append({"id": team_id, "group": group, "groupLabel": group_label, "level": level, "name": str(team.get("name") or "").strip(), "playerCount": player_count, "activationPlayerCount": activation_count, "skills": skills, "image": str(active_stage.get("icon_url") or team.get("icon_url") or "").strip()})
    result.sort(key=lambda row: ({"affiliation": 0, "feature": 1, "enhance": 2}.get(row["group"], 9), -int(row["playerCount"]), str(row["name"])))
    return result


def _build_squad_snapshot_payload(
    *,
    generated_at: datetime,
    season: str,
    player_id: str,
    nickname: str,
    privacy_meta: dict[str, str],
    latest_side: dict[str, Any] | None = None,
    spid_name_map: dict[str, str] | None = None,
    spposition_name_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    from .teamcolor_metadata import load_teamcolor_metadata

    latest_side = latest_side or {}
    spid_name_map = spid_name_map or {}
    spposition_name_map = spposition_name_map or {}
    loaded_metadata = load_teamcolor_metadata()
    metadata_ready = loaded_metadata.get("status") == "READY"
    metadata_players = {
        str(row.get("spid")): row
        for row in (loaded_metadata.get("data", {}).get("players") or [])
        if isinstance(row, dict)
    }
    raw_players = _nested_get(latest_side, "player") or []
    match_players = []
    for raw in raw_players:
        if not isinstance(raw, dict):
            continue
        sp_position = _to_int(raw.get("spPosition", raw.get("spposition")), -1)
        if not 0 <= sp_position <= 27:
            continue
        sp_id = _to_int(raw.get("spId", raw.get("spid")), -1)
        if sp_id < 0:
            continue
        match_players.append({"spId": sp_id, "spGrade": _to_int(raw.get("spGrade", raw.get("spgrade")), 0), "spPosition": sp_position})
    match_players = match_players[:11]
    player_rows = []
    for index, row in enumerate(match_players):
        sp_id = int(row["spId"])
        position_name = str(spposition_name_map.get(str(row["spPosition"])) or "").strip()
        player_meta = metadata_players.get(str(sp_id), {})
        pay = _to_int(player_meta.get("pay"), 0)
        player_rows.append({"spId": sp_id, "name": spid_name_map.get(str(sp_id), str(sp_id)), "role": position_name.lower(), "position": position_name.lower(), "spPosition": row["spPosition"], "spGrade": row["spGrade"], "pay": pay, "price": 0, "priceText": "-", "order": index, "starter": True})
    positions = [int(row["spPosition"]) for row in match_players]
    team_colors = _metadata_team_color_rows(match_players)
    total_pay = sum(int(row.get("pay") or 0) for row in player_rows)
    return {
        "schemaVersion": "0.1.0",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "status": "metadata_ready" if metadata_ready else "metadata_pending",
        },
        "privacy": privacy_meta,
        "player": {"playerId": str(player_id), "nickname": nickname},
        "season": str(season),
        "status": "READY" if metadata_ready else "PENDING_METADATA",
        "squad": {
            "formation": _formation_shape_from_positions(positions),
            "clubValue": None,
            "clubValueText": "-",
            "salary": {"current": total_pay, "cap": _to_int(os.environ.get("FCONLINE_SALARY_CAP"), 310)},
            "playerCount": len(player_rows),
        },
        "players": player_rows,
        "teamColors": team_colors,
        "summary": {"teamColorCount": len(team_colors), "affiliationCount": len([row for row in team_colors if row["group"] == "affiliation"]), "enhanceCount": len([row for row in team_colors if row["group"] == "enhance"]), "featureCount": len([row for row in team_colors if row["group"] == "feature"])},
    }


def _resolve_season_range_kst(season: str, data_base_dir: str) -> tuple[datetime, datetime]:
    def _parse_yymmdd_token(token: str) -> datetime | None:
        try:
            return datetime.strptime(str(token), "%y%m%d")
        except ValueError:
            return None

    def _infer_range_from_data_files() -> tuple[datetime, datetime] | None:
        season_dir = Path(data_base_dir) / str(season)
        user_root = season_dir / "user"

        min_day: datetime | None = None
        max_day: datetime | None = None
        if user_root.is_dir():
            for user_dir in user_root.iterdir():
                if not user_dir.is_dir():
                    continue
                for path in user_dir.iterdir():
                    if not path.is_file():
                        continue
                    matched = SNAPSHOT_FILE_NAME_RE.match(path.name)
                    if not matched:
                        continue
                    day = _parse_yymmdd_token(matched.group("yymmdd"))
                    if day is None:
                        continue
                    if min_day is None or day < min_day:
                        min_day = day
                    if max_day is None or day > max_day:
                        max_day = day

        # user 폴더에서 추정 실패 시 manifest의 endDate 기반으로 최소 범위라도 복구
        if min_day is None or max_day is None:
            manifest_path = season_dir / "manifest.json"
            if manifest_path.is_file():
                try:
                    with manifest_path.open("r", encoding="utf-8") as f:
                        manifest = json.load(f)
                except Exception:
                    manifest = {}
                if isinstance(manifest, dict):
                    token = str(manifest.get("endDate") or "").strip()
                    if not token:
                        raw = str(manifest.get("endDateTime") or "").strip()
                        if raw:
                            token = raw.split("_", 1)[0]
                    parsed = _parse_yymmdd_token(token) if token else None
                    if parsed is not None:
                        min_day = min_day or parsed
                        max_day = max_day or parsed

        if min_day is None or max_day is None:
            return None

        start_dt = min_day.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=KST)
        end_dt = max_day.replace(hour=23, minute=59, second=59, microsecond=0, tzinfo=KST)
        return start_dt, end_dt

    base_dir = Path(data_base_dir)
    candidate_paths = [
        Path("config/season_config.json"),
        Path("season_config.json"),
        base_dir.parent / "season_config.json",
        base_dir.parent / "config" / "season_config.json",
        base_dir / "season_config.json",
        base_dir / "config" / "season_config.json",
    ]

    seen: set[str] = set()
    found_config_file = False
    for candidate in candidate_paths:
        key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if not candidate.exists():
            continue
        found_config_file = True
        try:
            with candidate.open("r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            continue
        ranges = cfg.get("season_ranges", {})
        if not isinstance(ranges, dict):
            continue
        meta = ranges.get(season)
        if not isinstance(meta, dict):
            continue
        start_dt, end_dt = parse_range_datetime(meta)
        if start_dt is None or end_dt is None:
            raise OpenApiAnalyticsError(f"season 범위 파싱 실패: season={season}")
        return start_dt, end_dt

    fallback_range = _infer_range_from_data_files()
    if fallback_range is not None:
        start_dt, end_dt = fallback_range
        print(
            "[OPENAPI] season_range fallback from data files "
            f"season={season} start={start_dt.isoformat()} end={end_dt.isoformat()}",
            flush=True,
        )
        return start_dt, end_dt

    if found_config_file:
        raise OpenApiAnalyticsError(f"season_config에 시즌 범위가 없습니다: season={season}")
    raise OpenApiAnalyticsError("season_config.json을 찾을 수 없습니다.")


def _fetch_public_meta(name: str) -> list[dict[str, Any]] | None:
    urls = [
        f"https://open.api.nexon.com/static/fconline/meta/{name}.json",
        f"https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/{name}.json",
        f"https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/meta/{name}.json",
        f"https://fco.dn.nexoncdn.co.kr/live/externalAssets/meta/{name}.json",
    ]
    for url in urls:
        try:
            response = requests.get(url, timeout=10)
        except Exception:
            continue
        if response.status_code != 200:
            continue
        try:
            payload = response.json()
        except ValueError:
            continue
        if isinstance(payload, list):
            return payload
    return None


def _is_valid_spid_meta(payload: Any) -> bool:
    if not isinstance(payload, list) or len(payload) == 0:
        return False
    for row in payload:
        if not isinstance(row, dict):
            continue
        key = row.get("id", row.get("spid", row.get("spId")))
        name = row.get("name", row.get("desc"))
        if key is not None and str(name or "").strip():
            return True
    return False


def _is_valid_spposition_meta(payload: Any) -> bool:
    if not isinstance(payload, list) or len(payload) == 0:
        return False
    for row in payload:
        if not isinstance(row, dict):
            continue
        key = row.get("spposition", row.get("id", row.get("spPosition")))
        desc = row.get("desc", row.get("name"))
        if key is not None and str(desc or "").strip():
            return True
    return False


def _is_valid_seasonid_meta(payload: Any) -> bool:
    if not isinstance(payload, list) or len(payload) == 0:
        return False
    for row in payload:
        if not isinstance(row, dict):
            continue
        key = row.get("seasonId", row.get("id", row.get("seasonid")))
        name = row.get("className", row.get("name", row.get("seasonName")))
        if key is not None and str(name or "").strip():
            return True
    return False


def _is_valid_division_meta(payload: Any) -> bool:
    if not isinstance(payload, list) or len(payload) == 0:
        return False
    for row in payload:
        if not isinstance(row, dict):
            continue
        key = row.get("divisionId", row.get("division", row.get("id")))
        name = row.get("divisionName", row.get("name", row.get("desc")))
        if key is not None and str(name or "").strip():
            return True
    return False


def _load_meta_maps(
    cache: JsonFileCache,
) -> tuple[dict[str, str], dict[str, str], dict[str, str], dict[str, str], dict[str, str]]:
    spid_map: dict[str, str] = {}
    spposition_map: dict[str, str] = {}
    seasonid_map: dict[str, str] = {}
    seasonimg_map: dict[str, str] = {}
    division_map: dict[str, str] = {}

    spid_payload = cache.get_meta("spid")
    spposition_payload = cache.get_meta("spposition")
    seasonid_payload = cache.get_meta("seasonid")
    division_payload = cache.get_meta("division")

    spid_needs_refresh = not _is_valid_spid_meta(spid_payload)
    spposition_needs_refresh = not _is_valid_spposition_meta(spposition_payload)
    seasonid_needs_refresh = not _is_valid_seasonid_meta(seasonid_payload)
    division_needs_refresh = not _is_valid_division_meta(division_payload)

    if spid_needs_refresh or spposition_needs_refresh or seasonid_needs_refresh or division_needs_refresh:
        try:
            client = NexonFconlineClient()
        except Exception:
            client = None
        if client is not None:
            if spid_needs_refresh:
                try:
                    spid_payload = client.get_meta_spid()
                    if _is_valid_spid_meta(spid_payload):
                        cache.set_meta("spid", spid_payload)
                except Exception:
                    spid_payload = None
            if spposition_needs_refresh:
                try:
                    spposition_payload = client.get_meta_spposition()
                    if _is_valid_spposition_meta(spposition_payload):
                        cache.set_meta("spposition", spposition_payload)
                except Exception:
                    spposition_payload = None
            if seasonid_needs_refresh:
                try:
                    seasonid_payload = client.get_meta_seasonid()
                    if _is_valid_seasonid_meta(seasonid_payload):
                        cache.set_meta("seasonid", seasonid_payload)
                except Exception:
                    seasonid_payload = None
            if division_needs_refresh:
                try:
                    division_payload = client.get_meta_division()
                    if _is_valid_division_meta(division_payload):
                        cache.set_meta("division", division_payload)
                except Exception:
                    division_payload = None

    if not _is_valid_spid_meta(spid_payload):
        spid_payload = _fetch_public_meta("spid")
        if _is_valid_spid_meta(spid_payload):
            cache.set_meta("spid", spid_payload)
    if not _is_valid_spposition_meta(spposition_payload):
        spposition_payload = _fetch_public_meta("spposition")
        if _is_valid_spposition_meta(spposition_payload):
            cache.set_meta("spposition", spposition_payload)
    if not _is_valid_seasonid_meta(seasonid_payload):
        seasonid_payload = _fetch_public_meta("seasonid")
        if _is_valid_seasonid_meta(seasonid_payload):
            cache.set_meta("seasonid", seasonid_payload)
    if not _is_valid_division_meta(division_payload):
        division_payload = _fetch_public_meta("division")
        if _is_valid_division_meta(division_payload):
            cache.set_meta("division", division_payload)

    if _is_valid_spid_meta(spid_payload):
        for row in spid_payload:
            if not isinstance(row, dict):
                continue
            key = row.get("id", row.get("spid", row.get("spId")))
            name = row.get("name", row.get("desc"))
            if key is None or not name:
                continue
            spid_map[str(key)] = str(name)

    if _is_valid_spposition_meta(spposition_payload):
        for row in spposition_payload:
            if not isinstance(row, dict):
                continue
            key = row.get("spposition", row.get("id", row.get("spPosition")))
            name = row.get("desc", row.get("name"))
            if key is None or not name:
                continue
            spposition_map[str(key)] = str(name)

    if _is_valid_seasonid_meta(seasonid_payload):
        for row in seasonid_payload:
            if not isinstance(row, dict):
                continue
            key = row.get("seasonId", row.get("id", row.get("seasonid")))
            name = row.get("className", row.get("name", row.get("seasonName")))
            if key is None or not name:
                continue
            key_str = str(key)
            seasonid_map[key_str] = str(name)
            season_img = str(row.get("seasonImg", "")).strip()
            if season_img:
                seasonimg_map[key_str] = season_img

    if _is_valid_division_meta(division_payload):
        for row in division_payload:
            if not isinstance(row, dict):
                continue
            key = row.get("divisionId", row.get("division", row.get("id")))
            name = row.get("divisionName", row.get("name", row.get("desc")))
            if key is None or not name:
                continue
            division_map[str(key)] = str(name)
    for key, name in DIVISION_NAME_FALLBACK.items():
        division_map.setdefault(key, name)

    return spid_map, spposition_map, seasonid_map, seasonimg_map, division_map


def _season_id_from_spid(spid: int) -> int:
    if spid <= 0:
        return 0
    return int(spid) // 1_000_000


def _is_shot_on_target(shot: dict[str, Any], is_goal: bool) -> bool:
    if is_goal:
        return True
    raw = str(shot.get("result", "")).strip().lower()
    if raw in {"2", "save", "saved", "on_target", "ontarget"}:
        return True
    return False


def _estimate_shot_xg(x: float, y: float, in_penalty: bool, shot_type: Any) -> float:
    center_weight = 1.0 - min(abs(y - 0.5) / 0.5, 1.0)
    depth_weight = max(0.0, min(x, 1.0))
    base = 0.02 + (0.52 * depth_weight) + (0.15 * center_weight)
    if in_penalty:
        base += 0.12
    shot_type_int = _to_int(shot_type, -1)
    if shot_type_int == 6:
        return 0.78
    if shot_type_int == 3:
        base -= 0.07
    elif shot_type_int == 5:
        base -= 0.05
    return round(max(0.01, min(base, 0.9)), 4)


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def build_manager_mode_analysis(
    season: str,
    player_id: str,
    matchtype: int = 52,
    window_matches: int | None = None,
    data_base_dir: str = "data",
) -> dict[str, Any]:
    """Build detailed manager-mode analysis artifacts from cached match details."""
    if window_matches is not None and int(window_matches) <= 0:
        raise OpenApiAnalyticsError("window_matches는 1 이상이거나 all(None)이어야 합니다.")

    season_name = str(season).strip()
    pid = str(player_id).strip()
    cache = JsonFileCache(data_base_dir=data_base_dir)
    include_match_id = _include_public_match_id()
    privacy_meta = _privacy_meta(include_match_id)

    nickname = _resolve_nickname_for_player(data_base_dir, season_name, pid)
    ouid = cache.get_ouid(nickname)
    if not ouid:
        raise OpenApiAnalyticsError(
            f"OUID 캐시가 없습니다. 먼저 openapi-sync-user를 실행하세요 (nickname={nickname})."
        )

    match_index = cache.get_user_match_index(ouid, matchtype) or []
    match_index = _dedupe_preserve_order([str(x) for x in match_index if str(x).strip()])

    season_start, season_end = _resolve_season_range_kst(season_name, data_base_dir)

    records: list[dict[str, Any]] = []
    for match_id in match_index:
        detail = cache.get_match_detail(match_id)
        if not isinstance(detail, dict):
            continue
        date_kst = _parse_match_date_to_kst(detail.get("matchDate"))
        if date_kst is None:
            continue
        if date_kst < season_start or date_kst > season_end:
            continue

        my, opp = extract_side(detail, ouid)
        if not my:
            continue
        records.append(
            {
                "matchId": match_id,
                "matchDateKst": date_kst,
                "detail": detail,
                "my": my,
                "opp": opp,
            }
        )

    records.sort(key=lambda row: row["matchDateKst"], reverse=True)
    if window_matches is None:
        selected = records
        window_mode = "season_filtered_all"
        window_n = len(records)
        window_matches_report: int | str = "all"
    else:
        selected = records[: int(window_matches)]
        window_mode = "season_filtered_last_n"
        window_n = int(window_matches)
        window_matches_report = int(window_matches)

    w = d = l = 0
    sum_gf = sum_ga = 0
    sum_shots = sum_sot = 0
    sum_possession = 0.0
    possession_count = 0
    pass_success_total = pass_try_total = 0
    forward_pass_try_total = 0
    opp_pass_try_total = 0
    tackle_success_total = tackle_try_total = 0
    block_success_total = block_try_total = 0
    intercept_total = 0
    scoreline_counter: Counter[tuple[int, int]] = Counter()
    goal_time_for_counter: Counter[str] = Counter()
    goal_time_against_counter: Counter[str] = Counter()
    shot_type_counter: Counter[Any] = Counter()
    in_penalty_in = 0
    in_penalty_out = 0

    first_goal_count = 0
    first_goal_win_count = 0
    concede_first_count = 0
    concede_first_win_count = 0
    concede_first_points = 0
    lead_half_count = 0
    lead_half_win_count = 0
    concede_late_count = 0
    matches_with_any_goal_event = 0
    led_during_match_count = 0
    concede_while_ahead_count = 0

    clean_sheet_count = 0
    concede_two_plus_count = 0
    goals_for_75_plus = 0
    goals_against_75_plus = 0
    goals_against_80_plus = 0
    set_piece_goals_for = 0
    opp_sot_total = 0
    gk_save_total = 0

    my_shot_attempt_count = 0
    side_shot_attempt_count = 0
    assist_origin_known_total = 0
    assist_origin_flank_count = 0
    estimated_xg_for_sum = 0.0
    my_goal_shot_count = 0
    central_attack_attempt_count = 0
    central_attack_goal_count = 0
    scoring_route_goal_counter: Counter[Any] = Counter()

    shootout_total = 0
    shootout_win_count = 0
    shootout_loss_count = 0
    strong_opponent_samples: list[dict[str, Any]] = []

    recent_matches: list[dict[str, Any]] = []
    opponent_buckets: dict[str, dict[str, Any]] = {}
    time_slot_buckets: dict[str, dict[str, Any]] = {}
    weekday_buckets: dict[str, dict[str, Any]] = {}
    formation_buckets: dict[str, dict[str, Any]] = {}
    match_flow_counter: Counter[str] = Counter()
    player_pair_buckets: dict[tuple[str, str], dict[str, Any]] = {}
    player_trio_buckets: dict[tuple[str, str, str], dict[str, Any]] = {}
    position_group_buckets: dict[str, dict[str, Any]] = {}

    for rec in selected:
        match_id = rec["matchId"]
        date_kst = rec["matchDateKst"]
        my = rec["my"]
        opp = rec["opp"]

        result_label = _result_label(_nested_get(my, "matchDetail", "matchResult"))
        if result_label == "승":
            w += 1
        elif result_label == "무":
            d += 1
        elif result_label == "패":
            l += 1

        gf = _side_goal_total(my)
        ga = _side_goal_total(opp)
        my_shots = _side_shots(my)
        my_sot = _side_shots_on_target(my)
        opp_shots = _side_shots(opp)
        sum_gf += gf
        sum_ga += ga
        sum_shots += my_shots
        sum_sot += my_sot
        scoreline_counter[(gf, ga)] += 1
        if ga == 0:
            clean_sheet_count += 1
        if ga >= 2:
            concede_two_plus_count += 1
        opp_sot = _side_shots_on_target(opp)
        opp_sot_total += opp_sot
        gk_save_total += max(opp_sot - ga, 0)

        own_avg_rating = _to_float(_nested_get(my, "matchDetail", "averageRating"))
        opp_avg_rating = _to_float(_nested_get(opp, "matchDetail", "averageRating"))
        strong_opponent_samples.append(
            {
                "oppRating": opp_avg_rating,
                "isWin": result_label == "승",
                "isDraw": result_label == "무",
                "points": 3 if result_label == "승" else 1 if result_label == "무" else 0,
                "ownRating": own_avg_rating,
            }
        )

        possession = _safe_possession_percent(
            _nested_get(my, "matchDetail", "ballPossesion")
            if _nested_get(my, "matchDetail", "ballPossesion") is not None
            else _nested_get(my, "matchDetail", "ballPossession")
        )
        if possession is not None:
            sum_possession += possession
            possession_count += 1

        p_success, p_try = _side_pass_totals(my)
        pass_success_total += p_success
        pass_try_total += p_try
        forward_pass_try_total += (
            _to_int(_nested_get(my, "pass", "throughPassTry"), 0)
            + _to_int(_nested_get(my, "pass", "lobbedThroughPassTry"), 0)
            + _to_int(_nested_get(my, "pass", "longPassTry"), 0)
            + _to_int(_nested_get(my, "pass", "drivenGroundPassTry"), 0)
        )
        _, opp_p_try = _side_pass_totals(opp)
        opp_pass_try_total += opp_p_try

        t_success, t_try = _side_tackle_totals(my)
        tackle_success_total += t_success
        tackle_try_total += t_try
        b_success = _to_int(_nested_get(my, "defence", "blockSuccess"), 0)
        b_try = _to_int(_nested_get(my, "defence", "blockTry"), 0)
        block_success_total += b_success
        block_try_total += b_try

        my_goal_times: list[int] = []
        opp_goal_times: list[int] = []

        for shot in _extract_shoot_details(my):
            t_sec = goal_time_to_seconds(_to_int(shot.get("goalTime"), 0))
            x = clamp01(_to_float(shot.get("x", shot.get("posX", 0.0))) or 0.0)
            y = clamp01(_to_float(shot.get("y", shot.get("posY", 0.0))) or 0.0)
            shot_type = _shot_type_value(shot)
            result = _shot_result_value(shot)
            is_goal = _is_goal_shot(shot)
            in_penalty = _guess_in_penalty(shot, x, y)
            estimated_xg = _estimate_shot_xg(x, y, in_penalty, shot_type)
            estimated_xg_for_sum += estimated_xg
            my_shot_attempt_count += 1
            if y <= 0.23 or y >= 0.77:
                side_shot_attempt_count += 1
            if x >= 0.79 and 0.33 <= y <= 0.67:
                central_attack_attempt_count += 1
            if in_penalty:
                in_penalty_in += 1
            else:
                in_penalty_out += 1
            if is_goal:
                my_goal_shot_count += 1
                my_goal_times.append(t_sec)
                goal_time_for_counter[_goal_time_bin(t_sec)] += 1
                if t_sec >= 75 * 60:
                    goals_for_75_plus += 1
                if x >= 0.79 and 0.33 <= y <= 0.67:
                    central_attack_goal_count += 1
                scoring_route_goal_counter[shot_type] += 1
                assist_flag = _coerce_bool(shot.get("assist"))
                assist_y = _to_float(shot.get("assistY"))
                if assist_flag is True and assist_y is not None:
                    assist_origin_known_total += 1
                    ay = clamp01(assist_y)
                    if ay <= 0.23 or ay >= 0.77:
                        assist_origin_flank_count += 1
            shot_type_counter[shot_type] += 1

        for shot in _extract_shoot_details(opp):
            t_sec = goal_time_to_seconds(_to_int(shot.get("goalTime"), 0))
            x = clamp01(_to_float(shot.get("x", shot.get("posX", 0.0))) or 0.0)
            y = clamp01(_to_float(shot.get("y", shot.get("posY", 0.0))) or 0.0)
            shot_type = _shot_type_value(shot)
            result = _shot_result_value(shot)
            is_goal = _is_goal_shot(shot)
            in_penalty = _guess_in_penalty(shot, x, y)
            if is_goal:
                opp_goal_times.append(t_sec)
                goal_time_against_counter[_goal_time_bin(t_sec)] += 1
                if t_sec >= 75 * 60:
                    goals_against_75_plus += 1
                if t_sec >= 80 * 60:
                    goals_against_80_plus += 1

        my_goal_times.sort()
        opp_goal_times.sort()

        set_piece_goals_for += (
            _to_int(_nested_get(my, "shoot", "goalFreekick"), 0)
            + _to_int(_nested_get(my, "shoot", "goalPenaltyKick"), 0)
            + _to_int(_nested_get(my, "shoot", "goalHeading"), 0)
        )

        my_shootout_score = _to_int(_nested_get(my, "shoot", "shootOutScore"), 0)
        opp_shootout_score = _to_int(_nested_get(opp, "shoot", "shootOutScore"), 0)
        if my_shootout_score > 0 or opp_shootout_score > 0:
            shootout_total += 1
            if my_shootout_score > opp_shootout_score:
                shootout_win_count += 1
            elif my_shootout_score < opp_shootout_score:
                shootout_loss_count += 1

        if my_goal_times or opp_goal_times:
            matches_with_any_goal_event += 1
            my_first = my_goal_times[0] if my_goal_times else None
            opp_first = opp_goal_times[0] if opp_goal_times else None
            if my_first is not None and (opp_first is None or my_first < opp_first):
                first_goal_count += 1
                if result_label == "승":
                    first_goal_win_count += 1
            elif opp_first is not None and (my_first is None or opp_first < my_first):
                concede_first_count += 1
                if result_label == "승":
                    concede_first_win_count += 1
                    concede_first_points += 3
                elif result_label == "무":
                    concede_first_points += 1

        led_during_match, conceded_while_ahead = _lead_and_concede_flags(my_goal_times, opp_goal_times)
        if led_during_match:
            led_during_match_count += 1
        if conceded_while_ahead:
            concede_while_ahead_count += 1

        my_half_goals = len([t for t in my_goal_times if t < 45 * 60])
        opp_half_goals = len([t for t in opp_goal_times if t < 45 * 60])
        if my_half_goals > opp_half_goals:
            lead_half_count += 1
            if result_label == "승":
                lead_half_win_count += 1

        if any(t >= 75 * 60 for t in opp_goal_times):
            concede_late_count += 1

        pass_acc = _ratio(p_success, p_try, scale=1.0, ndigits=4)
        common_stats = {
            "result_label": result_label,
            "gf": gf,
            "ga": ga,
            "shots": my_shots,
            "sot": my_sot,
            "possession": possession,
            "pass_success": p_success,
            "pass_try": p_try,
            "date_kst": date_kst,
        }
        opp_key = str(opp.get("ouid") or opp.get("nickname") or "unknown")
        opp_label = str(opp.get("nickname") or opp_key)
        opponent_slot = opponent_buckets.setdefault(opp_key, _new_performance_bucket())
        opponent_slot["label"] = opp_label
        _add_match_to_bucket(opponent_slot, **common_stats)

        time_slot = _time_slot_label(date_kst.hour)
        _add_match_to_bucket(
            time_slot_buckets.setdefault(time_slot, _new_performance_bucket()),
            **common_stats,
        )
        weekday_key = str(date_kst.weekday())
        weekday_slot = weekday_buckets.setdefault(weekday_key, _new_performance_bucket())
        weekday_slot["label"] = ["월", "화", "수", "목", "금", "토", "일"][date_kst.weekday()]
        _add_match_to_bucket(weekday_slot, **common_stats)

        recent_match_row = {
            "matchKey": _short_match_key(match_id),
            "dateKst": date_kst.isoformat(),
            "result": result_label,
            "gf": gf,
            "ga": ga,
            "possession": possession if possession is not None else 0.0,
            "passAcc": pass_acc,
            "shots": _side_shots(my),
            "sot": _side_shots_on_target(my),
        }
        if include_match_id:
            recent_match_row["matchId"] = match_id
        recent_matches.append(recent_match_row)

        match_player_ids: list[str] = []
        match_position_values: list[int] = []
        match_position_groups: set[str] = set()
        players = _nested_get(my, "player")
        if isinstance(players, list):
            for row in players:
                if not isinstance(row, dict):
                    continue
                spid = _to_int(row.get("spId", row.get("spid")), -1)
                if spid < 0:
                    continue
                status = row.get("status")
                if not isinstance(status, dict):
                    status = {}
                spid_key = str(spid)
                sp_pos = _to_int(row.get("spPosition", row.get("spposition")), -1)
                # 선발 11 기준: 벤치 포지션(28) 중 비출장 더미는 제외.
                if sp_pos == 28 and not _has_player_activity(status):
                    continue
                match_player_ids.append(spid_key)
                if 0 <= sp_pos <= 27:
                    match_position_values.append(sp_pos)
                    if 1 <= sp_pos <= 8:
                        match_position_groups.add("수비진")
                    elif 9 <= sp_pos <= 19:
                        match_position_groups.add("미드필더진")
                    elif 20 <= sp_pos <= 27:
                        match_position_groups.add("공격진")
                intercept_total += _to_int(status.get("intercept"), 0)

        formation_shape = _formation_shape_from_positions(match_position_values)
        _add_match_to_bucket(
            formation_buckets.setdefault(formation_shape, _new_performance_bucket()),
            **common_stats,
        )
        flow_label = _classify_match_flow(
            result_label=result_label,
            gf=gf,
            ga=ga,
            possession=possession,
            shots=my_shots,
            opp_shots=opp_shots,
        )
        match_flow_counter[flow_label] += 1

        unique_players = sorted(set(match_player_ids))
        for pair in combinations(unique_players, 2):
            _add_match_to_bucket(
                player_pair_buckets.setdefault(pair, _new_performance_bucket()),
                **common_stats,
            )
        for trio in combinations(unique_players, 3):
            _add_match_to_bucket(
                player_trio_buckets.setdefault(trio, _new_performance_bucket()),
                **common_stats,
            )
        for group in sorted(match_position_groups):
            _add_match_to_bucket(
                position_group_buckets.setdefault(group, _new_performance_bucket()),
                **common_stats,
            )

    actual_matches = len(selected)
    generated_at = datetime.now(KST)

    period_from = selected[-1]["matchDateKst"].isoformat() if selected else None
    period_to = selected[0]["matchDateKst"].isoformat() if selected else None

    scoreline_top = [
        {"gf": gf, "ga": ga, "count": count}
        for (gf, ga), count in sorted(
            scoreline_counter.items(),
            key=lambda item: (-item[1], -item[0][0], item[0][1]),
        )[:10]
    ]

    shot_type_rows: list[dict[str, Any]] = []
    for shot_type, count in sorted(
        shot_type_counter.items(),
        key=lambda item: (-item[1], str(item[0])),
    ):
        type_name = SHOT_TYPE_NAMES.get(shot_type, f"type_{shot_type}")
        shot_type_rows.append({"type": shot_type, "name": type_name, "count": int(count)})

    in_penalty_total = in_penalty_in + in_penalty_out

    valid_opp_ratings = [
        float(row["oppRating"])
        for row in strong_opponent_samples
        if row.get("oppRating") is not None
    ]
    strong_threshold = _percentile(valid_opp_ratings, 0.8)
    strong_matches = [
        row
        for row in strong_opponent_samples
        if row.get("oppRating") is not None
        and (strong_threshold is None or float(row["oppRating"]) >= float(strong_threshold))
    ]
    strong_win_count = len([row for row in strong_matches if row.get("isWin")])
    strong_points = sum(_to_int(row.get("points"), 0) for row in strong_matches)
    strong_max_points = len(strong_matches) * 3

    elite_threshold = _percentile(valid_opp_ratings, 0.8)
    elite_matches = [
        row
        for row in strong_opponent_samples
        if row.get("oppRating") is not None
        and (elite_threshold is None or float(row["oppRating"]) >= float(elite_threshold))
    ]
    elite_points = sum(_to_int(row.get("points"), 0) for row in elite_matches)
    elite_max_points = len(elite_matches) * 3

    late_concede_share = (goals_against_75_plus / sum_ga) if sum_ga > 0 else 0.0
    avg_concede_per_match_raw = (sum_ga / actual_matches) if actual_matches > 0 else 0.0
    late_focus_coeff = round(late_concede_share * avg_concede_per_match_raw, 4)
    late_concession_share_value = (goals_against_80_plus / sum_ga) if sum_ga > 0 else 0.0

    scoring_route_goal_total = sum(int(v) for v in scoring_route_goal_counter.values())
    max_route_share = 0.0
    if scoring_route_goal_total > 0:
        max_route_share = max(scoring_route_goal_counter.values()) / scoring_route_goal_total
    advanced = {
        "firstGoalWinRate": _ratio(first_goal_win_count, first_goal_count, scale=1.0, ndigits=4),
        "comebackWinRate": _ratio(concede_first_win_count, concede_first_count, scale=1.0, ndigits=4),
        "concedeWhileLeadingRate": _ratio(
            concede_while_ahead_count, led_during_match_count, scale=1.0, ndigits=4
        ),
        "late75PlusGoalDiff": {
            "for": int(goals_for_75_plus),
            "against": int(goals_against_75_plus),
            "diff": int(goals_for_75_plus - goals_against_75_plus),
        },
        "setPieceGoalRate": _ratio(set_piece_goals_for, sum_gf, scale=1.0, ndigits=4),
        "cleanSheetRate": _ratio(clean_sheet_count, actual_matches, scale=1.0, ndigits=4),
        "concedeTwoPlusRate": _ratio(concede_two_plus_count, actual_matches, scale=1.0, ndigits=4),
        "strongOppWinRate": {
            "value": _ratio(strong_win_count, len(strong_matches), scale=1.0, ndigits=4),
            "wins": int(strong_win_count),
            "matches": int(len(strong_matches)),
            "oppAvgRatingThreshold": round(float(strong_threshold), 4)
            if strong_threshold is not None
            else None,
        },
        "highPerformanceIndex": {
            "value": _ratio(strong_points, strong_max_points, scale=1.0, ndigits=4),
            "points": int(strong_points),
            "maxPoints": int(strong_max_points),
            "matches": int(len(strong_matches)),
            "oppAvgRatingThreshold": round(float(strong_threshold), 4)
            if strong_threshold is not None
            else None,
        },
        "shootoutRecord": {
            "w": int(shootout_win_count),
            "l": int(shootout_loss_count),
            "total": int(shootout_total),
        },
        "tempo": {
            "passesPerMinute": _ratio(pass_try_total, actual_matches * 90, scale=1.0, ndigits=4),
            "passesPerMatch": _avg(pass_try_total, actual_matches, ndigits=2),
            "shotsPerMatch": _avg(sum_shots, actual_matches, ndigits=2),
        },
        "buildUpBreakRate": _ratio(
            max(pass_try_total - pass_success_total, 0), pass_try_total, scale=1.0, ndigits=4
        ),
        "flankRelianceShots": _ratio(
            side_shot_attempt_count, my_shot_attempt_count, scale=1.0, ndigits=4
        ),
        "flankRelianceAssistOrigin": _ratio(
            assist_origin_flank_count, assist_origin_known_total, scale=1.0, ndigits=4
        ),
        "conversionRate": {
            "value": _ratio(my_goal_shot_count, estimated_xg_for_sum, scale=1.0, ndigits=4),
            "goals": int(my_goal_shot_count),
            "xg": round(float(estimated_xg_for_sum), 4),
            "shots": int(my_shot_attempt_count),
        },
        "centralPenetrationEfficiency": _ratio(
            central_attack_goal_count, central_attack_attempt_count, scale=1.0, ndigits=4
        ),
        "recoveryIntensity": {
            "value": _ratio(
                intercept_total + tackle_success_total + block_success_total,
                opp_pass_try_total,
                scale=1.0,
                ndigits=4,
            ),
            "recoveries": int(intercept_total + tackle_success_total + block_success_total),
            "oppPassTry": int(opp_pass_try_total),
        },
        "secondBallRecoveryRate": _ratio(
            tackle_success_total + block_success_total,
            tackle_try_total + block_try_total,
            scale=1.0,
            ndigits=4,
        ),
        "lateFocusCoefficient": {
            "value": late_focus_coeff,
            "lateConcedeShare": round(late_concede_share, 4),
            "lateConcede": int(goals_against_75_plus),
            "concedeTotal": int(sum_ga),
            "avgConcedePerMatch": round(avg_concede_per_match_raw, 4),
        },
        "gkDependencyRate": _ratio(gk_save_total, opp_sot_total, scale=1.0, ndigits=4),
        "scoringRouteConcentration": round(float(max_route_share), 4),
    }

    pass_fail_rate = _ratio(
        max(pass_try_total - pass_success_total, 0), pass_try_total, scale=1.0, ndigits=4
    )
    passes_per_minute = _ratio(pass_try_total, actual_matches * 90, scale=1.0, ndigits=4)
    forward_pass_ratio = _ratio(forward_pass_try_total, pass_try_total, scale=1.0, ndigits=4)
    transition_velocity = round(forward_pass_ratio * passes_per_minute, 4)
    flank_reliance_shots = _ratio(
        side_shot_attempt_count, my_shot_attempt_count, scale=1.0, ndigits=4
    )
    flank_reliance_assist = _ratio(
        assist_origin_flank_count, assist_origin_known_total, scale=1.0, ndigits=4
    )
    recovery_value = _ratio(
        intercept_total + tackle_success_total + block_success_total,
        opp_pass_try_total,
        scale=1.0,
        ndigits=4,
    )
    shot_stopping_impact = _ratio(gk_save_total, opp_sot_total, scale=1.0, ndigits=4)
    opening_goal_conversion = _ratio(first_goal_win_count, first_goal_count, scale=1.0, ndigits=4)
    resilience_factor = _ratio(
        concede_first_points, concede_first_count * 3, scale=1.0, ndigits=4
    )
    lead_erosion_rate = _ratio(
        concede_while_ahead_count, led_during_match_count, scale=1.0, ndigits=4
    )
    elite_efficiency = _ratio(elite_points, elite_max_points, scale=1.0, ndigits=4)
    vertical_penetration_yield = _ratio(
        central_attack_goal_count, central_attack_attempt_count, scale=1.0, ndigits=4
    )
    scoring_route_concentration = round(float(max_route_share), 4)
    high_leakage_frequency = _ratio(concede_two_plus_count, actual_matches, scale=1.0, ndigits=4)

    advanced_standard = {
        "openingGoalConversion": {
            "value": opening_goal_conversion,
            "method": "exact",
            "wins": int(first_goal_win_count),
            "matches": int(first_goal_count),
        },
        "resilienceFactor": {
            "value": resilience_factor,
            "method": "exact",
            "points": int(concede_first_points),
            "maxPoints": int(concede_first_count * 3),
            "matches": int(concede_first_count),
        },
        "leadErosionRate": {
            "value": lead_erosion_rate,
            "method": "proxy",
            "events": int(concede_while_ahead_count),
            "leadMatches": int(led_during_match_count),
        },
        "eliteOpponentEfficiency": {
            "value": elite_efficiency,
            "method": "proxy",
            "points": int(elite_points),
            "maxPoints": int(elite_max_points),
            "matches": int(len(elite_matches)),
            "oppAvgRatingThreshold": round(float(elite_threshold), 4)
            if elite_threshold is not None
            else None,
        },
        "transitionVelocity": {
            "value": transition_velocity,
            "method": "proxy",
            "forwardPassRatio": forward_pass_ratio,
            "passesPerMinute": passes_per_minute,
            "forwardPassTry": int(forward_pass_try_total),
            "passTry": int(pass_try_total),
        },
        "phase1TurnoverRate": {
            "value": pass_fail_rate,
            "method": "proxy",
            "failures": int(max(pass_try_total - pass_success_total, 0)),
            "passTry": int(pass_try_total),
        },
        "flankReliance": {
            "shotsBased": flank_reliance_shots,
            "assistOriginBased": flank_reliance_assist,
            "method": "proxy",
            "flankShots": int(side_shot_attempt_count),
            "totalShots": int(my_shot_attempt_count),
            "flankAssistOriginGoals": int(assist_origin_flank_count),
            "knownAssistOriginGoals": int(assist_origin_known_total),
        },
        "verticalPenetrationYield": {
            "value": vertical_penetration_yield,
            "method": "proxy",
            "goals": int(central_attack_goal_count),
            "attempts": int(central_attack_attempt_count),
        },
        "scoringRouteConcentration": {
            "value": scoring_route_concentration,
            "method": "exact",
            "maxRouteShare": round(float(max_route_share), 4),
        },
        "looseBallDominance": {
            "value": recovery_value,
            "method": "proxy",
            "recoveries": int(intercept_total + tackle_success_total + block_success_total),
            "oppPassTry": int(opp_pass_try_total),
        },
        "lateConcessionShare": {
            "value": round(float(late_concession_share_value), 4),
            "method": "exact",
            "lateConcede80": int(goals_against_80_plus),
            "concedeTotal": int(sum_ga),
        },
        "shotStoppingImpact": {
            "value": shot_stopping_impact,
            "method": "exact",
            "saves": int(gk_save_total),
            "oppShotsOnTarget": int(opp_sot_total),
        },
        "highLeakageFrequency": {
            "value": high_leakage_frequency,
            "method": "exact",
            "matches2PlusConcede": int(concede_two_plus_count),
            "matches": int(actual_matches),
        },
    }

    last200 = {
        "schemaVersion": "0.1.5",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "matchtype": int(matchtype),
            "matchtypeName": "감독모드" if int(matchtype) == 52 else str(matchtype),
        },
        "privacy": privacy_meta,
        "player": {
            "playerId": pid,
            "nickname": nickname,
        },
        "window": {
            "mode": window_mode,
            "n": int(window_n),
            "actual": int(actual_matches),
        },
        "period": {
            "from": period_from,
            "to": period_to,
        },
        "kpi": {
            "w": int(w),
            "d": int(d),
            "l": int(l),
            "winRate": _ratio(w, actual_matches, scale=100.0, ndigits=2),
            "avgGoalsFor": _avg(sum_gf, actual_matches, ndigits=3),
            "avgGoalsAgainst": _avg(sum_ga, actual_matches, ndigits=3),
            "avgShots": _avg(sum_shots, actual_matches, ndigits=3),
            "avgShotsOnTarget": _avg(sum_sot, actual_matches, ndigits=3),
            "avgPossession": _avg(sum_possession, possession_count, ndigits=3),
            "avgPassAcc": _ratio(pass_success_total, pass_try_total, scale=1.0, ndigits=4),
            "avgTackleAcc": _ratio(tackle_success_total, tackle_try_total, scale=1.0, ndigits=4),
        },
        "behavior": {
            "firstGoalRate": _ratio(first_goal_count, matches_with_any_goal_event, scale=1.0, ndigits=4),
            "concedeFirstRate": _ratio(concede_first_count, matches_with_any_goal_event, scale=1.0, ndigits=4),
            "comebackWinRate": _ratio(concede_first_win_count, concede_first_count, scale=1.0, ndigits=4),
            "leadAtHalfRate": _ratio(lead_half_count, actual_matches, scale=1.0, ndigits=4),
            "leadAtHalfWinRate": _ratio(lead_half_win_count, lead_half_count, scale=1.0, ndigits=4),
            "concedeLateRate": _ratio(concede_late_count, actual_matches, scale=1.0, ndigits=4),
        },
        "advanced": advanced,
        "advancedStandard": advanced_standard,
        "distributions": {
            "goalTimeFor": _counter_to_ordered_bins(goal_time_for_counter),
            "goalTimeAgainst": _counter_to_ordered_bins(goal_time_against_counter),
            "shotType": shot_type_rows,
            "inPenalty": {
                "in": int(in_penalty_in),
                "out": int(in_penalty_out),
                "rate": _ratio(in_penalty_in, in_penalty_total, scale=1.0, ndigits=4),
            },
            "scorelinesTop": scoreline_top,
        },
        "recentMatches": recent_matches,
    }

    spid_name_map, spposition_name_map, seasonid_name_map, seasonimg_map, division_name_map = _load_meta_maps(cache)

    performance_summary = {
        "sampleSize": int(actual_matches),
        "w": int(w),
        "d": int(d),
        "l": int(l),
        "winRate": _ratio(w, actual_matches, scale=100.0, ndigits=2),
        "goalsPerMatch": _avg(sum_gf, actual_matches, ndigits=3),
        "goalsConcededPerMatch": _avg(sum_ga, actual_matches, ndigits=3),
        "goalDifferencePerMatch": _avg(sum_gf - sum_ga, actual_matches, ndigits=3),
        "shotsPerMatch": _avg(sum_shots, actual_matches, ndigits=3),
        "shotsOnTargetPerMatch": _avg(sum_sot, actual_matches, ndigits=3),
        "shotAccuracy": _ratio(sum_sot, sum_shots, scale=100.0, ndigits=2),
        "goalConversion": _ratio(sum_gf, sum_shots, scale=100.0, ndigits=2),
        "shotOnTargetConversion": _ratio(sum_gf, sum_sot, scale=100.0, ndigits=2),
        "averagePossession": _avg(sum_possession, possession_count, ndigits=3),
        "passSuccessRate": _ratio(pass_success_total, pass_try_total, scale=100.0, ndigits=2),
        "tackleSuccessRate": _ratio(tackle_success_total, tackle_try_total, scale=100.0, ndigits=2),
        "cleanSheetRate": _ratio(clean_sheet_count, actual_matches, scale=100.0, ndigits=2),
        "concedeTwoPlusRate": _ratio(concede_two_plus_count, actual_matches, scale=100.0, ndigits=2),
    }
    recent_form = [_summarize_recent_rows(recent_matches, 20)] if recent_matches else []
    recent_20 = _summarize_recent_rows(recent_matches, 20)
    previous_20 = _summarize_recent_rows(recent_matches[20:40], 20)
    def _combo_rows(
        buckets: dict[tuple[str, ...], dict[str, Any]],
        *,
        min_matches: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for combo_key, bucket in buckets.items():
            if int(bucket.get("matches") or 0) < min_matches:
                continue
            stat = _finalize_performance_bucket("|".join(combo_key), bucket)
            stat["players"] = [
                {
                    "spId": int(spid),
                    "name": spid_name_map.get(str(spid), str(spid)),
                }
                for spid in combo_key
            ]
            rows.append(stat)
        rows.sort(
            key=lambda row: (
                -float(row.get("winRate") or 0),
                -int(row.get("matches") or 0),
                -float(row.get("goalDifferencePerMatch") or 0),
                row.get("key") or "",
            )
        )
        return rows[:limit]

    formation_rows = [
        _finalize_performance_bucket(key, bucket, label=key)
        for key, bucket in formation_buckets.items()
        if int(bucket.get("matches") or 0) >= 3
    ]
    formation_rows.sort(
        key=lambda row: (
            -int(row.get("matches") or 0),
            -float(row.get("winRate") or 0),
            row.get("key") or "",
        )
    )
    opponent_rows = [
        _finalize_performance_bucket(key, bucket, label=str(bucket.get("label") or key))
        for key, bucket in opponent_buckets.items()
        if int(bucket.get("matches") or 0) >= 2
    ]
    opponent_rows.sort(
        key=lambda row: (
            -int(row.get("matches") or 0),
            float(row.get("winRate") or 0),
            row.get("label") or "",
        )
    )
    time_slot_rows = [
        _finalize_performance_bucket(key, bucket, label=key)
        for key, bucket in time_slot_buckets.items()
        if int(bucket.get("matches") or 0) > 0
    ]
    time_slot_rows.sort(key=lambda row: ["새벽", "오전", "오후", "야간"].index(row["key"]))
    weekday_rows = [
        _finalize_performance_bucket(key, bucket, label=str(bucket.get("label") or key))
        for key, bucket in weekday_buckets.items()
        if int(bucket.get("matches") or 0) > 0
    ]
    weekday_rows.sort(key=lambda row: int(row["key"]) if str(row["key"]).isdigit() else 99)
    position_group_rows = [
        _finalize_performance_bucket(key, bucket, label=key)
        for key, bucket in position_group_buckets.items()
        if int(bucket.get("matches") or 0) >= 10
    ]
    position_group_rows.sort(
        key=lambda row: (
            -float(row.get("winRate") or 0),
            -int(row.get("matches") or 0),
            row.get("key") or "",
        )
    )
    match_flow_rows = [
        {
            "type": key,
            "count": int(count),
            "share": _ratio(count, actual_matches, scale=100.0, ndigits=2),
        }
        for key, count in match_flow_counter.most_common()
    ]
    style_profile = _style_profile(performance_summary)
    expanded_analysis = {
        "schemaVersion": "0.1.0",
        "styleProfile": style_profile,
        "formationPerformance": formation_rows[:8],
        "timeSlotPerformance": time_slot_rows,
        "weekdayPerformance": weekday_rows,
        "opponentHeadToHead": opponent_rows[:10],
        "matchFlowTypes": match_flow_rows,
        "playerCombinations": {
            "pairs": _combo_rows(player_pair_buckets, min_matches=10, limit=10),
            "trios": _combo_rows(player_trio_buckets, min_matches=8, limit=8),
        },
        "positionGroupPerformance": position_group_rows,
    }
    manager_insights = [
        *_manager_mode_insights(performance_summary, recent_20, previous_20),
        *_expanded_manager_mode_insights(performance_summary, expanded_analysis),
    ][:8]

    manager_mode_analysis = {
        "schemaVersion": "0.1.0",
        "status": "SUCCESS" if actual_matches >= 20 else "INSUFFICIENT_DATA",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "matchtype": int(matchtype),
            "matchtypeName": "감독모드" if int(matchtype) == 52 else str(matchtype),
        },
        "privacy": privacy_meta,
        "player": {
            "playerId": pid,
            "nickname": nickname,
        },
        "sample": {
            "requested": window_matches_report,
            "valid": int(actual_matches),
            "excluded": max(int(window_n) - int(actual_matches), 0)
            if isinstance(window_n, int)
            else 0,
            "minimumForInsights": 20,
        },
        "period": {
            "from": period_from,
            "to": period_to,
        },
        "summary": performance_summary,
        "recentForm": recent_form,
        "expanded": expanded_analysis,
        "comparisons": {
            "recent20VsPrevious20": {
                "recent": recent_20,
                "previous": previous_20,
                "winRateDifference": _diff_value(
                    float(recent_20.get("winRate") or 0),
                    float(previous_20.get("winRate") or 0),
                    ndigits=2,
                ),
                "goalsPerMatchChangePercent": _percent_change(
                    float(recent_20.get("goalsPerMatch") or 0),
                    float(previous_20.get("goalsPerMatch") or 0),
                ),
                "goalsConcededPerMatchChangePercent": _percent_change(
                    float(recent_20.get("goalsConcededPerMatch") or 0),
                    float(previous_20.get("goalsConcededPerMatch") or 0),
                ),
            }
        },
        "insights": manager_insights,
    }

    squad_rows_map: dict[str, dict[str, Any]] = {}
    season_win_count = 0
    season_draw_count = 0
    season_loss_count = 0

    def _ensure_squad_slot(spid_value: int) -> dict[str, Any]:
        spid_key = str(spid_value)
        slot = squad_rows_map.get(spid_key)
        if slot is not None:
            return slot
        slot = {
            "spId": int(spid_value),
            "seasonId": _season_id_from_spid(spid_value),
            "appearanceCount": 0,
            "w": 0,
            "d": 0,
            "l": 0,
            "goal": 0,
            "assist": 0,
            "shoot": 0,
            "effectiveShoot": 0,
            "passSuccess": 0,
            "passTry": 0,
            "dribbleSuccess": 0,
            "dribbleTry": 0,
            "aerialSuccess": 0,
            "aerialTry": 0,
            "tackleSuccess": 0,
            "tackleTry": 0,
            "blockSuccess": 0,
            "blockTry": 0,
            "defending": 0,
            "intercept": 0,
            "longShotAttempts": 0,
            "longShotOnTarget": 0,
            "longShotGoals": 0,
            "xgSum": 0.0,
            "shotEventCount": 0,
            "ratingSum": 0.0,
            "ratingCount": 0,
            "positions": Counter(),
        }
        squad_rows_map[spid_key] = slot
        return slot

    for rec in records:
        my = rec["my"]
        result_label = _result_label(_nested_get(my, "matchDetail", "matchResult"))
        if result_label == "승":
            season_win_count += 1
        elif result_label == "무":
            season_draw_count += 1
        elif result_label == "패":
            season_loss_count += 1

        players = _nested_get(my, "player")
        if isinstance(players, list):
            for row in players:
                if not isinstance(row, dict):
                    continue
                spid = _to_int(row.get("spId", row.get("spid")), -1)
                if spid < 0:
                    continue
                status = row.get("status")
                if not isinstance(status, dict):
                    status = {}
                sp_pos = _to_int(row.get("spPosition", row.get("spposition")), -1)
                # 선발 11 기준: 벤치 포지션(28) 중 비출장 더미는 제외.
                if sp_pos == 28 and not _has_player_activity(status):
                    continue
                slot = _ensure_squad_slot(spid)
                slot["appearanceCount"] += 1
                if result_label == "승":
                    slot["w"] += 1
                elif result_label == "무":
                    slot["d"] += 1
                elif result_label == "패":
                    slot["l"] += 1

                if sp_pos >= 0:
                    slot["positions"][str(sp_pos)] += 1

                slot["goal"] += _to_int(status.get("goal"), 0)
                slot["assist"] += _to_int(status.get("assist"), 0)
                slot["shoot"] += _to_int(status.get("shoot"), 0)
                slot["effectiveShoot"] += _to_int(status.get("effectiveShoot"), 0)
                slot["passSuccess"] += _to_int(status.get("passSuccess"), 0)
                slot["passTry"] += _to_int(status.get("passTry"), 0)
                slot["dribbleSuccess"] += _to_int(status.get("dribbleSuccess"), 0)
                slot["dribbleTry"] += _to_int(status.get("dribbleTry"), 0)
                slot["aerialSuccess"] += _to_int(status.get("aerialSuccess"), 0)
                slot["aerialTry"] += _to_int(status.get("aerialTry"), 0)
                slot["tackleSuccess"] += _to_int(status.get("tackle"), 0)
                slot["tackleTry"] += _to_int(status.get("tackleTry"), 0)
                slot["blockSuccess"] += _to_int(status.get("block"), 0)
                slot["blockTry"] += _to_int(status.get("blockTry"), 0)
                slot["defending"] += _to_int(status.get("defending"), 0)
                slot["intercept"] += _to_int(status.get("intercept"), 0)
                rating = _to_float(status.get("spRating"))
                if rating is not None:
                    slot["ratingSum"] += float(rating)
                    slot["ratingCount"] += 1

        for shot in _extract_shoot_details(my):
            shooter_spid = _to_int(shot.get("spId"), -1)
            if shooter_spid < 0:
                continue
            slot = _ensure_squad_slot(shooter_spid)
            raw_x = _to_float(shot.get("x", shot.get("posX")))
            raw_y = _to_float(shot.get("y", shot.get("posY")))
            has_shot_coords = raw_x is not None and raw_y is not None
            x = clamp01(raw_x if raw_x is not None else 0.0)
            y = clamp01(raw_y if raw_y is not None else 0.0)
            shot_type = _shot_type_value(shot)
            is_goal = _is_goal_shot(shot)
            is_on_target = _is_shot_on_target(shot, is_goal)
            in_penalty = _guess_in_penalty(shot, x, y)
            if has_shot_coords:
                is_long_shot = _is_long_shot_by_distance(x, y, in_penalty)
            else:
                # Fallback for unexpected payloads without shot coordinates.
                is_long_shot = (not in_penalty) and x < LONG_SHOT_X_THRESHOLD

            slot["shotEventCount"] += 1
            slot["xgSum"] += _estimate_shot_xg(x, y, in_penalty, shot_type)
            if is_long_shot:
                slot["longShotAttempts"] += 1
                if is_on_target:
                    slot["longShotOnTarget"] += 1
                if is_goal:
                    slot["longShotGoals"] += 1

    season_total_matches = season_win_count + season_draw_count + season_loss_count
    # Spreadsheet AE 기준(0~1 ratio): 시즌 전체 승률
    season_win_rate_ratio = _ratio(
        season_win_count,
        season_total_matches,
        scale=1.0,
        ndigits=6,
    )
    season_win_rate_percent = round(season_win_rate_ratio * 100.0, 2)

    squad_rows: list[dict[str, Any]] = []
    for slot in squad_rows_map.values():
        spid = int(slot["spId"])
        spid_key = str(spid)
        positions: Counter[str] = slot["positions"]
        primary_position_key = positions.most_common(1)[0][0] if positions else ""
        primary_position_name = spposition_name_map.get(primary_position_key, "")
        attack_power = int(
            round(
                (slot["goal"] * 5.0)
                + (slot["assist"] * 3.0)
                + (slot["effectiveShoot"] * 1.5)
                + (slot["shoot"] * 0.5)
                + (slot["dribbleSuccess"] * 0.15)
            )
        )
        defense_power = int(
            round(
                slot["defending"]
                + slot["intercept"]
                + (slot["tackleSuccess"] * 1.5)
                + (slot["blockSuccess"] * 2.0)
                + (slot["aerialSuccess"] * 0.2)
            )
        )
        avg_rating = (
            round(slot["ratingSum"] / slot["ratingCount"], 2) if slot["ratingCount"] > 0 else None
        )
        attack_point = int(slot["goal"] + slot["assist"])
        appearances = int(slot["appearanceCount"])
        pass_success_rate = _ratio(slot["passSuccess"], slot["passTry"], scale=1.0, ndigits=4)
        dribble_success_rate = _ratio(slot["dribbleSuccess"], slot["dribbleTry"], scale=1.0, ndigits=4)
        intercept_per_game = _ratio(slot["intercept"], appearances, scale=1.0, ndigits=4)
        tackle_success_rate = _ratio(slot["tackleSuccess"], slot["tackleTry"], scale=1.0, ndigits=4)
        aerial_success_rate = _ratio(slot["aerialSuccess"], slot["aerialTry"], scale=1.0, ndigits=4)
        # HW.xlsx(지표 시트) Q열(선방 횟수/경기)은 데이터 구조상 block이 아니라
        # 선수 status.defending 누적치를 경기수로 나눈 값에 대응됨.
        save_per_game = _ratio(slot["defending"], appearances, scale=1.0, ndigits=4)
        # HW.xlsx(지표 시트) P열(슈팅방어율) 참조 수식:
        # P = AE / AF, AF는 AD(=태클 시도 분모)와 동일 참조를 사용.
        # 따라서 시트 일치 기준으로 blockTry가 아니라 tackleTry를 분모로 사용.
        block_success_rate = _ratio(slot["blockSuccess"], slot["tackleTry"], scale=1.0, ndigits=4)
        expected_goal_rate_sheet = _ratio(attack_point, appearances, scale=1.0, ndigits=4)
        season_win_term = (season_win_rate_ratio * 5.0 / appearances) if appearances > 0 else 0.0
        # Spreadsheet F/G 수식 적용
        # HW.xlsx(지표 시트) F/G는 퍼센트 서식(0.0%)을 사용하므로
        # 계산된 원값(예: 8.05)을 화면 스케일(805.0)로 맞추기 위해 x100 적용.
        attack_power_raw = round(
            (expected_goal_rate_sheet * 10.0)
            + pass_success_rate
            + dribble_success_rate
            + aerial_success_rate
            + season_win_term,
            4,
        )
        defense_power_raw = round(
            pass_success_rate
            + intercept_per_game
            + tackle_success_rate
            + aerial_success_rate
            + (save_per_game * 2.0)
            + block_success_rate
            + season_win_term,
            4,
        )
        attack_power = round(attack_power_raw * 100.0, 2)
        defense_power = round(defense_power_raw * 100.0, 2)
        long_shot_attempt_rate = (
            round(slot["longShotAttempts"] / slot["shoot"], 4) if slot["shoot"] > 0 else None
        )
        long_shot_selection_efficiency = (
            round(slot["longShotOnTarget"] / slot["longShotAttempts"], 4)
            if slot["longShotAttempts"] > 0
            else None
        )
        long_shot_goal_share = (
            round(slot["longShotGoals"] / slot["goal"], 4) if slot["goal"] > 0 else None
        )
        player_name = spid_name_map.get(spid_key, "")
        position_value = int(primary_position_key) if primary_position_key else None
        squad_rows.append(
            {
                "playerKey": str(spid),
                "spId": spid,
                "seasonId": int(slot["seasonId"]),
                "seasonName": seasonid_name_map.get(str(slot["seasonId"]), str(slot["seasonId"])),
                "seasonImg": seasonimg_map.get(str(slot["seasonId"]), ""),
                "name": player_name,
                "playerName": player_name,
                "position": position_value,
                "spPosition": position_value,
                "positionName": primary_position_name,
                "appearances": appearances,
                "record": {
                    "w": int(slot["w"]),
                    "d": int(slot["d"]),
                    "l": int(slot["l"]),
                },
                # Spreadsheet AE 수식 기준: 팀 공통 승률
                "winRate": season_win_rate_percent,
                # 참고용(표시 기본값 아님): 선수 개인 승률
                "playerWinRate": _ratio(slot["w"], slot["appearanceCount"], scale=100.0, ndigits=2),
                "attackPower": attack_power,
                "defensePower": defense_power,
                "longShotAttemptRate": long_shot_attempt_rate,
                "longShotSelectionEfficiency": long_shot_selection_efficiency,
                "longShotGoalShare": long_shot_goal_share,
                "expectedGoalRate": expected_goal_rate_sheet,
                "attackPoint": attack_point,
                "goal": int(slot["goal"]),
                "assist": int(slot["assist"]),
                "passSuccessRate": pass_success_rate,
                "dribbleSuccessRate": dribble_success_rate,
                "interceptPerGame": intercept_per_game,
                "aerialSuccessRate": aerial_success_rate,
                "tackleSuccessRate": tackle_success_rate,
                "savePerGame": save_per_game,
                "shotDefenseRate": block_success_rate,
                "avgRating": avg_rating,
            }
        )

    squad_rows.sort(
        key=lambda row: (
            -row["appearances"],
            -row["attackPoint"],
            -(row["avgRating"] if row["avgRating"] is not None else -1.0),
            row["spId"],
        )
    )

    squad_analysis_payload = {
        "schemaVersion": "0.1.2",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "matchtype": int(matchtype),
            "matchtypeName": "감독모드" if int(matchtype) == 52 else str(matchtype),
        },
        "privacy": privacy_meta,
        "player": {
            "playerId": pid,
            "nickname": nickname,
        },
        "scope": {
            "mode": "season_filtered_all",
            "actualMatches": len(records),
        },
        "summary": {
            "uniquePlayers": len(squad_rows),
            "totalAppearances": sum(int(row["appearances"]) for row in squad_rows),
        },
        "rows": squad_rows,
    }

    analysis_dir = Path(data_base_dir) / season_name / "user" / pid / "analysis"
    analysis_dir.mkdir(parents=True, exist_ok=True)
    try:
        openapi_client: NexonFconlineClient | None = NexonFconlineClient()
        client_error = None
    except Exception as exc:
        openapi_client = None
        client_error = _safe_error_message(exc)

    if openapi_client is not None:
        profile_payload = _build_profile_payload(
            client=openapi_client,
            cache=cache,
            analysis_dir=analysis_dir,
            generated_at=generated_at,
            season=season_name,
            player_id=pid,
            nickname=nickname,
            ouid=str(ouid),
            matchtype=matchtype,
            privacy_meta=privacy_meta,
            division_name_map=division_name_map,
        )
    else:
        profile_payload = {
            "schemaVersion": "0.1.0",
            "status": "ERROR",
            "generatedAt": generated_at.isoformat(),
            "source": {"provider": "NexonOpenAPI", "matchtype": int(matchtype)},
            "privacy": privacy_meta,
            "player": {"playerId": pid, "nickname": nickname},
            "error": client_error,
        }

    match_details_payload = {
        "schemaVersion": "0.1.0",
        "generatedAt": generated_at.isoformat(),
        "source": {
            "provider": "NexonOpenAPI",
            "matchtype": int(matchtype),
            "matchtypeName": "감독모드" if int(matchtype) == 52 else str(matchtype),
        },
        "privacy": privacy_meta,
        "player": {"playerId": pid, "nickname": nickname},
        "scope": {"recentMatches": min(20, len(selected))},
        "rows": _build_match_detail_rows(
            selected=selected,
            ouid=str(ouid),
            include_match_id=include_match_id,
            spid_name_map=spid_name_map,
            spposition_name_map=spposition_name_map,
            division_name_map=division_name_map,
            limit=20,
        ),
    }
    player_class_payload = _build_player_class_payload(
        squad_rows=squad_rows,
        generated_at=generated_at,
        matchtype=matchtype,
        player_id=pid,
        nickname=nickname,
        privacy_meta=privacy_meta,
    )
    latest_squad_side: dict[str, Any] = {}
    for candidate in selected:
        candidate_side = candidate.get("my") or {}
        candidate_players = _nested_get(candidate_side, "player") or []
        starter_count = sum(
            1
            for row in candidate_players
            if isinstance(row, dict)
            and 0 <= _to_int(row.get("spPosition", row.get("spposition")), -1) <= 27
        )
        if starter_count == 11:
            latest_squad_side = candidate_side
            break
    if not latest_squad_side and selected:
        latest_squad_side = selected[0].get("my") or {}

    squad_snapshot_payload = _build_squad_snapshot_payload(
        generated_at=generated_at,
        season=season_name,
        player_id=pid,
        nickname=nickname,
        privacy_meta=privacy_meta,
        latest_side=latest_squad_side,
        spid_name_map=spid_name_map,
        spposition_name_map=spposition_name_map,
    )
    last200_path = analysis_dir / "last200.json"
    manager_mode_analysis_path = analysis_dir / "manager_mode_analysis.json"
    squad_analysis_path = analysis_dir / "squad_analysis_all.json"
    profile_path = analysis_dir / "account_profile.json"
    match_details_path = analysis_dir / "match_details_last20.json"
    player_class_path = analysis_dir / "player_class_analysis.json"
    squad_snapshot_path = analysis_dir / "squad_snapshot.json"
    if actual_matches == 0 and last200_path.is_file():
        try:
            with last200_path.open("r", encoding="utf-8") as f:
                previous_last200 = json.load(f)
        except Exception:
            previous_last200 = None

        fallback_analysis = _manager_mode_analysis_from_last200(
            previous_last200,
            season=season_name,
            player_id=pid,
            nickname=nickname,
            matchtype=matchtype,
            privacy_meta=privacy_meta,
            generated_at=generated_at,
        )
        if fallback_analysis:
            atomic_write_json(manager_mode_analysis_path, fallback_analysis)
            atomic_write_json(squad_snapshot_path, squad_snapshot_payload)
            return {
                "status": "success",
                "season": season_name,
                "playerId": pid,
                "nickname": nickname,
                "ouid": ouid,
                "windowMatches": window_matches_report,
                "actualMatches": int(fallback_analysis["sample"]["valid"]),
                "analysisDir": str(analysis_dir),
                "last200Path": str(last200_path),
                "managerModeAnalysisPath": str(manager_mode_analysis_path),
                "squadAnalysisPath": str(squad_analysis_path),
                "squadSnapshotPath": str(squad_snapshot_path),
                "fallback": "last200.json",
            }

    atomic_write_json(last200_path, last200)
    atomic_write_json(manager_mode_analysis_path, manager_mode_analysis)
    atomic_write_json(squad_analysis_path, squad_analysis_payload)
    atomic_write_json(profile_path, profile_payload)
    atomic_write_json(match_details_path, match_details_payload)
    atomic_write_json(player_class_path, player_class_payload)
    atomic_write_json(squad_snapshot_path, squad_snapshot_payload)

    return {
        "status": "success",
        "season": season_name,
        "playerId": pid,
        "nickname": nickname,
        "ouid": str(ouid),
        "windowMatches": window_matches_report,
        "actualMatches": int(actual_matches),
        "analysisDir": str(analysis_dir),
        "last200Path": str(last200_path),
        "managerModeAnalysisPath": str(manager_mode_analysis_path),
        "squadAnalysisPath": str(squad_analysis_path),
        "profilePath": str(profile_path),
        "matchDetailsPath": str(match_details_path),
        "playerClassPath": str(player_class_path),
        "squadSnapshotPath": str(squad_snapshot_path),
    }


def _pick_self_match_info(match_info_list: list[dict[str, Any]], ouid: str | None) -> dict[str, Any]:
    if not match_info_list:
        return {}
    if ouid:
        for info in match_info_list:
            if str(info.get("ouid", "")) == str(ouid):
                return info
    return match_info_list[0]


def _pick_opp_match_info(match_info_list: list[dict[str, Any]], self_info: dict[str, Any]) -> dict[str, Any]:
    if len(match_info_list) < 2:
        return {}
    for info in match_info_list:
        if info is not self_info:
            return info
    return {}


def _extract_division_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if not isinstance(payload, dict):
        return []
    if any(key in payload for key in ("matchType", "matchtype", "division", "achievementDate")):
        return [payload]
    candidates = []
    for key in ("maxDivision", "division", "divisions", "rank", "ranks"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend([row for row in value if isinstance(row, dict)])
        elif isinstance(value, dict):
            candidates.append(value)
    return candidates


def _decorate_division_rows(
    rows: list[dict[str, Any]],
    division_name_map: dict[str, str],
) -> list[dict[str, Any]]:
    decorated: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        division_id = _to_int(row.get("division") or row.get("divisionId"), -1)
        next_row = dict(row)
        if division_id >= 0:
            next_row["divisionName"] = division_name_map.get(str(division_id), "")
        decorated.append(next_row)
    return decorated


def _build_profile_payload(
    *,
    client: NexonFconlineClient,
    cache: JsonFileCache,
    analysis_dir: Path,
    generated_at: datetime,
    season: str,
    player_id: str,
    nickname: str,
    ouid: str,
    matchtype: int,
    privacy_meta: dict[str, str],
    division_name_map: dict[str, str],
) -> dict[str, Any]:
    cache_key = f"user_basic:{ouid}"
    maxdivision_cache_key = f"user_maxdivision:{ouid}"
    basic = cache.get(cache_key)
    maxdivision = cache.get(maxdivision_cache_key)
    profile_status = "SUCCESS"
    error = None
    if not isinstance(basic, dict):
        try:
            basic = client.get_user_basic(ouid)
            cache.set(cache_key, basic)
        except Exception as exc:
            basic = {}
            profile_status = "ERROR"
            error = _safe_error_message(exc)

    if maxdivision is None:
        try:
            maxdivision = client.get_user_maxdivision(ouid)
            cache.set(maxdivision_cache_key, maxdivision)
        except Exception as exc:
            maxdivision = {}
            if profile_status == "SUCCESS":
                profile_status = "PARTIAL"
            error = _safe_error_message(exc)

    division_rows = _decorate_division_rows(
        _extract_division_rows(maxdivision),
        division_name_map,
    )
    manager_mode_divisions = [
        row
        for row in division_rows
        if _to_int(row.get("matchType") or row.get("matchtype"), -1) == int(matchtype)
    ]
    best_division = manager_mode_divisions[0] if manager_mode_divisions else (division_rows[0] if division_rows else {})
    profile = {
        "schemaVersion": "0.1.0",
        "status": profile_status,
        "generatedAt": generated_at.isoformat(),
        "source": {"provider": "NexonOpenAPI", "matchtype": int(matchtype)},
        "privacy": privacy_meta,
        "player": {"playerId": str(player_id), "nickname": nickname},
        "account": {
            "ouidHash": sha256(str(ouid).encode("utf-8")).hexdigest()[:12],
            "nickname": basic.get("nickname") or nickname,
            "level": basic.get("level"),
            "managerModeBestDivision": best_division,
            "divisionRows": division_rows,
        },
    }
    if error:
        profile["error"] = error

    return profile


def _build_match_detail_rows(
    *,
    selected: list[dict[str, Any]],
    ouid: str,
    include_match_id: bool,
    spid_name_map: dict[str, str],
    spposition_name_map: dict[str, str],
    division_name_map: dict[str, str],
    limit: int = 20,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for rec in selected[:limit]:
        match_id = rec["matchId"]
        detail = rec["detail"]
        my = rec["my"]
        opp = rec["opp"]
        date_kst = rec["matchDateKst"]
        my_players = _match_player_rows(my, spid_name_map, spposition_name_map)
        opp_players = _match_player_rows(opp, spid_name_map, spposition_name_map)
        my_division = _to_int(my.get("division"), -1)
        opp_division = _to_int(opp.get("division"), -1)
        result = _result_label(_nested_get(my, "matchDetail", "matchResult"))
        mining_fc = MINING_FC_BY_DIVISION_WIN.get(my_division, 0) if result == "승" else 0
        mining_policy_known = result != "승" or my_division in MINING_FC_BY_DIVISION_WIN
        row = {
            "matchKey": _short_match_key(match_id),
            "dateKst": date_kst.isoformat(),
            "result": result,
            "miningFc": mining_fc,
            "miningPolicy": MINING_POLICY_VERSION,
            "miningPolicyKnown": mining_policy_known,
            "self": {
                "nickname": my.get("nickname") or "",
                "division": my_division if my_division >= 0 else None,
                "divisionName": division_name_map.get(str(my_division), ""),
                "score": _side_goal_total(my),
                "shots": _side_shots(my),
                "shotsOnTarget": _side_shots_on_target(my),
                "possession": _safe_possession_percent(
                    _nested_get(my, "matchDetail", "ballPossesion")
                    if _nested_get(my, "matchDetail", "ballPossesion") is not None
                    else _nested_get(my, "matchDetail", "ballPossession")
                ),
                "averageRating": _to_float(_nested_get(my, "matchDetail", "averageRating")),
                "detail": _side_detail_metrics(my),
            },
            "opponent": {
                "nickname": opp.get("nickname") or "",
                "division": opp_division if opp_division >= 0 else None,
                "divisionName": division_name_map.get(str(opp_division), ""),
                "score": _side_goal_total(opp),
                "shots": _side_shots(opp),
                "shotsOnTarget": _side_shots_on_target(opp),
                "averageRating": _to_float(_nested_get(opp, "matchDetail", "averageRating")),
                "detail": _side_detail_metrics(opp),
            },
            "players": my_players,
            "opponentPlayers": opp_players,
            "rawMatchType": detail.get("matchType"),
        }
        if include_match_id:
            row["matchId"] = match_id
        rows.append(row)
    return rows


def _match_player_rows(
    side: dict[str, Any],
    spid_name_map: dict[str, str],
    spposition_name_map: dict[str, str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for player in _nested_get(side, "player") or []:
        if not isinstance(player, dict):
            continue
        spid = _to_int(player.get("spId", player.get("spid")), -1)
        if spid < 0:
            continue
        status = player.get("status") if isinstance(player.get("status"), dict) else {}
        sp_pos = _to_int(player.get("spPosition", player.get("spposition")), -1)
        rows.append(
            {
                "spId": spid,
                "name": spid_name_map.get(str(spid), str(spid)),
                "spPosition": sp_pos if sp_pos >= 0 else None,
                "positionName": spposition_name_map.get(str(sp_pos), ""),
                "spGrade": _to_int(player.get("spGrade", player.get("spgrade")), 0),
                "rating": _to_float(status.get("spRating")),
                "goal": _to_int(status.get("goal"), 0),
                "assist": _to_int(status.get("assist"), 0),
                "shoot": _to_int(status.get("shoot"), 0),
                "effectiveShoot": _to_int(status.get("effectiveShoot"), 0),
                "status": {
                    "dribble": _to_int(status.get("dribble"), 0),
                    "intercept": _to_int(status.get("intercept"), 0),
                    "defending": _to_int(status.get("defending"), 0),
                    "passTry": _to_int(status.get("passTry"), 0),
                    "passSuccess": _to_int(status.get("passSuccess"), 0),
                    "dribbleTry": _to_int(status.get("dribbleTry"), 0),
                    "dribbleSuccess": _to_int(status.get("dribbleSuccess"), 0),
                    "ballPossessionTry": _to_int(status.get("ballPossesionTry"), 0),
                    "ballPossessionSuccess": _to_int(status.get("ballPossesionSuc"), 0),
                    "aerialTry": _to_int(status.get("aerialTry"), 0),
                    "aerialSuccess": _to_int(status.get("aerialSuccess"), 0),
                    "blockTry": _to_int(status.get("blockTry"), 0),
                    "block": _to_int(status.get("block"), 0),
                    "tackleTry": _to_int(status.get("tackleTry"), 0),
                    "tackle": _to_int(status.get("tackle"), 0),
                    "yellowCards": _to_int(status.get("yellowCards"), 0),
                    "redCards": _to_int(status.get("redCards"), 0),
                },
            }
        )
    return rows


def _build_player_class_payload(
    *,
    squad_rows: list[dict[str, Any]],
    generated_at: datetime,
    matchtype: int,
    player_id: str,
    nickname: str,
    privacy_meta: dict[str, str],
) -> dict[str, Any]:
    class_buckets: dict[str, dict[str, Any]] = {}
    base_buckets: dict[str, list[dict[str, Any]]] = {}
    for row in squad_rows:
        season_key = str(row.get("seasonId") or "")
        class_slot = class_buckets.setdefault(
            season_key,
            {
                "seasonId": row.get("seasonId"),
                "seasonName": row.get("seasonName") or season_key,
                "players": 0,
                "appearances": 0,
                "goals": 0,
                "assists": 0,
                "ratingSum": 0.0,
                "ratingCount": 0,
            },
        )
        class_slot["players"] += 1
        class_slot["appearances"] += _to_int(row.get("appearances"), 0)
        class_slot["goals"] += _to_int(row.get("goal"), 0)
        class_slot["assists"] += _to_int(row.get("assist"), 0)
        rating = _to_float(row.get("avgRating"))
        if rating is not None:
            class_slot["ratingSum"] += rating
            class_slot["ratingCount"] += 1

        base_key = str(_to_int(row.get("spId"), 0) % 1000000)
        base_buckets.setdefault(base_key, []).append(row)

    class_rows = []
    for slot in class_buckets.values():
        class_rows.append(
            {
                "seasonId": slot["seasonId"],
                "seasonName": slot["seasonName"],
                "players": int(slot["players"]),
                "appearances": int(slot["appearances"]),
                "goals": int(slot["goals"]),
                "assists": int(slot["assists"]),
                "attackPoints": int(slot["goals"] + slot["assists"]),
                "avgRating": round(slot["ratingSum"] / slot["ratingCount"], 2)
                if slot["ratingCount"]
                else None,
            }
        )
    class_rows.sort(key=lambda row: (-row["appearances"], row["seasonName"]))
    same_player_rows = []
    for base_key, rows in base_buckets.items():
        if len(rows) < 2:
            continue
        same_player_rows.append(
            {
                "basePlayerId": base_key,
                "name": rows[0].get("playerName") or rows[0].get("name") or base_key,
                "cards": sorted(
                    [
                        {
                            "spId": row.get("spId"),
                            "seasonId": row.get("seasonId"),
                            "seasonName": row.get("seasonName"),
                            "appearances": row.get("appearances"),
                            "attackPoint": row.get("attackPoint"),
                            "avgRating": row.get("avgRating"),
                            "playerWinRate": row.get("playerWinRate"),
                        }
                        for row in rows
                    ],
                    key=lambda card: -_to_int(card.get("appearances"), 0),
                ),
            }
        )
    same_player_rows.sort(key=lambda row: -sum(_to_int(card.get("appearances"), 0) for card in row["cards"]))
    return {
        "schemaVersion": "0.1.0",
        "generatedAt": generated_at.isoformat(),
        "source": {"provider": "NexonOpenAPI", "matchtype": int(matchtype)},
        "privacy": privacy_meta,
        "player": {"playerId": str(player_id), "nickname": nickname},
        "classRows": class_rows,
        "samePlayerCardComparisons": same_player_rows[:20],
    }


def compute_manager_mode_summary(
    match_details: list[dict[str, Any]],
    *,
    ouid: str | None = None,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    now = generated_at or datetime.now(KST)
    wins = draws = losses = 0
    goal_for = goal_against = 0
    sampled = 0

    for detail in match_details:
        if not isinstance(detail, dict):
            continue
        match_info = detail.get("matchInfo")
        if not isinstance(match_info, list):
            continue

        self_info = _pick_self_match_info(match_info, ouid)
        if not self_info:
            continue
        opp_info = _pick_opp_match_info(match_info, self_info)

        result = _normalize_result(_nested_get(self_info, "matchDetail", "matchResult"))
        if result == "win":
            wins += 1
        elif result == "draw":
            draws += 1
        elif result == "lose":
            losses += 1

        self_goals = _side_goal_total(self_info)
        opp_goals = _side_goal_total(opp_info)
        goal_for += self_goals
        goal_against += opp_goals
        sampled += 1

    win_rate = round((wins / sampled) * 100, 2) if sampled else None

    return {
        "matchtype": 52,
        "generated_at": now.isoformat(),
        "sample_size": sampled,
        "record": {
            "wins": wins,
            "draws": draws,
            "losses": losses,
        },
        "win_rate": win_rate,
        "goals": {
            "for": goal_for,
            "against": goal_against,
            "diff": goal_for - goal_against,
        },
    }
