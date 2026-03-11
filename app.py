from flask import Flask, render_template, send_from_directory, jsonify, request, make_response, session
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
from bs4 import BeautifulSoup
from apscheduler.schedulers.background import BackgroundScheduler
from collections import defaultdict
from contextlib import contextmanager, suppress
from functools import wraps
import time, re, os, json, shutil, hmac, secrets, sys, fcntl, random
from datetime import datetime, timedelta, timezone, time as dt_time

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

load_local_env()

app = Flask(__name__, static_folder='static', template_folder='.')
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

# --- 설정 ---
MANAGERS_FILE = "managers.json"
DATA_BASE_DIR = "data"
SEASON_CONFIG_FILE = "season_config.json"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()
KST = timezone(timedelta(hours=9))
scheduler = BackgroundScheduler(timezone=KST)
SEASON_NAME_PATTERN = re.compile(r"^\d{4}-\d{1,2}$")
rate_limit_buckets = defaultdict(list)
WEEKLY_SCHEMA_VERSION = "1.0.0"
WEEKLY_MIN_GAMES = 500
WEEKLY_MIN_VALID_DAYS = 5
WEEKLY_IMPUTATION = "none"
WEEKLY_REQUIRE_BOUNDARY_POINTS = True
WEEKLY_LOCK_FILE = os.path.join(DATA_BASE_DIR, ".weekly_report.lock")
WEEKLY_DAILY_CRAWL_HOUR = 4
PRIVATE_LOCK_DIR = os.path.join(app.root_path, ".private", "locks")
OPENAPI_JOB_LOCK_FILE = os.path.join(PRIVATE_LOCK_DIR, "openapi.lock")
DAILY_CRAWL_LOCK_FILE = os.path.join(PRIVATE_LOCK_DIR, "daily_crawl.lock")

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

# 2. 브라우저 캐싱 정책 (Lighthouse 최적화)
@app.after_request
def add_header(response):
    if 'application/json' in response.content_type:
        response.cache_control.no_cache = True
    elif 'application/javascript' in response.content_type or 'text/css' in response.content_type:
        response.cache_control.max_age = 2678400 # 31일
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://unpkg.com https://www.googletagmanager.com https://api.nepcha.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
        "img-src 'self' data: https:; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://api.nepcha.com; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
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

def require_admin_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return jsonify({"error": "Unauthorized"}), 401
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
    if not os.path.exists(SEASON_CONFIG_FILE):
        return default_season
    try:
        with open(SEASON_CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
        selected = pick_current_season(config)
        if selected:
            return selected
    except:
        pass
    return default_season

def load_managers():
    if not os.path.exists(MANAGERS_FILE): return []
    try:
        with open(MANAGERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except: return []

def save_managers(data):
    with open(MANAGERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

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
    if not os.path.exists(SEASON_CONFIG_FILE):
        return default
    try:
        with open(SEASON_CONFIG_FILE, 'r', encoding='utf-8') as f:
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
    with open(SEASON_CONFIG_FILE, 'w', encoding='utf-8') as f:
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
    empty = {"구단주명": "-", "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0%", "지난 시즌 판수": 0, "지난 시즌 무": 0}
    mining_king = max(results, key=lambda x: x.get('지난 시즌 채굴 효율', -1), default=empty)
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
    results.sort(key=lambda x: x.get('채굴 효율', -9999), reverse=True)
    for i, item in enumerate(results):
        item['순위'] = i + 1
    return results

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
        curr_eff = to_int_or_default(item.get("채굴 효율"), 0)
        prev_eff = to_int_or_default(prev_by_player.get(pid, {}).get("채굴 효율"), curr_eff)
        item["성장력"] = curr_eff - prev_eff
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

def build_weekly_window(reference_dt):
    if reference_dt.tzinfo is None:
        reference_dt = reference_dt.replace(tzinfo=KST)
    days_since_thu = (reference_dt.weekday() - 3) % 7
    thursday_date = (reference_dt - timedelta(days=days_since_thu)).date()
    window_end = datetime.combine(thursday_date, dt_time(4, 59, 59)).replace(tzinfo=KST)
    if reference_dt < window_end:
        window_end -= timedelta(days=7)
    window_start = window_end - timedelta(days=7) + timedelta(seconds=1)
    return window_start, window_end

def next_daily_snapshot_at_or_after(dt):
    base = dt.replace(hour=WEEKLY_DAILY_CRAWL_HOUR, minute=0, second=0, microsecond=0)
    if base < dt:
        base += timedelta(days=1)
    return base

def previous_daily_snapshot_at_or_before(dt):
    base = dt.replace(hour=WEEKLY_DAILY_CRAWL_HOUR, minute=0, second=0, microsecond=0)
    if base > dt:
        base -= timedelta(days=1)
    return base

def expected_weekly_snapshot_points(window_start, window_end):
    first = next_daily_snapshot_at_or_after(window_start)
    last = previous_daily_snapshot_at_or_before(window_end)
    if first > last:
        return []
    points = []
    cursor = first
    while cursor <= last:
        points.append(cursor)
        cursor += timedelta(days=1)
    return points

def compute_weekly_segments(window_start, window_end):
    config = load_season_config()
    segments = []
    for season in sort_seasons_desc(config.get("seasons", [])):
        meta = (config.get("season_ranges", {}) or {}).get(season, {})
        season_start, season_end = parse_range_datetime(meta)
        if season_start is None or season_end is None:
            continue
        seg_start = max(window_start, season_start)
        seg_end = min(window_end, season_end)
        if seg_start <= seg_end:
            segments.append({
                "season": season,
                "start": seg_start,
                "end": seg_end,
            })

    if segments:
        return sorted(segments, key=lambda x: x["start"])

    fallback_season = pick_active_season_for_datetime(window_end) or get_current_season()
    return [{
        "season": fallback_season,
        "start": window_start,
        "end": window_end,
    }]

def collect_daily_records_in_range(season, range_start, range_end):
    user_root = os.path.join(DATA_BASE_DIR, season, "user")
    if not os.path.isdir(user_root):
        return []
    records = []
    for player_id in os.listdir(user_root):
        player_dir = os.path.join(user_root, player_id)
        if not os.path.isdir(player_dir):
            continue
        for filename in os.listdir(player_dir):
            if not re.fullmatch(rf"{re.escape(player_id)}_(\d{{6}})\.json", filename):
                continue
            m = re.search(r'_(\d{6})\.json$', filename)
            if not m:
                continue
            yymmdd = m.group(1)
            file_dt = datetime.strptime(yymmdd, "%y%m%d").replace(
                tzinfo=KST,
                hour=WEEKLY_DAILY_CRAWL_HOUR,
                minute=0,
                second=0,
                microsecond=0,
            )
            if not (range_start <= file_dt <= range_end):
                continue
            file_path = os.path.join(player_dir, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    payload = json.load(f)
                if isinstance(payload, list) and payload:
                    row = payload[0]
                elif isinstance(payload, dict):
                    row = payload
                else:
                    continue
            except Exception:
                continue
            records.append({
                "season": season,
                "player_id": str(row.get("player_id") or row.get("아이디") or player_id),
                "datetime": file_dt,
                "date": yymmdd,
                "row": row,
            })
    return records

def build_weekly_player_stats(records_by_player, expected_points):
    stats = {}
    first_expected = expected_points[0] if expected_points else None
    last_expected = expected_points[-1] if expected_points else None

    for player_id, entries in records_by_player.items():
        ordered = sorted(entries, key=lambda x: x["datetime"])
        if not ordered:
            continue
        dt_set = {item["datetime"] for item in ordered}
        has_start_boundary = (first_expected in dt_set) if first_expected else True
        has_end_boundary = (last_expected in dt_set) if last_expected else True
        boundary_ok = (has_start_boundary and has_end_boundary) if WEEKLY_REQUIRE_BOUNDARY_POINTS else True
        valid_days = len(ordered)
        eligible_base = boundary_ok and valid_days >= WEEKLY_MIN_VALID_DAYS

        manager_name = str(ordered[-1]["row"].get("구단주명") or ordered[-1]["row"].get("name") or "-")
        wins_delta = 0
        draws_delta = 0
        losses_delta = 0
        games_delta = 0
        mining_delta = 0

        by_season = defaultdict(list)
        for item in ordered:
            by_season[item["season"]].append(item)

        for season_entries in by_season.values():
            season_entries = sorted(season_entries, key=lambda x: x["datetime"])
            if not season_entries:
                continue
            start_row = season_entries[0]["row"]
            end_row = season_entries[-1]["row"]
            wins_delta += delta_with_reset(end_row.get("승"), start_row.get("승"))
            draws_delta += delta_with_reset(end_row.get("무"), start_row.get("무"))
            losses_delta += delta_with_reset(end_row.get("패"), start_row.get("패"))
            games_delta += delta_with_reset(end_row.get("판수"), start_row.get("판수"))
            mining_delta += delta_with_reset(end_row.get("채굴 효율"), start_row.get("채굴 효율"))

        weekly_win_rate = None
        draw_rate = None
        if games_delta > 0:
            weekly_win_rate = round((wins_delta / games_delta) * 100, 2)
            draw_rate = draws_delta / games_delta

        eligible_kpi = eligible_base and games_delta >= WEEKLY_MIN_GAMES
        stats[player_id] = {
            "player_id": player_id,
            "manager_name": manager_name,
            "valid_days": valid_days,
            "has_start_boundary": has_start_boundary,
            "has_end_boundary": has_end_boundary,
            "eligible_base": eligible_base,
            "eligible_kpi": eligible_kpi,
            "weekly_wins_delta": wins_delta,
            "weekly_draws_delta": draws_delta,
            "weekly_losses_delta": losses_delta,
            "weekly_games_delta": games_delta,
            "weekly_mining_delta": mining_delta,
            "weekly_win_rate": weekly_win_rate,
            "weekly_draw_rate": draw_rate,
        }
    return stats

def king_payload(player_stat, metric_value):
    if not player_stat:
        return None
    return {
        "player_id": player_stat["player_id"],
        "manager_name": player_stat["manager_name"],
        "weekly_games_delta": player_stat["weekly_games_delta"],
        "metric_value": metric_value,
        "eligible": True,
    }

def pick_weekly_kings(player_stats):
    candidates = [x for x in player_stats.values() if x.get("eligible_kpi")]
    if not candidates:
        return {
            "mining_king": None,
            "win_rate_king": None,
            "game_count_king": None,
            "draw_king": None,
        }

    def select_max(metric_key):
        valid = [x for x in candidates if x.get(metric_key) is not None]
        if not valid:
            return None
        valid.sort(key=lambda x: (-x.get(metric_key, 0), -x.get("weekly_games_delta", 0), str(x.get("player_id", ""))))
        return valid[0]

    def select_min(metric_key):
        valid = [x for x in candidates if x.get(metric_key) is not None]
        if not valid:
            return None
        valid.sort(key=lambda x: (x.get(metric_key, 0), -x.get("weekly_games_delta", 0), str(x.get("player_id", ""))))
        return valid[0]

    mining = select_max("weekly_mining_delta")
    win_rate = select_max("weekly_win_rate")
    game_count = select_max("weekly_games_delta")
    draw = select_min("weekly_draw_rate")
    return {
        "mining_king": king_payload(mining, mining.get("weekly_mining_delta") if mining else None),
        "win_rate_king": king_payload(win_rate, win_rate.get("weekly_win_rate") if win_rate else None),
        "game_count_king": king_payload(game_count, game_count.get("weekly_games_delta") if game_count else None),
        "draw_king": king_payload(draw, round((draw.get("weekly_draw_rate") or 0) * 100, 2) if draw else None),
    }

def bucket_specs():
    trillion = 1000000000000
    return [
        {"id": "lt_10_jo", "label": "10조 미만", "min": 0, "max": 10 * trillion},
        {"id": "10_20_jo", "label": "10조~20조", "min": 10 * trillion, "max": 20 * trillion},
        {"id": "20_50_jo", "label": "20조~50조", "min": 20 * trillion, "max": 50 * trillion},
        {"id": "50_100_jo", "label": "50조~100조", "min": 50 * trillion, "max": 100 * trillion},
        {"id": "100_200_jo", "label": "100조~200조", "min": 100 * trillion, "max": 200 * trillion},
        {"id": "200_500_jo", "label": "200조~500조", "min": 200 * trillion, "max": 500 * trillion},
        {"id": "500_1000_jo", "label": "500조~1000조", "min": 500 * trillion, "max": 1000 * trillion},
        {"id": "gte_1000_jo", "label": "1000조 이상", "min": 1000 * trillion, "max": None},
    ]

def resolve_bucket(value_krw):
    for spec in bucket_specs():
        lower_ok = value_krw >= spec["min"]
        upper_ok = True if spec["max"] is None else value_krw < spec["max"]
        if lower_ok and upper_ok:
            return spec
    return None

def build_value_bucket_report(records_by_player):
    accum = {}
    for spec in bucket_specs():
        accum[spec["id"]] = {
            "bucket_id": spec["id"],
            "label": spec["label"],
            "min_value_krw": spec["min"],
            "max_value_krw": spec["max"],
            "samples": 0,
            "mining_sum": 0.0,
            "win_rate_sum": 0.0,
            "win_rate_count": 0,
        }

    for entries in records_by_player.values():
        ordered = sorted(entries, key=lambda x: x["datetime"])
        prev = None
        for current in ordered:
            row = current["row"]
            if prev and prev["season"] == current["season"]:
                day_mining = delta_with_reset(row.get("채굴 효율"), prev["row"].get("채굴 효율"))
                club_value = parse_club_value_to_krw(row.get("구단 가치"))
                if club_value is not None:
                    spec = resolve_bucket(club_value)
                    if spec:
                        target = accum[spec["id"]]
                        target["samples"] += 1
                        target["mining_sum"] += float(day_mining)
                        win_rate_value = parse_percent_to_float(row.get("승률"))
                        if win_rate_value is not None:
                            target["win_rate_sum"] += win_rate_value
                            target["win_rate_count"] += 1
            prev = current

    output = []
    for spec in bucket_specs():
        data = accum[spec["id"]]
        samples = data["samples"]
        avg_mining = round(data["mining_sum"] / samples, 2) if samples > 0 else None
        avg_win_rate = round(data["win_rate_sum"] / data["win_rate_count"], 2) if data["win_rate_count"] > 0 else None
        output.append({
            "bucket_id": data["bucket_id"],
            "label": data["label"],
            "min_value_krw": data["min_value_krw"],
            "max_value_krw": data["max_value_krw"],
            "samples": samples,
            "avg_weekly_mining_delta": avg_mining,
            "avg_weekly_win_rate": avg_win_rate,
        })
    return output

def season_for_weekly_report(window_end):
    return pick_active_season_for_datetime(window_end) or get_current_season()

def weekly_report_filename(window_end):
    iso_year, iso_week, _ = window_end.isocalendar()
    return f"weekly_report_{iso_year}_{iso_week:02d}.json", f"{iso_year}-W{iso_week:02d}"

def build_weekly_report_payload(window_start, window_end, generated_at, player_stats, kings, buckets, week_id):
    total_players = len(player_stats)
    eligible_players = len([x for x in player_stats.values() if x.get("eligible_kpi")])
    return {
        "schema_version": WEEKLY_SCHEMA_VERSION,
        "report_type": "weekly",
        "week_id": week_id,
        "timezone": "Asia/Seoul",
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "generated_at": generated_at.isoformat(),
        "policy": {
            "min_weekly_games": WEEKLY_MIN_GAMES,
            "imputation": WEEKLY_IMPUTATION,
            "require_boundary_points": WEEKLY_REQUIRE_BOUNDARY_POINTS,
            "min_valid_days": WEEKLY_MIN_VALID_DAYS,
        },
        "weekly_kings": kings,
        "value_buckets": buckets,
        "quality": {
            "total_players": total_players,
            "eligible_players": eligible_players,
            "excluded_players": max(total_players - eligible_players, 0),
        },
    }

def run_weekly_report_batch(target_datetime=None, force=False):
    now_kst = (target_datetime or datetime.now(KST))
    if now_kst.tzinfo is None:
        now_kst = now_kst.replace(tzinfo=KST)

    lock_dir = os.path.dirname(WEEKLY_LOCK_FILE)
    if lock_dir:
        os.makedirs(lock_dir, exist_ok=True)

    lock_fp = open(WEEKLY_LOCK_FILE, "w", encoding="utf-8")
    try:
        try:
            fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[WEEKLY] Another weekly batch is running. Skip.", flush=True)
            return {"status": "skipped", "reason": "locked"}

        window_start, window_end = build_weekly_window(now_kst)
        segments = compute_weekly_segments(window_start, window_end)

        records_by_player = defaultdict(list)
        for seg in segments:
            segment_records = collect_daily_records_in_range(seg["season"], seg["start"], seg["end"])
            for item in segment_records:
                records_by_player[item["player_id"]].append(item)

        expected_points = expected_weekly_snapshot_points(window_start, window_end)
        player_stats = build_weekly_player_stats(records_by_player, expected_points)
        kings = pick_weekly_kings(player_stats)
        buckets = build_value_bucket_report(records_by_player)

        generated_at = datetime.now(KST)
        filename, week_id = weekly_report_filename(window_end)
        target_season = season_for_weekly_report(window_end)
        target_path = os.path.join(season_dir_path(target_season), filename)

        if os.path.exists(target_path) and not force:
            print(f"[WEEKLY] {filename} already exists. Overwrite with latest aggregate.", flush=True)

        payload = build_weekly_report_payload(
            window_start=window_start,
            window_end=window_end,
            generated_at=generated_at,
            player_stats=player_stats,
            kings=kings,
            buckets=buckets,
            week_id=week_id,
        )
        atomic_write_json(target_path, payload)
        print(f"[WEEKLY] Saved {target_path}", flush=True)
        return {"status": "success", "path": target_path, "week_id": week_id}
    finally:
        with suppress(Exception):
            fcntl.flock(lock_fp, fcntl.LOCK_UN)
        lock_fp.close()

def parse_week_id_to_run_datetime(week_id):
    m = re.fullmatch(r"(\d{4})[-_]?W?(\d{1,2})", str(week_id or "").strip(), flags=re.IGNORECASE)
    if not m:
        raise ValueError("Invalid week id format. Use YYYY-Www (e.g., 2026-W08).")
    year = int(m.group(1))
    week = int(m.group(2))
    thursday = datetime.fromisocalendar(year, week, 4).date()
    return datetime.combine(thursday, dt_time(hour=5, minute=5, second=0)).replace(tzinfo=KST)

def rebuild_weekly_reports(start_week_id, end_week_id, force=False):
    start_dt = parse_week_id_to_run_datetime(start_week_id)
    end_dt = parse_week_id_to_run_datetime(end_week_id)
    if start_dt > end_dt:
        start_dt, end_dt = end_dt, start_dt

    results = []
    cursor = start_dt
    while cursor <= end_dt:
        result = run_weekly_report_batch(target_datetime=cursor, force=force)
        results.append(result)
        cursor += timedelta(days=7)
    return results

def extract_manager_player_id(manager):
    if not isinstance(manager, dict):
        return ""

    direct_id = str(manager.get("player_id", "")).strip()
    if direct_id.isdigit():
        return direct_id

    candidates = [
        str(manager.get("stat_url", "")).strip(),
        str(manager.get("squad_url", "")).strip(),
    ]
    patterns = [
        r"/popup/(\d+)",
        r"/TeamInfo/(\d+)",
        r"n8NexonSN=(\d+)",
        r"(\d{6,})",
    ]
    for text in candidates:
        if not text:
            continue
        for pattern in patterns:
            matched = re.search(pattern, text)
            if matched:
                return matched.group(1)
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

def run_openapi_analytics_all():
    now_kst = datetime.now(KST)
    season = pick_active_season_for_datetime(now_kst) or get_current_season()
    managers = load_managers()
    batch_max_matches = env_int("OPENAPI_BATCH_MAX_MATCHES", 300, min_value=1)
    batch_window_matches = resolve_batch_window_matches(default=200)
    delay_min = env_float("OPENAPI_BATCH_DELAY_MIN", 0.8, min_value=0.0)
    delay_max = env_float("OPENAPI_BATCH_DELAY_MAX", 1.6, min_value=0.0)
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
                if not player_id:
                    skipped += 1
                    details.append({"status": "skipped", "reason": "player_id_not_found"})
                    print("[OPENAPI] Skip manager: player_id not found.", flush=True)
                    continue

                try:
                    report = run_openapi_update_analysis_for_user(
                        season=season,
                        player_id=player_id,
                        max_matches=batch_max_matches,
                        window_matches=batch_window_matches,
                        refresh_ouid=False,
                        nickname_hint=manager.get("name"),
                    )
                    success += 1
                    details.append({
                        "status": "success",
                        "player_id": player_id,
                        "newMatchCount": report["sync"].get("newMatchCount", 0),
                        "actualMatches": report["analysis"].get("actualMatches", 0),
                    })
                    print(
                        f"[OPENAPI] OK player_id={player_id} new={report['sync'].get('newMatchCount', 0)} "
                        f"actual={report['analysis'].get('actualMatches', 0)}",
                        flush=True,
                    )
                except Exception as exc:
                    failed += 1
                    details.append({
                        "status": "failed",
                        "player_id": player_id,
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

# --- [핵심] 고속 API 크롤링 로직 (조 단위 변환 포함) ---
def _crawl_single_manager_api(m):
    player_id = re.search(r'popup/(\d+)', m['stat_url']).group(1)
    res = {
        "name": m['name'], "player_id": player_id, "stat_url": m['stat_url'], "squad_url": m['squad_url'],
        "구단주명": m['name'], "승": 0, "무": 0, "패": 0, "판수": 0, "채굴 효율": 0, "승률": "0.0%",
        "구단 가치": "0", "비고": "-", "지난 시즌 승": 0, "지난 시즌 무": 0, "지난 시즌 패": 0,
        "지난 시즌 판수": 0, "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0.0%", 
        "crawl_time": datetime.now(KST).strftime("%Y-%m-%d")
    }
    session = requests.Session()
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36..."}
    try:
        # 1. 전적 수집
        stat_url = f"https://fconline.nexon.com/Profile/Stat/TeamInfo/{player_id}?n1Type=52"
        s_resp = session.get(stat_url, headers=headers, timeout=10)
        if s_resp.status_code == 200:
            soup = BeautifulSoup(s_resp.text, 'html.parser')
            regex = r'(\d+)승\s*(\d+)무\s*(\d+)패\((\d+\.\d+)%\)'
            curr = soup.select_one('.season_grade_info__current .grade_desc')
            if curr:
                m1 = re.search(regex, curr.get_text())
                if m1:
                    w, d, l, r = map(float, m1.groups())
                    res.update({"승":int(w),"무":int(d),"패":int(l),"판수":int(w+d+l),"채굴 효율":int(w)*7-int(d)*3-int(l),"승률":f"{r:.1f}%"})
            last = soup.select_one('.season_grade_info__last .grade_desc')
            if last:
                m2 = re.search(regex, last.get_text())
                if m2:
                    lw, ld, ll, lr = map(float, m2.groups())
                    res.update({"지난 시즌 승":int(lw),"지난 시즌 무":int(ld),"지난 시즌 패":int(ll),"지난 시즌 판수":int(lw+ld+ll),"지난 시즌 채굴 효율":int(lw)*7-int(ld)*3-int(ll),"지난 시즌 승률":f"{lr:.1f}%"})

        # 2. 구단 가치 수집 (열쇠 추출 방식)
        pop_resp = session.get(f"https://fconline.nexon.com/profile/squad/popup/{player_id}", timeout=10)
        token = re.search(f'"{player_id}",\s*"([a-f0-9]{{24}})"', pop_resp.text)
        if token:
            api_url = f"https://fconline.nexon.com/datacenter/SquadGetUserInfo?strTeamType=1&n1Type=2&n8NexonSN={player_id}&strCharacterID={token.group(1)}"
            session.headers.update({"X-Requested-With": "XMLHttpRequest", "Referer": pop_resp.url})
            a_resp = session.get(api_url, timeout=10)
            if a_resp.status_code == 200:
                price = int(a_resp.json().get("totalPrice", 0))
                if price >= 1000000000000: res["구단 가치"] = f"{price // 1000000000000}조"
                elif price > 0: res["구단 가치"] = "1조 미만"
    except Exception as e: res["error"] = str(e)
    return res

def run_full_crawl():
    now_kst = datetime.now(KST)
    season = pick_active_season_for_datetime(now_kst) or get_current_season()
    managers = load_managers()
    if not managers: return
    print(f"[{now_kst}] --- 고속 API 갱신 시작 ---", flush=True)
    results = []
    for m in managers:
        for attempt in range(1, 11):
            res = _crawl_single_manager_api(m)
            if "error" not in res:
                results.append(res); break
            time.sleep(1)
    results.sort(key=lambda x: x.get('채굴 효율', -9999), reverse=True)
    for i, item in enumerate(results): item['순위'] = i + 1
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
        # 기존 클라이언트 호환용 일 단위 최신 파일
        with open(os.path.join(p_path, f"{item['player_id']}_{d_str}.json"), 'w', encoding='utf-8') as f:
            json.dump([item], f, indent=4, ensure_ascii=False)
    
    # 요약 저장
    empty = {"구단주명": "-", "지난 시즌 채굴 효율": 0, "지난 시즌 승률": "0%", "지난 시즌 판수": 0, "지난 시즌 무": 0}
    mining_king = max(results, key=lambda x: x.get('지난 시즌 채굴 효율', -1), default=empty)
    win_king = max(results, key=lambda x: float(str(x.get('지난 시즌 승률', '0%')).replace('%','')), default=empty)
    game_king = max(results, key=lambda x: x.get('지난 시즌 판수', -1), default=empty)
    heavy = [r for r in results if r.get('지난 시즌 판수', 0) >= 4000]
    draw_king = min(heavy, key=lambda x: x.get('지난 시즌 무', 9999), default=empty)
    
    summary = {"results": results, "last_updated": now_kst.strftime("%Y-%m-%d %H:%M:%S"),
               "mining_king": mining_king, "win_rate_king": win_king, "game_count_king": game_king, "draw_king": draw_king}
    with open(os.path.join(s_dir, "current_crawl_display_data.json"), 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=4, ensure_ascii=False)
    with open(os.path.join(s_dir, "manifest.json"), 'w', encoding='utf-8') as f:
        json.dump({"endDate": d_str, "endDateTime": f"{d_str}_{t_str}"}, f, ensure_ascii=False)
    print("--- 갱신 완료 ---", flush=True)


def run_daily_crawl_then_openapi():
    crawl_lock = _try_acquire_exclusive_lock(DAILY_CRAWL_LOCK_FILE)
    if not crawl_lock:
        print("[CRAWL] Daily crawl already running. Skip.", flush=True)
        return {"status": "skipped", "reason": "daily_crawl_running"}
    try:
        run_full_crawl()
    finally:
        _release_lock(crawl_lock)
    return run_openapi_analytics_all()


def run_daily_crawl_only():
    crawl_lock = _try_acquire_exclusive_lock(DAILY_CRAWL_LOCK_FILE)
    if not crawl_lock:
        print("[CRAWL] Daily crawl already running. Skip.", flush=True)
        return {"status": "skipped", "reason": "daily_crawl_running"}
    try:
        run_full_crawl()
        return {"status": "success"}
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
    root_dir = app.root_path
    build_dir = os.path.join(app.root_path, "build")
    if os.path.isfile(os.path.join(root_dir, "season_config.json")):
        directory = root_dir
    elif os.path.isfile(os.path.join(build_dir, "season_config.json")):
        directory = build_dir
    else:
        return jsonify({"error": "season_config.json not found"}), 404
    res = make_response(send_from_directory(directory, "season_config.json"))
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

# 2. 통합 히스토리 API (Lighthouse 최적화용)
@app.route('/api/history/<season>/<player_id>')
def get_user_history(season, player_id):
    history = []
    now = datetime.now(KST)
    for i in range(5):
        d_str = (now - timedelta(days=i)).strftime('%y%m%d')
        f_p = os.path.join(DATA_BASE_DIR, season, "user", player_id, f"{player_id}_{d_str}.json")
        if os.path.exists(f_p):
            with open(f_p, 'r', encoding='utf-8') as f: history.append({"date": d_str, "data": json.load(f)[0]})
        else: history.append({"date": d_str, "data": None})
    history.reverse()
    return jsonify(history)

# 3. 관리자 페이지 (이게 있어야 esclub.info/admin 접속 가능)
@app.route('/admin')
def admin_page():
    return render_template('admin.html')

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
    session["login_at"] = datetime.now(KST).isoformat()
    return jsonify({"status": "success"})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"status": "success"})

@app.route('/api/session', methods=['GET'])
def api_session():
    return jsonify({"authenticated": bool(session.get("is_admin"))})

@app.route('/api/managers', methods=['GET', 'POST'])
@require_admin_auth
def api_managers():
    body = request.get_json(silent=True) or {}
    if request.method == 'GET':
        return jsonify(load_managers())
    save_managers(body.get('managers', []))
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

        if cmd == "weekly-report":
            force = "--force" in sys.argv[2:]
            if "--week" in sys.argv[2:]:
                idx = sys.argv.index("--week")
                if idx + 1 >= len(sys.argv):
                    raise SystemExit("Usage: python app.py weekly-report [--week YYYY-Www] [--force]")
                run_dt = parse_week_id_to_run_datetime(sys.argv[idx + 1])
            else:
                run_dt = datetime.now(KST)
            result = run_weekly_report_batch(target_datetime=run_dt, force=force)
            raise SystemExit(0 if result.get("status") == "success" else 1)

        if cmd == "weekly-backfill":
            if len(sys.argv) < 4:
                raise SystemExit("Usage: python app.py weekly-backfill <START_WEEK> <END_WEEK> [--force]")
            force = "--force" in sys.argv[4:]
            rows = rebuild_weekly_reports(sys.argv[2], sys.argv[3], force=force)
            success_count = len([x for x in rows if x.get("status") == "success"])
            print(f"[WEEKLY] Backfill done. success={success_count}, total={len(rows)}", flush=True)
            raise SystemExit(0 if success_count == len(rows) else 1)

        raise SystemExit(
            "Unsupported command. Use: "
            "openapi-security-selfcheck | openapi-migrate-cache | openapi-selftest | "
            "openapi-sync-user | openapi-update-analysis | weekly-report | weekly-backfill"
        )

    scheduler.add_job(
        func=run_daily_crawl_only,
        trigger="cron",
        hour=4,
        minute=0,
        id="daily_crawl",
        replace_existing=True,
        coalesce=True,
    )
    scheduler.add_job(
        func=run_openapi_analytics_all,
        trigger="cron",
        hour="*/2",
        minute=10,
        id="openapi_analytics",
        replace_existing=True,
        coalesce=True,
    )
    scheduler.add_job(
        func=run_weekly_report_batch,
        trigger="cron",
        day_of_week="thu",
        hour=5,
        minute=5,
        id="weekly_report",
        replace_existing=True,
        coalesce=True,
    )
    ensure_scheduler_running()
    app.run(host='0.0.0.0', port=80, threaded=True)
