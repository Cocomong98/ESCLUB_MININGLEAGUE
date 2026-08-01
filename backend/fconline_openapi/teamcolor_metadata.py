"""Load optional team-color metadata without requiring it for API collection."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


METADATA_DIR = Path(__file__).resolve().parents[2] / "data" / "meta" / "teamcolors"
REQUIRED_FILES = (
    "team_colors.json",
    "activation_stages.json",
    "effects.json",
    "players.json",
    "teamcolor_players.json",
    "metadata.json",
)


def _number(value: Any, default: float = 0.0) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def load_teamcolor_metadata(base_dir: str | Path | None = None) -> dict[str, Any]:
    """Return validated metadata, or an unavailable status before delivery."""

    directory = Path(base_dir) if base_dir is not None else METADATA_DIR
    missing = [name for name in REQUIRED_FILES if not (directory / name).is_file()]
    if missing:
        return {
            "status": "PENDING_METADATA",
            "directory": str(directory),
            "missing": missing,
        }

    payload: dict[str, Any] = {}
    try:
        for name in REQUIRED_FILES:
            with (directory / name).open("r", encoding="utf-8") as stream:
                payload[name.removesuffix(".json")] = json.load(stream)
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "status": "INVALID_METADATA",
            "directory": str(directory),
            "error": str(exc),
        }

    return {
        "status": "READY",
        "directory": str(directory),
        "data": payload,
    }
