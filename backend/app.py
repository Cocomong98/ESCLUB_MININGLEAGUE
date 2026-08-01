from flask import Flask, send_from_directory, jsonify, request, make_response, session
try:
    from flask_compress import Compress
except ModuleNotFoundError:
    class Compress:  # fallback for environments without flask-compress
        def __init__(self, app=None):
            if app is not None:
                self.init_app(app)

        def init_app(self, app):
            return None
import requests
from apscheduler.schedulers.background import BackgroundScheduler
from collections import defaultdict
from contextlib import contextmanager, suppress
from functools import wraps
import time, re, os, json, shutil, hmac, secrets, sys, fcntl, random
from datetime import datetime, timedelta, timezone, time as dt_time

BACKEND_ROOT_EARLY = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT_EARLY = os.path.abspath(os.path.join(BACKEND_ROOT_EARLY, os.pardir))


def load_local_env(path=".env"):
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key in os.environ:
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                    value = value[1:-1]
                os.environ[key] = value
    except OSError as e:
        print(f"[WARN] Failed to load .env: {e}", flush=True)

load_local_env(os.path.join(PROJECT_ROOT_EARLY, ".env"))
load_local_env(os.path.join(BACKEND_ROOT_EARLY, ".env"))
load_local_env()

app = Flask(__name__, static_folder='static', template_folder='.')
BACKEND_ROOT = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_ROOT, os.pardir))
app.config.update(
    SECRET_KEY=os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "0") == "1",
)

# 1. 성능 최적화: Gzip 압축
Compress(app)
app.config['COMPRESS_MIMETYPES'] = ['text/html', 'text/css', 'application/json', 'application/javascript']
app.config['COMPRESS_LEVEL'] = 6
app.config['COMPRESS_MIN_SIZE'] = 500


def resolve_existing_repo_file(primary: str, legacy: str) -> str:
    primary_abs = os.path.join(PROJECT_ROOT, primary)
    if os.path.isfile(primary_abs):
        return primary
    legacy_abs = os.path.join(PROJECT_ROOT, legacy)
    if os.path.isfile(legacy_abs):
        return legacy
    return primary


def repo_path(rel_path: str) -> str:
    return os.path.join(PROJECT_ROOT, rel_path)


def safe_player_image_candidates(spid):
    try:
        full_id = int(spid)
    except (TypeError, ValueError):
        return []
    if full_id <= 0:
        return []
    candidates = [full_id]
    base_id = full_id % 1000000
    if base_id > 0 and base_id != full_id:
        candidates.append(base_id)
    return candidates


def player_image_cache_path(kind, image_id):
    safe_kind = "action" if str(kind).lower() == "action" else "portrait"
    return repo_path(os.path.join(".private", "openapi_cache", "player_images", safe_kind, f"p{image_id}.png"))


# --- 설정 ---
MANAGERS_FILE = resolve_existing_repo_file("config/managers.json", "managers.json")
DATA_BASE_DIR = repo_path(os.environ.get("DATA_BASE_DIR", "public/data"))
SEASON_CONFIG_FILE = resolve_existing_repo_file(
    "public/season_config.json",
    "config/season_config.json",
)
ADMIN_HTML_FILE = resolve_existing_repo_file("backend/admin/admin.html", "admin.html")
ADMIN_PANEL_JS_FILE = resolve_existing_repo_file("backend/admin/admin-panel.js", "admin-panel.js")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()
KST = timezone(timedelta(hours=9))
scheduler = BackgroundScheduler(timezone=KST)
SEASON_NAME_PATTERN = re.compile(r"^\d{4}-\d{1,2}$")
rate_limit_buckets = defaultdict(list)
PRIVATE_LOCK_DIR = repo_path(os.path.join(".private", "locks"))
OPENAPI_JOB_LOCK_FILE = os.path.join(PRIVATE_LOCK_DIR, "openapi.lock")
DAILY_CRAWL_LOCK_FILE = os.path.join(PRIVATE_LOCK_DIR, "daily_crawl.lock")
DAILY_PUBLISH_MARKER_FILE = os.path.join(PRIVATE_LOCK_DIR, "daily_publish_marker.json")

if not ADMIN_PASSWORD:
    print("[WARN] ADMIN_PASSWORD is not set. Admin login will be unavailable.", flush=True)

def ensure_scheduler_running():
    if not scheduler.running:
        scheduler.start()


class OpenApiJobAlreadyRunningError(RuntimeError):
    pass


def _try_acquire_exclusive_lock(lock_path):
    lock_dir = os.path.dirname(lock_path)
    if lock_dir:
        os.makedirs(lock_dir, exist_ok=True)
    lock_fp = open(lock_path, "a+", encoding="utf-8")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_fp
    except BlockingIOError:
        lock_fp.close()
        return None


def _release_lock(lock_fp):
    if not lock_fp:
        return
    with suppress(Exception):
        fcntl.flock(lock_fp, fcntl.LOCK_UN)
    lock_fp.close()


def is_lock_held(lock_path):
    lock_fp = _try_acquire_exclusive_lock(lock_path)
    if not lock_fp:
        return True
    _release_lock(lock_fp)
    return False


def env_int(name, default, *, min_value=1):
    raw = str(os.environ.get(name, "")).strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < min_value:
        return default
    return value


def env_float(name, default, *, min_value=0.0):
    raw = str(os.environ.get(name, "")).strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    if value < min_value:
        return default
    return value


def env_flag(name, default=False):
    raw = str(os.environ.get(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def env_int_in_range(name, default, *, min_value=0, max_value=59):
    raw = str(os.environ.get(name, "")).strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < min_value or value > max_value:
        return default
    return value


ADMIN_SESSION_TTL_MINUTES = env_int("ADMIN_SESSION_TTL_MINUTES", 720, min_value=5)
ADMIN_SESSION_IDLE_MINUTES = env_int("ADMIN_SESSION_IDLE_MINUTES", 120, min_value=5)
DAILY_PUBLISH_HOUR = env_int_in_range("DAILY_PUBLISH_HOUR", 4, min_value=0, max_value=23)
DAILY_PUBLISH_MINUTE = env_int_in_range("DAILY_PUBLISH_MINUTE", 10, min_value=0, max_value=59)
CSP_REPORT_ONLY = env_flag("CSP_REPORT_ONLY", default=False)


def resolve_batch_window_matches(default=200):
    raw = str(os.environ.get("OPENAPI_BATCH_WINDOW_MATCHES", str(default))).strip().lower()
    if raw in {"", "all", "none", "0"}:
        return None
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@contextmanager
def openapi_job_lock():
    lock_fp = _try_acquire_exclusive_lock(OPENAPI_JOB_LOCK_FILE)
    if not lock_fp:
        raise OpenApiJobAlreadyRunningError("OpenAPI job already running")
    try:
        yield
    finally:
        _release_lock(lock_fp)


def resolve_csp_policy(path):
    normalized = str(path or "")
    is_admin_surface = normalized == "/legacy-admin" or normalized == "/legacy-admin-panel.js"

    if is_admin_surface:
        return (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' "
            "https://cdn.tailwindcss.com https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
            "img-src 'self' data: https:; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )

    return (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://api.nepcha.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src 'self' data: https:; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://api.nepcha.com; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )

# 2. 브라우저 캐싱 정책 (Lighthouse 최적화)
@app.after_request
def add_header(response):
    if 'application/json' in response.content_type:
        response.cache_control.no_cache = True
    elif (not response.cache_control.no_cache) and (
        'application/javascript' in response.content_type or 'text/css' in response.content_type
    ):
        response.cache_control.max_age = 2678400 # 31일
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    csp_value = resolve_csp_policy(request.path)
    if CSP_REPORT_ONLY:
        response.headers["Content-Security-Policy-Report-Only"] = csp_value
    else:
        response.headers["Content-Security-Policy"] = csp_value
    return response

# --- 유틸리티 함수 ---
def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"

def consume_rate_limit(bucket_key, max_requests, window_seconds):
    now = time.time()
    bucket = rate_limit_buckets[bucket_key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= max_requests:
        return False
    bucket.append(now)
    return True


def parse_iso_datetime_or_none(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed.astimezone(KST)


def is_admin_session_active(*, touch=False):
    if not session.get("is_admin"):
        return False

    now = datetime.now(KST)
    login_at = parse_iso_datetime_or_none(session.get("login_at"))
    if login_at is None:
        session.clear()
        return False

    if now - login_at > timedelta(minutes=ADMIN_SESSION_TTL_MINUTES):
        session.clear()
        return False

    last_seen = parse_iso_datetime_or_none(session.get("last_seen_at")) or login_at
    if now - last_seen > timedelta(minutes=ADMIN_SESSION_IDLE_MINUTES):
        session.clear()
        return False

    if touch:
        session["last_seen_at"] = now.isoformat()
    return True


def require_admin_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_admin_session_active(touch=True):
            return jsonify({"error": "Unauthorized", "reason": "session_expired"}), 401
        return fn(*args, **kwargs)
    return wrapper

def verify_admin_password(pw):
    if not ADMIN_PASSWORD:
        return False
    if not isinstance(pw, str):
        return False
    return hmac.compare_digest(pw, ADMIN_PASSWORD)

def is_valid_season_name(season):
    if not isinstance(season, str):
        return False
    text = season.strip()
    if not SEASON_NAME_PATTERN.fullmatch(text):
        return False
    year_text, part_text = text.split("-", 1)
    try:
        year = int(year_text)
        part = int(part_text)
    except ValueError:
        return False
    return 2024 <= year <= 2100 and 1 <= part <= 12

def season_dir_path(season):
    if not is_valid_season_name(season):
        raise ValueError("Invalid season name")
    base_dir = os.path.abspath(DATA_BASE_DIR)
    path = os.path.abspath(os.path.join(base_dir, season))
    if not path.startswith(base_dir + os.sep):
        raise ValueError("Invalid season path")
    return path

def resolve_frontend_file(filename):
    search_dirs = [os.path.join(app.root_path, "build"), app.root_path]
    for directory in search_dirs:
        candidate = os.path.join(directory, filename)
        if os.path.isfile(candidate):
            return directory
    return ""

def get_current_season():
    default_season = "2025-5"
    season_config_path = repo_path(SEASON_CONFIG_FILE)
    if not os.path.exists(season_config_path):
        return default_season
    try:
        with open(season_config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        selected = str(config.get("current_season") or "").strip()
        if not selected:
            selected = pick_current_season(config)
        if selected:
            return selected
    except:
        pass
    return default_season

def load_managers():
    managers_path = repo_path(MANAGERS_FILE)
    if not os.path.exists(managers_path): return []
    try:
        with open(managers_path, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        return payload if isinstance(payload, list) else []
    except: return []

def save_managers(data):
    managers_path = repo_path(MANAGERS_FILE)
    managers_dir = os.path.dirname(managers_path)
    if managers_dir:
        os.makedirs(managers_dir, exist_ok=True)
    with open(managers_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def validate_and_normalize_managers(rows):
    if not isinstance(rows, list):
        return None, "managers는 배열이어야 합니다."

    normalized = []
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            return None, f"{idx + 1}번째 항목 형식이 잘못되었습니다."

        name = str(row.get("name", "")).strip()
        joined_at = str(row.get("joined_at", "")).strip()

        if not name:
            return None, f"{idx + 1}번째 항목의 name이 비어 있습니다."
        player_id = extract_manager_player_id({
            "player_id": row.get("player_id"),
        })

        item = {
            "name": name,
        }
        if player_id:
            item["player_id"] = player_id
        if joined_at:
            item["joined_at"] = joined_at
        normalized.append(item)

    return normalized, ""

def season_sort_key(season):
    try:
        year, part = season.split('-')
        return int(year), int(part)
    except:
        return (0, 0)

def sort_seasons_desc(seasons):
    unique = list(set(seasons))
    return sorted(unique, key=season_sort_key, reverse=True)

def load_season_config():
    default = {"current_season": "2025-5", "seasons": [], "season_ranges": {}}
    season_config_path = repo_path(SEASON_CONFIG_FILE)
    if not os.path.exists(season_config_path):
        return default
    try:
        with open(season_config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if "seasons" not in data or not isinstance(data["seasons"], list):
            data["seasons"] = []
        if "season_ranges" not in data or not isinstance(data["season_ranges"], dict):
            data["season_ranges"] = {}
        if "current_season" not in data:
            data["current_season"] = "2025-5"
        return data
    except:
        return default

def save_season_config(config):
    config["seasons"] = sort_seasons_desc(config.get("seasons", []))
    season_config_path = repo_path(SEASON_CONFIG_FILE)
    season_config_dir = os.path.dirname(season_config_path)
    if season_config_dir:
        os.makedirs(season_config_dir, exist_ok=True)
    with open(season_config_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

def season_has_data(season):
    summary_path = os.path.join(DATA_BASE_DIR, season, "current_crawl_display_data.json")
    if not os.path.exists(summary_path):
        return False
    try:
        with open(summary_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return isinstance(data.get("results"), list) and len(data.get("results")) > 0
    except:
        return False

def update_current_season_to_latest_with_data(config):
    selected = pick_current_season(config)
    if selected:
        config["current_season"] = selected
    return config

def yymmdd_to_yyyymmdd(yymmdd):
    if not yymmdd or len(yymmdd) != 6:
        return None
    return f"20{yymmdd[0:2]}-{yymmdd[2:4]}-{yymmdd[4:6]}"

def date_to_yymmdd(date_obj):
    return date_obj.strftime("%y%m%d")

def parse_date_or_none(date_text):
    if not date_text:
        return None
    try:
        return datetime.strptime(date_text, "%Y-%m-%d").date()
    except:
        return None

def parse_time_or_none(time_text):
    if not time_text:
        return None
    if re.match(r"^\d{1,2}$", str(time_text).strip()):
        hour = int(str(time_text).strip())
        if 0 <= hour <= 23:
            return dt_time(hour=hour, minute=0, second=0)
        return None
    try:
        parsed = datetime.strptime(time_text, "%H:%M").time()
        # 시간 단위만 사용(분/초는 버림)
        return dt_time(hour=parsed.hour, minute=0, second=0)
    except:
        return None

def parse_range_datetime(meta):
    start_date = parse_date_or_none(meta.get("startDate") or meta.get("start_date"))
    end_date = parse_date_or_none(meta.get("endDate") or meta.get("end_date"))
    if start_date is None or end_date is None:
        return None, None
    start_time = parse_time_or_none(meta.get("startTime") or meta.get("start_time") or "00:00")
    end_time = parse_time_or_none(meta.get("endTime") or meta.get("end_time") or "23:59")
    if start_time is None or end_time is None:
        return None, None
    # 시간 단위 기준: 시작은 HH:00:00, 종료는 HH:59:59
    start_dt = datetime.combine(
        start_date, dt_time(hour=start_time.hour, minute=0, second=0)
    ).replace(tzinfo=KST)
    end_dt = datetime.combine(
        end_date, dt_time(hour=end_time.hour, minute=59, second=59)
    ).replace(tzinfo=KST)
    return start_dt, end_dt

def build_range_meta(start_dt, end_dt):
    return {
        "startDate": start_dt.strftime("%Y-%m-%d"),
        "startTime": start_dt.strftime("%H:00"),
        "endDate": end_dt.strftime("%Y-%m-%d"),
        "endTime": end_dt.strftime("%H:00")
    }

def validate_season_range_conflict(config, season_name, start_dt, end_dt):
    if end_dt < start_dt:
        return "시작 시각은 종료 시각보다 늦을 수 없습니다."
    for season in config.get("seasons", []):
        if season == season_name:
            continue
        meta = (config.get("season_ranges", {}) or {}).get(season, {})
        other_start, other_end = parse_range_datetime(meta)
        if other_start is None or other_end is None:
            continue
        # [start, end] 구간 충돌 체크
        if not (end_dt < other_start or start_dt > other_end):
            return f"{season} 시즌 기간과 겹칩니다. (기존 종료 이후로 시작하거나 기존 시작 이전으로 종료해야 합니다.)"
    return ""

def pick_active_season_for_datetime(dt):
    config = load_season_config()
    seasons = sort_seasons_desc(config.get("seasons", []))

    in_range = []
    for season in seasons:
        meta = (config.get("season_ranges", {}) or {}).get(season, {})
        start_dt, end_dt = parse_range_datetime(meta)
        if start_dt is None or end_dt is None:
            continue
        if start_dt <= dt <= end_dt:
            in_range.append(season)

    # 기간 겹침 시 최신(후자) 시즌 우선
    if in_range:
        return sort_seasons_desc(in_range)[0]
    return ""

def pick_current_season(config):
    seasons = sort_seasons_desc(config.get("seasons", []))
    with_data = [s for s in seasons if season_has_data(s)]
    if not with_data:
        return seasons[0] if seasons else ""

    season_ranges = config.get("season_ranges", {})
    today = datetime.now(KST).date()

    in_range = []
    for season in with_data:
        meta = season_ranges.get(season, {})
        start_date = parse_date_or_none(meta.get("startDate") or meta.get("start_date"))
        end_date = parse_date_or_none(meta.get("endDate") or meta.get("end_date"))
        if start_date is None or end_date is None:
            continue
        if start_date <= today <= end_date:
            in_range.append(season)

    # 기간이 겹치는 경우 최신(후자) 시즌 우선
    if in_range:
        return sort_seasons_desc(in_range)[0]

    # 오늘 날짜가 포함되는 시즌이 없으면 데이터가 있는 최신 시즌 사용
    return with_data[0]

def build_summary_from_results(results):
    empty = {"구단주명": "-", "지난 시즌 누적채굴량": 0, "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0%", "지난 시즌 판수": 0, "지난 시즌 무": 0}
    mining_king = max(results, key=lambda x: x.get('지난 시즌 누적채굴량', x.get('지난 시즌 채굴 효율', -1)), default=empty)
    win_king = max(results, key=lambda x: float(str(x.get('지난 시즌 승률', '0%')).replace('%','')), default=empty)
    game_king = max(results, key=lambda x: x.get('지난 시즌 판수', -1), default=empty)
    heavy = [r for r in results if r.get('지난 시즌 판수', 0) >= 4000]
    draw_king = min(heavy, key=lambda x: x.get('지난 시즌 무', 9999), default=empty)
    return {
        "results": results,
        "last_updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S"),
        "mining_king": mining_king,
        "win_rate_king": win_king,
        "game_count_king": game_king,
        "draw_king": draw_king
    }

def load_results_by_date(season, date_yymmdd):
    results = []
    user_root = os.path.join(DATA_BASE_DIR, season, "user")
    if not os.path.exists(user_root):
        return results
    for player_id in os.listdir(user_root):
        player_dir = os.path.join(user_root, player_id)
        if not os.path.isdir(player_dir):
            continue
        file_path = os.path.join(player_dir, f"{player_id}_{date_yymmdd}.json")
        if not os.path.exists(file_path):
            continue
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                row = json.load(f)
            if isinstance(row, list) and row:
                results.append(row[0])
        except:
            continue
    return apply_ranking_order(results)

def list_daily_dates_for_season(season):
    dates = set()
    user_root = os.path.join(DATA_BASE_DIR, season, "user")
    if not os.path.isdir(user_root):
        return []
    for player_id in os.listdir(user_root):
        player_dir = os.path.join(user_root, player_id)
        if not os.path.isdir(player_dir):
            continue
        for filename in os.listdir(player_dir):
            match = re.search(r'_(\d{6})\.json$', filename)
            if match:
                dates.add(match.group(1))
    return sorted(dates)

def previous_daily_date(season, current_date_yymmdd):
    candidates = [d for d in list_daily_dates_for_season(season) if d < current_date_yymmdd]
    return candidates[-1] if candidates else None

def to_int_or_default(value, default_value=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default_value

def apply_growth_metric(results, season, current_date_yymmdd):
    prev_date = previous_daily_date(season, current_date_yymmdd)
    if not prev_date:
        for item in results:
            item["전일 대비 채굴량"] = 0
            item["성장력"] = 0
        return results

    prev_results = load_results_by_date(season, prev_date)
    prev_by_player = {}
    for row in prev_results:
        pid = str(row.get("player_id") or row.get("아이디") or "")
        if pid:
            prev_by_player[pid] = row

    for item in results:
        pid = str(item.get("player_id") or item.get("아이디") or "")
        curr_mining = to_int_or_default(item.get("누적채굴량", item.get("채굴 효율")), 0)
        prev_row = prev_by_player.get(pid, {})
        prev_mining = (
            to_int_or_default(prev_row.get("누적채굴량"), curr_mining)
            if "누적채굴량" in prev_row
            else curr_mining
        )
        item["전일 대비 채굴량"] = max(curr_mining - prev_mining, 0)
        item["성장력"] = item["전일 대비 채굴량"]
    return results

def list_all_source_user_files():
    all_files = []
    if not os.path.exists(DATA_BASE_DIR):
        return all_files
    for season in os.listdir(DATA_BASE_DIR):
        user_root = os.path.join(DATA_BASE_DIR, season, "user")
        if not os.path.isdir(user_root):
            continue
        for player_id in os.listdir(user_root):
            player_dir = os.path.join(user_root, player_id)
            if not os.path.isdir(player_dir):
                continue
            for filename in os.listdir(player_dir):
                if re.match(rf"^{re.escape(player_id)}_\d{{6}}(?:_\d{{4}})?\.json$", filename):
                    all_files.append(os.path.join(player_dir, filename))
    return all_files

def split_season_data(target_season, start_dt, end_dt, reset_target=False):
    target_dir = season_dir_path(target_season)
    if reset_target and os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    target_user_dir = os.path.join(target_dir, "user")
    os.makedirs(target_user_dir, exist_ok=True)

    target_dates = set()
    cursor = start_dt.date()
    while cursor <= end_dt.date():
        target_dates.add(date_to_yymmdd(cursor))
        cursor += timedelta(days=1)

    copied_count = 0
    copied_dates = set()
    for src in list_all_source_user_files():
        filename = os.path.basename(src)
        m = re.search(r'_(\d{6})(?:_(\d{4}))?\.json$', filename)
        if not m:
            continue
        yymmdd = m.group(1)
        hhmm = m.group(2) or "2359"
        if yymmdd not in target_dates:
            continue
        file_dt = datetime.strptime(f"{yymmdd}{hhmm}", "%y%m%d%H%M").replace(tzinfo=KST)
        if not (start_dt <= file_dt <= end_dt):
            continue
        player_id = os.path.basename(os.path.dirname(src))
        dst_player_dir = os.path.join(target_user_dir, player_id)
        os.makedirs(dst_player_dir, exist_ok=True)
        dst = os.path.join(dst_player_dir, filename)
        if os.path.abspath(src) == os.path.abspath(dst):
            continue
        shutil.copy2(src, dst)
        copied_dates.add(yymmdd)
        copied_count += 1

    latest_date = max(copied_dates) if copied_dates else None
    if latest_date:
        results = load_results_by_date(target_season, latest_date)
        if results:
            results = apply_growth_metric(results, target_season, latest_date)
            summary = build_summary_from_results(results)
            with open(os.path.join(target_dir, "current_crawl_display_data.json"), 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=4, ensure_ascii=False)
            with open(os.path.join(target_dir, "manifest.json"), 'w', encoding='utf-8') as f:
                json.dump({"endDate": latest_date}, f, ensure_ascii=False)
    return copied_count, latest_date

def atomic_write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def _load_daily_publish_marker():
    if not os.path.exists(DAILY_PUBLISH_MARKER_FILE):
        return {}
    try:
        with open(DAILY_PUBLISH_MARKER_FILE, 'r', encoding='utf-8') as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    return {}


def resolve_daily_publish_policy(now_kst, season):
    gate_dt = now_kst.replace(
        hour=DAILY_PUBLISH_HOUR,
        minute=DAILY_PUBLISH_MINUTE,
        second=0,
        microsecond=0,
    )
    gate_label = f"{DAILY_PUBLISH_HOUR:02d}:{DAILY_PUBLISH_MINUTE:02d}"
    if now_kst < gate_dt:
        return False, f"before_gate({gate_label})"

    marker = _load_daily_publish_marker()
    today = now_kst.strftime("%Y-%m-%d")
    marker_date = str(marker.get("date") or "")
    marker_season = str(marker.get("season") or "")
    if marker_date == today and marker_season == season:
        return False, f"already_published({today}, {season})"
    return True, f"publish_due({today}, {season})"


def mark_daily_publish(now_kst, season):
    payload = {
        "date": now_kst.strftime("%Y-%m-%d"),
        "season": season,
        "publishedAt": now_kst.isoformat(),
        "gate": f"{DAILY_PUBLISH_HOUR:02d}:{DAILY_PUBLISH_MINUTE:02d}",
    }
    atomic_write_json(DAILY_PUBLISH_MARKER_FILE, payload)

def parse_percent_to_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace("%", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None

def parse_club_value_to_krw(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace(" ", "").replace(",", "")

    if "미만" in normalized and "조" in normalized:
        return 999999999999

    m_gyeong = re.fullmatch(r"(\d+)경(?:(\d+)조)?", normalized)
    if m_gyeong:
        gyeong = int(m_gyeong.group(1))
        jo = int(m_gyeong.group(2) or "0")
        return (gyeong * 10000 + jo) * 1000000000000

    m_jo = re.fullmatch(r"(\d+)조", normalized)
    if m_jo:
        jo = int(m_jo.group(1))
        return jo * 1000000000000

    return None

def format_krw_to_gyeong_jo(krw):
    if krw is None:
        return "-"
    if krw < 1000000000000:
        return "1조 미만"
    total_jo = int(krw // 1000000000000)
    if total_jo < 10000:
        return f"{total_jo}조"
    gyeong = total_jo // 10000
    remain_jo = total_jo % 10000
    if remain_jo == 0:
        return f"{gyeong}경"
    return f"{gyeong}경 {remain_jo}조"

def delta_with_reset(end_value, start_value):
    end_v = to_int_or_default(end_value, 0)
    start_v = to_int_or_default(start_value, 0)
    diff = end_v - start_v
    if diff < 0:
        return end_v
    return diff

def extract_manager_player_id(manager):
    if not isinstance(manager, dict):
        return ""

    direct_id = str(manager.get("player_id", "")).strip()
    if direct_id.isdigit():
        return direct_id

    return ""

def run_openapi_update_analysis_for_user(
    season,
    player_id,
    *,
    max_matches=1200,
    window_matches=None,
    refresh_ouid=False,
    nickname_hint=None,
):
    from fconline_openapi.analytics import OpenApiAnalyticsError, build_manager_mode_analysis
    from fconline_openapi.sync import OpenApiSyncError, sync_user_manager_mode

    try:
        sync_report = sync_user_manager_mode(
            season=season,
            player_id=player_id,
            matchtype=52,
            max_matches=max_matches,
            data_base_dir=DATA_BASE_DIR,
            refresh_ouid=refresh_ouid,
            nickname_hint=nickname_hint,
        )
        analysis_report = build_manager_mode_analysis(
            season=season,
            player_id=player_id,
            matchtype=52,
            window_matches=window_matches,
            data_base_dir=DATA_BASE_DIR,
        )
        return {
            "sync": sync_report,
            "analysis": analysis_report,
        }
    except (OpenApiSyncError, OpenApiAnalyticsError):
        raise

def run_openapi_analytics_all(*, season=None):
    season = season or get_current_season()
    managers = load_managers()
    batch_max_matches = env_int("OPENAPI_BATCH_MAX_MATCHES", 300, min_value=1)
    batch_window_matches = resolve_batch_window_matches(default=200)
    delay_min = env_float("OPENAPI_BATCH_DELAY_MIN", 0.15, min_value=0.0)
    delay_max = env_float("OPENAPI_BATCH_DELAY_MAX", 0.35, min_value=0.0)
    if delay_max < delay_min:
        delay_min, delay_max = delay_max, delay_min
    if is_lock_held(DAILY_CRAWL_LOCK_FILE):
        print("[OPENAPI] Daily crawl is running. Skip.", flush=True)
        return {"status": "skipped", "reason": "daily_crawl_running", "season": season}

    try:
        with openapi_job_lock():
            maintenance = {}
            try:
                from fconline_openapi.cache import list_stale_match_ids, purge_stale_cache

                purge_summary = purge_stale_cache(max_age_days=29, data_base_dir=DATA_BASE_DIR)
                maintenance["purge"] = purge_summary
                print(
                    "[OPENAPI] Cache maintenance purge "
                    f"scanned={purge_summary.get('scanned', 0)} "
                    f"deleted={purge_summary.get('deleted', 0)} "
                    f"errors={purge_summary.get('errors', 0)}",
                    flush=True,
                )

                refresh_enabled = os.environ.get("OPENAPI_REFRESH_STALE", "0").strip() == "1"
                if refresh_enabled:
                    from fconline_openapi.client import NexonFconlineClient
                    from fconline_openapi.sync import refresh_stale_match_details

                    stale_ids = list_stale_match_ids(max_age_days=25, data_base_dir=DATA_BASE_DIR)
                    refresh_summary = refresh_stale_match_details(
                        client=NexonFconlineClient(),
                        stale_ids=stale_ids,
                        data_base_dir=DATA_BASE_DIR,
                    )
                    maintenance["refresh"] = refresh_summary
                    print(
                        "[OPENAPI] Cache maintenance refresh "
                        f"stale={refresh_summary.get('staleFound', 0)} "
                        f"selected={refresh_summary.get('selected', 0)} "
                        f"refreshed={refresh_summary.get('refreshed', 0)} "
                        f"errors={refresh_summary.get('errors', 0)} "
                        f"budget={refresh_summary.get('budget', 0)}",
                        flush=True,
                    )
                else:
                    maintenance["refresh"] = {
                        "enabled": False,
                        "reason": "OPENAPI_REFRESH_STALE!=1",
                    }
                    print(
                        "[OPENAPI] Cache maintenance refresh disabled "
                        "(set OPENAPI_REFRESH_STALE=1 to enable)",
                        flush=True,
                    )
            except Exception as exc:
                maintenance["error"] = str(exc)
                print(f"[OPENAPI] Cache maintenance error: {exc}", flush=True)

            if not managers:
                print("[OPENAPI] Skip analytics batch: no managers configured.", flush=True)
                return {
                    "status": "skipped",
                    "reason": "no_managers",
                    "season": season,
                    "maintenance": maintenance,
                }

            print(
                "[OPENAPI] Analytics batch start. "
                f"season={season}, managers={len(managers)}, "
                f"max_matches={batch_max_matches}, window_matches={batch_window_matches or 'all'}, "
                f"delay={delay_min:.2f}~{delay_max:.2f}s",
                flush=True,
            )
            success = 0
            failed = 0
            skipped = 0
            details = []

            for idx, manager in enumerate(managers):
                player_id = extract_manager_player_id(manager)
                if not player_id and not str(manager.get("name") or "").strip():
                    skipped += 1
                    details.append({"status": "skipped", "reason": "nickname_not_found"})
                    print("[OPENAPI] Skip manager: nickname not found.", flush=True)
                    continue

                try:
                    manager_storage_id = player_id or str(manager.get("name") or "").strip()
                    report = run_openapi_update_analysis_for_user(
                        season=season,
                        player_id=manager_storage_id,
                        max_matches=batch_max_matches,
                        window_matches=batch_window_matches,
                        refresh_ouid=False,
                        nickname_hint=manager.get("name"),
                    )
                    success += 1
                    details.append({
                        "status": "success",
                        "player_id": player_id or "legacy-path-pending",
                        "newMatchCount": report["sync"].get("newMatchCount", 0),
                        "actualMatches": report["analysis"].get("actualMatches", 0),
                    })
                    print(
                        f"[OPENAPI] OK nickname={manager.get('name', '')} new={report['sync'].get('newMatchCount', 0)} "
                        f"actual={report['analysis'].get('actualMatches', 0)}",
                        flush=True,
                    )
                except Exception as exc:
                    failed += 1
                    details.append({
                        "status": "failed",
                        "player_id": player_id or "legacy-path-pending",
                        "error": str(exc),
                    })
                    print(f"[OPENAPI] FAIL player_id={player_id}: {exc}", flush=True)

                if idx < len(managers) - 1:
                    time.sleep(random.uniform(delay_min, delay_max))

            summary = {
                "status": "success" if failed == 0 else "partial",
                "season": season,
                "total": len(managers),
                "success": success,
                "failed": failed,
                "skipped": skipped,
                "batchConfig": {
                    "maxMatches": batch_max_matches,
                    "windowMatches": batch_window_matches,
                    "delayMin": delay_min,
                    "delayMax": delay_max,
                },
                "details": details,
                "maintenance": maintenance,
            }
            print(
                f"[OPENAPI] Analytics batch done. success={success}, failed={failed}, skipped={skipped}",
                flush=True,
            )
            return summary
    except OpenApiJobAlreadyRunningError:
        print("[OPENAPI] OpenAPI job already running. Skip.", flush=True)
        return {"status": "skipped", "reason": "openapi_job_running", "season": season}

def previous_configured_season(season):
    seasons = sorted(load_season_config().get("seasons", []), key=season_sort_key)
    previous = ""
    for candidate in seasons:
        if season_sort_key(candidate) < season_sort_key(season):
            previous = candidate
    return previous


def _empty_openapi_record_stats():
    return {
        "승": 0,
        "무": 0,
        "패": 0,
        "판수": 0,
        "누적채굴량": 0,
        "채굴 효율": 0,
        "채굴량 정책": "self_division_win_fc_v1",
        "채굴량 미확정 경기수": 0,
        "채굴 경기수": 0,
        "최근 매치 티어": "",
        "최근 매치 티어 코드": "",
        "최근 매치 티어 이미지": "",
        "승률": "0.0%",
    }


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
DIVISION_IMAGE_INDEX = {
    800: 0,
    900: 1,
    1000: 2,
    1100: 3,
    1200: 4,
    1300: 5,
    1400: 6,
    1500: 7,
    1600: 8,
    1700: 6,
    1800: 7,
    1900: 8,
    2000: 9,
    2100: 10,
    2200: 11,
    2300: 12,
    2400: 13,
    2500: 14,
    2600: 15,
    2700: 16,
    2800: 17,
    2900: 18,
    3000: 19,
    3100: 20,
}


def _division_image_from_code(division):
    try:
        code = int(division)
    except (TypeError, ValueError):
        return ""
    image_index = DIVISION_IMAGE_INDEX.get(code)
    if image_index is None:
        return ""
    return f"https://ssl.nexon.com/s2/game/fo4/obt/rank/large/update_2026/ico_rank{image_index}.png"


def _division_name_from_code(division, division_name_map):
    try:
        code = int(division)
    except (TypeError, ValueError):
        return ""
    if code <= 0:
        return ""
    key = str(code)
    return division_name_map.get(key) or DIVISION_NAME_FALLBACK.get(key, "")


def is_rankable_result(row):
    games = to_int_or_default(row.get("판수"), 0)
    recent_tier_code = str(row.get("최근 매치 티어 코드") or "").strip()
    recent_tier_image = str(row.get("최근 매치 티어 이미지") or "").strip()
    return games > 0 and bool(recent_tier_code or recent_tier_image)


def apply_ranking_order(results):
    ranked = [item for item in results if is_rankable_result(item)]
    unranked = [item for item in results if not is_rankable_result(item)]

    def sort_key(item):
        return to_int_or_default(item.get("누적채굴량", item.get("채굴 효율")), 0)

    ranked.sort(key=sort_key, reverse=True)
    unranked.sort(key=sort_key, reverse=True)
    for i, item in enumerate(ranked):
        item["순위"] = i + 1
    for item in unranked:
        item.pop("순위", None)
    return ranked + unranked


def _mining_fc_for_match(division, result):
    if str(result or "").strip() != "승":
        return 0, False
    try:
        division_code = int(division)
    except (TypeError, ValueError):
        return 0, True
    if division_code in MINING_FC_BY_DIVISION_WIN:
        return MINING_FC_BY_DIVISION_WIN[division_code], False
    return 0, True


def _stats_payload_from_counts(w, d, l, *, cumulative_mining=0, unknown_policy_matches=0, mining_matches=0, latest_division=None, latest_division_name=""):
    games = int(w) + int(d) + int(l)
    win_rate = (int(w) / games * 100.0) if games > 0 else 0.0
    mining = int(cumulative_mining)
    return {
        "승": int(w),
        "무": int(d),
        "패": int(l),
        "판수": games,
        "누적채굴량": mining,
        "채굴 효율": mining,
        "채굴량 정책": MINING_POLICY_VERSION,
        "채굴량 미확정 경기수": int(unknown_policy_matches),
        "채굴 경기수": int(mining_matches),
        "최근 매치 티어": latest_division_name or "",
        "최근 매치 티어 코드": "" if latest_division is None else str(latest_division),
        "최근 매치 티어 이미지": _division_image_from_code(latest_division),
        "승률": f"{win_rate:.1f}%",
    }


def _openapi_record_stats_from_cache(cache, ouid, season):
    from fconline_openapi.analytics import (
        _load_meta_maps,
        _parse_match_date_to_kst,
        _resolve_season_range_kst,
        extract_side,
    )

    try:
        season_start, season_end = _resolve_season_range_kst(str(season), DATA_BASE_DIR)
    except Exception:
        return _empty_openapi_record_stats()

    _spid_name_map, _spposition_name_map, _seasonid_name_map, _seasonimg_map, division_name_map = _load_meta_maps(cache)
    match_ids = cache.get_user_match_index(str(ouid), 52) or []
    w = d = l = 0
    cumulative_mining = 0
    unknown_policy_matches = 0
    mining_matches = 0
    latest_date = None
    latest_division = None
    latest_division_name = ""
    for match_id in match_ids:
        detail = cache.get_match_detail(match_id)
        if not isinstance(detail, dict):
            continue
        date_kst = _parse_match_date_to_kst(detail.get("matchDate"))
        if date_kst is None or date_kst < season_start or date_kst > season_end:
            continue
        my, _opp = extract_side(detail, str(ouid))
        if not my:
            continue
        result = str((my.get("matchDetail") or {}).get("matchResult") or "").strip()
        if result == "승":
            w += 1
        elif result == "무":
            d += 1
        elif result == "패":
            l += 1
        division = my.get("division")
        mining_fc, unknown_policy = _mining_fc_for_match(division, result)
        cumulative_mining += mining_fc
        if mining_fc > 0:
            mining_matches += 1
        if unknown_policy:
            unknown_policy_matches += 1
        if latest_date is None or date_kst > latest_date:
            latest_date = date_kst
            try:
                latest_division = int(division)
            except (TypeError, ValueError):
                latest_division = None
            latest_division_name = _division_name_from_code(latest_division, division_name_map)
    return _stats_payload_from_counts(
        w,
        d,
        l,
        cumulative_mining=cumulative_mining,
        unknown_policy_matches=unknown_policy_matches,
        mining_matches=mining_matches,
        latest_division=latest_division,
        latest_division_name=latest_division_name,
    )


def _openapi_manager_record_payload(m, season, player_id):
    from fconline_openapi.cache import JsonFileCache
    from fconline_openapi.sync import sync_user_manager_mode

    max_matches = env_int("OPENAPI_CRAWL_MAX_MATCHES", 1200, min_value=1)
    sync_report = sync_user_manager_mode(
        season=season,
        player_id=player_id,
        matchtype=52,
        max_matches=max_matches,
        data_base_dir=DATA_BASE_DIR,
        refresh_ouid=False,
        nickname_hint=m.get("name"),
        backfill_to_max=True,
    )
    cache = JsonFileCache(data_base_dir=DATA_BASE_DIR)
    current = _openapi_record_stats_from_cache(cache, sync_report["ouid"], season)

    previous_season = previous_configured_season(season)
    previous = _empty_openapi_record_stats()
    if previous_season:
        previous = _openapi_record_stats_from_cache(cache, sync_report["ouid"], previous_season)

    return {
        **current,
        "지난 시즌 승": previous["승"],
        "지난 시즌 무": previous["무"],
        "지난 시즌 패": previous["패"],
        "지난 시즌 판수": previous["판수"],
        "지난 시즌 누적채굴량": previous["누적채굴량"],
        "지난 시즌 채굴 효율": previous["누적채굴량"],
        "지난 시즌 승률": previous["승률"],
        "openapi_sync": {
            "ouid": sync_report.get("ouid"),
            "newMatchCount": sync_report.get("newMatchCount", 0),
            "totalIndexCount": sync_report.get("totalIndexCount", 0),
            "maxMatches": max_matches,
        },
    }


def _snapshot_club_value_text(season, player_id):
    path = os.path.join(DATA_BASE_DIR, str(season), "user", str(player_id), "analysis", "squad_snapshot.json")
    if not os.path.isfile(path):
        return _known_club_value_text(season, player_id)
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        text = str(((payload.get("squad") or {}).get("clubValueText")) or "").strip()
        if text and text not in {"-", "0"}:
            return text
    except Exception:
        pass
    return _known_club_value_text(season, player_id)


def _valid_club_value_text(value):
    text = str(value or "").strip()
    return text if text and text not in {"-", "0", "0조"} else ""


def _known_club_value_text(season, player_id):
    summary_path = os.path.join(DATA_BASE_DIR, str(season), "current_crawl_display_data.json")
    try:
        with open(summary_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        for row in payload.get("results", []):
            if str(row.get("player_id") or "") == str(player_id):
                text = _valid_club_value_text(row.get("구단 가치"))
                if text:
                    return text
    except Exception:
        pass

    user_dir = os.path.join(DATA_BASE_DIR, str(season), "user", str(player_id))
    if os.path.isdir(user_dir):
        candidates = []
        for filename in os.listdir(user_dir):
            if re.match(rf"^{re.escape(str(player_id))}_\d{{6}}(?:_\d{{4}})?\.json$", filename):
                candidates.append(filename)
        for filename in sorted(candidates, reverse=True):
            try:
                with open(os.path.join(user_dir, filename), "r", encoding="utf-8") as f:
                    payload = json.load(f)
                row = payload[0] if isinstance(payload, list) and payload else payload
                if isinstance(row, dict):
                    text = _valid_club_value_text(row.get("구단 가치"))
                    if text:
                        return text
            except Exception:
                continue
    return "0"


# --- [핵심] OpenAPI 전용 수집 로직 ---
def _crawl_single_manager_api(m, season):
    player_id = extract_manager_player_id(m) or str(m.get("name") or "").strip()
    if not player_id:
        return {"error": "nickname_not_found"}
    res = {
        "name": m.get('name', ''), "player_id": player_id,
        "구단주명": m.get('name', ''), **_empty_openapi_record_stats(),
        "구단 가치": _snapshot_club_value_text(season, player_id), "비고": "-", "지난 시즌 승": 0, "지난 시즌 무": 0, "지난 시즌 패": 0,
        "지난 시즌 판수": 0, "지난 시즌 누적채굴량": 0, "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0.0%",
        "crawl_time": datetime.now(KST).strftime("%Y-%m-%d"),
        "record_source": "nexon_open_api",
    }
    try:
        res.update(_openapi_manager_record_payload(m, season, player_id))
    except Exception as e:
        res["error"] = str(e)
        return res
    res["구단 가치"] = _snapshot_club_value_text(season, player_id)
    return res


def classify_openapi_collection_error(error):
    text = str(error or "")
    lowered = text.lower()
    if "nickname_not_found" in text:
        return "nickname_not_found", False
    if "ouid 조회 실패" in text or "nickname 후보" in text:
        return "ouid_lookup_failed", False
    if "match index 캐시" in text:
        return "match_index_missing", False
    retry_markers = [
        "timeout",
        "timed out",
        "connection",
        "temporar",
        "429",
        "500",
        "502",
        "503",
        "504",
        "rate limit",
    ]
    if any(marker in lowered for marker in retry_markers):
        return "transient_network", True
    return "openapi_error", False


def write_collection_run_log(kind, payload):
    log_dir = repo_path(os.path.join(".private", "run_logs"))
    os.makedirs(log_dir, exist_ok=True)
    run_id = payload.get("runId") or datetime.now(KST).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(log_dir, f"{kind}_{run_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return path


def run_full_crawl(*, now_kst=None, season=None, publish_daily_outputs=True):
    now_kst = now_kst or datetime.now(KST)
    started_perf = time.perf_counter()
    run_id = now_kst.strftime("%Y%m%d_%H%M%S")
    season = season or get_current_season()
    managers = load_managers()
    if not managers:
        print("[CRAWL] Skip: no managers configured.", flush=True)
        return {
            "status": "skipped",
            "reason": "no_managers",
            "season": season,
            "publishDailyOutputs": publish_daily_outputs,
        }
    print(f"[{now_kst}] --- OpenAPI 수집 시작 ---", flush=True)
    results = []
    details = []
    max_attempts = env_int("OPENAPI_CRAWL_MAX_ATTEMPTS", 2, min_value=1)
    for idx, m in enumerate(managers, start=1):
        manager_name = str(m.get("name") or "")
        player_id = extract_manager_player_id(m) or manager_name
        if not player_id:
            details.append({
                "status": "skipped",
                "managerName": manager_name,
                "errorType": "nickname_not_found",
                "retryable": False,
                "attempts": 0,
            })
            print(f"[CRAWL] SKIP {idx}/{len(managers)} name={manager_name} reason=nickname_not_found", flush=True)
            continue

        item_started = time.perf_counter()
        last_error = ""
        last_error_type = ""
        last_retryable = False
        for attempt in range(1, max_attempts + 1):
            res = _crawl_single_manager_api(m, season)
            if "error" not in res:
                results.append(res)
                duration = round(time.perf_counter() - item_started, 3)
                details.append({
                    "status": "success",
                    "player_id": player_id,
                    "managerName": res.get("구단주명") or manager_name,
                    "attempts": attempt,
                    "durationSec": duration,
                    "games": res.get("판수", 0),
                    "cumulativeMining": res.get("누적채굴량", 0),
                    "latestDivision": res.get("최근 매치 티어", ""),
                })
                print(f"[CRAWL] OK {idx}/{len(managers)} player_id={player_id} attempts={attempt} duration={duration}s", flush=True)
                break

            last_error = str(res.get("error") or "unknown_error")
            last_error_type, last_retryable = classify_openapi_collection_error(last_error)
            if not last_retryable or attempt >= max_attempts:
                duration = round(time.perf_counter() - item_started, 3)
                details.append({
                    "status": "failed",
                    "player_id": player_id,
                    "managerName": manager_name,
                    "attempts": attempt,
                    "durationSec": duration,
                    "errorType": last_error_type,
                    "retryable": last_retryable,
                    "error": last_error,
                })
                print(
                    f"[CRAWL] FAIL {idx}/{len(managers)} player_id={player_id} "
                    f"type={last_error_type} retryable={last_retryable} attempts={attempt} duration={duration}s",
                    flush=True,
                )
                break
            time.sleep(env_float("OPENAPI_CRAWL_RETRY_DELAY_SEC", 0.25, min_value=0.0))
    results = apply_ranking_order(results)
    results = apply_growth_metric(results, season, now_kst.strftime('%y%m%d'))
    ampm = "오전" if now_kst.hour < 12 else "오후"
    hour12 = now_kst.hour % 12 or 12
    for item in results:
        item["crawl_time"] = now_kst.strftime("%Y-%m-%d")
        item["crawl_time_detail"] = f"{now_kst.strftime('%Y-%m-%d')} {ampm} {hour12}시"
        item["crawl_time_hhmm"] = now_kst.strftime("%H:%M")
    
    # 파일 저장
    s_dir = os.path.join(DATA_BASE_DIR, season)
    u_dir = os.path.join(s_dir, "user")
    if not os.path.exists(u_dir): os.makedirs(u_dir)
    d_str = now_kst.strftime('%y%m%d')
    t_str = now_kst.strftime('%H%M')
    for item in results:
        p_path = os.path.join(u_dir, item['player_id'])
        if not os.path.exists(p_path): os.makedirs(p_path)
        # 시간 단위 스냅샷 파일 (예: 260201_1500)
        with open(os.path.join(p_path, f"{item['player_id']}_{d_str}_{t_str}.json"), 'w', encoding='utf-8') as f:
            json.dump([item], f, indent=4, ensure_ascii=False)
        if publish_daily_outputs:
            # 기존 클라이언트 호환용 일 단위 최신 파일
            with open(os.path.join(p_path, f"{item['player_id']}_{d_str}.json"), 'w', encoding='utf-8') as f:
                json.dump([item], f, indent=4, ensure_ascii=False)

    if publish_daily_outputs and results:
        empty = {"구단주명": "-", "지난 시즌 누적채굴량": 0, "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0%", "지난 시즌 판수": 0, "지난 시즌 무": 0}
        mining_king = max(results, key=lambda x: x.get('지난 시즌 누적채굴량', x.get('지난 시즌 채굴 효율', -1)), default=empty)
        win_king = max(results, key=lambda x: float(str(x.get('지난 시즌 승률', '0%')).replace('%','')), default=empty)
        game_king = max(results, key=lambda x: x.get('지난 시즌 판수', -1), default=empty)
        heavy = [r for r in results if r.get('지난 시즌 판수', 0) >= 4000]
        draw_king = min(heavy, key=lambda x: x.get('지난 시즌 무', 9999), default=empty)
        summary = {
            "results": results,
            "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
            "mining_king": mining_king,
            "win_rate_king": win_king,
            "game_count_king": game_king,
            "draw_king": draw_king
        }
        with open(os.path.join(s_dir, "current_crawl_display_data.json"), 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=4, ensure_ascii=False)
        with open(os.path.join(s_dir, "manifest.json"), 'w', encoding='utf-8') as f:
            json.dump({"endDate": d_str, "endDateTime": f"{d_str}_{t_str}"}, f, ensure_ascii=False)
        mark_daily_publish(now_kst, season)
        print("[CRAWL] 갱신 완료 (daily publish + hourly snapshot).", flush=True)
    elif publish_daily_outputs:
        print("[CRAWL] Daily publish skipped: no successful crawl rows.", flush=True)
    else:
        print("[CRAWL] 갱신 완료 (hourly snapshot only).", flush=True)
    success_count = len([row for row in details if row.get("status") == "success"])
    failed_count = len([row for row in details if row.get("status") == "failed"])
    skipped_count = len([row for row in details if row.get("status") == "skipped"])
    duration_sec = round(time.perf_counter() - started_perf, 3)
    run_log_payload = {
        "runId": run_id,
        "startedAt": now_kst.isoformat(),
        "finishedAt": datetime.now(KST).isoformat(),
        "durationSec": duration_sec,
        "season": season,
        "total": len(managers),
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "publishDailyOutputs": publish_daily_outputs,
        "date": d_str,
        "time": t_str,
        "details": details,
    }
    log_path = write_collection_run_log("openapi_collection", run_log_payload)
    print(
        f"[CRAWL] OpenAPI collection done. success={success_count}, failed={failed_count}, "
        f"skipped={skipped_count}, duration={duration_sec}s",
        flush=True,
    )
    return {
        "status": "success" if failed_count == 0 else "partial",
        "season": season,
        "results": len(results),
        "total": len(managers),
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "publishDailyOutputs": publish_daily_outputs,
        "date": d_str,
        "time": t_str,
        "durationSec": duration_sec,
        "details": details,
        "logPath": log_path,
    }


def run_daily_crawl_then_openapi():
    crawl_lock = _try_acquire_exclusive_lock(DAILY_CRAWL_LOCK_FILE)
    if not crawl_lock:
        print("[CRAWL] Daily crawl already running. Skip.", flush=True)
        return {"status": "skipped", "reason": "daily_crawl_running"}
    try:
        now_kst = datetime.now(KST)
        season = get_current_season()
        # The scheduled crawl is the production refresh pipeline. Publish its
        # latest successful results on every run so the UI never trails the
        # user-level snapshots produced by the same chain.
        publish_daily_outputs = True
        publish_reason = "scheduled_chain_refresh"
        print(
            "[CRAWL] Chain start. "
            f"season={season}, publishDailyOutputs={publish_daily_outputs}, reason={publish_reason}",
            flush=True,
        )
        crawl_report = run_full_crawl(
            now_kst=now_kst,
            season=season,
            publish_daily_outputs=publish_daily_outputs,
        )
    finally:
        _release_lock(crawl_lock)
    openapi_report = run_openapi_analytics_all(season=season)
    return {"crawl": crawl_report, "openapi": openapi_report}


def run_daily_crawl_only():
    crawl_lock = _try_acquire_exclusive_lock(DAILY_CRAWL_LOCK_FILE)
    if not crawl_lock:
        print("[CRAWL] Daily crawl already running. Skip.", flush=True)
        return {"status": "skipped", "reason": "daily_crawl_running"}
    try:
        now_kst = datetime.now(KST)
        season = get_current_season()
        publish_daily_outputs, publish_reason = resolve_daily_publish_policy(now_kst, season)
        print(
            "[CRAWL] Single run. "
            f"season={season}, publishDailyOutputs={publish_daily_outputs}, reason={publish_reason}",
            flush=True,
        )
        return run_full_crawl(
            now_kst=now_kst,
            season=season,
            publish_daily_outputs=publish_daily_outputs,
        )
    finally:
        _release_lock(crawl_lock)

# --- 라우팅 (순서가 매우 중요함) ---

def normalize_data_filename(filename):
    text = str(filename or "").replace("\\", "/")
    text = re.sub(r"/+", "/", text)
    while text.startswith("./"):
        text = text[2:]
    return text.lstrip("/")


def is_blocked_data_filename(filename):
    safe = normalize_data_filename(filename)
    lowered = safe.lower()
    if lowered.startswith("openapi_cache/"):
        return True
    if lowered.startswith("."):
        return True
    if "/." in lowered:
        return True
    if lowered.endswith(".lock"):
        return True
    if lowered.startswith("_private/") or lowered.startswith(".private/"):
        return True
    return False


# 1. 데이터 직접 서빙
@app.route('/data/<path:filename>')
def serve_data(filename):
    safe_filename = normalize_data_filename(filename)
    if is_blocked_data_filename(safe_filename):
        return jsonify({"error": "Not found"}), 404
    res = make_response(send_from_directory(DATA_BASE_DIR, safe_filename))
    res.cache_control.no_cache = True
    return res

@app.route('/season_config.json')
def serve_season_config():
    season_config_abs = repo_path(SEASON_CONFIG_FILE)
    build_dir = os.path.join(app.root_path, "build")
    if os.path.isfile(season_config_abs):
        directory = os.path.dirname(season_config_abs)
        filename = os.path.basename(season_config_abs)
    elif os.path.isfile(os.path.join(build_dir, "season_config.json")):
        directory = build_dir
        filename = "season_config.json"
    else:
        return jsonify({"error": "season_config.json not found"}), 404
    res = make_response(send_from_directory(directory, filename))
    res.cache_control.no_cache = True
    return res

@app.route('/manifest.json')
def serve_web_manifest():
    directory = resolve_frontend_file("manifest.json")
    if not directory:
        return jsonify({"error": "manifest.json not found"}), 404
    res = make_response(send_from_directory(directory, "manifest.json"))
    res.cache_control.no_cache = True
    return res

@app.route('/api/player-image/<int:spid>')
def get_player_image(spid):
    kind = "action" if request.args.get("kind") == "action" else "portrait"
    folder = "playersAction" if kind == "action" else "players"
    for image_id in safe_player_image_candidates(spid):
        cache_path = player_image_cache_path(kind, image_id)
        if os.path.isfile(cache_path):
            with open(cache_path, "rb") as f:
                response = make_response(f.read())
            response.headers["Content-Type"] = "image/png"
            response.headers["Cache-Control"] = "public, max-age=604800"
            return response

        url = f"https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/{folder}/p{image_id}.png"
        try:
            remote = requests.get(url, timeout=8)
        except requests.RequestException:
            continue
        content_type = (remote.headers.get("Content-Type") or "").lower()
        if remote.status_code != 200 or "image" not in content_type or not remote.content:
            continue
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        try:
            with open(cache_path, "wb") as f:
                f.write(remote.content)
        except OSError:
            pass
        response = make_response(remote.content)
        response.headers["Content-Type"] = "image/png"
        response.headers["Cache-Control"] = "public, max-age=604800"
        return response

    return jsonify({"error": "player image not found", "spId": spid, "kind": kind}), 404


# 3. Legacy 관리자 페이지. React /admin 라우트와 충돌하지 않도록 분리한다.
@app.route('/legacy-admin')
def legacy_admin_page():
    admin_html_abs = repo_path(ADMIN_HTML_FILE)
    if not os.path.isfile(admin_html_abs):
        return jsonify({"error": "admin.html not found"}), 404
    directory = os.path.dirname(admin_html_abs)
    filename = os.path.basename(admin_html_abs)
    res = make_response(send_from_directory(directory, filename))
    res.cache_control.no_cache = True
    res.cache_control.no_store = True
    res.cache_control.must_revalidate = True
    return res


@app.route('/legacy-admin-panel.js')
def legacy_admin_panel_script():
    panel_abs = repo_path(ADMIN_PANEL_JS_FILE)
    if not os.path.isfile(panel_abs):
        return jsonify({"error": "admin-panel.js not found"}), 404
    directory = os.path.dirname(panel_abs)
    filename = os.path.basename(panel_abs)
    res = make_response(send_from_directory(directory, filename))
    res.cache_control.no_cache = True
    res.cache_control.no_store = True
    res.cache_control.must_revalidate = True
    return res


# 4. 관리자 API
@app.route('/api/login', methods=['POST'])
def api_login():
    ip = get_client_ip()
    if not consume_rate_limit(f"login:{ip}", max_requests=10, window_seconds=300):
        return jsonify({"error": "Too many login attempts. Try again later."}), 429

    body = request.get_json(silent=True) or {}
    pw = body.get("pw", "")
    if not verify_admin_password(pw):
        return jsonify({"error": "Unauthorized"}), 401

    session.clear()
    session["is_admin"] = True
    now_iso = datetime.now(KST).isoformat()
    session["login_at"] = now_iso
    session["last_seen_at"] = now_iso
    return jsonify({"status": "success"})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"status": "success"})

@app.route('/api/session', methods=['GET'])
def api_session():
    return jsonify({"authenticated": is_admin_session_active(touch=True)})

@app.route('/api/managers', methods=['GET', 'POST'])
@require_admin_auth
def api_managers():
    body = request.get_json(silent=True) or {}
    if request.method == 'GET':
        return jsonify(load_managers())
    normalized, error_message = validate_and_normalize_managers(body.get('managers', []))
    if error_message:
        return jsonify({"message": error_message}), 400
    save_managers(normalized)
    return jsonify({"status": "success"})

@app.route('/api/seasons', methods=['GET', 'POST'])
@require_admin_auth
def api_seasons():
    body = request.get_json(silent=True) or {}

    if request.method == 'GET':
        config = load_season_config()
        seasons = sort_seasons_desc(config.get("seasons", []))
        season_ranges = config.get("season_ranges", {})
        payload = []
        for season in seasons:
            meta = season_ranges.get(season, {})
            has_data = season_has_data(season)
            payload.append({
                "season": season,
                "startDate": meta.get("startDate"),
                "startTime": meta.get("startTime"),
                "endDate": meta.get("endDate"),
                "endTime": meta.get("endTime"),
                "status": "ready" if has_data else "empty",
                "hasData": has_data
            })
        return jsonify(payload)

    season = str(body.get("season", "")).strip()
    if not is_valid_season_name(season):
        return jsonify({"message": "season 형식이 유효하지 않습니다. (예: 2026-1)"}), 400
    start_date = parse_date_or_none(body.get("startDate"))
    start_time = parse_time_or_none(body.get("startTime") or "00:00")
    end_date = parse_date_or_none(body.get("endDate"))
    end_time = parse_time_or_none(body.get("endTime") or "23:59")
    if not season or start_date is None or end_date is None or start_time is None or end_time is None:
        return jsonify({"message": "season, startDate, startTime, endDate, endTime이 필요합니다."}), 400
    start_dt = datetime.combine(
        start_date, dt_time(hour=start_time.hour, minute=0, second=0)
    ).replace(tzinfo=KST)
    end_dt = datetime.combine(
        end_date, dt_time(hour=end_time.hour, minute=59, second=59)
    ).replace(tzinfo=KST)

    config = load_season_config()
    conflict_msg = validate_season_range_conflict(config, season, start_dt, end_dt)
    if conflict_msg:
        return jsonify({"message": conflict_msg}), 400

    season_exists = season in config["seasons"]
    copied_count, latest_date = split_season_data(
        season, start_dt, end_dt, reset_target=season_exists
    )
    if season not in config["seasons"]:
        config["seasons"].append(season)
    config["season_ranges"][season] = build_range_meta(start_dt, end_dt)
    config = update_current_season_to_latest_with_data(config)
    save_season_config(config)

    if copied_count == 0:
        return jsonify({
            "status": "warning",
            "message": "시즌은 생성되었지만 해당 기간의 데이터 파일이 없어 비어 있습니다.",
            "season": season
        }), 200

    return jsonify({
        "status": "success",
        "message": f"{season} 시즌 생성 완료 ({copied_count}개 파일, 최신일 {yymmdd_to_yyyymmdd(latest_date)})",
        "season": season
    })

@app.route('/api/seasons/split', methods=['POST'])
def api_seasons_split():
    # /api/seasons 와 동일 동작을 유지해 admin 클라이언트와 하위 호환.
    return api_seasons()

@app.route('/api/seasons/<season>', methods=['PUT'])
@require_admin_auth
def api_update_season(season):
    if not is_valid_season_name(season):
        return jsonify({"message": "season 형식이 유효하지 않습니다. (예: 2026-1)"}), 400
    body = request.get_json(silent=True) or {}

    start_date = parse_date_or_none(body.get("startDate"))
    start_time = parse_time_or_none(body.get("startTime") or "00:00")
    end_date = parse_date_or_none(body.get("endDate"))
    end_time = parse_time_or_none(body.get("endTime") or "23:59")
    if start_date is None or end_date is None or start_time is None or end_time is None:
        return jsonify({"message": "startDate, startTime, endDate, endTime이 필요합니다."}), 400
    start_dt = datetime.combine(
        start_date, dt_time(hour=start_time.hour, minute=0, second=0)
    ).replace(tzinfo=KST)
    end_dt = datetime.combine(
        end_date, dt_time(hour=end_time.hour, minute=59, second=59)
    ).replace(tzinfo=KST)

    config = load_season_config()
    conflict_msg = validate_season_range_conflict(config, season, start_dt, end_dt)
    if conflict_msg:
        return jsonify({"message": conflict_msg}), 400

    copied_count, latest_date = split_season_data(
        season, start_dt, end_dt, reset_target=True
    )
    if season not in config["seasons"]:
        config["seasons"].append(season)
    config["season_ranges"][season] = build_range_meta(start_dt, end_dt)
    config = update_current_season_to_latest_with_data(config)
    save_season_config(config)

    if copied_count == 0:
        return jsonify({
            "status": "warning",
            "message": f"{season} 기간은 수정되었지만 해당 범위의 데이터가 없습니다.",
            "season": season
        }), 200

    return jsonify({
        "status": "success",
        "message": f"{season} 시즌 기간 수정 완료 ({copied_count}개 파일, 최신일 {yymmdd_to_yyyymmdd(latest_date)})",
        "season": season
    })

# 5. 캐치올 (맨 마지막)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    build_dir = os.path.join(app.root_path, "build")
    build_root = os.path.abspath(build_dir)
    if path:
        requested = os.path.abspath(os.path.join(build_dir, path))
        if requested.startswith(build_root + os.sep) and os.path.isfile(requested):
            return send_from_directory(build_dir, path)

    index_in_build = os.path.join(build_dir, "index.html")
    if os.path.isfile(index_in_build):
        return send_from_directory(build_dir, "index.html")

    fallback_index = os.path.join(app.root_path, "index.html")
    if os.path.isfile(fallback_index):
        return send_from_directory(app.root_path, "index.html")
    return jsonify({"error": "Frontend not found"}), 404

if __name__ == '__main__':
    if len(sys.argv) >= 2:
        cmd = sys.argv[1].strip().lower()
        if cmd == "openapi-security-selfcheck":
            usage = (
                "Usage: python app.py openapi-security-selfcheck "
                "--season <YYYY-N> --id <PLAYER_ID>"
            )
            args = sys.argv[2:]

            def read_arg_value(flag):
                if flag not in args:
                    return None
                idx = args.index(flag)
                if idx + 1 >= len(args):
                    raise SystemExit(usage)
                value = args[idx + 1].strip()
                if not value:
                    raise SystemExit(usage)
                return value

            season = read_arg_value("--season")
            player_id = read_arg_value("--id")
            if not season or not player_id:
                raise SystemExit(usage)

            probe_dir = os.path.join(DATA_BASE_DIR, "openapi_cache")
            probe_file = os.path.join(probe_dir, "_probe.txt")
            probe_created = False
            probe_error = None
            try:
                os.makedirs(probe_dir, exist_ok=True)
                with open(probe_file, "w", encoding="utf-8") as f:
                    f.write("probe")
                probe_created = True
            except Exception as exc:
                probe_error = str(exc)

            analysis_rel = f"{season}/user/{player_id}/analysis/last200.json"
            analysis_abs = os.path.join(DATA_BASE_DIR, season, "user", player_id, "analysis", "last200.json")

            with app.test_client() as client:
                blocked_resp = client.get("/data/openapi_cache/_probe.txt")
                analysis_resp = client.get(f"/data/{analysis_rel}")

            blocked_ok = blocked_resp.status_code == 404
            analysis_exists = os.path.isfile(analysis_abs)
            if analysis_exists:
                analysis_ok = analysis_resp.status_code == 200
            else:
                analysis_ok = analysis_resp.status_code == 404

            report = {
                "status": "success" if (blocked_ok and analysis_ok) else "failed",
                "blockedProbePath": "/data/openapi_cache/_probe.txt",
                "blockedProbeStatus": blocked_resp.status_code,
                "analysisPath": f"/data/{analysis_rel}",
                "analysisFileExists": analysis_exists,
                "analysisStatus": analysis_resp.status_code,
                "probeCreated": probe_created,
            }
            if probe_error:
                report["probeError"] = probe_error

            print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)

            if probe_created:
                with suppress(Exception):
                    os.remove(probe_file)
                with suppress(Exception):
                    if os.path.isdir(probe_dir) and not os.listdir(probe_dir):
                        os.rmdir(probe_dir)

            raise SystemExit(0 if report["status"] == "success" else 1)

        if cmd == "openapi-migrate-cache":
            try:
                from fconline_openapi.cache import (
                    get_cache_root,
                    get_legacy_cache_root,
                    migrate_legacy_cache_dir,
                )
            except Exception as exc:
                print(f"[OPENAPI] FAIL: import error: {exc}", flush=True)
                raise SystemExit(1)

            try:
                old_path = get_legacy_cache_root(DATA_BASE_DIR)
                target_path = get_cache_root()
                old_exists = os.path.isdir(old_path)
                print(f"[OPENAPI] Legacy cache path: {old_path}", flush=True)
                print(f"[OPENAPI] Legacy cache exists: {old_exists}", flush=True)
                print(f"[OPENAPI] Target cache path: {target_path}", flush=True)
                report = migrate_legacy_cache_dir(data_base_dir=DATA_BASE_DIR)
                print(f"[OPENAPI] Migration action: {report.get('action', 'none')}", flush=True)
                print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
                if report.get("status") in {"success", "skipped"}:
                    raise SystemExit(0)
                raise SystemExit(1)
            except Exception as exc:
                print(f"[OPENAPI] FAIL: {exc}", flush=True)
                raise SystemExit(1)

        if cmd == "openapi-selftest":
            try:
                from fconline_openapi.client import NexonFconlineClient, NexonOpenApiError
            except Exception as exc:
                print(f"[OPENAPI] FAIL: import error: {exc}", flush=True)
                raise SystemExit(1)

            def contains_matchtype_52(payload):
                if isinstance(payload, dict):
                    for key, value in payload.items():
                        key_text = str(key).strip().lower()
                        if key_text in {"matchtype", "match_type"}:
                            try:
                                if int(value) == 52:
                                    return True
                            except (TypeError, ValueError):
                                pass
                        if contains_matchtype_52(value):
                            return True
                    return False
                if isinstance(payload, list):
                    return any(contains_matchtype_52(item) for item in payload)
                return False

            try:
                client = NexonFconlineClient()
                payload = client.get_meta_matchtype()
                if contains_matchtype_52(payload):
                    print("[OPENAPI] OK: meta matchtype reachable and includes 52", flush=True)
                    raise SystemExit(0)
                print("[OPENAPI] FAIL: meta matchtype reachable but 52 not found", flush=True)
                raise SystemExit(1)
            except ValueError as exc:
                print(f"[OPENAPI] FAIL: {exc}", flush=True)
                raise SystemExit(1)
            except NexonOpenApiError as exc:
                print(f"[OPENAPI] FAIL: {exc}", flush=True)
                raise SystemExit(1)
            except Exception as exc:
                print(f"[OPENAPI] FAIL: unexpected error: {exc}", flush=True)
                raise SystemExit(1)

        if cmd == "openapi-sync-user":
            usage = (
                "Usage: python app.py openapi-sync-user "
                "--season <YYYY-N> --id <PLAYER_ID> [--max-matches 1200] [--refresh-ouid]"
            )
            args = sys.argv[2:]

            def read_arg_value(flag):
                if flag not in args:
                    return None
                idx = args.index(flag)
                if idx + 1 >= len(args):
                    raise SystemExit(usage)
                value = args[idx + 1].strip()
                if not value:
                    raise SystemExit(usage)
                return value

            season = read_arg_value("--season")
            player_id = read_arg_value("--id")
            max_matches_raw = read_arg_value("--max-matches") or "1200"
            refresh_ouid = "--refresh-ouid" in args

            if not season or not player_id:
                raise SystemExit(usage)
            try:
                max_matches = int(max_matches_raw)
            except ValueError:
                raise SystemExit(usage)
            if max_matches <= 0:
                raise SystemExit("--max-matches must be >= 1")

            try:
                from fconline_openapi.sync import OpenApiSyncError, sync_user_manager_mode

                if is_lock_held(DAILY_CRAWL_LOCK_FILE):
                    print("OpenAPI job already running", flush=True)
                    raise SystemExit(2)

                try:
                    with openapi_job_lock():
                        report = sync_user_manager_mode(
                            season=season,
                            player_id=player_id,
                            matchtype=52,
                            max_matches=max_matches,
                            data_base_dir=DATA_BASE_DIR,
                            refresh_ouid=refresh_ouid,
                        )
                except OpenApiJobAlreadyRunningError:
                    print("OpenAPI job already running", flush=True)
                    raise SystemExit(2)

                print("[OPENAPI] Sync user completed.", flush=True)
                print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
                raise SystemExit(0)
            except OpenApiSyncError as exc:
                print(f"[OPENAPI] FAIL: {exc}", flush=True)
                raise SystemExit(1)
            except Exception as exc:
                print(f"[OPENAPI] FAIL: unexpected error: {exc}", flush=True)
                raise SystemExit(1)

        if cmd == "openapi-update-analysis":
            usage = (
                "Usage: python app.py openapi-update-analysis "
                "--season <YYYY-N> --id <PLAYER_ID> "
                "[--max-matches 1200] [--window-matches N|all] [--refresh-ouid]"
            )
            args = sys.argv[2:]

            def read_arg_value(flag):
                if flag not in args:
                    return None
                idx = args.index(flag)
                if idx + 1 >= len(args):
                    raise SystemExit(usage)
                value = args[idx + 1].strip()
                if not value:
                    raise SystemExit(usage)
                return value

            season = read_arg_value("--season")
            player_id = read_arg_value("--id")
            max_matches_raw = read_arg_value("--max-matches") or "1200"
            window_matches_raw = read_arg_value("--window-matches") or "all"
            refresh_ouid = "--refresh-ouid" in args

            if not season or not player_id:
                raise SystemExit(usage)
            try:
                max_matches = int(max_matches_raw)
            except ValueError:
                raise SystemExit(usage)
            window_raw = str(window_matches_raw or "").strip().lower()
            if window_raw in {"", "all", "0"}:
                window_matches = None
            else:
                try:
                    window_matches = int(window_raw)
                except ValueError:
                    raise SystemExit(usage)
            if max_matches <= 0:
                raise SystemExit("--max-matches must be >= 1")
            if window_matches is not None and window_matches <= 0:
                raise SystemExit("--window-matches must be >= 1 or 'all'")

            try:
                from fconline_openapi.analytics import OpenApiAnalyticsError
                from fconline_openapi.sync import OpenApiSyncError

                if is_lock_held(DAILY_CRAWL_LOCK_FILE):
                    print("OpenAPI job already running", flush=True)
                    raise SystemExit(2)

                try:
                    with openapi_job_lock():
                        report = run_openapi_update_analysis_for_user(
                            season=season,
                            player_id=player_id,
                            max_matches=max_matches,
                            window_matches=window_matches,
                            refresh_ouid=refresh_ouid,
                        )
                except OpenApiJobAlreadyRunningError:
                    print("OpenAPI job already running", flush=True)
                    raise SystemExit(2)

                print("[OPENAPI] Analysis update completed.", flush=True)
                print(
                    json.dumps(
                        report,
                        ensure_ascii=False,
                        indent=2,
                    ),
                    flush=True,
                )
                raise SystemExit(0)
            except (OpenApiSyncError, OpenApiAnalyticsError) as exc:
                print(f"[OPENAPI] FAIL: {exc}", flush=True)
                raise SystemExit(1)
            except Exception as exc:
                print(f"[OPENAPI] FAIL: unexpected error: {exc}", flush=True)
                raise SystemExit(1)

        raise SystemExit(
            "Unsupported command. Use: "
            "openapi-security-selfcheck | openapi-migrate-cache | openapi-selftest | "
            "openapi-sync-user | openapi-update-analysis"
        )

    # 운영 배치: 짝수시 10분마다 전적 크롤링 -> OpenAPI 분석 순차 실행
    scheduler.add_job(
        func=run_daily_crawl_then_openapi,
        trigger="cron",
        hour="*/2",
        minute=10,
        id="crawl_openapi_chain",
        replace_existing=True,
        coalesce=True,
    )
    ensure_scheduler_running()
    port = int(os.environ.get("PORT", "80"))
    app.run(host='0.0.0.0', port=port, threaded=True)
