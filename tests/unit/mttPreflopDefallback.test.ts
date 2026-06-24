import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRAINING_PROFILE,
  profileWith,
  type BlindSpeed,
  type EvModel,
  type TableFormat,
} from "../../src/core/trainingProfile";
import type { AnteMode } from "../../src/core/types";
import { buildMttCompletionReadinessReport } from "../../src/data/ranges/mttProductionReadiness";
import { rangePackForTrainingProfile } from "../../src/data/ranges/trainingRangePacks";

const tableFormats: readonly TableFormat[] = ["FULL_RING_9", "SIX_MAX"];
const blindSpeeds: readonly BlindSpeed[] = ["REGULAR", "TURBO"];
const evModels = ["CHIP_EV", "DOLAR_EV"] as const satisfies readonly Extract<
  EvModel,
  "CHIP_EV" | "DOLAR_EV"
>[];
const anteModes: readonly AnteMode[] = ["ON", "OFF"];

describe("MTT preflop production de-fallback guard", () => {
  it("drzi celou 16slotovou preflop matici mimo production scoring dokud nejsou canonical legal importy", () => {
    const report = buildMttCompletionReadinessReport();
    const preflopRows = report.rows.filter((row) => row.street === "PREFLOP");

    expect(preflopRows).toHaveLength(16);
    expect(preflopRows.filter((row) => row.productionReady)).toHaveLength(0);
    expect(preflopRows.filter((row) => row.status === "CANDIDATE")).toHaveLength(6);
    expect(preflopRows.filter((row) => row.status === "MISSING")).toHaveLength(10);

    for (const tableFormat of tableFormats) {
      for (const blindSpeed of blindSpeeds) {
        for (const evModel of evModels) {
          for (const ante of anteModes) {
            const profile = profileWith(DEFAULT_TRAINING_PROFILE, {
              gameVariant: "MTT",
              tableFormat,
              blindSpeed,
              street: "PREFLOP",
              evModel,
              ante,
              rakeMode: "NONE",
            });
            const row = preflopRows.find((candidate) => (
              candidate.tableFormat === tableFormat &&
              candidate.blindSpeed === blindSpeed &&
              candidate.evModel === evModel &&
              candidate.ante === ante
            ));
            const pack = rangePackForTrainingProfile(profile);

            expect(row).toBeDefined();
            expect(row?.productionReady).toBe(false);
            expect(row?.importSlot).not.toBeNull();
            expect(row?.importSlot?.packId).toMatch(/^mtt-(?:full-ring-9|six-max)-/);
            expect(row?.importSlot?.packId).toContain("-production-v1");
            if (pack) {
              expect(row?.packId).toBe(pack.id);
              expect(row?.status).toBe("CANDIDATE");
            } else {
              expect(row?.packId).toBeNull();
              expect(row?.status).toBe("MISSING");
            }
          }
        }
      }
    }
  });
});
