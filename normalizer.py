import re
from constants import _KOREAN_UNIT_MAP

def clean_material_name(name: str) -> str:
    if not name:
        return ""

    n = str(name).strip()

    # (총 1510) 같은 꼬리 제거
    n = re.sub(r"\(총\s*[\d,]+\)", "", n).strip()
    n = re.sub(r"^\(총\s*", "", n).strip()
    n = re.sub(r"^총\s*", "", n).strip()

    # 제거할 불필요 태그 목록
    remove_tags = [
        "유료",
        "이벤트",
        "교환불가",
        "귀속",
        "거래불가",
        "한정",
    ]

    for tag in remove_tags:
        n = re.sub(rf"\(\s*{tag}\s*\)", "", n)

    # 빈 괄호 제거
    n = re.sub(r"\(\s*\)", "", n).strip()

    return n

def normalize_item_name(s: str) -> str:
    return " ".join((s or "").split()).strip()

def make_ui_candidate_by_ui(name: str):
    n = normalize_item_name(name)
    ns = n.replace(" ", "")
    if "의" not in ns:
        return None
    i = ns.rfind("의")
    if 0 < i < len(ns) - 1:
        cand = ns[:i+1] + " " + ns[i+1:]
        return cand if cand != n else None
    return None

def make_candidate_remove_eui(name: str):
    n = normalize_item_name(name)
    ns = n.replace(" ", "")
    if "의" not in ns:
        return None
    cand = ns.replace("의", "")
    return cand if cand and cand != ns else None


def make_candidates_insert_eui(name: str):
    n = normalize_item_name(name)
    ns = n.replace(" ", "")
    if not ns or "의" in ns or len(ns) < 3:
        return []
    left = ns[:-2]
    right = ns[-2:]
    return [f"{left}의{right}", f"{left}의 {right}"]

def parse_korean_amount_to_int(text: str):
    if not text:
        return None
    s = str(text).strip()
    s = s.replace("원", "").replace(",", "").replace(" ", "")
    s = s.replace("비용:", "").replace("비용", "").replace("개", "")
    s = s.strip()
    if not s:
        return None

    # 순수 숫자
    if re.fullmatch(r"\d+(\.\d+)?", s):
        try:
            return int(float(s))
        except:
            return None

    # 1억7250만 형태 처리
    # (억 단위 + 만 단위 + 나머지) 를 가능한 조합으로 파싱
    total = 0

    # 억
    m = re.search(r"(\d+(?:\.\d+)?)억", s)
    if m:
        total += int(float(m.group(1)) * _KOREAN_UNIT_MAP["억"])
        s = s.replace(m.group(0), "")

    # 천만 / 백만 / 십만 / 만 / 천 순서로 처리 (긴 단위 우선)
    for unit in ["천만", "백만", "십만", "만", "천"]:
        mm = re.search(r"(\d+(?:\.\d+)?)" + re.escape(unit), s)
        if mm:
            total += int(float(mm.group(1)) * _KOREAN_UNIT_MAP[unit])
            s = s.replace(mm.group(0), "")

    # 남은 숫자(있으면 더하기)
    if s and re.fullmatch(r"\d+(?:\.\d+)?", s):
        total += int(float(s))
        s = ""

    return total if total > 0 else None

def parse_craft_qty_from_text(text: str):
    """
    연금: '수량: 5개'
    대장: '개수:2개'
    세공: '수량: 2개'
    """
    if not text:
        return None
    t = str(text).replace(" ", "")
    m = re.search(r"(?:수량|개수)\s*[:：]?\s*(\d+)\s*개", t)
    if m:
        try:
            q = int(m.group(1))
            return q if q > 0 else None
        except:
            return None
    return None
