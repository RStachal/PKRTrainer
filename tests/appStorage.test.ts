import { describe, expect, it } from "vitest";
import { EMPTY_TRAINING_PROGRESS } from "../src/domain/trainingSession";
import {
  APP_STATE_KEY,
  APP_STATISTICS_KEY,
  loadAppState,
  loadStatistics,
  parseAppStorageState,
  parseStatistics,
  resetAppState,
  resetStatistics,
  saveAppState,
  saveStatistics,
} from "../src/state/appStorage";

function createMemoryStorage(initialValues: Record<string, string | null> = {}) {
  const values = new Map<string, string | null>(Object.entries(initialValues));

  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, nextValue: string) => {
      values.set(key, nextValue);
    },
  };
}

describe("nove ukladani statistik aplikace", () => {
  it("pouziva vlastni storage klice oddelene od legacy aplikace", () => {
    expect(APP_STATE_KEY).toBe("pkrtrainer_v2_app_state_v2");
    expect(APP_STATISTICS_KEY).toBe("pkrtrainer_v2_statistics_v1");
  });

  it("nacte validni statistiky ze stareho statistickeho tvaru", () => {
    expect(
      parseStatistics(
        JSON.stringify({
          bySpot: {
            "spot-a": { attempts: 3, correct: 2 },
          },
        }),
      ),
    ).toEqual({
      bySpot: {
        "spot-a": { attempts: 3, correct: 2 },
      },
    });
  });

  it("ignoruje rozbite nebo neplatne statistiky", () => {
    expect(parseStatistics("neni json")).toEqual({ bySpot: {} });
    expect(
      parseStatistics(
        JSON.stringify({
          bySpot: {
            valid: { attempts: 2, correct: 1 },
            impossible: { attempts: 1, correct: 2 },
            fractional: { attempts: 1.5, correct: 1 },
          },
        }),
      ),
    ).toEqual({
      bySpot: {
        valid: { attempts: 2, correct: 1 },
      },
    });
  });

  it("ulozi a znovu nacte kompletni v2 stav", () => {
    const storage = createMemoryStorage();

    saveAppState(storage, {
      version: 2,
      statistics: {
        bySpot: {
          "spot-a": { attempts: 2, correct: 1 },
        },
      },
      progress: {
        answered: 3,
        correct: 2,
        streak: 1,
        seen: { "spot-a": true },
        missed: { "spot-b": true },
        byCategory: {
          BB_DEFEND: { answered: 3, correct: 2 },
        },
      },
      settings: {
        format: "MTT_15_25BB",
        phase: "PREFLOP",
        blockSize: 25,
        seed: 42,
        mode: "MISSED",
        strict: "STRICT",
      },
    });

    expect(loadAppState(storage)).toEqual({
      statistics: {
        bySpot: {
          "spot-a": { attempts: 2, correct: 1 },
        },
      },
      progress: {
        answered: 3,
        correct: 2,
        streak: 1,
        seen: { "spot-a": true },
        missed: { "spot-b": true },
        byCategory: {
          BB_DEFEND: { answered: 3, correct: 2 },
        },
      },
      settings: {
        format: "MTT_15_25BB",
        phase: "PREFLOP",
        blockSize: 25,
        seed: 42,
        mode: "MISSED",
        strict: "STRICT",
      },
    });
  });

  it("odmitne neplatny v2 stav", () => {
    expect(
      parseAppStorageState(
        JSON.stringify({
          version: 2,
          statistics: { bySpot: {} },
          progress: EMPTY_TRAINING_PROGRESS,
          settings: {
            format: "UNKNOWN",
            phase: "PREFLOP",
            blockSize: 25,
            seed: 1,
            mode: "MIXED",
            strict: "LENIENT",
          },
        }),
      ),
    ).toBeNull();
  });

  it("migruje ze stareho statistickeho klice, kdyz v2 stav neexistuje", () => {
    const storage = createMemoryStorage({
      [APP_STATISTICS_KEY]: JSON.stringify({
        bySpot: {
          "spot-a": { attempts: 1, correct: 1 },
        },
      }),
    });

    expect(loadAppState(storage)).toEqual({
      statistics: {
        bySpot: {
          "spot-a": { attempts: 1, correct: 1 },
        },
      },
      progress: EMPTY_TRAINING_PROGRESS,
      settings: null,
    });
  });

  it("ulozi a znovu nacte statistiky pres stare storage rozhrani", () => {
    const storage = createMemoryStorage();

    saveStatistics(storage, {
      bySpot: {
        "spot-a": { attempts: 1, correct: 1 },
      },
    });

    expect(loadStatistics(storage)).toEqual({
      bySpot: {
        "spot-a": { attempts: 1, correct: 1 },
      },
    });
  });

  it("resetuje novy v2 stav i stary statisticky fallback", () => {
    const storage = createMemoryStorage({
      [APP_STATE_KEY]: JSON.stringify({ version: 2 }),
      [APP_STATISTICS_KEY]: JSON.stringify({
        bySpot: {
          "spot-a": { attempts: 1, correct: 1 },
        },
      }),
    });

    resetAppState(storage);

    expect(loadAppState(storage)).toEqual({
      statistics: { bySpot: {} },
      progress: EMPTY_TRAINING_PROGRESS,
      settings: null,
    });
  });

  it("resetuje pouze stary statisticky klic pri legacy resetu", () => {
    const storage = createMemoryStorage({
      [APP_STATISTICS_KEY]: JSON.stringify({
        bySpot: {
          "spot-a": { attempts: 1, correct: 1 },
        },
      }),
    });

    resetStatistics(storage);

    expect(loadStatistics(storage)).toEqual({ bySpot: {} });
  });
});
