import { describe, expect, it } from "vitest";
import { TRAINING_SPOTS } from "../src/content/spots";
import {
  getPreflopHand,
  PREFLOP_HAND_MATRIX,
  PREFLOP_HANDS,
} from "../src/domain/preflopMatrix";
import { mulberry32 } from "../src/domain/random";
import { getSpotWeight, selectNextSpot } from "../src/domain/selectNextSpot";
import {
  EMPTY_STATISTICS,
  getOverallStatistics,
  getSpotStat,
  getSuccessRate,
  recordSpotAnswer,
} from "../src/domain/statistics";
import {
  DEFAULT_TRAINING_FORMAT,
  TRAINING_FORMATS,
} from "../src/domain/trainingFormat";

describe("univerzální tréninkový model", () => {
  it("má výchozí formát bez uživatelských profilů", () => {
    expect(DEFAULT_TRAINING_FORMAT).toBe("MTT_15_25BB");
    expect(TRAINING_FORMATS.map((format) => format.id)).toEqual([
      "MTT_15_25BB",
      "MTT_25_40BB",
      "CASH_100BB",
      "SPIN_SHORT",
    ]);
  });

  it("obsahuje seed spoty s range referencí a vysvětlením", () => {
    expect(TRAINING_SPOTS).toHaveLength(3);
    expect(TRAINING_SPOTS[0]).toMatchObject({
      id: "mtt-15-25-open-btn-a8o",
      format: "MTT_15_25BB",
      phase: "PREFLOP",
      category: "OPEN",
      heroHand: ["A♠", "8♦"],
      effectiveStack: "20 BB",
      correctAction: "OPEN",
    });
    expect(TRAINING_SPOTS[0].seats).toContainEqual({
      position: "BTN",
      label: "Hero",
      isHero: true,
    });
    expect(TRAINING_SPOTS[0].range.cells).toContainEqual({
      hand: "A8o",
      action: "OPEN",
      weight: "pure",
    });
    expect(TRAINING_SPOTS[0].explanation).toContain("standardní open");
  });

  it("má standardní 13x13 preflop matici", () => {
    expect(PREFLOP_HAND_MATRIX).toHaveLength(13);
    expect(PREFLOP_HAND_MATRIX.every((row) => row.length === 13)).toBe(true);
    expect(PREFLOP_HANDS).toHaveLength(169);
    expect(getPreflopHand("A", "A")).toBe("AA");
    expect(getPreflopHand("A", "K")).toBe("AKs");
    expect(getPreflopHand("K", "A")).toBe("AKo");
    expect(PREFLOP_HAND_MATRIX[12][12]).toBe("22");
  });

  it("ukládá statistiky úspěšnosti bez mutace původního objektu", () => {
    const first = recordSpotAnswer(EMPTY_STATISTICS, "spot-a", false);
    const second = recordSpotAnswer(first, "spot-a", true);

    expect(EMPTY_STATISTICS.bySpot).toEqual({});
    expect(getSpotStat(second, "spot-a")).toEqual({ attempts: 2, correct: 1 });
    expect(getSuccessRate(getSpotStat(second, "spot-a"))).toBe(0.5);
    expect(getSuccessRate(getSpotStat(second, "unknown"))).toBeNull();
  });

  it("spočítá celkové statistiky napříč spoty", () => {
    let statistics = EMPTY_STATISTICS;

    statistics = recordSpotAnswer(statistics, "spot-a", true);
    statistics = recordSpotAnswer(statistics, "spot-a", false);
    statistics = recordSpotAnswer(statistics, "spot-b", true);

    expect(getOverallStatistics(statistics)).toEqual({
      attempts: 3,
      correct: 2,
    });
  });

  it("dává vyšší váhu novým a slabším spotům", () => {
    const strongSpot = TRAINING_SPOTS[0];
    const weakSpot = TRAINING_SPOTS[1];
    const unseenSpot = TRAINING_SPOTS[2];
    let statistics = EMPTY_STATISTICS;

    for (let index = 0; index < 4; index += 1) {
      statistics = recordSpotAnswer(statistics, strongSpot.id, true);
      statistics = recordSpotAnswer(statistics, weakSpot.id, false);
    }

    expect(getSpotWeight(unseenSpot, statistics)).toBeGreaterThan(
      getSpotWeight(weakSpot, statistics),
    );
    expect(getSpotWeight(weakSpot, statistics)).toBeGreaterThan(
      getSpotWeight(strongSpot, statistics),
    );
  });

  it("vybírá deterministicky podle filtru a dodaného RNG", () => {
    const statistics = recordSpotAnswer(
      EMPTY_STATISTICS,
      "mtt-15-25-open-btn-a8o",
      true,
    );
    const random = mulberry32(1);

    expect(
      selectNextSpot(TRAINING_SPOTS, statistics, random, {
        format: "MTT_15_25BB",
        phase: "PREFLOP",
      })?.id,
    ).toBe("mtt-15-25-bb-defend-k4s");
  });

  it("vrací null, když filtr nemá žádný spot", () => {
    expect(
      selectNextSpot(TRAINING_SPOTS, EMPTY_STATISTICS, () => 0, {
        format: "SPIN_SHORT",
        phase: "RIVER",
      }),
    ).toBeNull();
  });
});
