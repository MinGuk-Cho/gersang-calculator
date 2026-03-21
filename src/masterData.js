function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const facilityMasterData = {
  무기장: {
    조선: {
      궁포공장: [
        {
          id: "weapon-joseon-bow-1",
          craft: "고급단궁",
          craftQty: 1,
          baseQty: 1,
          sum: "-",
          tool: "조각칼",
          work: 818,
          baseWork: 818,
          gameTime: "40.9일",
          realTime: "1.4일(33시간)",
          note: "",
          children: [
            {
              id: "weapon-joseon-bow-1-1",
              need: "소나무판",
              needQty: 3,
              baseNeedQty: 3,
              unit: "-",
              sum: "-",
              note: "",
              lack: false,
              lackQty: 0,
              filledQty: 0,
              usedName: "소나무판",
            },
            {
              id: "weapon-joseon-bow-1-2",
              need: "참나무판",
              needQty: 6,
              baseNeedQty: 6,
              unit: "-",
              sum: "-",
              note: "",
              lack: false,
              lackQty: 0,
              filledQty: 0,
              usedName: "참나무판",
            },
          ],
        },
        {
          id: "weapon-joseon-bow-2",
          craft: "고급맥궁",
          craftQty: 1,
          baseQty: 1,
          sum: "-",
          tool: "끌",
          work: 2046,
          baseWork: 2046,
          gameTime: "102.3일",
          realTime: "3.4일(82시간)",
          note: "",
          children: [
            {
              id: "weapon-joseon-bow-2-1",
              need: "참나무판",
              needQty: 7,
              baseNeedQty: 7,
              unit: "-",
              sum: "-",
              note: "",
              lack: false,
              lackQty: 0,
              filledQty: 0,
              usedName: "참나무판",
            },
            {
              id: "weapon-joseon-bow-2-2",
              need: "철",
              needQty: 2,
              baseNeedQty: 2,
              unit: "-",
              sum: "-",
              note: "",
              lack: false,
              lackQty: 0,
              filledQty: 0,
              usedName: "철",
            },
          ],
        },
      ],
    },

    일본: {
      궁포공장: [],
    },

    대만: {
      궁포공장: [],
    },

    중국: {
      궁포공장: [],
    },
  },

  공장: {
    조선: {
      공예장: [
        {
          id: "factory-joseon-craft-1",
          craft: "가는실",
          craftQty: 1,
          baseQty: 1,
          sum: "-",
          tool: "베틀",
          work: 120,
          baseWork: 120,
          gameTime: "6.0일",
          realTime: "0.2일(5시간)",
          note: "",
          children: [
            {
              id: "factory-joseon-craft-1-1",
              need: "누에고치",
              needQty: 2,
              baseNeedQty: 2,
              unit: "-",
              sum: "-",
              note: "",
              lack: false,
              lackQty: 0,
              filledQty: 0,
              usedName: "누에고치",
            },
          ],
        },
      ],
      대장간: [],
      도요지: [],
      제약장: [],
      직조장: [],
    },

    일본: {
      공예장: [],
      대장간: [],
      도요지: [],
      제약장: [],
      직조장: [],
    },

    대만: {
      공예장: [],
      대장간: [],
      도요지: [],
      제약장: [],
      직조장: [],
    },

    중국: {
      공예장: [],
      대장간: [],
      도요지: [],
      제약장: [],
      직조장: [],
    },
  },

  목장: {
    조선: {
      도축장: [],
      제약장: [],
      축사: [],
    },

    일본: {
      도축장: [],
      제약장: [],
      축사: [],
    },

    대만: {
      도축장: [],
      제약장: [],
      축사: [],
    },

    중국: {
      도축장: [],
      제약장: [],
      축사: [],
    },
  },
};

export const techMasterData = {
  연금술사: [
    {
      id: "alchemy-1",
      craft: "박하탕",
      craftQty: 5,
      baseQty: 5,
      cost: "1,000",
      avgPrice: "-",
      note: "",
      children: [
        {
          id: "alchemy-1-1",
          need: "박하",
          needQty: 10,
          baseNeedQty: 10,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "박하",
        },
        {
          id: "alchemy-1-2",
          need: "감초",
          needQty: 10,
          baseNeedQty: 10,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "감초",
        },
      ],
    },
    {
      id: "alchemy-2",
      craft: "최가환약",
      craftQty: 5,
      baseQty: 5,
      cost: "2,000",
      avgPrice: "-",
      note: "",
      children: [
        {
          id: "alchemy-2-1",
          need: "감초",
          needQty: 10,
          baseNeedQty: 10,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "감초",
        },
        {
          id: "alchemy-2-2",
          need: "인삼",
          needQty: 10,
          baseNeedQty: 10,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "인삼",
        },
      ],
    },
  ],

  세공사: [
    {
      id: "jewel-1",
      craft: "청동반지",
      craftQty: 1,
      baseQty: 1,
      cost: "5,000",
      avgPrice: "-",
      note: "",
      children: [
        {
          id: "jewel-1-1",
          need: "청동",
          needQty: 2,
          baseNeedQty: 2,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "청동",
        },
      ],
    },
  ],

  대장장이: [
    {
      id: "blacksmith-1",
      craft: "철검",
      craftQty: 1,
      baseQty: 1,
      cost: "8,000",
      avgPrice: "-",
      note: "",
      children: [
        {
          id: "blacksmith-1-1",
          need: "철",
          needQty: 3,
          baseNeedQty: 3,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "철",
        },
        {
          id: "blacksmith-1-2",
          need: "목재",
          needQty: 1,
          baseNeedQty: 1,
          unit: "-",
          sum: "-",
          note: "",
          usedName: "목재",
        },
      ],
    },
  ],
};

export function getFacilityMasterRows(category, country, subcategory) {
  const rows = facilityMasterData?.[category]?.[country]?.[subcategory] || [];
  return deepClone(rows);
}

export function getTechMasterRows(category) {
  const rows = techMasterData?.[category] || [];
  return deepClone(rows);
}