import re
from constants import WAGE_EFF_TABLE, FACILITY_MAX_QTY

def _round_wage_to_100(w: int) -> int:
    # 표가 100 단위니까 가장 가까운 100으로 반올림
    return int(round(w / 100.0) * 100)

def compute_times_from_work_and_wage(work: int, wage: int):
    """
    return: (game_days:float|None, real_days:float|None, real_hours:int|None, real_minutes:int|None)
    """
    if not isinstance(work, int) or work <= 0:
        return (None, None, None, None)
    if not isinstance(wage, int) or wage <= 0:
        return (None, None, None, None)

    wage_key = _round_wage_to_100(wage)
    if wage_key not in WAGE_EFF_TABLE:
        return (None, None, None, None)

    game_eff, real_eff = WAGE_EFF_TABLE[wage_key]  # 작업량/게임일, 작업량/현실일
    game_days = round(work / game_eff, 1)
    real_days_raw = work / real_eff
    real_days = round(real_days_raw, 1)
    real_hours = int(round(real_days_raw * 24))
    real_minutes = int(round(real_days_raw * 24 * 60))
    return (game_days, real_days, real_hours, real_minutes)

def calc_facility_runs(craft_qty: int, base_qty: int) -> int:
    craft_qty = int(craft_qty or 0)
    base_qty = int(base_qty or 1)
    if base_qty <= 0:
        base_qty = 1
    if craft_qty <= 0:
        return 1
    return max(1, craft_qty // base_qty)


def calc_facility_total_work(base_work: int, runs: int) -> int:
    base_work = int(base_work or 0)
    runs = int(runs or 1)
    if base_work <= 0 or runs <= 0:
        return 0
    return base_work * runs


def calc_facility_child_need(base_need: int, runs: int) -> int:
    base_need = int(base_need or 0)
    runs = int(runs or 1)
    if base_need <= 0 or runs <= 0:
        return 0
    return base_need * runs


def calc_facility_labor_cost(base_work: int, runs: int, wage: int) -> int:
    base_work = int(base_work or 0)
    runs = int(runs or 1)
    wage = int(wage or 0)
    if base_work <= 0 or runs <= 0 or wage <= 0:
        return 0
    return base_work * runs * wage


def calc_facility_parent_sum(child_sum: int, base_work: int, runs: int, wage: int) -> int:
    child_sum = int(child_sum or 0)
    labor_cost = calc_facility_labor_cost(base_work, runs, wage)
    return child_sum + labor_cost

def recalc_facility_values(craft_qty: int, base_qty: int, base_work: int, wage: int, child_sum: int) -> dict:
    runs = calc_facility_runs(craft_qty, base_qty)
    total_work = calc_facility_total_work(base_work, runs)
    total_sum = calc_facility_parent_sum(child_sum, base_work, runs, wage)

    game_days = None
    real_days = None
    real_hours = None
    real_minutes = None

    if total_work > 0 and int(wage or 0) > 0:
        game_days, real_days, real_hours, real_minutes = compute_times_from_work_and_wage(total_work, wage)

    return {
        "runs": runs,
        "work": total_work,
        "sum": total_sum,
        "game_days": game_days,
        "real_days": real_days,
        "real_hours": real_hours,
        "real_minutes": real_minutes,
        "real_time_text": format_real_time(real_days, real_hours, real_minutes),
    }

def fmt_eta_min(total_min):
    if total_min is None:
        return ""
    try:
        total_min = int(total_min)
    except:
        return ""
    if total_min <= 0:
        return "0분"

    h, m = divmod(total_min, 60)
    if h > 0 and m > 0:
        return f"{h}시간 {m}분"
    if h > 0:
        return f"{h}시간"
    return f"{m}분"

def format_real_time(rd, rh, rmin):
    """
    - 24시간 미만이면: 'H시간 M분' (분 0이면 'H시간')
    - 그 외: 'x.x일(y시간)'
    """
    if isinstance(rmin, int) and 0 < rmin < 24 * 60:
        hh, mm = divmod(int(rmin), 60)
        if mm:
            return f"{hh}시간 {mm}분"
        return f"{hh}시간"

    if isinstance(rd, (int, float)) and isinstance(rh, int):
        return f"{rd:.1f}일({rh}시간)"

    return ""

def clamp_to_multiple_max(nv: int, base_qty: int, max_qty: int = FACILITY_MAX_QTY) -> int:
    """nv를 max_qty 이하로 제한 + base_qty의 배수로 '내림' 보정"""
    if base_qty <= 0:
        base_qty = 1
    if nv <= 0:
        nv = base_qty

    # 먼저 max 제한
    nv = min(nv, max_qty)

    # 배수 내림 보정
    k = nv // base_qty
    if k <= 0:
        k = 1
    fixed = base_qty * k

    # 혹시 fixed가 max를 넘는 경우(이론상 거의 없지만 안전장치)
    if fixed > max_qty:
        k = max_qty // base_qty
        fixed = base_qty * max(1, k)

    return fixed

def _to_int_price(v):
    """'12,000' -> 12000 / 'abc' -> None"""
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = re.sub(r"[^\d]", "", v)
        return int(s) if s else None
    return None

def _to_int(v):
    if isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, str):
        s = re.sub(r"[^\d]", "", v)
        return int(s) if s else None
    return None

def fmt_won(n: int) -> str:
    return f"{n:,}"

def build_note(user_note: str, lowest_price=None, is_lack=False, lack_cnt=0, total_avail=0, need_qty=0) -> str:
    """
    user_note: 사용자가 입력한 메모(기존 비고에서 자동문구 제거한 결과)
    자동문구(최저가/부족)를 앞에 붙이고 | 로만 연결해서 최종 비고를 만든다.
    """
    user_note = strip_auto_note(user_note)

    parts = []
    if isinstance(lowest_price, int):
        parts.append(f"최저가 {lowest_price:,}")
    if is_lack:
        parts.append(f"부족 {max(0, int(lack_cnt))}개 ({int(total_avail)}/{int(need_qty)})")

    auto_txt = " | ".join(parts).strip()
    if auto_txt and user_note:
        return f"{auto_txt} | {user_note}"
    return auto_txt or user_note or ""

def strip_parent_auto_note(note: str) -> str:
    """
    부모 비고의 자동문구(예: '745,000 / 20') 제거하고
    사용자가 입력한 메모만 남긴다.
    """
    s = str(note or "").strip()

    # 앞에 붙은 '숫자,콤마 / 숫자' 패턴 제거 (745,000 / 20)
    s = re.sub(r"^(?:\s*[\d,]+\s*/\s*\d+\s*)(?:/|\||-)?\s*", "", s).strip()

    # 불필요한 구분자 정리
    s = re.sub(r"\s*\|\s*", " | ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = s.strip(" |/")

    return s

def build_parent_note(existing_note: str, total_sum: int, craft_qty: int) -> str:
    """
    부모 비고: '총합 / 제작수량' 을 맨 앞에 자동으로 붙임.
    기존 사용 메모는 유지.
    예: '745,000 / 20 | 내메모'
    """
    user_note = strip_parent_auto_note(existing_note)

    auto_txt = ""
    if isinstance(total_sum, int) and total_sum > 0 and isinstance(craft_qty, int) and craft_qty > 0:
        auto_txt = f"{total_sum:,} / {craft_qty:,}"

    if auto_txt and user_note:
        return f"{auto_txt} | {user_note}"
    return auto_txt or user_note or ""

def strip_auto_note(note: str) -> str:
    s = str(note or "").strip()

    # 자동 생성 문구 제거
    s = re.sub(r"(?:^|\s*\|\s*)최저가\s*[\d,]+\s*", " ", s)
    s = re.sub(r"(?:^|\s*\|\s*)부족\s*\d+개\s*\(\d+/\d+\)\s*", " ", s)

    # | 정리
    s = re.sub(r"\s*\|\s*", " | ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = s.strip(" |")

    return s

def fmt_duration(sec: float) -> str:
    sec = int(max(0, sec))
    m, s = divmod(sec, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}시간 {m}분 {s}초"
    if m > 0:
        return f"{m}분 {s}초"
    return f"{s}초"