import requests
import time
import re
from normalizer import (
    normalize_item_name,
    make_ui_candidate_by_ui,
    make_candidate_remove_eui,
    make_candidates_insert_eui,
)
from calculator import _to_int, _to_int_price


MARKET_API_URL = "https://www.gersanginfo.com/api/game/market/new/search"

_price_cache = {}  # { (serverId, itemName): (price_or_None, ts) }

CACHE_TTL = 60     # 초

_sess = requests.Session()

_sess.headers.update({
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.gersanginfo.com/game/market"
})

def get_market_price_for_qty_ex(item_name: str, need_qty: int, server_id: int = 1):
    """
    부모/자식 공통:
    시장 매물을 가격 오름차순으로 가져와서,
    need_qty 만큼만 누적 구매했을 때의
    총액/평균단가/채운수량을 계산한다.

    return:
      {
        "used_name": str,
        "filled_qty": int,
        "target_qty": int,
        "total_price": int,
        "unit_price": int | None,
        "lowest_price": int | None,
      }
      또는 None
    """
    target_qty = _to_int(need_qty)
    if target_qty is None or target_qty <= 0:
        target_qty = 1

    offers, used_name = get_offers_ex(item_name, server_id=server_id)
    if not offers:
        return None

    remain = target_qty
    total_price = 0
    filled_qty = 0
    lowest_price = offers[0][0] if offers else None

    for price, qty in offers:
        if remain <= 0:
            break

        take_qty = min(remain, qty)
        total_price += price * take_qty
        filled_qty += take_qty
        remain -= take_qty

    # 수량이 부족하면 있는 것만 기준으로 평균
    if filled_qty <= 0:
        return None

    unit_price = round(total_price / filled_qty)

    return {
        "used_name": used_name,
        "filled_qty": filled_qty,
        "target_qty": target_qty,
        "total_price": total_price,
        "unit_price": unit_price,
        "lowest_price": lowest_price,
    }

def get_lowest_price_ex(item_name: str, server_id: int = 1):
    item_name = normalize_item_name(item_name)
    now = time.time()

    def call_api(name: str):
        params = {
            "serverId": server_id,
            "page": 0,
            "size": 70,
            "itemName": name,
            "sort": "price,asc"
        }
        try:
            r = _sess.get(MARKET_API_URL, params=params, timeout=10)
            r.raise_for_status()
            data = r.json()
            rows = data.get("content") if isinstance(data, dict) else None
            if not rows:
                return []

            prices = []
            target_ns = normalize_item_name(name).replace(" ", "")

            for row in rows:
                if not isinstance(row, dict):
                    continue

                # ✅ 정확 이름만 필터링
                row_name = row.get("itemName") or row.get("name")
                if not row_name and isinstance(row.get("item"), dict):
                    row_name = row["item"].get("name")

                row_ns = normalize_item_name(row_name or "").replace(" ", "")
                if row_ns != target_ns:
                    continue

                p = _to_int_price(row.get("price"))
                if p is not None:
                    prices.append(p)

            return prices
        except:
            return []

    def call_try(name: str):
        key = (server_id, name)
        if key in _price_cache:
            v, ts = _price_cache[key]
            if now - ts < CACHE_TTL:
                return v, name

        prices = call_api(name)
        if prices:
            lowest = min(prices)
            _price_cache[key] = (lowest, now)
            return lowest, name

        _price_cache[key] = (None, now)
        return None, None

    # 🔥 후보 리스트 생성
    candidates = []

    # 1) 원본
    candidates.append(item_name)

    # 2) 의 띄어쓰기 후보
    cand_space = make_ui_candidate_by_ui(item_name)
    if cand_space:
        candidates.append(cand_space)

    # 3) 의 제거 후보
    cand_remove = make_candidate_remove_eui(item_name)
    if cand_remove:
        candidates.append(cand_remove)

    # 4) 의 삽입 후보
    for c in make_candidates_insert_eui(item_name):
        if c and c not in candidates:
            candidates.append(c)

    # 중복 제거
    seen = set()
    candidates = [x for x in candidates if x and (x not in seen and not seen.add(x))]

    for name in candidates:
        price, used = call_try(name)
        if price is not None:
            _price_cache[(server_id, item_name)] = (price, now)
            return price, used

    _price_cache[(server_id, item_name)] = (None, now)
    return None, None

def get_offers_ex(item_name: str, server_id: int = 1):
    """
    검색 순서:
    1) 원본
    2) '의' 기준 띄어쓰기 후보 (사막기린의가죽 -> 사막기린의 가죽)
    3) '의' 제거 후보 (유령해저왕의비늘 -> 유령해저왕비늘)  # 너가 이전에 추가했던 거 유지 가능
    4) '의' 삽입 후보 (이무기비늘 -> 이무기의비늘 -> 이무기의 비늘)
    """
    item_name = normalize_item_name(item_name)

    # 1) 원본
    offers = get_offers(item_name, server_id=server_id)
    if offers:
        return offers, item_name

    # 2) '의' 기준 띄어쓰기 후보
    cand = make_ui_candidate_by_ui(item_name)
    if cand:
        offers = get_offers(cand, server_id=server_id)
        if offers:
            return offers, cand

    # 3) '의' 제거 후보 (너가 이미 추가해둔 함수가 있다면 사용)
    # 없으면 이 블록은 지워도 됨
    try:
        cand2 = make_candidate_remove_eui(item_name)
    except NameError:
        cand2 = None

    if cand2:
        offers = get_offers(cand2, server_id=server_id)
        if offers:
            return offers, cand2

    # 4) '의' 삽입 후보(2개)
    for cand3 in make_candidates_insert_eui(item_name):
        offers = get_offers(cand3, server_id=server_id)
        if offers:
            return offers, cand3

    return [], item_name

def get_offers(item_name: str, server_id: int = 1):
    """
    return: [(price:int, qty:int), ...]  # price 오름차순
    """
    name = normalize_item_name(item_name)
    params = {
        "serverId": server_id,
        "page": 0,
        "size": 70,
        "itemName": name,
        "sort": "price,asc"
    }

    target_ns = normalize_item_name(name).replace(" ", "")

    for attempt in range(3):
        try:
            r = _sess.get(MARKET_API_URL, params=params, timeout=10)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(0.4 * (attempt + 1))
                continue
            r.raise_for_status()

            data = r.json()
            rows = data.get("content") if isinstance(data, dict) else None
            if not rows:
                return []

            offers = []
            for row in rows:
                if not isinstance(row, dict):
                    continue

                # ✅ 정확 이름만 필터링 (부분검색 섞임 방지)
                row_name = row.get("itemName") or row.get("name")
                if not row_name and isinstance(row.get("item"), dict):
                    row_name = row["item"].get("name")

                row_ns = normalize_item_name(row_name or "").replace(" ", "")
                if row_ns != target_ns:
                    continue

                p = _to_int(row.get("price"))
                if p is None:
                    continue

                q = _to_int(row.get("quantity"))
                if q is None or q <= 0:
                    q = 1
                offers.append((p, q))

            offers.sort(key=lambda x: x[0])
            return offers

        except requests.exceptions.RequestException:
            time.sleep(0.4 * (attempt + 1))
            continue

    return []

