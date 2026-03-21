import os
import json
from datetime import datetime
from normalizer import normalize_item_name, clean_material_name

APP_NAME = "GersangPriceTool"

def get_save_path():
    appdata = os.getenv("APPDATA") or os.path.expanduser("~")
    folder = os.path.join(appdata, APP_NAME)
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "data.json")

SAVE_PATH = get_save_path()

DEFAULT_CATEGORY_RECIPES = {
    "무기장": [],
    "공장": [],
    "목장": [],
    "연금술사": [],
    "세공사": [],
    "대장장이": [],
}

app_state = {
    "dark_mode": False,
    "categories": {},
    "last_refresh_time": None
}
app_state.setdefault("facility_filters", {})

def is_facility_category_name(cname: str) -> bool:
    return cname in ("무기장", "공장", "목장")

def load_state():
    app_state["categories"] = _deepcopy(DEFAULT_CATEGORY_RECIPES)
    app_state["dark_mode"] = False
    app_state["last_refresh_time"] = None  # ✅ 기본값

    if not os.path.exists(SAVE_PATH):
        return

    saved = {}  # ✅ 먼저 초기화 (핵심)

    try:
        with open(SAVE_PATH, "r", encoding="utf-8") as f:
            saved = json.load(f)

        if not isinstance(saved, dict):
            return

        # ✅ 마지막 갱신 시간 복원 (여기로 이동!)
        lrt = saved.get("last_refresh_time")
        if isinstance(lrt, str):
            app_state["last_refresh_time"] = lrt

        dm = saved.get("dark_mode")
        if isinstance(dm, bool):
            app_state["dark_mode"] = dm

        ff = saved.get("facility_filters")
        if isinstance(ff, dict):
            app_state["facility_filters"] = ff

        cats = saved.get("categories")
        if isinstance(cats, dict):
            merged = _deepcopy(DEFAULT_CATEGORY_RECIPES)

            for cname, recipes in cats.items():
                if not isinstance(recipes, list):
                    continue

                fixed_recipes = []
                for r in recipes:
                    if not isinstance(r, dict):
                        continue

                    craft = normalize_item_name(r.get("craft", ""))
                    note = str(r.get("note", "") or "")
                    cost = r.get("cost", None)

                    mats = r.get("materials", [])
                    fixed_mats = []
                    if isinstance(mats, list):
                        for m in mats:
                            if not isinstance(m, dict):
                                continue
                            need = clean_material_name(normalize_item_name(m.get("need", "")))
                            if not need or need in {"총"}:
                                continue

                            fixed_mats.append({
                                "need": need,
                                "qty": int(m.get("qty", 1) or 1),
                                "unit": str(m.get("unit", "-") or "-"),
                                "sum": str(m.get("sum", "-") or "-"),
                                "note": str(m.get("note", "") or ""),
                                "lack": bool(m.get("lack", False))
                            })
                    
                    if craft:
                        if is_facility_category_name(cname):
                            fixed_recipes.append({
                                "base_qty": int(r.get("base_qty", r.get("craft_qty", 1)) or 1),
                                "craft_qty": int(r.get("craft_qty", 1) or 1),
                                "craft": craft,
                                "tools": str(r.get("tools", "") or ""),
                                "work": r.get("work", None),
                                "base_work": r.get("base_work", r.get("work", None)),
                                "remark": str(r.get("remark", "") or ""),
                                "materials": fixed_mats,
                            })
                        else:
                            fixed_recipes.append({
                                "base_qty": int(r.get("base_qty", r.get("craft_qty", 1)) or 1),
                                "craft_qty": int(r.get("craft_qty", 1) or 1),
                                "craft": craft,
                                "note": note,
                                "cost": cost if isinstance(cost, int) else None,
                                "avg_total": r.get("avg_total", None),
                                "materials": fixed_mats,
                            })

                merged[cname] = fixed_recipes

            app_state["categories"] = merged

    except Exception as e:
        print("로드 실패:", e)


def save_state():
    try:
        payload = {
            "dark_mode": app_state.get("dark_mode", False),
            "categories": app_state.get("categories", {}),
            "last_refresh_time": app_state.get("last_refresh_time"),
            "saved_at": datetime.now().strftime("%m-%d %H:%M:%S"),
            "facility_filters": app_state.get("facility_filters", {}),
        }
        with open(SAVE_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("저장 실패:", e)

def _deepcopy(obj):
    return json.loads(json.dumps(obj, ensure_ascii=False))