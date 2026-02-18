from flask import Flask, render_template, send_from_directory, jsonify, request, make_response
from flask_compress import Compress 
import requests
from bs4 import BeautifulSoup
from apscheduler.schedulers.background import BackgroundScheduler
import time, re, os, json, shutil
from datetime import datetime, timedelta, timezone, time as dt_time

app = Flask(__name__, static_folder='static', template_folder='.')

# 1. 성능 최적화: Gzip 압축
Compress(app)
app.config['COMPRESS_MIMETYPES'] = ['text/html', 'text/css', 'application/json', 'application/javascript']
app.config['COMPRESS_LEVEL'] = 6
app.config['COMPRESS_MIN_SIZE'] = 500

# --- 설정 ---
MANAGERS_FILE = "managers.json"
DATA_BASE_DIR = "data"
SEASON_CONFIG_FILE = "season_config.json"
ADMIN_PASSWORD = "240416" 
KST = timezone(timedelta(hours=9))
scheduler = BackgroundScheduler(timezone=KST)

def ensure_scheduler_running():
    if not scheduler.running:
        scheduler.start()

# 2. 브라우저 캐싱 정책 (Lighthouse 최적화)
@app.after_request
def add_header(response):
    if 'application/json' in response.content_type:
        response.cache_control.no_cache = True
    elif 'application/javascript' in response.content_type or 'text/css' in response.content_type:
        response.cache_control.max_age = 2678400 # 31일
    return response

# --- 유틸리티 함수 ---
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
    target_dir = os.path.join(DATA_BASE_DIR, target_season)
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
            summary = build_summary_from_results(results)
            with open(os.path.join(target_dir, "current_crawl_display_data.json"), 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=4, ensure_ascii=False)
            with open(os.path.join(target_dir, "manifest.json"), 'w', encoding='utf-8') as f:
                json.dump({"endDate": latest_date}, f, ensure_ascii=False)
    return copied_count, latest_date

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

# --- 라우팅 (순서가 매우 중요함) ---

# 1. 데이터 직접 서빙
@app.route('/data/<path:filename>')
def serve_data(filename):
    res = make_response(send_from_directory(DATA_BASE_DIR, filename))
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
@app.route('/api/managers', methods=['GET', 'POST'])
def api_managers():
    body = request.get_json(silent=True) or {}
    pw = request.args.get('pw') or body.get('pw')
    if pw != ADMIN_PASSWORD:
        return jsonify({"error": "Unauthorized"}), 401
    if request.method == 'GET':
        return jsonify(load_managers())
    save_managers(body.get('managers', []))
    return jsonify({"status": "success"})

@app.route('/api/seasons', methods=['GET', 'POST'])
def api_seasons():
    body = request.get_json(silent=True) or {}
    pw = request.args.get('pw') or body.get('pw')
    if pw != ADMIN_PASSWORD:
        return jsonify({"error": "Unauthorized"}), 401

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
def api_update_season(season):
    body = request.get_json(silent=True) or {}
    pw = request.args.get('pw') or body.get('pw')
    if pw != ADMIN_PASSWORD:
        return jsonify({"error": "Unauthorized"}), 401

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

@app.route('/crawl-now', methods=['POST'])
def api_manual_crawl():
    data = request.get_json(silent=True) or {}
    if data.get('pw') != ADMIN_PASSWORD: return jsonify({"status": "error"}), 401
    ensure_scheduler_running()
    scheduler.add_job(func=run_full_crawl, trigger='date', run_date=datetime.now(KST))
    return jsonify({"status": "success", "message": "크롤링 시작"})

# 5. 캐치올 (맨 마지막)
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    f_p = os.path.join(app.root_path, path)
    if path != "" and os.path.exists(f_p): return send_from_directory(app.root_path, path)
    return render_template('index.html')

if __name__ == '__main__':
    scheduler.add_job(func=run_full_crawl, trigger="cron", hour=4, minute=0)
    ensure_scheduler_running()
    app.run(host='0.0.0.0', port=80, threaded=True)
