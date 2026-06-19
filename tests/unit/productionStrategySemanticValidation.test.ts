import { describe, expect, it } from "vitest";

import {
  validateProductionStrategySemantics,
  type ProductionStrategyPack,
} from "../../src/data/ranges/productionStrategySemanticValidation";

function clonePack<T extends ProductionStrategyPack>(pack: T): T {
  return structuredClone(pack);
}

function fixture(street: "FLOP" | "TURN" | "RIVER"): ProductionStrategyPack {
  const streetFields = street === "FLOP"
    ? { boardTextures: ["dry"] }
    : street === "TURN"
      ? { priorFlopAction: "BET_SMALL", turnCardClasses: ["BLANK"] }
      : {
        priorTurnAction: "BET_SMALL",
        riverRunoutClasses: ["BLANK"],
        blockerRelevance: "HIGH",
      };
  return {
    id: `semantic-${street.toLowerCase()}-fixture`,
    dimensions: {
      street,
      blindSpeeds: ["REGULAR", "TURBO"],
      antes: ["ON", "OFF"],
    },
    rules: [
      {
        id: `${street.toLowerCase()}-rule`,
        actionNode: street === "FLOP"
          ? "SINGLE_RAISED_POT_CBET"
          : street === "TURN"
            ? "TURN_BARREL"
            : "RIVER_PRESSURE",
        potType: "SINGLE_RAISED",
        positionPattern: "BTN_VS_BB",
        sprMin: 1,
        sprMax: 8,
        rangeBuckets: [
          { lane: "VALUE", handClasses: ["AA"] },
          { lane: "BLUFF", handClasses: ["QJs"] },
          { lane: "CHECK", handClasses: ["72o"] },
        ],
        cardRemovalSamples: [
          {
            board: street === "FLOP"
              ? [
                { rank: "K", suit: "d" },
                { rank: "7", suit: "c" },
                { rank: "2", suit: "d" },
              ]
              : street === "TURN"
                ? [
                  { rank: "K", suit: "d" },
                  { rank: "7", suit: "c" },
                  { rank: "2", suit: "d" },
                  { rank: "5", suit: "c" },
                ]
                : [
                  { rank: "K", suit: "d" },
                  { rank: "7", suit: "c" },
                  { rank: "2", suit: "d" },
                  { rank: "5", suit: "c" },
                  { rank: "J", suit: "d" },
                ],
            heroCards: [
              { rank: "A", suit: "s" },
              { rank: "A", suit: "h" },
            ],
            handClass: "AA",
            rationale: "Deterministicky source-free QA sample.",
          },
        ],
        ...streetFields,
      },
    ],
  } as unknown as ProductionStrategyPack;
}

describe("productionStrategySemanticValidation", () => {
  it("prijima jednoznacne postflop fixture", () => {
    for (const street of ["FLOP", "TURN", "RIVER"] as const) {
      expect(validateProductionStrategySemantics(fixture(street)), street).toEqual([]);
    }
  });

  it("odmita duplicitni coverage a stejny hand ve vice bucket lanes", () => {
    const pack = clonePack(fixture("FLOP"));
    pack.dimensions.blindSpeeds = [
      pack.dimensions.blindSpeeds[0],
      pack.dimensions.blindSpeeds[0],
    ];
    pack.dimensions.antes = [pack.dimensions.antes[0], pack.dimensions.antes[0]];
    pack.rules[0].rangeBuckets[1].handClasses = [
      ...pack.rules[0].rangeBuckets[1].handClasses,
      pack.rules[0].rangeBuckets[0].handClasses[0],
    ];

    expect(validateProductionStrategySemantics(pack)).toEqual(expect.arrayContaining([
      "Flop production blindSpeeds coverage contains duplicates.",
      "Flop production ante coverage contains duplicates.",
      `${pack.rules[0].id}: hand ${pack.rules[0].rangeBuckets[0].handClasses[0]} appears in multiple range buckets without overlap policy.`,
    ]));
  });

  it("povoli deklarovany hand overlap jen pro presne lanes s odduvodnenim", () => {
    const pack = clonePack(fixture("FLOP"));
    pack.rules[0].rangeBuckets[1].handClasses = ["QJs", "AA"];
    pack.rules[0].handClassOverlapPolicies = [
      {
        handClass: "AA",
        lanes: ["VALUE", "BLUFF"],
        rationale: "Explicitni mixed lane reprezentace z importu.",
      },
    ];

    expect(validateProductionStrategySemantics(pack)).toEqual([]);

    pack.rules[0].handClassOverlapPolicies = [
      {
        handClass: "AA",
        lanes: ["VALUE", "CHECK"],
        rationale: "",
      },
    ];
    expect(validateProductionStrategySemantics(pack)).toEqual(expect.arrayContaining([
      `${pack.rules[0].id}: overlap policy lanes do not match buckets for hand AA.`,
      `${pack.rules[0].id}: overlap policy for hand AA needs rationale.`,
    ]));
  });

  it.each([
    ["Flop", fixture("FLOP")],
    ["Turn", fixture("TURN")],
    ["River", fixture("RIVER")],
  ] as const)(
    "odmita duplicitni id a semanticky selector pro %s",
    (street, sourcePack) => {
      const pack = clonePack(sourcePack);
      pack.rules = [...pack.rules, structuredClone(pack.rules[0])] as typeof pack.rules;

      expect(validateProductionStrategySemantics(pack)).toEqual(expect.arrayContaining([
        `Duplicate ${street.toLowerCase()} production rule id: ${pack.rules[0].id}.`,
        `${street} production rule ${pack.rules[0].id} duplicates selector of ${pack.rules[0].id}.`,
      ]));
    },
  );

  it.each([
    ["Flop", fixture("FLOP"), "boardTextures", ["dry", "wet"]],
    ["Turn", fixture("TURN"), "turnCardClasses", ["BLANK", "OVER_CARD"]],
    ["River", fixture("RIVER"), "riverRunoutClasses", ["BLANK", "OVER_CARD"]],
  ] as const)(
    "odmita prekryvajici se %s selector bez explicitni precedence",
    (street, sourcePack, field, values) => {
      const pack = clonePack(sourcePack);
      const second = {
        ...structuredClone(pack.rules[0]),
        id: `${pack.rules[0].id}-overlap`,
        [field]: values,
      };
      pack.rules = [...pack.rules, second] as typeof pack.rules;

      expect(validateProductionStrategySemantics(pack)).toContain(
        `${street} production rule ${second.id} overlaps selector of ${pack.rules[0].id}.`,
      );
    },
  );

  it("povazuje river blockerRelevance bez runtime vstupu za kolidujici selector", () => {
    const pack = clonePack(fixture("RIVER"));
    const second = {
      ...structuredClone(pack.rules[0]),
      id: "river-rule-different-blocker-only",
      blockerRelevance: "LOW",
    };
    pack.rules = [...pack.rules, second] as typeof pack.rules;

    expect(validateProductionStrategySemantics(pack)).toContain(
      "River production rule river-rule-different-blocker-only duplicates selector of river-rule.",
    );
  });

  it("validuje hero hand match, fyzicke duplicity a card removal proti sample boardu", () => {
    const pack = clonePack(fixture("FLOP"));
    pack.rules[0].cardRemovalSamples = [
      {
        board: [
          { rank: "A", suit: "s" },
          { rank: "A", suit: "h" },
          { rank: "A", suit: "d" },
        ],
        heroCards: [
          { rank: "Q", suit: "s" },
          { rank: "J", suit: "s" },
        ],
        handClass: "QJo",
        rationale: "",
      },
    ];

    expect(validateProductionStrategySemantics(pack)).toEqual(expect.arrayContaining([
      "flop-rule: card removal sample 1 needs rationale.",
      "flop-rule: card removal sample 1 hero cards resolve to QJs, not QJo.",
      "flop-rule: card removal sample 1 hand QJo is absent from range buckets.",
      "flop-rule: card removal sample 1 removes every combo of range hand AA.",
    ]));
  });
});
