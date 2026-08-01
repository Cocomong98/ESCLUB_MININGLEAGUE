"""File-based cache helpers and typed cache access for Nexon Open API."""

from __future__ import annotations

from contextlib import suppress
import fcntl
import gzip
import json
import os
import shutil
from datetime import datetime, timedelta, timezone
from hashlib import sha1
from pathlib import Path
from typing import Any


KST = timezone(timedelta(hours=9))
DEFAULT_MAX_AGE_DAYS = 29
DEFAULT_META_MAX_AGE_HOURS = 24
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OPENAPI_CACHE_DIR = REPO_ROOT / ".private" / "openapi_cache"
OPENAPI_CACHE_ENV_KEY = "OPENAPI_CACHE_DIR"


def now_kst_iso() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def ensure_dir(path: str | Path) -> None:
    os.makedirs(path, exist_ok=True)


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


class _PathFileLock:
    def __init__(self, target_path: str | Path) -> None:
        target = Path(target_path)
        self.lock_path = target.with_name(f"{target.name}.lock")
        self._fp = None

    def __enter__(self):
        ensure_dir(self.lock_path.parent)
        self._fp = self.lock_path.open("a+", encoding="utf-8")
        fcntl.flock(self._fp, fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._fp is None:
            return False
        with suppress(Exception):
            fcntl.flock(self._fp, fcntl.LOCK_UN)
        self._fp.close()
        self._fp = None
        return False


def atomic_write_bytes(path: str | Path, payload: bytes) -> None:
    path_obj = Path(path)
    ensure_dir(path_obj.parent)
    tmp_path = path_obj.with_suffix(f"{path_obj.suffix}.tmp.{os.getpid()}")
    with tmp_path.open("wb") as f:
        f.write(payload)
    os.replace(tmp_path, path_obj)


def write_json(path: str | Path, obj: Any) -> None:
    data = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    atomic_write_bytes(path, data)


def read_json(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json_gz(path: str | Path, obj: Any) -> None:
    path_obj = Path(path)
    ensure_dir(path_obj.parent)
    tmp_path = path_obj.with_suffix(f"{path_obj.suffix}.tmp.{os.getpid()}")
    with gzip.open(tmp_path, "wt", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path_obj)


def read_json_gz(path: str | Path) -> Any:
    with gzip.open(Path(path), "rt", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: str | Path, obj: Any) -> None:
    """Compatibility helper used by sync.py."""
    write_json(path, obj)


def is_stale(fetched_at_iso: str, max_age_days: float = DEFAULT_MAX_AGE_DAYS) -> bool:
    try:
        fetched_at = datetime.fromisoformat(str(fetched_at_iso))
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=KST)
        return datetime.now(KST) - fetched_at > timedelta(days=max_age_days)
    except Exception:
        return True


def _resolve_path_from_repo(path: str | Path) -> Path:
    candidate = Path(path).expanduser()
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / candidate).resolve()
    return candidate.resolve()


def get_cache_root(cache_dir: str | None = None) -> str:
    raw = (cache_dir or os.environ.get(OPENAPI_CACHE_ENV_KEY, "")).strip()
    root_path = _resolve_path_from_repo(raw) if raw else DEFAULT_OPENAPI_CACHE_DIR.resolve()
    ensure_dir(root_path)
    return str(root_path)


def cache_root(data_base_dir: str = "data", cache_dir: str | None = None) -> str:
    # data_base_dir is retained only for backward compatibility.
    _ = data_base_dir
    return get_cache_root(cache_dir=cache_dir)


def get_legacy_cache_root(data_base_dir: str = "data") -> str:
    legacy = _resolve_path_from_repo(Path(data_base_dir) / "openapi_cache")
    return str(legacy)


def migrate_legacy_cache_dir(
    *,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> dict[str, Any]:
    old_root = Path(get_legacy_cache_root(data_base_dir))
    new_root = Path(get_cache_root(cache_dir=cache_dir))
    old_exists = old_root.is_dir()
    new_has_data = any(new_root.iterdir())
    result: dict[str, Any] = {
        "oldPath": str(old_root),
        "oldExists": old_exists,
        "targetPath": str(new_root),
        "targetHasData": new_has_data,
        "status": "skipped",
        "action": "none",
    }

    if not old_exists:
        result["reason"] = "legacy_cache_not_found"
        return result

    if old_root.resolve() == new_root.resolve():
        result["reason"] = "legacy_and_target_are_same"
        return result

    if new_has_data:
        result["reason"] = "target_not_empty"
        return result

    try:
        shutil.copytree(old_root, new_root, dirs_exist_ok=True)
        shutil.rmtree(old_root)
    except Exception as exc:
        result["status"] = "error"
        result["action"] = "copy_failed"
        result["error"] = str(exc)
        return result

    result["status"] = "success"
    result["action"] = "copied_then_removed_legacy"
    result["legacyRemoved"] = not old_root.exists()
    return result


def _read_wrapper_for_stale_check(path: Path) -> tuple[str | None, Any]:
    try:
        if path.suffix == ".gz":
            record = read_json_gz(path)
        else:
            record = read_json(path)
    except Exception:
        return None, None
    return _unwrap_payload(record)


def _cleanup_empty_parents(base: Path, leaf: Path) -> None:
    current = leaf.parent
    while True:
        if current == base or not str(current).startswith(str(base)):
            return
        try:
            current.rmdir()
        except OSError:
            return
        current = current.parent


def list_stale_match_ids(
    max_age_days: int = 25,
    *,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> list[str]:
    root = Path(get_cache_root(cache_dir=cache_dir))
    match_dir = root / "match"
    if not match_dir.is_dir():
        return []

    stale_ids: list[str] = []
    for path in sorted(match_dir.glob("*.json.gz")):
        fetched_at, _ = _read_wrapper_for_stale_check(path)
        if not fetched_at or is_stale(fetched_at, max_age_days=max_age_days):
            stale_ids.append(path.name[:-8])  # trim ".json.gz"

    # preserve order, dedupe
    seen: set[str] = set()
    deduped: list[str] = []
    for match_id in stale_ids:
        if match_id in seen:
            continue
        seen.add(match_id)
        deduped.append(match_id)
    return deduped


def purge_stale_cache(
    max_age_days: int = DEFAULT_MAX_AGE_DAYS,
    *,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> dict[str, Any]:
    root = Path(get_cache_root(cache_dir=cache_dir))
    summary: dict[str, Any] = {
        "cacheRoot": str(root),
        "maxAgeDays": int(max_age_days),
        "scanned": 0,
        "deleted": 0,
        "errors": 0,
        "matchDetailsScanned": 0,
        "matchDetailsDeleted": 0,
        "matchDetailsErrors": 0,
        "matchIndexScanned": 0,
        "matchIndexDeleted": 0,
        "matchIndexErrors": 0,
        "ouidEntriesScanned": 0,
        "ouidEntriesDeleted": 0,
        "ouidErrors": 0,
    }

    match_dir = root / "match"
    if match_dir.is_dir():
        for path in sorted(match_dir.glob("*.json.gz")):
            summary["scanned"] += 1
            summary["matchDetailsScanned"] += 1
            fetched_at, _ = _read_wrapper_for_stale_check(path)
            should_delete = (not fetched_at) or is_stale(fetched_at, max_age_days=max_age_days)
            if not should_delete:
                continue
            try:
                path.unlink()
                _cleanup_empty_parents(match_dir, path)
                summary["deleted"] += 1
                summary["matchDetailsDeleted"] += 1
            except Exception:
                summary["errors"] += 1
                summary["matchDetailsErrors"] += 1

    user_dir = root / "user"
    if user_dir.is_dir():
        for path in sorted(user_dir.rglob("match_index_*.json")):
            summary["scanned"] += 1
            summary["matchIndexScanned"] += 1
            fetched_at, _ = _read_wrapper_for_stale_check(path)
            should_delete = (not fetched_at) or is_stale(fetched_at, max_age_days=max_age_days)
            if not should_delete:
                continue
            try:
                path.unlink()
                _cleanup_empty_parents(user_dir, path)
                summary["deleted"] += 1
                summary["matchIndexDeleted"] += 1
            except Exception:
                summary["errors"] += 1
                summary["matchIndexErrors"] += 1

    ouid_path = root / "ouid_map.json"
    if ouid_path.is_file():
        try:
            payload = read_json(ouid_path)
        except Exception:
            summary["errors"] += 1
            summary["ouidErrors"] += 1
            payload = None

        if isinstance(payload, dict):
            changed = False
            for nickname in list(payload.keys()):
                summary["scanned"] += 1
                summary["ouidEntriesScanned"] += 1
                row = payload.get(nickname)
                fetched_at = str(row.get("fetchedAt", "")) if isinstance(row, dict) else ""
                should_delete = (not fetched_at) or is_stale(
                    fetched_at, max_age_days=max_age_days
                )
                if not should_delete:
                    continue
                payload.pop(nickname, None)
                changed = True
                summary["deleted"] += 1
                summary["ouidEntriesDeleted"] += 1

            if changed:
                try:
                    write_json(ouid_path, payload)
                except Exception:
                    summary["errors"] += 1
                    summary["ouidErrors"] += 1

    return summary


def ouid_map_path(data_base_dir: str = "data", cache_dir: str | None = None) -> str:
    return os.path.join(cache_root(data_base_dir, cache_dir=cache_dir), "ouid_map.json")


def user_index_path(
    ouid: str,
    matchtype: int,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> str:
    return os.path.join(
        cache_root(data_base_dir, cache_dir=cache_dir),
        "user",
        str(ouid),
        f"match_index_{int(matchtype)}.json",
    )


def match_detail_path(
    matchid: str,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> str:
    return os.path.join(
        cache_root(data_base_dir, cache_dir=cache_dir),
        "match",
        f"{str(matchid)}.json.gz",
    )


def meta_path(
    name: str,
    data_base_dir: str = "data",
    cache_dir: str | None = None,
) -> str:
    safe_name = str(name).strip()
    return os.path.join(
        cache_root(data_base_dir, cache_dir=cache_dir),
        "meta",
        f"{safe_name}.json",
    )


def _wrap_payload(payload: Any) -> dict[str, Any]:
    return {
        "fetchedAt": now_kst_iso(),
        "payload": payload,
    }


def _unwrap_payload(record: Any) -> tuple[str | None, Any]:
    if not isinstance(record, dict):
        return None, None
    if "payload" not in record:
        return None, None
    fetched_at = record.get("fetchedAt")
    payload = record.get("payload")
    return str(fetched_at) if fetched_at is not None else None, payload


def _parse_match_index_key(key: str) -> tuple[str, int] | None:
    # expected format: match_index:<ouid>:<matchtype>
    parts = key.split(":", 2)
    if len(parts) != 3 or parts[0] != "match_index":
        return None
    ouid = parts[1].strip()
    if not ouid:
        return None
    try:
        matchtype = int(parts[2])
    except (TypeError, ValueError):
        return None
    return ouid, matchtype


class JsonFileCache:
    """Typed cache API with compatibility key/value methods."""

    def __init__(
        self,
        *,
        data_base_dir: str = "data",
        root_dir: str | None = None,
        max_age_days: int = DEFAULT_MAX_AGE_DAYS,
        meta_max_age_hours: int = DEFAULT_META_MAX_AGE_HOURS,
    ) -> None:
        self.data_base_dir = data_base_dir
        self.root_dir = get_cache_root(cache_dir=root_dir)
        self.max_age_days = max_age_days
        self.meta_max_age_hours = meta_max_age_hours
        ensure_dir(self.root_dir)

    def _generic_path(self, key: str) -> str:
        digest = sha1(key.encode("utf-8")).hexdigest()
        return os.path.join(self.root_dir, "generic", digest[:2], f"{digest}.json")

    def get_ouid(self, nickname: str) -> str | None:
        nickname = str(nickname).strip()
        if not nickname:
            return None
        path = ouid_map_path(self.data_base_dir, cache_dir=self.root_dir)
        if not os.path.exists(path):
            return None
        try:
            payload = read_json(path)
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        row = payload.get(nickname)
        if not isinstance(row, dict):
            return None
        fetched_at = str(row.get("fetchedAt", ""))
        if is_stale(fetched_at, self.max_age_days):
            return None
        ouid = str(row.get("ouid", "")).strip()
        return ouid or None

    def set_ouid(self, nickname: str, ouid: str) -> None:
        nickname = str(nickname).strip()
        if not nickname:
            return
        path = Path(ouid_map_path(self.data_base_dir, cache_dir=self.root_dir))
        with _PathFileLock(path):
            payload: dict[str, Any] = {}
            if path.exists():
                try:
                    existing = read_json(path)
                    if isinstance(existing, dict):
                        payload = existing
                except Exception:
                    payload = {}
            payload[nickname] = {
                "ouid": str(ouid).strip(),
                "fetchedAt": now_kst_iso(),
            }
            write_json(path, payload)

    def get_user_match_index(self, ouid: str, matchtype: int) -> list[str] | None:
        path = user_index_path(ouid, matchtype, self.data_base_dir, cache_dir=self.root_dir)
        if not os.path.exists(path):
            return None
        try:
            record = read_json(path)
        except Exception:
            return None
        fetched_at, payload = _unwrap_payload(record)
        if not fetched_at or is_stale(fetched_at, self.max_age_days):
            return None
        if not isinstance(payload, list):
            return None
        return [str(x) for x in payload]

    def set_user_match_index(self, ouid: str, matchtype: int, match_ids: list[Any]) -> None:
        incoming = [str(x) for x in (match_ids or [])]
        path = Path(user_index_path(ouid, matchtype, self.data_base_dir, cache_dir=self.root_dir))
        with _PathFileLock(path):
            existing_payload: list[str] = []
            if path.exists():
                try:
                    record = read_json(path)
                    _, unwrapped = _unwrap_payload(record)
                    if isinstance(unwrapped, list):
                        existing_payload = [str(x) for x in unwrapped]
                except Exception:
                    existing_payload = []
            merged = _dedupe_preserve_order(incoming + existing_payload)
            write_json(path, _wrap_payload(merged))

    def get_match_detail(self, matchid: str) -> dict[str, Any] | None:
        path = match_detail_path(matchid, self.data_base_dir, cache_dir=self.root_dir)
        if not os.path.exists(path):
            return None
        try:
            record = read_json_gz(path)
        except Exception:
            return None
        fetched_at, payload = _unwrap_payload(record)
        if not fetched_at or is_stale(fetched_at, self.max_age_days):
            return None
        if not isinstance(payload, dict):
            return None
        return payload

    def set_match_detail(self, matchid: str, detail: dict[str, Any]) -> None:
        path = match_detail_path(matchid, self.data_base_dir, cache_dir=self.root_dir)
        write_json_gz(path, _wrap_payload(detail))

    def get_meta(self, name: str) -> Any | None:
        path = meta_path(name, self.data_base_dir, cache_dir=self.root_dir)
        if not os.path.exists(path):
            return None
        try:
            record = read_json(path)
        except Exception:
            return None
        fetched_at, payload = _unwrap_payload(record)
        max_age_days = self.meta_max_age_hours / 24.0
        if not fetched_at or is_stale(fetched_at, max_age_days):
            return None
        return payload

    def set_meta(self, name: str, payload: Any) -> None:
        path = meta_path(name, self.data_base_dir, cache_dir=self.root_dir)
        write_json(path, _wrap_payload(payload))

    def get(self, key: str) -> Any | None:
        if key.startswith("ouid:"):
            return self.get_ouid(key.split(":", 1)[1])
        if key.startswith("match_detail:"):
            return self.get_match_detail(key.split(":", 1)[1])
        parsed_match_index = _parse_match_index_key(key)
        if parsed_match_index is not None:
            ouid, matchtype = parsed_match_index
            return self.get_user_match_index(ouid, matchtype)

        path = self._generic_path(key)
        if not os.path.exists(path):
            return None
        try:
            record = read_json(path)
        except Exception:
            return None
        fetched_at, payload = _unwrap_payload(record)
        if not fetched_at or is_stale(fetched_at, self.max_age_days):
            return None
        return payload

    def set(self, key: str, value: Any) -> None:
        if key.startswith("ouid:"):
            self.set_ouid(key.split(":", 1)[1], str(value))
            return
        if key.startswith("match_detail:") and isinstance(value, dict):
            self.set_match_detail(key.split(":", 1)[1], value)
            return
        parsed_match_index = _parse_match_index_key(key)
        if parsed_match_index is not None and isinstance(value, list):
            ouid, matchtype = parsed_match_index
            self.set_user_match_index(ouid, matchtype, value)
            return
        write_json(self._generic_path(key), _wrap_payload(value))

    def invalidate(self, key: str) -> None:
        if key.startswith("ouid:"):
            nickname = key.split(":", 1)[1].strip()
            if not nickname:
                return
            path = Path(ouid_map_path(self.data_base_dir, cache_dir=self.root_dir))
            if not path.exists():
                return
            with _PathFileLock(path):
                try:
                    payload = read_json(path)
                    if not isinstance(payload, dict):
                        return
                    payload.pop(nickname, None)
                    write_json(path, payload)
                except Exception:
                    return
            return

        if key.startswith("match_detail:"):
            path = match_detail_path(key.split(":", 1)[1], self.data_base_dir, cache_dir=self.root_dir)
        else:
            parsed_match_index = _parse_match_index_key(key)
            if parsed_match_index is not None:
                ouid, matchtype = parsed_match_index
                path = user_index_path(ouid, matchtype, self.data_base_dir, cache_dir=self.root_dir)
            else:
                path = self._generic_path(key)

        try:
            os.remove(path)
        except FileNotFoundError:
            return
