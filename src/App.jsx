import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Hammer,
  Factory,
  Trees,
  FlaskConical,
  Gem,
  Anvil,
  Plus,
  Trash2,
  Coins,
} from "lucide-react";
import "./App.css";
import {
  FACILITY_CATEGORIES,
  TECH_CATEGORIES,
  FACILITY_SUBCATEGORY_MAP,
  FACILITY_COUNTRIES,
  defaultAppState,
} from "./mockData";

import {
  fetchAppState,
  refreshPrices,
  fetchMasterData,
} from "./api";

const LOCAL_STATE_KEY = "gersang-web-state-v2";

const CATEGORY_META = {
  무기장: { icon: Hammer },
  공장: { icon: Factory },
  목장: { icon: Trees },
  연금술사: { icon: FlaskConical },
  세공사: { icon: Gem },
  대장장이: { icon: Anvil },
};

const WAGE_OPTIONS = Array.from({ length: 30 }, (_, i) => String((i + 1) * 100));

export default function App() {
  const [masterData, setMasterData] = useState(null);
  const [screen, setScreen] = useState("home");
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [wage, setWage] = useState("100");
  const [country, setCountry] = useState("조선");
  const [subcategory, setSubcategory] = useState("궁포공장");

  const [recipesByCategory, setRecipesByCategory] = useState(defaultAppState.categories);
  const [lastRefreshText, setLastRefreshText] = useState("아직 가격 갱신 기록 없음");

  const [isLoadingState, setIsLoadingState] = useState(true);
  const [loadError, setLoadError] = useState("");

  const isFacility = FACILITY_CATEGORIES.includes(selectedCategory || "");
  const isTech = TECH_CATEGORIES.includes(selectedCategory || "");
  
  const [hasPriceData, setHasPriceData] = useState(false);
  const [favorites, setFavorites] = useState({});
  const [favoriteFacilityRowsState, setFavoriteFacilityRowsState] = useState([]);
  const [favoriteTechRowsState, setFavoriteTechRowsState] = useState([]);
  const [directCraftMode, setDirectCraftMode] = useState(false);
  const [techUnitOverrides, setTechUnitOverrides] = useState({});
  const [facilityUnitOverrides, setFacilityUnitOverrides] = useState({});
  
  const [actionMessage, setActionMessage] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [searchText, setSearchText] = useState("");
	
	const handleToggleFavorite = useCallback(
	  ({ category, country, subcategory, isFacility, craft }) => {
	  const key = getFavoriteKey({
		category,
		country,
		subcategory,
		isFacility,
		craft,
	  });

	  setFavorites((prev) => {
		const next = { ...prev };

		if (next[key]) {
		  delete next[key];
		  setActionMessage(`즐겨찾기에서 제거: ${craft}`);
		} else {
		  next[key] = {
			category,
			country: isFacility ? country : "",
			subcategory: isFacility ? subcategory : "",
			isFacility,
			craft,
		  };
		  setActionMessage(`즐겨찾기에 추가: ${craft}`);
		}

		return next;
	  });
	  },
	  []
	);

	const currentPriceCacheKey = useMemo(() => {
	  if (!selectedCategory) return "";
	  return getPriceCacheKey({
		category: selectedCategory,
		country,
		subcategory,
		isFacility,
	  });
	}, [selectedCategory, country, subcategory, isFacility]);
	
	const handleClearSavedState = useCallback(() => {
	  if (!currentPriceCacheKey) return;

	  clearPriceCache(currentPriceCacheKey);
	  setActionMessage("현재 화면의 가격 캐시를 초기화했습니다.");

	  if (!masterData || !selectedCategory) return;

	  const masterRows = getMasterRows(
		masterData,
		selectedCategory,
		country,
		subcategory,
		isFacility
	  );

	  const copiedRows = JSON.parse(JSON.stringify(masterRows || []));

	  setRecipesByCategory((prev) => ({
		...prev,
		[selectedCategory]: copiedRows,
	  }));

	  setLastRefreshText("아직 가격 갱신 기록 없음");
	  setHasPriceData(false);

	  if (isFacility) {
		const nextExpanded = {};
		copiedRows.forEach((row) => {
		  nextExpanded[row.id] = true;
		});
		setExpandedRows(nextExpanded);
	  }
	}, [currentPriceCacheKey, masterData, selectedCategory, country, subcategory, isFacility]);
	
	useEffect(() => {
	  if (screen === "favorite-facility") {
		setFavoriteFacilityRowsState((prev) => recalcFacilityRowsWithWage(prev, wage));
		return;
	  }

	  if (!selectedCategory || !isFacility) return;

	  setRecipesByCategory((prev) => {
		const currentRows = prev[selectedCategory] || [];
		if (!currentRows.length) return prev;

		return {
		  ...prev,
		  [selectedCategory]: recalcFacilityRowsWithWage(currentRows, wage),
		};
	  });
	}, [wage, selectedCategory, isFacility, screen]);
	
	useEffect(() => {
	  let mounted = true;

	  async function loadMaster() {
		try {
		  const data = await fetchMasterData();
		  if (!mounted) return;
		  setMasterData(data);
		} catch (error) {
		  console.error("마스터 데이터 불러오기 실패:", error);
		  if (!mounted) return;
		  setActionMessage("마스터 데이터를 불러오지 못했습니다.");
		}
	  }

	  loadMaster();

	  return () => {
		mounted = false;
	  };
	}, []);

	useEffect(() => {
	  if (!masterData || !selectedCategory) return;

	  const rows = getMasterRows(
		masterData,
		selectedCategory,
		country,
		subcategory,
		isFacility
	  );

	  if (!rows.length) {
		setRecipesByCategory((prev) => ({
		  ...prev,
		  [selectedCategory]: [],
		}));
		setExpandedRows({});
		return;
	  }

		const copiedRows = JSON.parse(JSON.stringify(rows));

		const cacheKey = getPriceCacheKey({
		  category: selectedCategory,
		  country,
		  subcategory,
		  isFacility,
		});

		const cached = loadPriceCache(cacheKey);

		const sourceRows =
		  cached?.rows && Array.isArray(cached.rows) ? cached.rows : copiedRows;
		  
		const finalRows = isFacility ? sourceRows : normalizeTechRows(sourceRows);

		setRecipesByCategory((prev) => ({
		  ...prev,
		  [selectedCategory]: finalRows,
		}));

		if (cached?.lastRefreshText) {
		  setLastRefreshText(cached.lastRefreshText);
		} else {
		  setLastRefreshText("아직 가격 갱신 기록 없음");
		}
		
		setHasPriceData(!!(cached?.rows && Array.isArray(cached.rows)));

		if (isFacility) {
		  const nextExpanded = {};
		  finalRows.forEach((row) => {
			nextExpanded[row.id] = true;
		  });
		  setExpandedRows(nextExpanded);
		} else {
		  setExpandedRows({});
		}

	  setActionMessage("고정 데이터를 불러왔습니다.");
	}, [masterData, selectedCategory, country, subcategory, isFacility]);

	useEffect(() => {
	  if (isLoadingState) return;

	  saveLocalAppState({
		recipesByCategory,
		lastRefreshText,
		wage,
		country,
		subcategory,
		expandedRows,
		favorites,
		searchText,
		techUnitOverrides,
		facilityUnitOverrides,
		directCraftMode,
	  });
	}, [
		isLoadingState,
		recipesByCategory,
		lastRefreshText,
		wage,
		country,
		subcategory,
		expandedRows,
		favorites,
		searchText,
		techUnitOverrides,
		facilityUnitOverrides,
		directCraftMode,
	]);
	
	useEffect(() => {
	  let mounted = true;

	  async function loadState() {
		try {
			setIsLoadingState(true);
			setLoadError("");

			const localState = loadLocalAppState();

			if (localState && mounted) {

			  setRecipesByCategory(
				localState.recipesByCategory && typeof localState.recipesByCategory === "object"
				  ? localState.recipesByCategory
				  : defaultAppState.categories
			  );

			  setLastRefreshText(
				typeof localState.lastRefreshText === "string" && localState.lastRefreshText.trim()
				  ? localState.lastRefreshText
				  : "아직 가격 갱신 기록 없음"
			  );

			  setWage(
				typeof localState.wage === "string" && localState.wage
				  ? localState.wage
				  : "100"
			  );

			  setCountry(
				typeof localState.country === "string" && localState.country
				  ? localState.country
				  : "조선"
			  );

			  setSubcategory(
				typeof localState.subcategory === "string" && localState.subcategory
				  ? localState.subcategory
				  : "궁포공장"
			  );

			  setExpandedRows(
				localState.expandedRows && typeof localState.expandedRows === "object"
				  ? localState.expandedRows
				  : {}
			  );

			  setFavorites(
				localState.favorites && typeof localState.favorites === "object"
				  ? localState.favorites
				  : {}
			  );
			  
				setTechUnitOverrides(
				  localState.techUnitOverrides && typeof localState.techUnitOverrides === "object"
					? localState.techUnitOverrides
					: {}
				);

				setFacilityUnitOverrides(
				  localState.facilityUnitOverrides && typeof localState.facilityUnitOverrides === "object"
					? localState.facilityUnitOverrides
					: {}
				);

				setDirectCraftMode(!!localState.directCraftMode);
				setSearchText(typeof localState.searchText === "string" ? localState.searchText : "");

			  setActionMessage("저장된 데이터를 불러왔습니다.");
			  setIsLoadingState(false);
			  return;
			}

			const data = await fetchAppState();

			if (!mounted) return;

			const loadedCategories =
			  data?.categories && typeof data.categories === "object"
				? data.categories
				: defaultAppState.categories;

			const loadedLastRefresh =
			  typeof data?.last_refresh_time === "string" && data.last_refresh_time.trim()
				? data.last_refresh_time
				: "아직 가격 갱신 기록 없음";

			setRecipesByCategory(loadedCategories);
			setLastRefreshText(loadedLastRefresh);
			setFavorites({});
			setSearchText("");
		  } catch (error) {
			console.error("앱 상태 불러오기 실패:", error);

			if (!mounted) return;

			setLoadError("서버 상태를 불러오지 못해 기본 데이터로 실행 중");
			setRecipesByCategory(defaultAppState.categories);
			setLastRefreshText("아직 가격 갱신 기록 없음");
			setFavorites({});
			setSearchText("");
		  } finally {
			if (mounted) {
			  setIsLoadingState(false);
			}
		  }
		}

	  loadState();

	  return () => {
		mounted = false;
	  };
	}, []);

	const currentSubcategories = useMemo(() => {
	  if (!selectedCategory || !isFacility) return [];
      return FACILITY_SUBCATEGORY_MAP[selectedCategory] || [];
	}, [selectedCategory, isFacility]);

	const rows = useMemo(() => {
	  if (!selectedCategory) return [];
	  return recipesByCategory[selectedCategory] || [];
	}, [selectedCategory, recipesByCategory]);
	
	const favoriteFacilityBaseRows = useMemo(() => {
	  if (!masterData) return [];

	  return Object.values(favorites || {})
		.filter((item) => item.isFacility)
		.map((item, idx) => {
		  const sourceRows =
			masterData?.facility?.[item.category]?.[item.country]?.[item.subcategory] ?? [];

		  const foundRow = sourceRows.find((row) => row.craft === item.craft);
		  if (!foundRow) return null;

		  const copied = JSON.parse(JSON.stringify(foundRow));

		  return {
			...copied,
			id: `fav-f-${idx}-${item.category}-${item.country}-${item.subcategory}-${item.craft}`,
			favoriteMeta: {
			  category: item.category,
			  country: item.country,
			  subcategory: item.subcategory,
			  originalCraft: item.craft,
			},
		  };
		})
		.filter(Boolean);
	}, [masterData, favorites]);

	useEffect(() => {
	  if (!masterData) return;

	  setFavoriteFacilityRowsState((prev) => {
		if (prev.length > 0) return prev;
		return favoriteFacilityBaseRows;
	  });
	}, [masterData, favoriteFacilityBaseRows]);

	const favoriteTechBaseRows = useMemo(() => {
	  if (!masterData) return [];

	  const rows = Object.values(favorites || {})
		.filter((item) => !item.isFacility)
		.map((item, idx) => {
		  const sourceRows = masterData?.tech?.[item.category] ?? [];
		  const sourceIndex = sourceRows.findIndex((row) => row.craft === item.craft);
		  const foundRow = sourceRows[sourceIndex];
		  if (!foundRow) return null;

		  const copied = JSON.parse(JSON.stringify(foundRow));

		  return normalizeTechRow({
			...copied,
			id: `fav-t-${idx}-${item.category}-${item.craft}`,
			favoriteMeta: {
			  category: item.category,
			  originalCraft: item.craft,
			  sourceIndex,
			},
		  });
		})
		.filter(Boolean);

	  rows.sort((a, b) => {
		const catA = a.favoriteMeta?.category ?? "";
		const catB = b.favoriteMeta?.category ?? "";
		if (catA !== catB) return catA.localeCompare(catB, "ko");
		return (a.favoriteMeta?.sourceIndex ?? 99999) - (b.favoriteMeta?.sourceIndex ?? 99999);
	  });

	  return rows;
	}, [masterData, favorites]);
	useEffect(() => {
	  setFavoriteTechRowsState(favoriteTechBaseRows);
	}, [favoriteTechBaseRows]);

	const handleEnterCategory = useCallback((category) => {
	  setSelectedCategory(category);

	  if (FACILITY_CATEGORIES.includes(category)) {
		const firstSub = FACILITY_SUBCATEGORY_MAP[category]?.[0] || "";
		setSubcategory(firstSub);
	  }

	  setScreen("workspace");
	}, []);
  
	const handleRefreshPrices = useCallback(async () => {
	  if (!selectedCategory && screen !== "favorite-facility" && screen !== "favorite-tech") {
		return;
	  }

	  try {
		setIsRefreshingPrices(true);
		setActionMessage("가격을 갱신하는 중...");

		const isFavoriteFacilityScreen = screen === "favorite-facility";
		const isFavoriteTechScreen = screen === "favorite-tech";

		const currentRows = isFavoriteFacilityScreen
		  ? favoriteFacilityRowsState
		  : isFavoriteTechScreen
		  ? favoriteTechRowsState
		  : (recipesByCategory[selectedCategory] || []);

		if (!currentRows.length) {
		  setActionMessage("갱신할 항목이 없습니다.");
		  return;
		}

		const updatedRows = await Promise.all(
		  currentRows.map(async (row) => {
			const materialsPayload = (row.children || []).map((child) => ({
			  name: child.need,
			  need_qty: Number(child.needQty) || 0,
			}));

			const payload = {
			  serverId: 1,
			  craftName: row.craft,   // 추가
			  materials: materialsPayload,
			};

			if (isFacility || isFavoriteFacilityScreen) {
			  payload.wage = Number(wage);
			  payload.craftQty = Number(row.craftQty) || 1;
			  payload.baseQty = Number(row.baseQty) || 1;
			  payload.baseWork = Number(row.baseWork) || 0;
			  payload.craftName = row.craft;
			}

			const result = await refreshPrices(payload);

			const refreshedChildren = (result.materials || []).map((mat, idx) => ({
			  id: row.children?.[idx]?.id ?? `child-${row.id}-${idx}`,
			  need: row.children?.[idx]?.need ?? mat.name ?? "",
			  needQty: row.children?.[idx]?.needQty ?? mat.need_qty ?? "",
			  baseNeedQty: row.children?.[idx]?.baseNeedQty ?? mat.need_qty ?? "",
			
			  // ✅ 개당 = 최저가
			  unit: mat.lowest_price_text ?? "-",
			
			  // ✅ 평균가 = 필요한 수량 기준 가중 평균 단가
			  avgPrice: mat.unit_price_text ?? "-",
			
			  sum: mat.sum_text ?? "-",
			  note: mat.note ?? "",
			  lack: !!mat.lack,
			  lackQty: mat.lack_qty ?? 0,
			  filledQty: mat.filled_qty ?? 0,
			  usedName: mat.used_name ?? mat.name ?? "",
			}));

			if (isFacility || isFavoriteFacilityScreen) {
			  return {
				...row,
				sum: result.parent_sum_text ?? row.sum ?? "-",
				marketAvgPrice:
				  result.parent_market_price_text ??
				  row.marketAvgPrice ??
				  "-",
				marketUnitPrice:
				  result.parent_market_unit_price_text ??
				  row.marketUnitPrice ??
				  "-",
				note: result.parent_note ?? row.note ?? "",
				children: refreshedChildren,
			  };
			}

			const totalOutputQty =
			  (Number(row.baseCraftQty) || Number(row.craftQty) || 1) *
			  (Number(row.craftCount) || 1);

			return normalizeTechRow({
			  ...row,
			  marketAvgPrice:
				result.parent_market_price_text ??
				row.marketAvgPrice ??
				"-",
			  marketUnitPrice:
				result.parent_market_unit_price_text ??
				row.marketUnitPrice ??
				"-",
			  marketCompareQty:
				result.parent_market_target_qty ??
				row.marketCompareQty ??
				totalOutputQty,
			  note: result.parent_note ?? "",
			  children: refreshedChildren,
			});
		  })
		);
		
		const now = new Date();
		const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
		  now.getDate()
		).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
		  now.getMinutes()
		).padStart(2, "0")}`;

		const nextRefreshText = `마지막 가격 갱신: ${stamp}`;
		setLastRefreshText(nextRefreshText);

		// 일반 카테고리 화면
		if (!isFavoriteFacilityScreen && !isFavoriteTechScreen) {
		  setRecipesByCategory((prev) => ({
			...prev,
			[selectedCategory]: updatedRows,
		  }));

		  savePriceCache(currentPriceCacheKey, updatedRows, nextRefreshText);
		}

		// 즐겨찾기 화면
		if (isFavoriteFacilityScreen) {
		  setFavoriteFacilityRowsState(updatedRows);
		}

		if (isFavoriteTechScreen) {
		  setFavoriteTechRowsState(updatedRows);
		}

		setActionMessage("가격 갱신이 완료되었습니다.");
	  } catch (error) {
		console.error("가격 갱신 실패:", error);
		setActionMessage("가격 갱신에 실패했습니다.");
	  } finally {
		setIsRefreshingPrices(false);
	  }
	}, [
		selectedCategory,
		country,
		subcategory,
		isFacility,
		isTech,
		screen,
		favoriteFacilityRowsState,
		favoriteTechRowsState,
		recipesByCategory,
		wage,
		currentPriceCacheKey,
	]);

	const handleChangeFacilityCraftQty = useCallback((rowId, nextCraftQty) => {
		if (screen === "favorite-facility") {
		  let nextMessage = "제작 수량에 맞게 작업량과 재료 수량을 재계산했습니다.";

		  setFavoriteFacilityRowsState((prev) => {
			const result = updateFacilityCraftQtyRows(
			  prev,
			  { [rowId]: nextCraftQty },
			  wage,
			  ""
			);

			nextMessage = result.message;
			return result.updatedRows;
		  });

		  setActionMessage(nextMessage);
		  return;
		}

	  if (!selectedCategory || !isFacility) return;

	  let nextMessage = "제작 수량에 맞게 작업량과 재료 수량을 재계산했습니다.";

		setRecipesByCategory((prev) => {
		  const currentRows = prev[selectedCategory] || [];
		  const result = updateFacilityCraftQtyRows(
			currentRows,
			{ [rowId]: nextCraftQty },
			wage,
			selectedCategory
		  );

		  nextMessage = result.message;

		  if (currentPriceCacheKey) {
			savePriceCache(currentPriceCacheKey, result.updatedRows, lastRefreshText);
		  }

		  return {
			...prev,
			[selectedCategory]: result.updatedRows,
		  };
		});

		setActionMessage(nextMessage);
	}, [screen, selectedCategory, isFacility, wage, currentPriceCacheKey, lastRefreshText]);
	
	const handleChangeTechCraftCount = useCallback((rowId, nextCraftCount) => {
	  const updateRows = (targetRows) => updateTechCraftCountRows(targetRows, {
		[rowId]: nextCraftCount,
	  });

	  if (screen === "favorite-tech") {
		setFavoriteTechRowsState((prev) => updateRows(prev));
		setActionMessage("제작 수량에 맞게 제조기술 재료값을 재계산했습니다.");
		return;
	  }

	  if (!selectedCategory || !isTech) return;

	  setRecipesByCategory((prev) => ({
		...prev,
		[selectedCategory]: updateRows(prev[selectedCategory] || []),
	  }));

	  setActionMessage("제작 수량에 맞게 제조기술 재료값을 재계산했습니다.");
	}, [screen, selectedCategory, isTech]);
	
	const handleChangeFacilityChildUnit = useCallback((rowId, childId, nextUnitText) => {
	  const updateRows = (targetRows, currentCategory = "") => {
		return (targetRows || []).map((row) => {
		  if (row.id !== rowId) return row;

		  let childTotal = 0;

		  const updatedChildren = (row.children || []).map((child) => {
			let unitNum = parseWonToNumber(child.unit);

			if (child.id === childId) {
			  unitNum = parseWonToNumber(nextUnitText);
			}

			const needQtyNum = Number(child.needQty) || 0;
			const sumNum = unitNum * needQtyNum;

			const updatedChild = {
			  ...child,
			  unit: unitNum > 0 ? unitNum.toLocaleString() : "-",
			  sum: sumNum > 0 ? sumNum.toLocaleString() : "-",
			};

			childTotal += parseWonToNumber(updatedChild.sum);
			return updatedChild;
		  });

		  const rowCategory = row.favoriteMeta?.category ?? currentCategory;
		  const runs = calcFacilityRuns(row.craftQty, row.baseQty);
		  const laborCost = calcFacilityLaborCost(row.baseWork, runs, wage);
		  const parentSum = childTotal + laborCost;

		  return {
			...row,
			children: updatedChildren,
			sum: parentSum > 0 ? parentSum.toLocaleString() : "-",
			note: buildParentNoteText(parentSum, row.craftQty),
		  };
		});
	  };

	  if (screen === "favorite-facility") {
		setFavoriteFacilityRowsState((prev) => updateRows(prev, ""));
		return;
	  }

	  if (!selectedCategory || !isFacility) return;

		setRecipesByCategory((prev) => {
		  const updatedRows = updateRows(prev[selectedCategory] || [], selectedCategory);

		  if (currentPriceCacheKey) {
			savePriceCache(currentPriceCacheKey, updatedRows, lastRefreshText);
		  }

		  return {
			...prev,
			[selectedCategory]: updatedRows,
		  };
		});
	}, [screen, selectedCategory, isFacility, currentPriceCacheKey, lastRefreshText]);

	return (
	  <div className="app dark">
		{isLoadingState ? (
		  <div className="page">
			<div className="loading-box">앱 상태 불러오는 중...</div>
		  </div>
		) : screen === "home" ? (
		  <HomeScreen
			loadError={loadError}
			onEnterCategory={handleEnterCategory}
			onEnterFacilityFavorites={() => setScreen("favorite-facility")}
			onEnterTechFavorites={() => setScreen("favorite-tech")}
		  />
		) : screen === "favorite-facility" ? (
		  <WorkspaceScreen
			category="즐겨찾기"
			isFacility={true}
			isTech={false}
			wage={wage}
			setWage={setWage}
			country={country}
			setCountry={setCountry}
			subcategory={subcategory}
			setSubcategory={setSubcategory}
			currentSubcategories={[]}
			rows={favoriteFacilityRowsState}
			lastRefreshText={lastRefreshText}
			onBack={() => setScreen("home")}
			actionMessage={actionMessage}
			expandedRows={expandedRows}
			setExpandedRows={setExpandedRows}
			isRefreshingPrices={isRefreshingPrices}
			onRefreshPrices={handleRefreshPrices}
			onClearSavedState={() => {}}
			onChangeFacilityCraftQty={handleChangeFacilityCraftQty}
			favorites={favorites}
			onToggleFavorite={handleToggleFavorite}
			titleOverride="생산시설 즐겨찾기"
			hideFavoriteFilter={true}
			directCraftMode={directCraftMode}
			setDirectCraftMode={setDirectCraftMode}
			techUnitOverrides={techUnitOverrides}
			setTechUnitOverrides={setTechUnitOverrides}
			facilityUnitOverrides={facilityUnitOverrides}
			setFacilityUnitOverrides={setFacilityUnitOverrides}
			onChangeFacilityChildUnit={handleChangeFacilityChildUnit}
			onChangeTechCraftCount={() => {}}
			setSearchText={setSearchText}
			searchText={searchText}
		  />
		) : screen === "favorite-tech" ? (
		  <WorkspaceScreen
			category="즐겨찾기"
			isFacility={false}
			isTech={true}
			wage={wage}
			setWage={setWage}
			country={country}
			setCountry={setCountry}
			subcategory={subcategory}
			setSubcategory={setSubcategory}
			currentSubcategories={[]}
			rows={favoriteTechRowsState}
			lastRefreshText={lastRefreshText}
			onBack={() => setScreen("home")}
			actionMessage={actionMessage}
			expandedRows={expandedRows}
			setExpandedRows={setExpandedRows}
			isRefreshingPrices={isRefreshingPrices}
			onRefreshPrices={handleRefreshPrices}
			onClearSavedState={() => {}}
			onChangeFacilityCraftQty={() => {}}
			favorites={favorites}
			onToggleFavorite={handleToggleFavorite}
			titleOverride="제조기술 즐겨찾기"
			hideFavoriteFilter={true}
			directCraftMode={directCraftMode}
			setDirectCraftMode={setDirectCraftMode}
			techUnitOverrides={techUnitOverrides}
			setTechUnitOverrides={setTechUnitOverrides}
			facilityUnitOverrides={facilityUnitOverrides}
			setFacilityUnitOverrides={setFacilityUnitOverrides}
			onChangeFacilityChildUnit={handleChangeFacilityChildUnit}
			onChangeTechCraftCount={handleChangeTechCraftCount}
			setSearchText={setSearchText}
			searchText={searchText}
		  />
		) : (
		  <WorkspaceScreen
			category={selectedCategory}
			isFacility={isFacility}
			isTech={isTech}
			wage={wage}
			setWage={setWage}
			country={country}
			setCountry={setCountry}
			subcategory={subcategory}
			setSubcategory={setSubcategory}
			currentSubcategories={currentSubcategories}
			rows={rows}
			lastRefreshText={lastRefreshText}
			onBack={() => setScreen("home")}
			actionMessage={actionMessage}
			expandedRows={expandedRows}
			setExpandedRows={setExpandedRows}
			isRefreshingPrices={isRefreshingPrices}
			onRefreshPrices={handleRefreshPrices}
			onClearSavedState={handleClearSavedState}
			onChangeFacilityCraftQty={handleChangeFacilityCraftQty}
			favorites={favorites}
			onToggleFavorite={handleToggleFavorite}
			directCraftMode={directCraftMode}
			setDirectCraftMode={setDirectCraftMode}
			techUnitOverrides={techUnitOverrides}
			setTechUnitOverrides={setTechUnitOverrides}
			facilityUnitOverrides={facilityUnitOverrides}
			setFacilityUnitOverrides={setFacilityUnitOverrides}
			onChangeFacilityChildUnit={handleChangeFacilityChildUnit}
			onChangeTechCraftCount={handleChangeTechCraftCount}
			setSearchText={setSearchText}
			searchText={searchText}
		  />
		)}
	  </div>
	);
}

function computeProfitForParent(row) {
  if (!row) return null;

  // 제조기술: 부모 시세 평균가(회당) - 현재 제작원가(회당)
  if (row.marketAvgPrice !== undefined) {
    const marketAvgPriceNum = parseWonToNumber(row.marketAvgPrice);
    const craftedTotalPriceNum = parseWonToNumber(row.avgPrice);
    const craftCountNum = Number(row.craftCount) || 1;

    if (marketAvgPriceNum <= 0 || craftedTotalPriceNum <= 0 || craftCountNum <= 0) {
      return null;
    }

    const craftedPerBatchPriceNum = Math.round(craftedTotalPriceNum / craftCountNum);
    return marketAvgPriceNum - craftedPerBatchPriceNum;
  }

  // 생산시설
  if (row.sum !== undefined) {
    const parentSumNum = parseWonToNumber(row.sum);
    if (parentSumNum <= 0) return null;

    const totalMaterialCost = (row.children || []).reduce((acc, child) => {
      return acc + parseWonToNumber(child.sum);
    }, 0);

    return parentSumNum - totalMaterialCost;
  }

  return null;
}

function buildParentNote(row) {
  if (!row) return "-";

  // 부모 제작 개당 원가
	const craftedUnitPrice =
	  row.unitPrice !== undefined && parseWonToNumber(row.unitPrice) > 0
		? parseWonToNumber(row.unitPrice)
		: row.sum !== undefined &&
		  Number(row.craftQty) > 0 &&
		  parseWonToNumber(row.sum) > 0
		? Math.round(parseWonToNumber(row.sum) / Number(row.craftQty))
		: 0;

  // 부모 시장 총액
	const marketUnitPrice =
	  row.marketUnitPrice !== undefined
		? parseWonToNumber(row.marketUnitPrice)
		: 0;

	const marketTotalPrice =
	  row.marketAvgPrice !== undefined
		? parseWonToNumber(row.marketAvgPrice)
		: 0;

  // 총 생산 개수
  const totalOutputQty =
    Number(row.craftQty) > 0
      ? Number(row.craftQty)
      : (
          (Number(row.baseCraftQty) || 1) *
          (Number(row.craftCount) || 1)
        );

  // 시장가를 몇 개 기준으로 계산했는지
  const compareQty =
    Number(row.marketCompareQty) > 0
      ? Number(row.marketCompareQty)
      : totalOutputQty;

  // 육의전 개당 = 시장 총액 / 비교 수량
	const auctionUnitPrice =
	  row.marketUnitPrice !== undefined && parseWonToNumber(row.marketUnitPrice) > 0
		? parseWonToNumber(row.marketUnitPrice)
		: marketTotalPrice > 0 && compareQty > 0
		? Math.round(marketTotalPrice / compareQty)
		: 0;

  // 개당 차익
  const unitProfit =
    auctionUnitPrice > 0 && craftedUnitPrice > 0
      ? auctionUnitPrice - craftedUnitPrice
      : null;

  // 총 차익
  const totalProfit =
    unitProfit !== null
      ? unitProfit * compareQty
      : null;

  // 이익률
  const profitRate =
    unitProfit !== null && craftedUnitPrice > 0
      ? (unitProfit / craftedUnitPrice) * 100
      : null;

  const profitClass =
    typeof totalProfit === "number" && Number.isFinite(totalProfit)
      ? totalProfit >= 0
        ? "profit-positive"
        : "profit-negative"
      : "profit-empty";

  return (
    <span className="parent-note-inline">
      <span>
        육의전 개당 : {auctionUnitPrice > 0 ? auctionUnitPrice.toLocaleString() : "-"}
      </span>
      <span>
        {" "} / 총 : {totalOutputQty > 0 ? totalOutputQty.toLocaleString() : "-"}개
      </span>
      <span>{" "} / 제작 시 이익 : </span>
      <span className={profitClass}>
        {typeof totalProfit === "number" && Number.isFinite(totalProfit)
          ? `${totalProfit >= 0 ? "+" : ""}${totalProfit.toLocaleString()}${
              profitRate !== null
                ? `(${profitRate >= 0 ? "+" : ""}${profitRate.toFixed(1)}%)`
                : ""
            }`
          : "-"}
      </span>
    </span>
  );
}

function getDisplayedChildSum(child, options = {}) {
  const {
    directCraftMode = false,
    techUnitOverrides = {},
    facilityUnitOverrides = {},
  } = options;

  if (!child) return 0;

  // 직접 제작 OFF면 원래 sum 사용
  if (!directCraftMode) {
    return parseWonToNumber(child.sum);
  }

  // 직접 제작 ON이면 우선 override 단가를 보고 합계 재계산
  const needQty = Number(child.needQty ?? child.need ?? 0) || 0;

  let unitPrice = null;

  if (child.sourceType === "tech") {
    unitPrice = techUnitOverrides[child.id];
  } else if (child.sourceType === "facility") {
    unitPrice = facilityUnitOverrides[child.id];
  }

  // override 없으면 현재 child.unitPrice 사용
  if (unitPrice == null || unitPrice === "") {
    unitPrice = parseWonToNumber(child.unitPrice);
  } else {
    unitPrice = parseWonToNumber(unitPrice);
  }

  if (needQty > 0 && unitPrice > 0) {
    return needQty * unitPrice;
  }

  return parseWonToNumber(child.sum);
}

function getFavoriteKey({ category, country, subcategory, isFacility, craft }) {
  if (isFacility) {
    return `facility|${category}|${country}|${subcategory}|${craft}`;
  }
  return `tech|${category}|${craft}`;
}

function getPriceCacheKey({ category, country, subcategory, isFacility }) {
  if (isFacility) {
    return `price-cache|facility|${category}|${country}|${subcategory}`;
  }
  return `price-cache|tech|${category}`;
}

function loadPriceCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("가격 캐시 불러오기 실패:", error);
    return null;
  }
}

function savePriceCache(cacheKey, rows, lastRefreshText) {
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        rows,
        lastRefreshText,
      })
    );
  } catch (error) {
    console.error("가격 캐시 저장 실패:", error);
  }
}

function clearPriceCache(cacheKey) {
  try {
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error("가격 캐시 삭제 실패:", error);
  }
}

function convertFacilityItems(items) {
  return (items || []).map((item, idx) => {
    const materials = Array.isArray(item.materials) ? item.materials : [];

    return {
      id: `f-${idx}`,
      craft: item.craft ?? item.name ?? "",
      craftQty: item.craft_qty ?? 1,
      baseQty: item.craft_qty ?? 1,
      sum: item.sum_text ?? item.sum ?? "-",
      tool: item.tools ?? item.tool ?? "",
      work: item.work ?? "",
      baseWork: item.work ?? 0,
      gameTime: formatGameDays(item.game_days ?? item.gameTime),
      realTime: formatRealTime(item),
      note: item.remark ?? item.note ?? "",
      children: materials.map((m, i) => {
        const need = Array.isArray(m) ? (m[0] ?? "") : (m.name ?? "");
        const needQty = Array.isArray(m) ? (m[1] ?? "") : (m.qty ?? m.need_qty ?? "");

        return {
          id: `m-${idx}-${i}`,
          need,
          needQty,
          baseNeedQty: needQty,
          unit: "-",
          sum: "-",
          note: "",
          lack: false,
          lackQty: 0,
          filledQty: 0,
          usedName: need,
        };
      }),
    };
  });
}
function getMasterRows(masterData, category, country, subcategory, isFacility) {
  if (!masterData) return [];

  if (isFacility) {
    return (
      masterData?.facility?.[category]?.[country]?.[subcategory] ?? []
    );
  }

  return masterData?.tech?.[category] ?? [];
}

function formatGameDays(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (Number.isNaN(num)) return "";
  return `${num.toFixed(1)}일`;
}

function formatRealTime(item) {
  const realDays = Number(item.real_days);
  const realHours = Number(item.real_hours);

  if (!Number.isNaN(realDays) && !Number.isNaN(realHours)) {
    return `${realDays.toFixed(1)}일(${realHours}시간)`;
  }

  if (!Number.isNaN(realDays)) {
    return `${realDays.toFixed(1)}일`;
  }

  if (!Number.isNaN(realHours)) {
    return `${realHours}시간`;
  }

  return "";
}

function calculateScaledValue(baseValue, craftQty, baseQty = 1) {
  const base = Number(baseValue);
  const craft = Number(craftQty);
  const parentBaseQty = Number(baseQty);

  if (Number.isNaN(base) || Number.isNaN(craft) || Number.isNaN(parentBaseQty) || parentBaseQty === 0) {
    return 0;
  }

  return Math.round((base * craft) / parentBaseQty);
}

const FACILITY_MAX_QTY = 30000;

function clampToMultipleMax(nv, baseQty, maxQty = FACILITY_MAX_QTY) {
  let next = Number(nv);
  let base = Number(baseQty);

  if (!Number.isFinite(base) || base <= 0) base = 1;
  if (!Number.isFinite(next) || next <= 0) next = base;

  next = Math.min(next, maxQty);

  let k = Math.floor(next / base);
  if (k <= 0) k = 1;

  let fixed = base * k;

  if (fixed > maxQty) {
    k = Math.floor(maxQty / base);
    fixed = base * Math.max(1, k);
  }

  return fixed;
}

function normalizeFacilityCraftQty(category, nextQty, baseQty) {
  const nv = Number(nextQty);
  const base = Number(baseQty) || 1;

  if (!Number.isFinite(nv) || nv <= 0) {
    return { qty: base, adjusted: true, reason: "invalid" };
  }

  // 목장: 30000 상한 + baseQty 배수 내림 보정
  if (category === "목장") {
    const fixed = clampToMultipleMax(nv, base, FACILITY_MAX_QTY);
    return {
      qty: fixed,
      adjusted: fixed !== nv,
      reason: fixed !== nv ? "ranch-clamped" : "",
    };
  }

  // 무기장/공장: baseQty 배수만 허용
  if (base > 0 && nv % base !== 0) {
    return { qty: base, adjusted: true, reason: "not-multiple" };
  }

  return { qty: nv, adjusted: false, reason: "" };
}

const WAGE_EFF_TABLE = {
  100: [20, 600],
  200: [30, 900],
  300: [50, 1500],
  400: [80, 2400],
  500: [120, 3600],
  600: [170, 5100],
  700: [230, 6900],
  800: [300, 9000],
  900: [380, 11400],
  1000: [500, 15000],
  1100: [600, 18000],
  1200: [700, 21000],
  1300: [800, 24000],
  1400: [900, 27000],
  1500: [1000, 30000],
  1600: [1100, 33000],
  1700: [1200, 36000],
  1800: [1300, 39000],
  1900: [1400, 42000],
  2000: [1500, 45000],
  2100: [1600, 48000],
  2200: [1700, 51000],
  2300: [1800, 54000],
  2400: [1900, 57000],
  2500: [2000, 60000],
  2600: [2100, 63000],
  2700: [2200, 66000],
  2800: [2300, 69000],
  2900: [2400, 72000],
  3000: [2500, 75000],
};

function roundWageTo100(wage) {
  return Math.round(Number(wage) / 100) * 100;
}

function computeTimesFromWorkAndWage(work, wage) {
  const workNum = Number(work);
  const wageKey = roundWageTo100(wage);

  if (!Number.isFinite(workNum) || workNum <= 0) {
    return {
      gameTime: "",
      realTime: "",
    };
  }

  const eff = WAGE_EFF_TABLE[wageKey];
  if (!eff) {
    return {
      gameTime: "",
      realTime: "",
    };
  }

  const [gameEff, realEff] = eff;

  const gameDays = Math.round((workNum / gameEff) * 10) / 10;
  const realDaysRaw = workNum / realEff;
  const realDays = Math.round(realDaysRaw * 10) / 10;
  const realHours = Math.round(realDaysRaw * 24);

  return {
    gameTime: `${gameDays.toFixed(1)}일`,
    realTime: `${realDays.toFixed(1)}일(${realHours}시간)`,
  };
}

function calcFacilityRuns(craftQty, baseQty) {
  const craft = Number(craftQty) || 0;
  const base = Number(baseQty) || 1;
  if (craft <= 0) return 1;
  return Math.max(1, Math.floor(craft / base));
}

function calcFacilityLaborCost(baseWork, runs, wage) {
  const work = Number(baseWork) || 0;
  const runCount = Number(runs) || 1;
  const wageNum = Number(wage) || 0;

  if (work <= 0 || runCount <= 0 || wageNum <= 0) return 0;
  return work * runCount * wageNum;
}

function buildParentNoteText(totalSum, craftQty) {
  const sumNum = Number(totalSum) || 0;
  const qtyNum = Number(craftQty) || 0;

  if (sumNum > 0 && qtyNum > 0) {
    return `${sumNum.toLocaleString()} / ${qtyNum.toLocaleString()}`;
  }
  return "";
}

function parseWonToNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(String(value).replace(/,/g, "")) || 0;
}

function formatWonText(value) {
  const num = Number(value) || 0;
  return num > 0 ? num.toLocaleString() : "-";
}

function getTechChildOverrideKey(row, child) {
  const parentCategory = row.favoriteMeta?.category ?? "";
  const parentCraft = row.favoriteMeta?.originalCraft ?? row.craft ?? "";
  const childName = child.need ?? "";
  return `${parentCategory}|${parentCraft}|${childName}|${child.id ?? ""}`;
}

function getFacilityChildOverrideKey(row, child) {
  const parentCategory = row.favoriteMeta?.category ?? "";
  const parentCountry = row.favoriteMeta?.country ?? "";
  const parentSubcategory = row.favoriteMeta?.subcategory ?? "";
  const parentCraft = row.favoriteMeta?.originalCraft ?? row.craft ?? "";
  const childName = child.need ?? "";

  return `${parentCategory}|${parentCountry}|${parentSubcategory}|${parentCraft}|${childName}|${child.id ?? ""}`;
}

function normalizeTechRow(row) {
  const baseCraftQty = Number(row.baseCraftQty ?? row.craftQty) || 0;
  const craftCount = Number(row.craftCount) || 1;

  let childTotal = 0;

  const normalizedChildren = (row.children || []).map((child) => {
    const baseNeedQty = Number(child.baseNeedQty ?? child.needQty) || 0;
    const needQtyNum = baseNeedQty * craftCount;
    const unitNum = parseWonToNumber(child.unit);
    const sumNum = unitNum > 0 ? unitNum * needQtyNum : 0;

    childTotal += sumNum;

    return {
      ...child,
      baseNeedQty,
      needQty: needQtyNum,
      unit: unitNum > 0 ? unitNum.toLocaleString() : "-",
      sum: sumNum > 0 ? sumNum.toLocaleString() : "-",
    };
  });

  const baseCostNum = parseWonToNumber(row.baseCost ?? row.cost);
  const totalCostNum = baseCostNum * craftCount;
  const totalCraftQty = baseCraftQty * craftCount;
  const avgPriceNum = childTotal + totalCostNum;
  const unitPriceNum = totalCraftQty > 0 ? Math.round(avgPriceNum / totalCraftQty) : 0;

	return {
	  ...row,
	  marketAvgPrice: row.marketAvgPrice ?? row.avgPrice ?? "-",
	  marketCompareQty: Number(row.marketCompareQty) || totalCraftQty,
	  baseCraftQty,
	  craftCount,
	  craftQty: totalCraftQty,
	  baseCost: baseCostNum > 0 ? baseCostNum.toLocaleString() : "-",
	  cost: totalCostNum > 0 ? totalCostNum.toLocaleString() : "-",
	  avgPrice: avgPriceNum > 0 ? avgPriceNum.toLocaleString() : "-",
	  unitPrice: unitPriceNum > 0 ? unitPriceNum.toLocaleString() : "-",
	  children: normalizedChildren,
	  note:
		avgPriceNum > 0
		  ? `${avgPriceNum.toLocaleString()} / ${totalCraftQty || 0}`
		  : "",
	};
}

function normalizeTechRows(rows) {
  return (rows || []).map(normalizeTechRow);
}

function applyDirectCraftToTechRows(rows, directCraftMode, techUnitOverrides) {
  const craftMap = new Map();

	(rows || []).forEach((row) => {
	  const craftName = String(row.craft || "").trim();
	  const unitNum = parseWonToNumber(row.unitPrice);
	  const totalAvgPriceNum = parseWonToNumber(row.avgPrice);
	  const totalCraftQty = Number(row.craftQty) || 0;

	  if (!craftName || unitNum <= 0) return;

	  craftMap.set(craftName, {
		avgPriceNum: totalAvgPriceNum,
		craftQtyNum: totalCraftQty,
		unitNum, // 부모 행의 개당 값을 그대로 사용
	  });
	});

  return (rows || []).map((row) => {
    let childTotalSum = 0;

    const updatedChildren = (row.children || []).map((child) => {
      const overrideKey = getTechChildOverrideKey(row, child);
      const overrideRaw = techUnitOverrides[overrideKey];
      const overrideNum = parseWonToNumber(overrideRaw);

      const childName = String(child.need || "").trim();
      const matchedParent = craftMap.get(childName);

      let resolvedUnitNum = parseWonToNumber(child.unit);

      if (overrideRaw !== undefined && String(overrideRaw).trim() !== "") {
        resolvedUnitNum = overrideNum;
      } else if (directCraftMode && matchedParent) {
        resolvedUnitNum = matchedParent.unitNum;
      }

      const needQtyNum = Number(child.needQty) || 0;
      const resolvedSumNum = resolvedUnitNum > 0 ? resolvedUnitNum * needQtyNum : 0;

      childTotalSum += resolvedSumNum;

      return {
        ...child,
        overrideKey,
        inputUnitValue:
          overrideRaw !== undefined && String(overrideRaw).trim() !== ""
            ? Number(overrideNum).toLocaleString()
            : resolvedUnitNum > 0
            ? resolvedUnitNum.toLocaleString()
            : "",
        unit: resolvedUnitNum > 0 ? resolvedUnitNum.toLocaleString() : "-",
        sum: resolvedSumNum > 0 ? resolvedSumNum.toLocaleString() : "-",
        directCraftMatched:
          directCraftMode &&
          !(overrideRaw !== undefined && String(overrideRaw).trim() !== "") &&
          !!matchedParent,
        note:
          directCraftMode &&
          !(overrideRaw !== undefined && String(overrideRaw).trim() !== "") &&
          matchedParent
            ? `직접제작 단가 ${matchedParent.unitNum.toLocaleString()}`
            : child.note ?? "",
      };
    });

    const totalCostNum = parseWonToNumber(row.cost);
    const totalCraftQty = Number(row.craftQty) || 0;
    const nextAvgPriceNum = childTotalSum + totalCostNum;
    const unitPriceNum =
      totalCraftQty > 0 ? Math.round(nextAvgPriceNum / totalCraftQty) : 0;

    return {
      ...row,
      marketAvgPrice: row.marketAvgPrice ?? row.avgPrice ?? "-",
	  marketCompareQty: Number(row.marketCompareQty) || totalCraftQty,
      children: updatedChildren,
      avgPrice: nextAvgPriceNum > 0 ? nextAvgPriceNum.toLocaleString() : "-",
      unitPrice: unitPriceNum > 0 ? unitPriceNum.toLocaleString() : "-",
      note:
        nextAvgPriceNum > 0
          ? `${nextAvgPriceNum.toLocaleString()} / ${totalCraftQty || 0}`
          : "",
    };
  });
}

function updateTechCraftCountRows(rows, nextCraftCountByRowId) {
  return (rows || []).map((row) => {
    const rawValue = nextCraftCountByRowId[row.id];
    if (rawValue === undefined) return row;

    let craftCount = Number(rawValue);
    if (!Number.isFinite(craftCount) || craftCount <= 0) {
      craftCount = 1;
    }

    return normalizeTechRow({
      ...row,
      craftCount,
    });
  });
}

function recalcFacilityRowsWithWage(rows, wage) {
  return (rows || []).map((row) => {
    const nextTimes = computeTimesFromWorkAndWage(row.work, wage);

    let childSumTotal = 0;

    const updatedChildren = (row.children || []).map((child) => {
      const needQty = Number(child.needQty) || 0;
      const unitPrice = Number(String(child.unit || "0").replace(/,/g, "")) || 0;
      const childSum = unitPrice * needQty;

      childSumTotal += childSum;

      return {
        ...child,
        sum: unitPrice > 0 ? childSum.toLocaleString() : child.sum,
      };
    });

    const runs = calcFacilityRuns(row.craftQty, row.baseQty);
    const laborCost = calcFacilityLaborCost(row.baseWork, runs, wage);
    const parentSum = childSumTotal + laborCost;

    return {
      ...row,
      gameTime: nextTimes.gameTime,
      realTime: nextTimes.realTime,
      sum: parentSum > 0 ? parentSum.toLocaleString() : "-",
      note: buildParentNoteText(parentSum, row.craftQty),
      children: updatedChildren,
    };
  });
}

function updateFacilityCraftQtyRows(rows, nextCraftQtyByRowId, wage, selectedCategory = "") {
  let message = "제작 수량에 맞게 작업량과 재료 수량을 재계산했습니다.";

  const updatedRows = (rows || []).map((row) => {
    const rawNextQty = nextCraftQtyByRowId[row.id];
    if (rawNextQty === undefined) return row;

    const rowCategory = row.favoriteMeta?.category ?? selectedCategory;
    const normalized = normalizeFacilityCraftQty(
      rowCategory,
      rawNextQty,
      row.baseQty
    );

    if (normalized.reason === "ranch-clamped") {
      message = "목장은 최대 30,000개이며 기본 제작 수량 배수로 자동 보정했습니다.";
    } else if (normalized.reason === "not-multiple") {
      message = "잘못된 수량입니다. 기본 제작 수량의 배수만 입력 가능합니다.";
    } else if (normalized.reason === "invalid") {
      message = "잘못된 수량입니다. 기본 제작 수량으로 되돌렸습니다.";
    }

    const safeCraftQty = normalized.qty;
    const updatedWork = calculateScaledValue(row.baseWork, safeCraftQty, row.baseQty);

    let childSumTotal = 0;

    const updatedChildren = (row.children || []).map((child) => {
      const nextNeedQty = calculateScaledValue(child.baseNeedQty, safeCraftQty, row.baseQty);
      const unitPrice = Number(String(child.unit || "0").replace(/,/g, "")) || 0;
      const childSum = unitPrice * nextNeedQty;

      childSumTotal += childSum;

      return {
        ...child,
        needQty: nextNeedQty,
        sum: unitPrice > 0 ? childSum.toLocaleString() : child.sum,
      };
    });

    const nextTimes = computeTimesFromWorkAndWage(updatedWork, wage);
    const runs = calcFacilityRuns(safeCraftQty, row.baseQty);
    const laborCost = calcFacilityLaborCost(row.baseWork, runs, wage);
    const parentSum = childSumTotal + laborCost;

    return {
      ...row,
      craftQty: safeCraftQty,
      work: updatedWork,
      gameTime: nextTimes.gameTime,
      realTime: nextTimes.realTime,
      sum: parentSum > 0 ? parentSum.toLocaleString() : "-",
      note: buildParentNoteText(parentSum, safeCraftQty),
      children: updatedChildren,
    };
  });

  return { updatedRows, message };
}

function loadLocalAppState() {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("로컬 상태 불러오기 실패:", error);
    return null;
  }
}

function saveLocalAppState(state) {
  try {
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("로컬 상태 저장 실패:", error);
  }
}

const HomeScreen = memo(function HomeScreen({
  loadError,
  onEnterCategory,
  onEnterFacilityFavorites,
  onEnterTechFavorites,
}) {
  return (
    <div className="page">
      <div className="home-header">
        <h1 className="home-title">거상 향수</h1>
      </div>
      {loadError ? <div className="notice-box warning">{loadError}</div> : null}

      <div className="home-grid">
        <CategorySection title="생산시설">
          <CategoryButton label="무기장" onClick={() => onEnterCategory("무기장")} />
          <CategoryButton label="공장" onClick={() => onEnterCategory("공장")} />
          <CategoryButton label="목장" onClick={() => onEnterCategory("목장")} />
        </CategorySection>

        <CategorySection title="제조기술">
          <CategoryButton label="연금술사" onClick={() => onEnterCategory("연금술사")} />
          <CategoryButton label="세공사" onClick={() => onEnterCategory("세공사")} />
          <CategoryButton label="대장장이" onClick={() => onEnterCategory("대장장이")} />
        </CategorySection>
		
		<CategorySection title="즐겨찾기 바로가기">
		  <CategoryButton label="생산시설 즐겨찾기" onClick={onEnterFacilityFavorites} />
		  <CategoryButton label="제조기술 즐겨찾기" onClick={onEnterTechFavorites} />
		</CategorySection>
      </div>
    </div>
  );
});

const WorkspaceScreen = memo(function WorkspaceScreen({
  category,
  isFacility,
  isTech,
  wage,
  setWage,
  country,
  setCountry,
  subcategory,
  setSubcategory,
  currentSubcategories,
  rows,
  lastRefreshText,
  onBack,
  actionMessage,
  expandedRows,
  setExpandedRows,
  isRefreshingPrices,
  onRefreshPrices,
  onClearSavedState,
  onChangeFacilityCraftQty,
  favorites,
  onToggleFavorite,
  titleOverride = "",
  hideFavoriteFilter = false,
  directCraftMode,
  setDirectCraftMode,
  techUnitOverrides,
  setTechUnitOverrides,
  facilityUnitOverrides,
  setFacilityUnitOverrides,
  onChangeFacilityChildUnit,
  onChangeTechCraftCount,
  searchText,
  setSearchText,
}) {
  const SHOW_EDIT_BUTTONS = false;
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const processedRows = useMemo(() => {
	if (!isTech) return rows;
	return applyDirectCraftToTechRows(rows, directCraftMode, techUnitOverrides);
  }, [rows, isTech, directCraftMode, techUnitOverrides]);
  const Icon = CATEGORY_META[category]?.icon || Hammer;
	const visibleRows = useMemo(() => {
	  let nextRows = processedRows;

	  if (showFavoritesOnly) {
		nextRows = nextRows.filter((row) => {
		  const favoriteKey = getFavoriteKey({
			category,
			country,
			subcategory,
			isFacility,
			craft: row.craft,
		  });

		  return !!favorites[favoriteKey];
		});
	  }

	  const keyword = (searchText || "").trim().toLowerCase();
	  if (!keyword) return nextRows;

	  return nextRows.filter((row) => {
		const parentText = String(row.craft || "").toLowerCase();
		const childText = (row.children || [])
		  .map((child) => `${child.need || ""} ${child.usedName || ""}`)
		  .join(" ")
		  .toLowerCase();

		return parentText.includes(keyword) || childText.includes(keyword);
	  });
	}, [
	  processedRows,
	  showFavoritesOnly,
	  favorites,
	  category,
	  country,
	  subcategory,
	  isFacility,
	  searchText,
	]);

  return (
    <div className="page workspace">
		<div className="workspace-header">
		  <div className="workspace-header-top">
			<div className="workspace-title-row">
			  <button className="back-button" onClick={onBack}>
				← 처음으로
			  </button>

			  <div className="workspace-title">
				<Icon size={24} />
				<h2>{titleOverride || category}</h2>
			  </div>
			</div>

			<div className="workspace-filter-panel">
			  <div className="workspace-filter-row">
				<div className="workspace-filter-row-left">
				  {isFacility ? (
					<FilterChipGroup
					  label="국가"
					  value={country}
					  onChange={setCountry}
					  options={FACILITY_COUNTRIES}
					/>
				  ) : null}
				</div>

				<div className="workspace-right-tools">
				<input
				  type="text"
				  className="search-input"
				  placeholder="제작 아이템 / 재료 검색"
				  value={searchText}
				  onChange={(e) => setSearchText(e.target.value)}
				/>
				{isFacility ? (
				  <LabelSelect
					label="임금"
					value={wage}
					onChange={setWage}
					options={WAGE_OPTIONS}
				  />
				) : null}
				</div>
			  </div>

			  {isFacility ? (
				<div className="workspace-subcategory-row">
				  <FilterChipGroup
					label="세부분류"
					value={subcategory}
					onChange={setSubcategory}
					options={currentSubcategories}
				  />
				</div>
			  ) : null}
			</div>
		  </div>
		</div>

      <div className="table-panel">
        <div className="table-scroll">
          {isFacility ? (
		    <FacilityTable
			  rows={visibleRows}
			  expandedRows={expandedRows}
			  setExpandedRows={setExpandedRows}
			  onChangeFacilityCraftQty={onChangeFacilityCraftQty}
			  selectedCategory={category}
			  country={country}
			  subcategory={subcategory}
			  favorites={favorites}
			  onToggleFavorite={onToggleFavorite}
			  directCraftMode={directCraftMode}
			  techUnitOverrides={techUnitOverrides}
			  facilityUnitOverrides={facilityUnitOverrides}
			  setFacilityUnitOverrides={setFacilityUnitOverrides}
			  onChangeFacilityChildUnit={onChangeFacilityChildUnit}
			/>
		  ) : (
		    <TechTable
			  rows={visibleRows}
			  category={category}
			  favorites={favorites}
			  onToggleFavorite={onToggleFavorite}
			  directCraftMode={directCraftMode}
			  techUnitOverrides={techUnitOverrides}
			  facilityUnitOverrides={facilityUnitOverrides}
			  setTechUnitOverrides={setTechUnitOverrides}
			  onChangeTechCraftCount={onChangeTechCraftCount}
			/>
		  )}
        </div>

        <div className="bottom-bar">
          <div>
            <div className="bottom-left">{lastRefreshText}</div>
            {actionMessage ? <div className="notice-box info">{actionMessage}</div> : null}
          </div>

          <div className="bottom-actions">
            <ActionButton
			  onClick={onRefreshPrices}
			  disabled={isRefreshingPrices}
			>
			  <Coins size={15} />
			  <span>{isRefreshingPrices ? "가격 갱신 중..." : "가격 갱신"}</span>
			</ActionButton>
			
			<ActionButton onClick={onClearSavedState}>
			  <span>저장 초기화</span>
			</ActionButton>
			
			{isTech ? (
			  <ActionButton onClick={() => setDirectCraftMode((prev) => !prev)}>
				<span>{`하위 재료 직접 제작 시 ${directCraftMode ? "ON" : "OFF"}`}</span>
			  </ActionButton>
			) : null}
			
			{!hideFavoriteFilter ? (
			  <ActionButton onClick={() => setShowFavoritesOnly((prev) => !prev)}>
			    <span>{showFavoritesOnly ? "전체 보기" : "즐겨찾기만 보기"}</span>
			  </ActionButton>
			) : null}

			{SHOW_EDIT_BUTTONS && (
			  <>
				<ActionButton>
				  <Plus size={15} />
				  <span>제작 아이템 추가</span>
				</ActionButton>

				<ActionButton>
				  <Plus size={15} />
				  <span>필요한 아이템 추가</span>
				</ActionButton>

				<ActionButton>
				  <Trash2 size={15} />
				  <span>선택 삭제</span>
				</ActionButton>
			  </>
			)}
          </div>
        </div>
      </div>
    </div>
  );
});

const FacilityTable = memo(function FacilityTable({
  rows,
  expandedRows,
  setExpandedRows,
  onChangeFacilityCraftQty,
  selectedCategory,
  country,
  subcategory,
  favorites,
  onToggleFavorite,
  directCraftMode = false,
  techUnitOverrides,
  facilityUnitOverrides,
  setFacilityUnitOverrides,
  readOnlyFavoriteView = false,
  onChangeFacilityChildUnit,
}) {
  const [draftQty, setDraftQty] = useState({});

  const columns = [
    "제작 아이템",
    "제작 재료",
    "제작 수량",
    "필요한 수량",
    "개당",
    "합계",
    "필요 도구",
    "작업량",
    "게임 시간",
    "현실 시간",
    "비고",
  ];

  if (!rows.length) {
    return <div className="empty-box">표시할 시설 데이터가 없습니다.</div>;
  }

  const toggleRow = (rowId) => {
    setExpandedRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const commitCraftQty = (row) => {
    const rawValue = draftQty[row.id];

    if (rawValue === undefined) return;

    onChangeFacilityCraftQty(row.id, rawValue);

    setDraftQty((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  };

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const rowKey = row.id ?? `row-${rowIndex}`;
          const isOpen = !!expandedRows[rowKey];

          const favoriteCategory = row.favoriteMeta?.category ?? selectedCategory;
		  const favoriteCountry = row.favoriteMeta?.country ?? country;
		  const favoriteSubcategory = row.favoriteMeta?.subcategory ?? subcategory;
		  const favoriteCraft = row.favoriteMeta?.originalCraft ?? row.craft;

		  const favoriteKey = getFavoriteKey({
		    category: favoriteCategory,
		    country: favoriteCountry,
		    subcategory: favoriteSubcategory,
		    isFacility: true,
		    craft: favoriteCraft,
		  });

          const isFavorite = !!favorites[favoriteKey];

          return (
            <React.Fragment key={rowKey}>
              <tr>
                <td className="primary">
                  <div className="primary-cell">
                    <button
                      type="button"
                      className="tree-toggle"
                      onClick={() => toggleRow(rowKey)}
                    >
                      <span className="tree-arrow">{isOpen ? "▼" : "▶"}</span>
                      <span>
					    {row.favoriteMeta?.country && row.favoriteMeta?.subcategory
						? `[${row.favoriteMeta.country} / ${row.favoriteMeta.subcategory}] ${row.craft}`
						: row.craft}
					  </span>
                    </button>

                    <button
                      type="button"
                      className={`favorite-button ${isFavorite ? "active" : ""}`}
                      onClick={() =>
                        onToggleFavorite({
                          category: favoriteCategory,
						  country: favoriteCountry,
						  subcategory: favoriteSubcategory,
						  isFacility: true,
						  craft: favoriteCraft,
                        })
                      }
                      title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    >
                      {isFavorite ? "★" : "☆"}
                    </button>
                  </div>
                </td>
                <td></td>
                <td>
                  <input
                    type="number"
                    min={row.baseQty || 1}
                    max={(row.favoriteMeta?.category ?? selectedCategory) === "목장" ? 30000 : undefined}
                    step={row.baseQty || 1}
                    className="qty-input"
                    value={draftQty[row.id] ?? String(row.craftQty)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      setDraftQty((prev) => ({
                        ...prev,
                        [row.id]: e.target.value,
                      }))
                    }
                    onBlur={() => commitCraftQty(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </td>
                <td></td>
                <td></td>
                <td>{row.sum}</td>
                <td>{row.tool}</td>
                <td>{row.work}</td>
                <td>{row.gameTime}</td>
                <td>{row.realTime}</td>
				<td className="note-cell">
				  {buildParentNote(row, {
					directCraftMode,
					techUnitOverrides,
					facilityUnitOverrides,
				  })}
				</td>
              </tr>

              {isOpen &&
                row.children?.map((child, childIndex) => (
                  <tr
                    key={child.id ?? `child-${rowIndex}-${childIndex}`}
                    className={child.lack ? "lack-row" : ""}
                  >
                    <td></td>
                    <td className="tree-child-cell">{child.need}</td>
                    <td></td>
                    <td>{child.needQty}</td>
					<td>
					  <input
						type="text"
						className="qty-input price-input"
						value={
						  facilityUnitOverrides[getFacilityChildOverrideKey(row, child)] ??
						  (child.unit && child.unit !== "-" ? child.unit : "")
						}
						onChange={(e) => {
						  const raw = e.target.value;
						  const digits = raw.replace(/[^\d]/g, "");
						  const key = getFacilityChildOverrideKey(row, child);

						  setFacilityUnitOverrides((prev) => {
							const next = { ...prev };

							if (!digits) {
							  delete next[key];
							} else {
							  next[key] = Number(digits).toLocaleString();
							}

							return next;
						  });
						}}
						onBlur={() => {
						  const key = getFacilityChildOverrideKey(row, child);
						  const value =
							facilityUnitOverrides[key] ??
							(child.unit && child.unit !== "-" ? child.unit : "");

						  onChangeFacilityChildUnit(row.id, child.id, value);
						}}
						onFocus={(e) => e.target.select()}
						onKeyDown={(e) => {
						  if (e.key === "Enter") {
							e.currentTarget.blur();
						  }
						}}
					  />
					</td>
					<td>{child.sum}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td className="note-cell">{child.note}</td>
                  </tr>
                ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
});

const TechTable = memo(function TechTable({
  rows,
  category,
  favorites,
  onToggleFavorite,
  readOnlyFavoriteView = false,
  directCraftMode = false,
  techUnitOverrides,
  facilityUnitOverrides,
  setTechUnitOverrides,
  onChangeTechCraftCount,
}) {
  const [draftCraftCount, setDraftCraftCount] = useState({});

  const commitCraftCount = (row) => {
    const rawValue = draftCraftCount[row.id];
    if (rawValue === undefined) return;

    onChangeTechCraftCount(row.id, rawValue);

    setDraftCraftCount((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  };

  const columns = [
    "제작 아이템",
    "회당 수량",
    "필요한 아이템",
    "필요한 수량",
    "제작 수량",
    "제작비용",
    "개당",
    "합계",
    "평균가",
    "비고",
  ];

  if (!rows.length) {
    return <div className="empty-box">표시할 제조기술 데이터가 없습니다.</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const rowKey = row.id ?? `row-${rowIndex}`;

          const favoriteCategory = row.favoriteMeta?.category ?? category;
          const favoriteCraft = row.favoriteMeta?.originalCraft ?? row.craft;

          const favoriteKey = getFavoriteKey({
            category: favoriteCategory,
            isFacility: false,
            craft: favoriteCraft,
          });

          const isFavorite = !!favorites[favoriteKey];

          return (
            <React.Fragment key={rowKey}>
              <tr>
                <td className="primary">
                  <div className="primary-cell">
                    <span>
                      {row.favoriteMeta?.category ? `[${row.favoriteMeta.category}] ${row.craft}` : row.craft}
                    </span>

                    <button
                      type="button"
                      className={`favorite-button ${isFavorite ? "active" : ""}`}
                      onClick={() =>
                        onToggleFavorite({
                          category: favoriteCategory,
                          isFacility: false,
                          craft: favoriteCraft,
                        })
                      }
                      title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    >
                      {isFavorite ? "★" : "☆"}
                    </button>
                  </div>
                </td>
                <td>{row.baseCraftQty}</td>
                <td></td>
                <td></td>
				<td>
				  <input
					type="number"
					min="1"
					className="qty-input"
					value={draftCraftCount[row.id] ?? String(row.craftCount || 1)}
					onChange={(e) =>
					  setDraftCraftCount((prev) => ({
						...prev,
						[row.id]: e.target.value,
					  }))
					}
					onBlur={() => commitCraftCount(row)}
					onFocus={(e) => e.target.select()}
					onKeyDown={(e) => {
					  if (e.key === "Enter") {
						e.currentTarget.blur();
					  }
					}}
				  />
				</td>
                <td>{row.cost}</td>
                <td>{row.unitPrice}</td>
                <td></td>
                <td>{row.avgPrice}</td>
				<td className="note-cell">
				  {buildParentNote(row, {
					directCraftMode,
					techUnitOverrides,
					facilityUnitOverrides,
				  })}
				</td>
              </tr>

              {row.children?.map((child, childIndex) => (
                <tr
                  key={child.id ?? `child-${rowIndex}-${childIndex}`}
                  className={child.lack ? "lack-row" : ""}
                >
                  <td></td>
                  <td></td>
                  <td>{child.need}</td>
                  <td>{child.needQty}</td>
                  <td></td>
                  <td></td>
                  <td className="col-unit-cell">
                    <input
                      type="text"
                      className="qty-input price-input"
                      value={child.inputUnitValue ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const digits = raw.replace(/[^\d]/g, "");

                        setTechUnitOverrides((prev) => {
                          const next = { ...prev };

                          if (!digits) {
                            delete next[child.overrideKey];
                          } else {
                            next[child.overrideKey] = Number(digits).toLocaleString();
                          }

                          return next;
                        });
                      }}
					  onBlur={(e) => {
						const raw = e.target.value;
						const digits = raw.replace(/[^\d]/g, "");

						setTechUnitOverrides((prev) => {
						  const next = { ...prev };

						  if (!digits) {
							delete next[child.overrideKey];
						  } else {
							next[child.overrideKey] = Number(digits).toLocaleString();
						  }

						  return next;
						});
					  }}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  </td>
                  <td>{child.sum}</td>
                  <td></td>
                  <td className="note-cell">{child.note}</td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
});

function CategorySection({ title, children }) {
  return (
    <fieldset className="group-box">
      <legend>{title}</legend>
      <div className="group-buttons">{children}</div>
    </fieldset>
  );
}

function CategoryButton({ label, onClick }) {
  return (
    <button className="category-button" onClick={onClick}>
      {label}
    </button>
  );
}

function LabelSelect({ label, value, onChange, options }) {
  return (
    <label className="select-wrap">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterChipGroup({ label, value, onChange, options }) {
  return (
    <div className="filter-block">
      <div className="filter-label">{label}</div>
      <div className="filter-chip-row">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`filter-chip ${value === option ? "active" : ""}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled = false }) {
  return (
    <button className="action-button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function FavoritesScreen({
  favorites,
  onBack,
  onOpenFavorite,
}) {
  const favoriteItems = Object.values(favorites || {});

  return (
    <div className="page workspace">
      <div className="workspace-header">
        <div className="workspace-header-top">
          <div className="workspace-title-row">
            <button className="back-button" onClick={onBack}>
              ← 처음으로
            </button>

            <div className="workspace-title">
              <h2>★ 즐겨찾기</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          {!favoriteItems.length ? (
            <div className="empty-box">즐겨찾기한 아이템이 없습니다.</div>
          ) : (
            <div className="favorite-list">
              {favoriteItems.map((item, idx) => (
                <button
                  key={`${item.category}-${item.craft}-${idx}`}
                  className="favorite-card"
                  onClick={() => onOpenFavorite(item)}
                >
                  <div className="favorite-card-title">{item.craft}</div>
                  <div className="favorite-card-meta">
                    {item.isFacility
                      ? `${item.category} / ${item.country} / ${item.subcategory}`
                      : `${item.category} / 제조기술`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FavoriteWorkspaceScreen({
  title,
  rows,
  isFacility,
  onBack,
  favorites,
  onToggleFavorite,
}) {
  const [expandedRows, setExpandedRows] = useState(() => {
    const initial = {};
    (rows || []).forEach((row) => {
      initial[row.id] = true;
    });
    return initial;
  });

  useEffect(() => {
    const nextExpanded = {};
    (rows || []).forEach((row) => {
      nextExpanded[row.id] = true;
    });
    setExpandedRows(nextExpanded);
  }, [rows]);

  return (
    <div className="page workspace">
      <div className="workspace-header">
        <div className="workspace-header-top">
          <div className="workspace-title-row">
            <button className="back-button" onClick={onBack}>
              ← 처음으로
            </button>

            <div className="workspace-title">
              <h2>{title}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="table-panel">
        <div className="table-scroll">
          {!rows.length ? (
            <div className="empty-box">즐겨찾기한 항목이 없습니다.</div>
          ) : isFacility ? (
            <FacilityTable
              rows={rows}
              expandedRows={expandedRows}
              setExpandedRows={setExpandedRows}
              onChangeFacilityCraftQty={() => {}}
              selectedCategory="즐겨찾기"
              country=""
              subcategory=""
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              readOnlyFavoriteView={true}
            />
          ) : (
            <TechTable
              rows={rows}
              category="즐겨찾기"
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
              readOnlyFavoriteView={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
