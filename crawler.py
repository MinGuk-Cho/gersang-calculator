import time
import re
from constants import FACILITY_URL, FACILITY_DEFAULT_COUNTRIES, FACILITY_SUBCATEGORY_MAP
from normalizer import clean_material_name, normalize_item_name, parse_craft_qty_from_text, parse_korean_amount_to_int
from calculator import compute_times_from_work_and_wage, format_real_time

def fetch_gjj_craft_qty_map_direct(category: str):
    from playwright.sync_api import sync_playwright
    import re

    URL_MAP = {
        "연금술사": "https://www.gersangjjang.com/zhizuo/skill_lianjin.asp",
        "세공사": "https://www.gersangjjang.com/zhizuo/skill_xigongshi.asp",
        "대장장이": "https://www.gersangjjang.com/zhizuo/skill_tiejiang.asp",
    }

    def norm(s: str) -> str:
        return " ".join((s or "").split()).strip()

    def parse_qty(text: str):
        m = re.search(r"수량\s*:\s*(\d+)\s*개", text or "")
        return int(m.group(1)) if m else 0

    url = URL_MAP.get(category)
    if not url:
        return {}

    qty_map = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            locale="ko-KR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(1000)

        if category in ("연금술사", "대장장이"):
            cards = page.locator("div.card")
            for i in range(cards.count()):
                card = cards.nth(i)

                try:
                    header_text = norm(card.locator(".card-header").first.inner_text(timeout=2000))
                except:
                    continue

                # 예: "30렙 : 경험치두루마기-초급"
                m = re.search(r"^\s*\d+\s*렙\s*:\s*(.+?)\s*$", header_text)
                craft = m.group(1).strip() if m else header_text.strip()
                if not craft:
                    continue

                try:
                    cells = card.locator(".card-body .cell")
                    if cells.count() < 3:
                        continue

                    info_text = norm(cells.nth(2).inner_text(timeout=2000))
                    qty = parse_qty(info_text)
                    if qty <= 0:
                        qty = 1
                except:
                    qty = 1

                qty_map[craft] = qty

        elif category == "세공사":
            rows = page.locator("table tr")
            for i in range(rows.count()):
                tr = rows.nth(i)
                tds = tr.locator("td")
                if tds.count() < 4:
                    continue

                try:
                    craft = norm(tds.nth(0).inner_text(timeout=2000))
                    info_text = norm(tds.nth(3).inner_text(timeout=2000))
                except:
                    continue

                if not craft or "제조목록" in craft:
                    continue

                qty = parse_qty(info_text)
                if qty <= 0:
                    qty = 1

                qty_map[craft] = qty

        browser.close()

    print(f"[QTY MAP] {category}: {len(qty_map)}개")
    return qty_map

def parse_material_lines_segong(text: str):
    """
    ✅ 세공사(테이블) 재료칸 전용 파서
    - 쉼표(,)로 재료를 먼저 분리
    - 각 토큰에서 "이름 + (마지막 숫자)"를 추출
    - 이름에 공백이 있어도 OK (예: '연마용 분말가루30')
    - (+5) 같은 옵션 괄호는 제거
    """
    if not text:
        return []

    s = str(text)

    # 줄바꿈 통일
    s = re.sub(r"[\r\n\u2028\u2029]+", " ", s)

    # (총...), (잔고...) 같은 UI 괄호 제거
    s = re.sub(r"\(\s*총[^)]*\)", " ", s)
    s = re.sub(r"\(\s*(?:잔고|보유|재고|소지|갯수|개수|수량)[^)]*\)", " ", s)

    # (+5) 같은 옵션 표기 제거
    s = re.sub(r"\(\s*\+\s*\d+\s*\)", "", s)

    # '개' 제거
    s = s.replace("개", "")

    # 공백 정리
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return []

    # ✅ 1) 쉼표로 먼저 분리 (세공사 재료칸의 기본 구분자)
    parts = [p.strip() for p in s.split(",") if p.strip()]

    out = []
    for part in parts:
        # 쉼표가 없는 경우도 있으니 part 자체에서 처리
        # 뒤에 붙은 숫자(수량)를 "마지막 숫자"로 뽑기
        m = re.search(r"^(.*?)(\d+)\s*$", part)
        if not m:
            # 혹시 쉼표 대신 공백으로 나열된 경우를 대비해 한번 더 쪼개기(보조)
            # 예: "구리10 아연10" 같은 케이스
            for mm in re.finditer(r"(.*?)(\d+)(?=\s|$)", part):
                name = mm.group(1).strip()
                qty = int(mm.group(2))
                name = clean_material_name(name)
                if name in {"총", ""}:
                    continue
                if name and qty > 0:
                    out.append((name, qty))
            continue

        name = m.group(1).strip()
        qty = int(m.group(2))
        name = clean_material_name(name)
        if name in {"총", ""}:
            continue
        if name and qty > 0:
            out.append((name, qty))

    return out

def fetch_recipes_from_gerniverse_artisan(artisan_type: str):
    """
    gerniverse artisan 제조 탭에서
    연금술사/세공사/대장장이 카드 파싱 (로그/스샷/디버그 출력 없음)
    """
    from playwright.sync_api import sync_playwright
    import re, time

    URL = "https://gerniverse.app/artisan"

    def norm(s: str) -> str:
        return " ".join((s or "").split()).strip()

    def parse_int(s: str):
        if not s:
            return None
        t = re.sub(r"[^\d]", "", str(s))
        return int(t) if t else None

    def parse_x_qty(s: str):
        m = re.search(r"x\s*(\d+)", (s or "").replace(",", ""))
        return int(m.group(1)) if m else None

    results = []
    start_ts = time.time()
    HARD_LIMIT = 120

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            locale="ko-KR",
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36")
        )
        page = context.new_page()
        page.set_default_timeout(10000)
        page.set_default_navigation_timeout(60000)
        page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        try:
            page.goto(URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(800)

            # 쿠키/오버레이
            try:
                cookie_accept = page.locator("button:has-text('수락')").first
                if cookie_accept.count():
                    cookie_accept.click(timeout=2000)
                    page.wait_for_timeout(200)
            except:
                pass
            try:
                page.keyboard.press("Escape")
            except:
                pass

            # 제조 탭 텍스트 대기
            page.wait_for_selector("text=제조", timeout=60000)
            page.wait_for_timeout(400)

            # 버튼 클릭
            btn = page.locator(f"button:has-text('{artisan_type}')").first
            btn.wait_for(state="visible", timeout=30000)
            btn.click(timeout=30000)
            page.wait_for_timeout(1200)
            
            # ✅ 카드 lazy load 대비: 끝까지 자동 스크롤
            last_height = 0
            same_count = 0

            for _ in range(30):
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(700)

                new_height = page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    same_count += 1
                    if same_count >= 3:
                        break
                else:
                    same_count = 0
                    last_height = new_height

            # 다시 맨 위로 올릴 필요는 없음
            page.wait_for_timeout(800)

            # 링크 수집: href 우선 -> 텍스트 폴백
            calc_links = page.locator("a[href*='/item-make-cost']")
            ok = False
            try:
                calc_links.first.wait_for(state="visible", timeout=15000)
                ok = True
            except:
                ok = False

            if not ok:
                calc_links = page.locator("a:has-text('제작 비용 계산기')")
                calc_links.first.wait_for(state="visible", timeout=15000)

            n_links = calc_links.count()
            seen = set()

            print(f"[DEBUG] {artisan_type} link count: {n_links}")

            for i in range(n_links):
                if time.time() - start_ts > HARD_LIMIT:
                    raise RuntimeError(f"[제조기술] 제한시간 초과 (parse_cards {i}/{n_links})")

                link = calc_links.nth(i)

                # ✅ 계산기 링크를 포함하고, 내부에 '제작 재료' 제목이 있는 카드 루트
                card = link.locator(
                    "xpath=ancestor::div[.//h3[contains(., '제작 재료')]][1]"
                )

                try:
                    if card.count() == 0:
                        continue
                except:
                    continue

                # ✅ 제작 아이템명
                craft = ""
                try:
                    craft = norm(
                        card.locator("a.text-base.font-bold[href^='/item/']").first.inner_text(timeout=1500)
                    )
                except:
                    craft = ""

                if not craft:
                    try:
                        craft = norm(card.locator("img[alt]").first.get_attribute("alt") or "")
                    except:
                        craft = ""

                if not craft or craft in seen:
                    continue
                seen.add(craft)

                # ✅ 제작 수량
                craft_qty = 1
                try:
                    qty_wrap = card.locator("span:has-text('제작 수량')").first.locator("xpath=ancestor::div[1]")
                    qty_txt = norm(qty_wrap.locator("span").last.inner_text(timeout=1500))
                    craft_qty = parse_int(qty_txt) or 1
                except:
                    craft_qty = 1

                # ✅ 제작 재료 섹션
                section = card.locator("h3:has-text('제작 재료')").first.locator(
                    "xpath=ancestor::div[contains(@class,'p-4')][1]"
                )

                # ✅ 비용
                cost_int = None
                try:
                    cost_txt = norm(section.locator("span.text-sm.font-bold").first.inner_text(timeout=1500))
                    cost_int = parse_int(cost_txt)
                except:
                    cost_int = None

                # ✅ 재료
                materials = []
                try:
                    mat_links = section.locator("a[href^='/item/']")
                    for k in range(mat_links.count()):
                        mb = mat_links.nth(k)

                        name = ""
                        try:
                            name = norm(mb.locator("img[alt]").first.get_attribute("alt") or "")
                        except:
                            name = ""
                        if not name:
                            continue

                        qty = 1
                        try:
                            badge = mb.locator("xpath=.//div[contains(., 'x')]").last
                            badge_txt = norm(badge.inner_text(timeout=800)) if badge.count() else ""
                            qty = parse_x_qty(badge_txt) or 1
                        except:
                            qty = 1

                        name = clean_material_name(name)
                        if name and qty > 0:
                            materials.append((name, int(qty)))
                except:
                    pass

                if not materials:
                    continue

                results.append({
                    "craft": craft,
                    "materials": materials,
                    "cost_int": cost_int,
                    "craft_qty": int(craft_qty) if craft_qty else 1,
                    "remark": ""
                })

        finally:
            browser.close()

    return results

def fetch_recipes_from_table_url(url: str):
    """
    세공사처럼 <table><tr><td>.. 구조에서:
    - 1번째 td: craft
    - 3번째 td(.hang): materials text
    - 4번째 td: '비용: ...' 만 뽑아 cost_int
    """
    from playwright.sync_api import sync_playwright
    import re

    def norm(s: str) -> str:
        return " ".join((s or "").split()).strip()

    def parse_cost_from_td(text: str):
        # 예: "비용: 1천\n수량: 2개\n숙련도+2"
        if not text:
            return None
        m = re.search(r"비용\s*:\s*([^\n\r<]+)", text)
        if not m:
            return None
        return parse_korean_amount_to_int(m.group(1).strip())

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="ko-KR"
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        page.goto(url, wait_until="domcontentloaded", timeout=60000)

        # ✅ 세공사 테이블 row 대기
        page.wait_for_selector("table tr td", timeout=60000)

        cost_cell = page.locator("table td", has_text="비용:").first
        cost_cell.wait_for(timeout=60000)

        target_table = cost_cell.locator("xpath=ancestor::table[1]")
        rows = target_table.locator("tr")

        for i in range(rows.count()):
            tr = rows.nth(i)
            tds = tr.locator("td")
            if tds.count() < 4:
                continue

            try:
                craft = norm(tds.nth(0).text_content(timeout=6000) or "")
                mats_text = norm(tds.nth(2).text_content(timeout=6000) or "")
                cost_text = norm(tds.nth(3).text_content(timeout=6000) or "")

                if not craft:
                    continue

                # 🔥 제조목록 헤더 제거
                if "제조목록" in craft:
                    continue
            except:
                continue

            if not craft or not mats_text or "비용" not in cost_text:
                continue

            materials = parse_material_lines_segong(mats_text)
            cost_int = parse_cost_from_td(cost_text)
            craft_qty = parse_craft_qty_from_text(cost_text) or 1

            # 비고는 세공사는 일단 비워도 됨
            results.append({
                "craft": craft,
                "materials": materials,
                "cost_int": cost_int,
                "craft_qty": craft_qty,
                "remark": "",
            })

        browser.close()

    return results

def fetch_facility_cards(facility_type: str, subcategory: str, countries=None, wage=None):
    countries = countries or FACILITY_DEFAULT_COUNTRIES
    from playwright.sync_api import sync_playwright
    import re

    def norm(s: str) -> str:
        return " ".join((s or "").split()).strip()

    def parse_num(s: str):
        s = re.sub(r"[^\d]", "", s or "")
        return int(s) if s else None

    def parse_qty_badge(txt: str):
        # "x3" -> 3
        m = re.search(r"x\s*(\d+)", (txt or "").replace(",", ""))
        return int(m.group(1)) if m else None

    def parse_game_days(text: str):
        # "93.0일" / "93.0 일" -> 93.0
        m = re.search(r"([\d.]+)\s*일", text or "")
        return float(m.group(1)) if m else None

    def parse_real_time(text: str):
        # "3.1일(74시간)" -> (3.1, 74)
        m = re.search(r"([\d.]+)\s*일\s*\(\s*([\d,]+)\s*시간\s*\)", text or "")
        if not m:
            return (None, None)
        return (float(m.group(1)), int(m.group(2).replace(",", "")))

    start_ts = time.time()
    HARD_LIMIT = 120  # 전체 작업 75초 넘으면 강제 중단
    results = []

    # =========================
    # ✅ 디버그용 스샷 저장
    # =========================
    def hard_check(step: str):
        if time.time() - start_ts > HARD_LIMIT:
            try:
                page.screenshot(path="facility_hang.png", full_page=True)
                print("디버그 스샷 저장: facility_hang.png")
            except Exception as e:
                print("❌ 스샷 저장 실패:", repr(e))
            raise RuntimeError(f"[시설] 제한시간 초과로 중단됨 (멈춘 단계: {step})")


    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(
            viewport={"width": 1400, "height": 900},
            locale="ko-KR",
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36")
        )
        page = context.new_page()
        page.set_default_timeout(5000)
        page.set_default_navigation_timeout(60000)
        page.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")

        # ✅ (중요) 시설 페이지로 이동하는 코드 - 이게 빠져있어서 계속 타임아웃 난 거야
        page.goto(FACILITY_URL, wait_until="domcontentloaded", timeout=60000)

        page.wait_for_timeout(1200)

        # 1) 쿠키 배너 "수락" 클릭
        try:
            cookie_accept = page.locator("button:has-text('수락')").first
            if cookie_accept.count():
                cookie_accept.click(timeout=3000)
                page.wait_for_timeout(300)
        except:
            pass

        # 2) 안내 패널 접기 (있으면)
        try:
            fold_btn = page.locator("button:has-text('접기')").first
            if fold_btn.count():
                fold_btn.click(timeout=2000)
                page.wait_for_timeout(200)
        except:
            pass

        # 3) 혹시 남아있는 오버레이 대비
        try:
            page.keyboard.press("Escape")
        except:
            pass

        # 4) 필터 칩(국가/시설)이 화면에 보일 때까지 대기
        page.wait_for_selector("text=국가 선택", timeout=60000)
        page.wait_for_selector("text=시설 종류", timeout=60000)

        # ✅ 페이지가 렌더링될 시간을 조금 준다
        page.wait_for_timeout(1200)

        # ✅ 버튼/input이 뜨는지 확인 (networkidle은 쓰지 말자)
        page.wait_for_selector(":is(button, input, select)", timeout=60000)

        def safe_click_by_text(page, text: str, timeout=15000):
            """버튼이든 div/span이든 텍스트로 최대한 클릭"""
            text = (text or "").strip()
            if not text:
                return False

            # 0) 화면 안정화 (가끔 오버레이/포커스 문제)
            try:
                page.keyboard.press("Escape")
            except:
                pass

            # 1) 가장 광범위: button/a/div/span 중 텍스트 포함 요소
            try:
                loc = page.locator(f":is(button,a,div,span):has-text('{text}')").first
                if loc.count():
                    loc.scroll_into_view_if_needed()
                    loc.click(timeout=timeout)
                    return True
            except:
                pass

            # 2) 정확 텍스트 클릭
            try:
                loc = page.get_by_text(text, exact=True).first
                if loc.count():
                    loc.scroll_into_view_if_needed()
                    loc.click(timeout=timeout)
                    return True
            except:
                pass

            # 3) 부분일치 텍스트 클릭(마지막 수단)
            try:
                loc = page.get_by_text(text, exact=False).first
                if loc.count():
                    loc.scroll_into_view_if_needed()
                    loc.click(timeout=timeout)
                    return True
            except:
                pass

            return False

        # ✅ 임금 입력 (값이 있을 때만)
        def find_wage_input(page):
            cands = [
                page.locator("#wage-input"),
                page.locator("input[name*='wage' i]"),
                page.locator("input[placeholder*='임금']"),
                page.locator("label:has-text('임금')").locator("xpath=following::input[1]"),
                page.locator(":text('임금')").first.locator("xpath=following::input[1]"),
            ]
            for loc in cands:
                try:
                    if loc and loc.count():
                        return loc.first
                except:
                    pass
            return None

        # ✅ 임금 입력 (값이 있을 때만)
        if wage is not None and wage > 0:
            wage_input = find_wage_input(page)
            if wage_input:
                try:
                    wage_input.scroll_into_view_if_needed()
                    wage_input.fill("")
                    wage_input.type(str(wage), delay=20)
                    page.wait_for_timeout(500)
                except Exception as e:
                    print("임금 입력 실패:", e)
            else:
                print("[경고] 임금 입력칸을 찾지 못함(임금 입력 스킵)")

        # ✅ 국가 선택(텍스트 기반으로 더 튼튼하게 클릭)
        for c in countries:
            btn = page.locator(f"button:has-text('{c}')").first
            btn.wait_for(state="visible", timeout=20000)
            btn.click(timeout=20000)
            page.wait_for_timeout(300)

        # ✅ 시설 종류 선택
        btn = page.locator(f"button:has-text('{facility_type}')").first
        btn.wait_for(state="visible", timeout=20000)
        btn.click(timeout=20000)
        page.wait_for_timeout(300)

        # ✅ 세부 분류 선택
        if subcategory:
            btn = page.locator(f"button:has-text('{subcategory}')").first
            btn.wait_for(state="visible", timeout=20000)
            btn.click(timeout=20000)
            page.wait_for_timeout(300)

        # ✅ 카드 로딩 대기

        deadline = time.time() + 45

        while True:
            # ✅ count() 대신, 0.3초만 기다려보고 있으면 성공 처리
            try:
                page.wait_for_selector("div.group.relative.flex.flex-col:has(a[href^='/item/'])", timeout=300)
                break
            except Exception:
                pass

            if time.time() > deadline:
                png = "facility_no_cards.png"
                try:
                    page.screenshot(path=png, full_page=True)
                    print("디버그 스샷 저장 OK:", png)
                except Exception as e:
                    print("❌ 스샷 저장 실패:", repr(e))
                raise RuntimeError("카드가 45초 내 로딩되지 않음(필터 선택이 실제 적용되지 않았을 가능성).")

            page.wait_for_timeout(300)

        # 조금 더 기다림 (렌더 애니메이션 대비)
        page.wait_for_timeout(1500)
        
        cards = page.locator("div.group.relative.flex.flex-col:has(a[href^='/item/'])")
        for i in range(cards.count()):
            if i % 20 == 0:
                hard_check(f"카드 파싱 {i}/{cards.count()}")

            card = cards.nth(i)

            # 1) 제작 아이템명: 카드 헤더의 대표 이미지(img alt)
            craft_alt = ""
            try:
                # ✅ 카드 헤더 대표 이미지: h-16 w-16 박스 안의 img
                craft_alt = norm(card.locator("div.h-16.w-16 img[alt]").first.get_attribute("alt") or "")
            except:
                craft_alt = ""

            # fallback: 혹시 클래스가 바뀌면, 카드 안에서 가장 처음 나오는 img alt 사용
            if not craft_alt:
                try:
                    craft_alt = norm(card.locator("img[alt]").first.get_attribute("alt") or "")
                except:
                    craft_alt = ""

            if not craft_alt:
                continue

            # 2) 제작 수량: <span class="text-sm font-black">1</span>
            craft_qty = 1
            try:
                qty_txt = norm(card.locator("span.text-sm.font-black").first.inner_text(timeout=1500))
                craft_qty = parse_num(qty_txt) or 1
            except:
                craft_qty = 1

            # 3) 제작 재료: img alt + xN
            materials = []
            try:
                grid_items = card.locator("div.grid.grid-cols-3").first.locator("div.group\\/item")
                for k in range(grid_items.count()):
                    gi = grid_items.nth(k)
                    name = norm(gi.locator("img[alt]").first.get_attribute("alt") or "")
                    badge = gi.locator("div.absolute.-bottom-1.-right-1").first
                    badge_txt = norm(badge.inner_text(timeout=1500)) if badge.count() else ""
                    qty = parse_qty_badge(badge_txt) or 1
                    if name:
                        materials.append((name, qty))
            except:
                pass

            # 4) 필요 도구: 도구 pill의 img alt
            tools = []
            try:
                tool_imgs = card.locator("div.mt-auto img[alt]")
                for t in range(tool_imgs.count()):
                    tools.append(norm(tool_imgs.nth(t).get_attribute("alt") or ""))
            except:
                pass
            tools = [x for x in tools if x]
            tools_text = ", ".join(sorted(set(tools)))

            # 5) 작업량
            work = None
            try:
                wrap = card.locator("span:has-text('작업량')").first.locator("xpath=ancestor::div[1]")
                work_txt = norm(wrap.inner_text(timeout=1500))
                work = parse_num(work_txt)
            except:
                work = None

            # 6) 시간(임금 있을 때만) - ✅ 웹에서 읽지 말고 직접 계산
            game_days = None
            real_days = None
            real_hours = None
            real_minutes = None
            real_fmt = "dh"

            if wage is not None and wage > 0 and isinstance(work, int) and work > 0:
                g, rd, rh, rmin = compute_times_from_work_and_wage(work, int(wage))
                game_days = g
                real_days = rd
                real_hours = rh
                real_minutes = rmin
                real_fmt = "dh"

            results.append({
                "craft": craft_alt,
                "materials": materials,
                "craft_qty": craft_qty,
                "tools": tools_text,
                "work": work,
                "game_days": game_days,
                "real_days": real_days,
                "real_hours": real_hours,
                "remark": "",
                "real_minutes": real_minutes,
                "real_fmt": real_fmt
            })

        browser.close()

    return results

def _label_value(card, label: str) -> str:
    """카드 내부에서 '현실 시간' 같은 라벨 옆의 값을 안정적으로 뽑음"""
    try:
        lab = card.locator(f"span:has-text('{label}')").first
        if lab.count() == 0:
            return ""
        # ✅ 라벨 바로 옆 span이 값인 구조가 많음
        val = lab.locator("xpath=following-sibling::span[1]").first
        if val.count():
            return _pw_norm(val.inner_text(timeout=1500))
        # fallback: 같은 줄(div) 안에 두 번째 span
        wrap = lab.locator("xpath=ancestor::div[1]")
        val2 = wrap.locator("span").nth(1)
        return _pw_norm(val2.inner_text(timeout=1500)) if val2.count() else ""
    except:
        return ""

def _parse_game_days(text: str):
    m = re.search(r"([\d.]+)\s*일", text or "")
    return float(m.group(1)) if m else None

def _parse_real_time(text: str):
    if not text:
        return (None, None)

    t = text.replace(" ", "")

    # 1️⃣ 2.0일(47시간) 형식
    m = re.search(r"([\d.]+)일(?:\(([\d,]+)시간\))?", t)
    if m:
        days = float(m.group(1))
        hours = m.group(2)
        hours = int(hours.replace(",", "")) if hours else None
        return (days, hours)

    # 2️⃣ 11시간54분 형식
    m2 = re.search(r"(\d+)시간(?:(\d+)분)?", t)
    if m2:
        h = int(m2.group(1))
        m = int(m2.group(2)) if m2.group(2) else 0
        total_hours = h + (m / 60)
        days = round(total_hours / 24, 1)
        return (days, int(total_hours))

    return (None, None)

def _parse_real_minutes(text: str):
    if not text:
        return (None, "dh")

    raw = str(text).strip()
    t = raw.replace(" ", "")

    # 1)  1.2일(30시간) / 1.2일 형태
    m = re.search(r"([\d.]+)일(?:\(([\d,]+)시간\))?", t)
    if m:
        days = float(m.group(1))
        hours_in_paren = m.group(2)
        if hours_in_paren:
            h = int(hours_in_paren.replace(",", ""))
            return (h * 60, "dh")
        # 괄호 시간이 없으면 days로 환산
        total_min = int(round(days * 24 * 60))
        return (total_min, "dh")

    # 2) 11시간 54분 / 11시간 / 54분
    h = 0
    mm = 0

    mh = re.search(r"(\d+)시간", t)
    if mh:
        h = int(mh.group(1))

    mmin = re.search(r"(\d+)분", t)
    if mmin:
        mm = int(mmin.group(1))

    if mh or mmin:
        return (h * 60 + mm, "hm")

    return (None, "dh")

