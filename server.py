from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from crawler import fetch_facility_cards
from pricing import get_offers_ex
from pricing import get_market_price_for_qty_ex

from state import app_state, load_state, save_state
from calculator import (
    recalc_facility_values,
    _to_int_price,
    fmt_won,
    build_note,
    build_parent_note,
    calc_facility_runs,
    calc_facility_parent_sum,
)

app = FastAPI(title="Gersang Helper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://gersang-calculator-git-main-min-guk-chos-projects.vercel.app",
        "https://gersang-calculator.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MaterialRow(BaseModel):
    name: str
    need_qty: int


class PriceRefreshRequest(BaseModel):
    server_id: int = 1
    craft_name: Optional[str] = None
    craft_qty: Optional[int] = None
    base_qty: Optional[int] = None
    base_work: Optional[int] = None
    wage: Optional[int] = None
    materials: List[MaterialRow]


def calc_material_purchase(offers: List[tuple], need_qty: int):
    """
    offers: [(price, qty), ...]
    return:
      {
        "filled_qty": int,
        "total_cost": int,
        "unit_price": int | None,   # 평균단가(총합/채운수량)
        "lowest_price": int | None,
        "lack_qty": int,
        "is_lack": bool,
      }
    """
    need_qty = int(need_qty or 0)
    if need_qty <= 0:
        return {
            "filled_qty": 0,
            "total_cost": 0,
            "unit_price": None,
            "lowest_price": None,
            "lack_qty": 0,
            "is_lack": False,
        }

    total_cost = 0
    filled = 0
    lowest_price = offers[0][0] if offers else None

    for price, qty in offers:
        if filled >= need_qty:
            break
        take = min(int(qty), need_qty - filled)
        if take <= 0:
            continue
        total_cost += int(price) * int(take)
        filled += int(take)

    lack_qty = max(0, need_qty - filled)
    is_lack = lack_qty > 0
    unit_price = int(round(total_cost / filled)) if filled > 0 else None

    return {
        "filled_qty": filled,
        "total_cost": total_cost,
        "unit_price": unit_price,
        "lowest_price": lowest_price,
        "lack_qty": lack_qty,
        "is_lack": is_lack,
    }


@app.post("/api/prices/refresh")
def refresh_prices(req: PriceRefreshRequest):
    updated_materials = []
    child_sum = 0

    for mat in req.materials:
        offers, used_name = get_offers_ex(mat.name, server_id=req.server_id)

        info = calc_material_purchase(offers, mat.need_qty)

        note = build_note(
            user_note="",
            lowest_price=info["lowest_price"],
            is_lack=info["is_lack"],
            lack_cnt=info["lack_qty"],
            total_avail=info["filled_qty"],
            need_qty=mat.need_qty,
        )

        row = {
            "name": mat.name,
            "used_name": used_name,
            "need_qty": mat.need_qty,
            "unit_price": info["unit_price"],
            "unit_price_text": fmt_won(info["unit_price"]) if isinstance(info["unit_price"], int) else "-",
            "sum": info["total_cost"],
            "sum_text": fmt_won(info["total_cost"]) if info["total_cost"] > 0 else "-",
            "note": note,
            "lack": info["is_lack"],
            "lack_qty": info["lack_qty"],
            "filled_qty": info["filled_qty"],
        }
        updated_materials.append(row)

        if info["total_cost"] > 0:
            child_sum += info["total_cost"]

    parent_sum = child_sum
    if (
        isinstance(req.craft_qty, int)
        and isinstance(req.base_qty, int)
        and isinstance(req.base_work, int)
        and isinstance(req.wage, int)
    ):
        runs = calc_facility_runs(req.craft_qty, req.base_qty)
        parent_sum = calc_facility_parent_sum(
            child_sum=child_sum,
            base_work=req.base_work,
            runs=runs,
            wage=req.wage,
        )
    else:
        runs = None

    parent_note = build_parent_note("", parent_sum, req.craft_qty or 0)

    response = {
        "materials": updated_materials,
        "child_sum": child_sum,
        "child_sum_text": fmt_won(child_sum) if child_sum > 0 else "-",
        "runs": runs,
        "parent_sum": parent_sum,
        "parent_sum_text": fmt_won(parent_sum) if parent_sum > 0 else "-",
        "parent_note": parent_note,
    }

    # ✅ 부모 완성품 시장가 계산 추가
    if req.craft_name:
        market_info = get_market_price_for_qty_ex(
            item_name=req.craft_name,
            need_qty=req.craft_qty or 1,
            server_id=req.server_id,
        )

        if market_info:
            response["parent_market_price"] = market_info["total_price"]
            response["parent_market_price_text"] = (
                fmt_won(market_info["total_price"])
                if market_info["total_price"] > 0
                else "-"
            )
            response["parent_market_unit_price"] = market_info["unit_price"]
            response["parent_market_unit_price_text"] = (
                fmt_won(market_info["unit_price"])
                if isinstance(market_info["unit_price"], int)
                else "-"
            )
            response["parent_market_filled_qty"] = market_info["filled_qty"]
            response["parent_market_target_qty"] = market_info["target_qty"]
            response["parent_market_lowest_price"] = market_info["lowest_price"]
            response["parent_market_lowest_price_text"] = (
                fmt_won(market_info["lowest_price"])
                if isinstance(market_info["lowest_price"], int)
                else "-"
            )
            response["parent_market_used_name"] = market_info["used_name"]

    return response

class FacilityFetchRequest(BaseModel):
    facility_type: str
    subcategory: str
    countries: List[str]
    wage: Optional[int] = None

@app.post("/api/facility/fetch")
def facility_fetch(req: FacilityFetchRequest):
    rows = fetch_facility_cards(
        facility_type=req.facility_type,
        subcategory=req.subcategory,
        countries=req.countries,
        wage=req.wage,
    )
    return {"items": rows}

class SaveStateRequest(BaseModel):
    state: Dict[str, Any]


class FacilityRecalcRequest(BaseModel):
    craft_qty: int
    base_qty: int
    base_work: int
    wage: int
    child_sum: int


@app.get("/api/state")
def get_state():
    load_state()
    return app_state


@app.post("/api/state")
def post_state(req: SaveStateRequest):
    app_state.clear()
    app_state.update(req.state)
    save_state()
    return {"ok": True}


@app.post("/api/facility/recalc")
def facility_recalc(req: FacilityRecalcRequest):
    result = recalc_facility_values(
        craft_qty=req.craft_qty,
        base_qty=req.base_qty,
        base_work=req.base_work,
        wage=req.wage,
        child_sum=req.child_sum,
    )
    return result
