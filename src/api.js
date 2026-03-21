export async function fetchMasterData() {
  const response = await fetch("/master_data.json", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`마스터 데이터 불러오기 실패: ${response.status}`);
  }

  return response.json();
}

export async function fetchAppState() {
  const response = await fetch("/api/state", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`상태 불러오기 실패: ${response.status}`);
  }

  return response.json();
}

export async function fetchFacilityData({
  facilityType,
  subcategory,
  countries,
  wage,
}) {
  const response = await fetch("/api/facility/fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      facility_type: facilityType,
      subcategory,
      countries,
      wage,
    }),
  });

  if (!response.ok) {
    throw new Error(`시설 데이터 가져오기 실패: ${response.status}`);
  }

  return response.json();
}

export async function refreshPrices({
  serverId,
  wage,
  craftQty,
  baseQty,
  baseWork,
  craftName,
  materials,
}) {
  const response = await fetch("/api/prices/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      server_id: serverId,
      wage,
      craft_qty: craftQty,
      base_qty: baseQty,
      base_work: baseWork,
      craft_name: craftName,
      materials,
    }),
  });

  if (!response.ok) {
    throw new Error(`가격 갱신 실패: ${response.status}`);
  }

  return response.json();
}

