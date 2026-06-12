import { describe, expect, it } from "vitest";

import type { MttPreflopRangePackImportInput } from "../../src/data/ranges/mttPreflopRangePackImport";
import {
  buildMttPostflopImportSlotValidationReport,
  buildMttPreflopImportSlotValidationReport,
  renderMttImportSlotValidationReport,
} from "../../src/data/ranges/mttImportSlotValidation";
import type { MttPostflopProductionPack } from "../../src/data/ranges/mttPostflopImportSlots";

function preflopImport(id = "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1") {
  return {
    id,
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeed: "TURBO",
      street: "PREFLOP",
      evModel: "CHIP_EV",
      ante: "ON",
      rakeMode: "NONE",
    },
  } as MttPreflopRangePackImportInput;
}

function postflopPack(gameVariant: "MTT" | "CASH" = "MTT") {
  return {
    id: "mtt-full-ring-9-flop-slot-validation-fixture-v1",
    dimensions: {
      gameVariant,
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
  } as unknown as MttPostflopProductionPack;
}

describe("mttImportSlotValidation", () => {
  it("validuje legalni MTT preflop import slot podle dimenzi a pack id", () => {
    const report = buildMttPreflopImportSlotValidationReport(preflopImport());

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.matchedSlots).toHaveLength(1);
    expect(report.matchedSlots[0]).toMatchObject({
      slotId: "FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON",
      packId: "mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1",
    });
  });

  it("blokuje MTT preflop import se spravnymi dimenzemi, ale spatnym pack id", () => {
    const report = buildMttPreflopImportSlotValidationReport(
      preflopImport("mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-fixture-v1"),
    );

    expect(report.valid).toBe(false);
    expect(report.matchedSlots).toHaveLength(1);
    expect(report.errors).toContain(
      "MTT preflop import id must match legal slot packId mtt-full-ring-9-turbo-preflop-chip-ev-ante-on-production-v1.",
    );
  });

  it("validuje postflop production pack proti vsem pokrytym MTT slotum", () => {
    const report = buildMttPostflopImportSlotValidationReport(postflopPack());

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.matchedSlots).toHaveLength(4);
    expect(report.matchedSlots.map((slot) => slot.slotId)).toContain(
      "FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON",
    );
  });

  it("umi renderovat stejny legal-slot report pro CLI i builder", () => {
    const report = buildMttPostflopImportSlotValidationReport(postflopPack("CASH"), {
      gameVariantError: "Flop production module must target MTT gameVariant.",
      noSlotError: "Flop production pack must match at least one legal MTT postflop import slot.",
      stopAfterGameVariantError: true,
    });

    expect(report.valid).toBe(false);
    expect(report.matchedSlots).toEqual([]);
    expect(renderMttImportSlotValidationReport(report)).toContain("legal import slot: false");
    expect(report.errors).toContain("Flop production module must target MTT gameVariant.");
  });
});
