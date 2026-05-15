import { describe, expect, it } from "vitest";
import {
  APP_STATISTICS_KEY,
  loadStatistics,
  parseStatistics,
  resetStatistics,
  saveStatistics,
} from "../src/state/appStorage";

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: (key: string) => (key === APP_STATISTICS_KEY ? value : null),
    removeItem: (key: string) => {
      if (key === APP_STATISTICS_KEY) value = null;
    },
    setItem: (key: string, nextValue: string) => {
      if (key === APP_STATISTICS_KEY) value = nextValue;
    },
  };
}

describe("nové ukládání statistik aplikace", () => {
  it("používá vlastní storage klíč oddělený od legacy aplikace", () => {
    expect(APP_STATISTICS_KEY).toBe("pkrtrainer_v2_statistics_v1");
  });

  it("načte validní statistiky", () => {
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

  it("ignoruje rozbité nebo neplatné statistiky", () => {
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

  it("uloží a znovu načte statistiky přes storage rozhraní", () => {
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

  it("resetuje pouze nový storage klíč statistik", () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        bySpot: {
          "spot-a": { attempts: 1, correct: 1 },
        },
      }),
    );

    resetStatistics(storage);

    expect(loadStatistics(storage)).toEqual({ bySpot: {} });
  });
});
