// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { generatePostflopLine } from "../../src/core/postflopLineSimulator";
import { generatePostflopSpot } from "../../src/core/postflopGenerator";
import { postflopSpotToTrainingSpot } from "../../src/core/postflopTrainingSpot";
import { DEFAULT_TRAINING_PROFILE } from "../../src/core/trainingProfile";
import type { Card } from "../../src/core/types";
import { hasValidVillainFields, type VillainFields } from "../../src/core/villain/archetypes";
import {
  GTO_PLAYERS,
  playerSettings,
  postflopTablePlayers,
  villainFields,
} from "../../src/core/villain/tableCast";
import { currentMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import {
  buildPostflopLineResultRecord,
  isPostflopLineResultRecord,
} from "../../src/persistence/postflopLineResultRecord";
import {
  bridgePostflopResultRecordToStatsV2,
  buildPostflopResultRecord,
  isPostflopResultRecord,
  isPostflopStatsV2BridgeRecord,
  normalizePostflopStatsV2BridgeRecord,
} from "../../src/persistence/postflopResultRecord";
import { isResultRecordV2, upgradeResultRecordToV2 } from "../../src/persistence/statsRecordV2";
import { createStatsStore, isValidResultRecord, type ResultRecord } from "../../src/persistence/statsStore";
import { createPreflopSession } from "../../src/training/preflopSession";
import { createPreflopTrainerView } from "../../src/ui/trainer/preflopTrainerView";
import { makeFilters } from "../properties/drillSupport";

/**
 * Režim a typ soupeře v záznamech statistik (plán GTO/REAL, M2).
 *
 * Záznam v GTO se nesmí lišit od záznamu před režimy: chybějící pole znamená
 * GTO a staré záznamy nic nepřepisují. V REAL se zapisuje to, co hráč u stolu
 * viděl, takže statistiky po typu (M5) a hodnocení proti typu (M3) stojí na
 * stejném soupeři jako obrázek.
 */

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

const oldRecord: ResultRecord = {
  qid: "RFI|BTN|25|AKs|OFF",
  chosen: "OPEN_2X",
  correct: true,
  context: "RFI",
  position: "BTN",
  bucket: 25,
  ts: 1,
};

const realWhale: VillainFields = { trainingMode: "REAL", villainArchetype: "WHALE" };

const flopSpot = () => postflopSpotToTrainingSpot(generatePostflopSpot({ seed: 12, street: "FLOP" }));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pole o soupeři", () => {
  it("v GTO nic, v REAL režim a typ soupeře ve hře", () => {
    const spot = flopSpot();
    expect(villainFields(postflopTablePlayers(spot, GTO_PLAYERS))).toEqual({});
    expect(villainFields(postflopTablePlayers(spot, { mode: "REAL", focus: "WHALE" }))).toEqual(realWhale);

    const live = postflopTablePlayers(spot, { mode: "REAL" });
    expect(villainFields(live)).toEqual({
      trainingMode: "REAL",
      villainArchetype: live.cast[spot.villainPosition],
    });
  });

  it("hráč, který jedná první, soupeře ve hře nemá", () => {
    expect(villainFields({ mode: "REAL", cast: { BB: "ROCK" } })).toEqual({ trainingMode: "REAL" });
  });

  it("nastavení z filtrů relace", () => {
    expect(playerSettings(null)).toEqual(GTO_PLAYERS);
    expect(playerSettings(undefined)).toEqual(GTO_PLAYERS);
    expect(playerSettings({ trainingMode: "REAL", villainFocus: "DICE" })).toEqual({ mode: "REAL", focus: "DICE" });
    expect(playerSettings({ trainingMode: "REAL" })).toEqual({ mode: "REAL" });
  });

  it("načtený záznam s neznámým režimem nebo typem neobstojí", () => {
    expect(hasValidVillainFields({})).toBe(true);
    expect(hasValidVillainFields(realWhale)).toBe(true);
    expect(hasValidVillainFields({ trainingMode: "GTO" })).toBe(false);
    expect(hasValidVillainFields({ villainArchetype: "PIRATE" })).toBe(false);
  });
});

describe("preflopový záznam", () => {
  it("starý záznam zůstává platný a pole jdou uložením i V2", () => {
    expect(isValidResultRecord(oldRecord)).toBe(true);
    expect(isValidResultRecord({ ...oldRecord, ...realWhale })).toBe(true);
    expect(isValidResultRecord({ ...oldRecord, villainArchetype: "PIRATE" })).toBe(false);

    const storage = new MemoryStorage();
    createStatsStore(storage).record({ ...oldRecord, ...realWhale });
    expect(createStatsStore(storage).events()[0]).toMatchObject(realWhale);

    const upgraded = upgradeResultRecordToV2({ ...oldRecord, ...realWhale });
    expect(upgraded).toMatchObject(realWhale);
    expect(isResultRecordV2(upgraded)).toBe(true);
    expect(isResultRecordV2({ ...upgraded, trainingMode: "NOPE" })).toBe(false);
    expect(upgradeResultRecordToV2(oldRecord)).not.toHaveProperty("trainingMode");
  });

  function startedSession(filters: ReturnType<typeof makeFilters>) {
    const store = createStatsStore(new MemoryStorage());
    const session = createPreflopSession(store);
    const started = session.start(
      filters,
      42,
      { ...DEFAULT_TRAINING_PROFILE, ante: "ON", street: "PREFLOP" },
      currentMttPreflopRangePack("ON"),
    );
    if (started.kind !== "STARTED") throw new Error("relace nezačala");
    const view = createPreflopTrainerView(document, {
      session,
      title: (spot) => spot.id,
      onAnswered: () => {},
      onChangeSituation: () => {},
      onSessionEnded: () => {},
    });
    document.body.appendChild(view.element);
    view.show(started.spot);
    document.querySelector<HTMLButtonElement>(".dx-trainer__actions button")!.click();
    return store;
  }

  it("obrazovka v GTO zapíše záznam bez polí o soupeři", () => {
    const store = startedSession(makeFilters({ ante: "ON", positions: ["BB"], contexts: ["VS_OPEN"] }));
    const [record] = store.events();
    expect(record).not.toHaveProperty("trainingMode");
    expect(record).not.toHaveProperty("villainArchetype");
  });

  it("obrazovka v REAL zapíše soupeře, kterého hráč viděl u stolu", () => {
    const store = startedSession({
      ...makeFilters({ ante: "ON", positions: ["BB"], contexts: ["VS_OPEN"] }),
      trainingMode: "REAL",
      villainFocus: "WHALE",
    });
    const focus = document.querySelector<HTMLElement>('.dx-table__seat[data-focus="true"]');
    expect(focus?.dataset.player).toBe("WHALE");
    expect(store.events()[0]).toMatchObject(realWhale);
  });

  it("první vstup do potu v REAL: režim ano, soupeř ne", () => {
    const store = startedSession({
      ...makeFilters({ ante: "ON", positions: ["CO"], contexts: ["RFI"] }),
      trainingMode: "REAL",
    });
    const [record] = store.events();
    expect(record.trainingMode).toBe("REAL");
    expect(record).not.toHaveProperty("villainArchetype");
  });

  it("první vstup do potu při tréninku proti typu: zvolený typ sedí na big blindu", () => {
    const store = startedSession({
      ...makeFilters({ ante: "ON", positions: ["CO"], contexts: ["RFI"] }),
      trainingMode: "REAL",
      villainFocus: "WHALE",
    });
    const focus = document.querySelector<HTMLElement>('.dx-table__seat[data-focus="true"]');
    expect(focus?.dataset.position).toBe("BB");
    expect(focus?.dataset.player).toBe("WHALE");
    expect(store.events()[0]).toMatchObject(realWhale);
  });
});

describe("postflopový záznam", () => {
  it("pole projdou záznamem, mostem i normalizací", () => {
    const spot = flopSpot();
    const record = buildPostflopResultRecord(spot, spot.recommendedAction, 111, 987, realWhale);
    const bridge = bridgePostflopResultRecordToStatsV2(record);

    expect(record).toMatchObject(realWhale);
    expect(bridge).toMatchObject(realWhale);
    expect(normalizePostflopStatsV2BridgeRecord(bridge)).toMatchObject(realWhale);
    expect(isPostflopResultRecord(record)).toBe(true);
    expect(isPostflopStatsV2BridgeRecord(bridge)).toBe(true);
    expect(isPostflopResultRecord({ ...record, villainArchetype: "PIRATE" })).toBe(false);
    expect(isPostflopStatsV2BridgeRecord({ ...bridge, trainingMode: "GTO" })).toBe(false);
  });

  it("v GTO se záznam neliší od záznamu před režimy", () => {
    const spot = flopSpot();
    const before = buildPostflopResultRecord(spot, spot.recommendedAction, 111, 987);
    const gto = buildPostflopResultRecord(
      spot,
      spot.recommendedAction,
      111,
      987,
      villainFields(postflopTablePlayers(spot, GTO_PLAYERS)),
    );
    expect(gto).toEqual(before);
    expect(gto).not.toHaveProperty("trainingMode");
    expect(bridgePostflopResultRecordToStatsV2(gto)).not.toHaveProperty("trainingMode");
  });

  const heroCards: [Card, Card] = [{ rank: "A", suit: "s" }, { rank: "K", suit: "d" }];
  const board: [Card, Card, Card, Card, Card] = [
    { rank: "A", suit: "h" },
    { rank: "7", suit: "d" },
    { rank: "2", suit: "c" },
    { rank: "4", suit: "s" },
    { rank: "Q", suit: "h" },
  ];

  it("linka má na všech ulicích téhož soupeře", () => {
    const line = generatePostflopLine({ seed: 42, heroCards, board });
    const record = buildPostflopLineResultRecord(line, {
      startedAt: 100,
      completedAt: 250,
      players: { mode: "REAL" },
    });
    const archetypes = record.streetResults.map((street) => street.record.villainArchetype);
    expect(record.streetResults.map((street) => street.record.trainingMode)).toEqual(["REAL", "REAL", "REAL"]);
    expect(archetypes[0]).toBeDefined();
    expect(new Set(archetypes).size).toBe(1);
    expect(isPostflopLineResultRecord(record)).toBe(true);
  });

  it("linka bez režimu se zapíše jako dřív", () => {
    const line = generatePostflopLine({ seed: 42, heroCards, board });
    const record = buildPostflopLineResultRecord(line, { startedAt: 100, completedAt: 250 });
    for (const street of record.streetResults) {
      expect(street.record).not.toHaveProperty("trainingMode");
      expect(street.record).not.toHaveProperty("villainArchetype");
    }
  });
});
