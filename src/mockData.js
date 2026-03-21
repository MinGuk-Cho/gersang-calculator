export const FACILITY_CATEGORIES = ["무기장", "공장", "목장"];
export const TECH_CATEGORIES = ["연금술사", "세공사", "대장장이"];

export const FACILITY_SUBCATEGORY_MAP = {
  무기장: [
    "궁포공장",
    "도검공장",
    "무선공장",
    "부월공장",
    "불무공장",
    "암기공장",
    "조도공장",
    "창극공장",
    "총포공장",
    "특수무기공장",
  ],
  공장: ["공예장", "대장간", "도요지", "제약장", "직조장"],
  목장: ["도축장", "제약장", "축사"],
};

export const FACILITY_COUNTRIES = ["조선", "일본", "대만", "중국"];

export const defaultRecipesByCategory = {
  무기장: [
    {
      id: "f1",
      craft: "고급단궁",
      craftQty: 1,
      sum: "81,800",
      tool: "조각칼",
      work: "818",
      gameTime: "40.9일",
      realTime: "1.4일(33시간)",
      note: "",
      children: [
        { id: "f1-1", need: "소나무판", needQty: 3, unit: "-", sum: "-", note: "" },
        { id: "f1-2", need: "참나무판", needQty: 6, unit: "-", sum: "-", note: "" },
      ],
    },
    {
      id: "f2",
      craft: "고급맥궁",
      craftQty: 1,
      sum: "204,600",
      tool: "끌",
      work: "2,046",
      gameTime: "102.3일",
      realTime: "3.4일(82시간)",
      note: "",
      children: [
        { id: "f2-1", need: "참나무판", needQty: 7, unit: "-", sum: "-", note: "" },
        { id: "f2-2", need: "철", needQty: 2, unit: "-", sum: "-", note: "" },
      ],
    },
  ],

  공장: [
    {
      id: "g1",
      craft: "가는실",
      craftQty: 1,
      sum: "12,000",
      tool: "베틀",
      work: "120",
      gameTime: "6일",
      realTime: "4시간 48분",
      note: "",
      children: [
        { id: "g1-1", need: "누에고치", needQty: 2, unit: "-", sum: "-", note: "" },
      ],
    },
  ],

  목장: [
    {
      id: "m1",
      craft: "가죽",
      craftQty: 1,
      sum: "7,500",
      tool: "칼",
      work: "80",
      gameTime: "4일",
      realTime: "3시간 12분",
      note: "",
      children: [
        { id: "m1-1", need: "짐승가죽", needQty: 1, unit: "-", sum: "-", note: "" },
      ],
    },
  ],

  연금술사: [
    {
      id: "t1",
      craft: "박하탕",
      craftQty: 5,
      cost: "1,000",
      avgPrice: "-",
      note: "",
      children: [
        { id: "t1-1", need: "박하", needQty: 10, note: "" },
        { id: "t1-2", need: "감초", needQty: 10, note: "" },
      ],
    },
    {
      id: "t2",
      craft: "최가환약",
      craftQty: 5,
      cost: "2,000",
      avgPrice: "-",
      note: "",
      children: [
        { id: "t2-1", need: "감초", needQty: 10, note: "" },
        { id: "t2-2", need: "인삼", needQty: 10, note: "" },
      ],
    },
  ],

  세공사: [
    {
      id: "j1",
      craft: "청동반지",
      craftQty: 1,
      cost: "5,000",
      avgPrice: "-",
      note: "",
      children: [
        { id: "j1-1", need: "청동", needQty: 2, note: "" },
      ],
    },
  ],

  대장장이: [
    {
      id: "b1",
      craft: "철검",
      craftQty: 1,
      cost: "8,000",
      avgPrice: "-",
      note: "",
      children: [
        { id: "b1-1", need: "철", needQty: 3, note: "" },
        { id: "b1-2", need: "목재", needQty: 1, note: "" },
      ],
    },
  ],
};
export const defaultAppState = {
  dark_mode: true,
  last_refresh_time: "",
  categories: defaultRecipesByCategory,
};