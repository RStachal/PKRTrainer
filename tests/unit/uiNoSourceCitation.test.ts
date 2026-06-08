// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { DEFAULT_TRAINING_PROFILE, profileWith } from "../../src/core/trainingProfile";
import { renderPostflopView } from "../../src/ui/postflopView";
import { renderProfileSelector } from "../../src/ui/profileSelector";
import { renderRangeModalButton } from "../../src/ui/rangeModal";
import { createStatsStore, type ResultRecord } from "../../src/persistence/statsStore";
import { renderDashboard } from "../../src/ui/dashboard";
import type { PostflopStatsV2BridgeRecord } from "../../src/persistence/postflopResultRecord";
import type { RangeStore } from "../../src/data/rangeStore";
import type { Card, Spot, TableState } from "../../src/core/types";
import { buildProductionPermissionManifestReport } from "../../src/data/ranges/productionPermissionManifest";

const FORBIDDEN_SOURCE_TEXT = [
  "https://",
  "http://",
  "GTO Wizard",
  "Upswing",
  "ICMIZER",
  "HoldemResources",
  "GTO Hero",
  "Poker Academy",
  "BBZ Poker",
  "GTO Sims",
  "PokerCoaching",
  "GTOBase",
  "RangePack",
  "StrategyPack",
  "mtt-full-ring",
  "mtt-6max",
  "cash-6max",
  "sng-6max",
  "SINGLE_RAISED_POT_CBET",
  "THREE_BET_POT_CBET",
  "TURN_BARREL",
  "RIVER_PRESSURE",
  "dry|ace-high|disconnected",
  "THREE_BET_POT",
  "OOP_CALLER_VS_IP_3BETTOR",
  "OOP_RAISER_VS_IP_CALLER",
  "BTN_VS_BB",
  "EP_VS_BB",
  "SB_VS_BB",
  "FULL_RING_9",
  "SIX_MAX",
  "PREFLOP",
  "CHIP_EV",
  "NO_RAKE",
];

const FORBIDDEN_SOURCE_PATTERNS: RegExp[] = [
  /\bhttps?:\/\/\S+/i,
  /\b(?:mtt|sng|cash)-(?:full-ring|six-max|6max)[a-z0-9-]*(?:candidate|heuristic|production|private|v\d)[a-z0-9-]*/i,
  /\b(?:flop|turn|river)-(?:srp|three-bet|production|public|range)[a-z0-9-]*/i,
  /\b(?:RangePack|StrategyPack)\b/,
];

const heroCards: [Card, Card] = [
  { rank: "A", suit: "s" },
  { rank: "K", suit: "s" },
];

const tableState: TableState = {
  heroPos: "BTN",
  pushFold: false,
  limpsBefore: 0,
  callsBefore: 0,
  facing: "NONE",
  isBvB: false,
};

const spot: Spot = {
  id: "RFI|BTN|25|AKs|OFF",
  context: "RFI",
  heroPos: "BTN",
  effStack: 25,
  ante: "OFF",
  pushFold: false,
  hand: "AKs",
  heroCards,
  tableState,
  answers: [{ key: "OPEN_2X", label: "Raise 2x" }],
  correctKeys: ["OPEN_2X"],
  strictCorrect: ["OPEN_2X"],
  explanation: "Testovaci spot.",
};

const loadedStore: RangeStore = {
  isLoaded: () => true,
  lookup: () => ({
    actions: { AKs: ["OPEN_2X"] },
    strict: { AKs: ["OPEN_2X"] },
  }),
};

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
}

const preflopRecord: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

const postflopRecord: PostflopStatsV2BridgeRecord = {
  schema: "postflop_stats_v2_bridge_v1",
  schemaVersion: 2,
  qid: "POSTFLOP|FLOP|1|As-Kd-Qh",
  correct: true,
  ts: 2,
  profileId: "MTT|FULL_RING_9|REGULAR|FLOP|CHIP_EV|ON|NONE",
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "FLOP",
  evModel: "CHIP_EV",
  rakeMode: "NONE",
  actionNode: "SINGLE_RAISED_POT_CBET",
  potType: "SINGLE_RAISED",
  boardTextureKey: "dry|ace-high|disconnected",
  heroPosition: "BTN",
  villainPosition: "BB",
  positionPattern: "BTN_VS_BB",
  chosen: "BET_SMALL",
  recommended: "BET_SMALL",
  strategyPackId: "mtt-full-ring-9-flop-single-raised-chip-ev-public-heuristic-v1",
  strategyRuleId: "flop-srp-ace-high-disconnected-small-cbet",
  confidence: "LOW",
};

describe("UI source citation policy", () => {
  it("nezobrazuje URL ani provider citace v profile selectoru", () => {
    const root = document.createElement("div");
    renderProfileSelector(root);

    const profiles = [
      profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" }),
      profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "SNG",
        tableFormat: "SIX_MAX",
        blindSpeed: "TURBO",
        evModel: "ICM",
      }),
      profileWith(DEFAULT_TRAINING_PROFILE, {
        gameVariant: "CASH",
        tableFormat: "SIX_MAX",
        ante: "OFF",
        rakeMode: "RAKE",
      }),
    ];

    const view = renderProfileSelector(root);
    for (const profile of profiles) {
      view.setProfile(profile);
      expectNoSourceCitation(root.textContent ?? "");
    }
  });

  it("nezobrazuje URL ani provider citace v range modal metadatech", () => {
    const root = document.createElement("div");

    renderRangeModalButton(spot, loadedStore, root);
    root.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    expectNoSourceCitation(document.querySelector<HTMLElement>(".range-modal")?.textContent ?? "");
    document.querySelector<HTMLButtonElement>(".range-modal__close")?.click();
  });

  it("nezobrazuje URL ani provider citace v postflop vysvetleni", () => {
    const root = document.createElement("div");
    renderPostflopView(root, { initialStreet: "RIVER", autoGenerate: true });

    root.querySelector<HTMLButtonElement>(".postflop-action")?.click();

    expectNoSourceCitation(root.querySelector<HTMLElement>(".postflop-result")?.textContent ?? "");
  });

  it("nezobrazuje raw postflop enumy v konkretni otazce", () => {
    const root = document.createElement("div");
    renderPostflopView(root, {
      initialSeed: 1788246284,
      initialStreet: "FLOP",
      autoGenerate: true,
      initialPotType: "THREE_BET_POT",
      initialPotBB: 18,
      initialEffectiveStackBB: 40,
      initialPositionContext: {
        heroPosition: "LJ",
        villainPosition: "HJ",
        aggressorPosition: "HJ",
        callerPosition: "LJ",
        inPosition: false,
        callerType: "OUT_OF_POSITION_CALLER",
        positionPattern: "OOP_CALLER_VS_IP_3BETTOR",
      },
    });

    expectNoSourceCitation(root.textContent ?? "");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent)
      .toContain("3bet pot");
    expect(root.querySelector<HTMLElement>(".postflop-meta")?.textContent)
      .toContain("LJ vs HJ (OOP)");
  });

  it("nezobrazuje source/pack citace ve viditelnem dashboard textu", () => {
    const store = createStatsStore(new MemoryStorage());
    expect(store.record(preflopRecord).ok).toBe(true);

    const root = document.createElement("div");
    renderDashboard({ store, sessionCount: 1, postflopRecords: [postflopRecord] }, root);

    expectNoSourceCitation(root.textContent ?? "");
    expect(root.querySelector<HTMLElement>(".profile-breakdown--rangePackId")?.textContent)
      .toContain("Preflop model");
    expect(root.querySelector<HTMLElement>(".postflop-breakdown--strategyPackId")?.textContent)
      .toContain("Postflop model");
  });

  it("nezobrazuje URL ani pack id v permission audit panelu", () => {
    const store = createStatsStore(new MemoryStorage());
    const report = buildProductionPermissionManifestReport({
      packId: "mtt-full-ring-9-flop-production-private-v1",
      version: "permission-v1",
      reviewedAt: "2026-06-05",
      reviewer: "Internal Review",
      rightsOwner: "Private Solver Owner",
      licenseKind: "OWNED_SOLVER_EXPORT",
      allowedRedistributionScope: "PKRTRAINER_RUNTIME_BUNDLE",
      sourceMaterialLocation: "Agents/range-intake/raw/mtt-full-ring-9-flop-production-private-v1/",
      evidence: [
        {
          referenceId: "private-solver-export",
          storedAt: "Agents/range-intake/raw/mtt-full-ring-9-flop-production-private-v1/export.txt",
          reviewer: "Internal Review",
          description: "Private solver export permission record.",
          containsRangeValues: true,
        },
      ],
      notes: ["Internal permission report fixture."],
    }, {
      packId: "mtt-full-ring-9-flop-production-private-v1",
      licenseKind: "OWNED_SOLVER_EXPORT",
    });

    const root = document.createElement("div");
    renderDashboard({
      store,
      sessionCount: 0,
      permissionReports: [report],
    }, root);

    const text = root.querySelector<HTMLElement>(".permission-audit")?.textContent ?? "";
    expect(text).toContain("Range audit");
    expect(text).toContain("Owned solver export");
    expectNoSourceCitation(root.textContent ?? "");
    expect(text).not.toContain("mtt-full-ring-9-flop-production-private-v1");
    expect(text).not.toContain("Private Solver Owner");
    expect(text).not.toContain("Internal Review");
  });

  it("release gate blokuje source/provider/pack id ve vsech hlavnich UI surfacech", () => {
    const root = document.createElement("div");
    const store = createStatsStore(new MemoryStorage());
    expect(store.record(preflopRecord).ok).toBe(true);

    const profileRoot = root.appendChild(document.createElement("section"));
    const dashboardRoot = root.appendChild(document.createElement("section"));
    const postflopRoot = root.appendChild(document.createElement("section"));
    const rangeRoot = root.appendChild(document.createElement("section"));

    const profileView = renderProfileSelector(profileRoot);
    profileView.setProfile(profileWith(DEFAULT_TRAINING_PROFILE, { tableFormat: "SIX_MAX" }));
    renderDashboard({ store, sessionCount: 1, postflopRecords: [postflopRecord] }, dashboardRoot);
    renderPostflopView(postflopRoot, { initialStreet: "FLOP", autoGenerate: true });
    postflopRoot.querySelector<HTMLButtonElement>(".postflop-action")?.click();
    renderRangeModalButton(spot, loadedStore, rangeRoot);
    rangeRoot.querySelector<HTMLButtonElement>(".range-modal-open")?.click();

    expectNoSourceCitation(root.textContent ?? "");
    expectNoSourceCitation(document.querySelector<HTMLElement>(".range-modal")?.textContent ?? "");
  });
});

function expectNoSourceCitation(text: string): void {
  for (const forbidden of FORBIDDEN_SOURCE_TEXT) {
    expect(text).not.toContain(forbidden);
  }
  for (const forbidden of FORBIDDEN_SOURCE_PATTERNS) {
    expect(text).not.toMatch(forbidden);
  }
  expect(text.toLowerCase()).not.toContain("zdroj");
}
