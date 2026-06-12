import { describe, expect, it } from "vitest";

import {
  buildMttPostflopImportSlots,
  mttPostflopImportSlotsForPack,
  renderMttPostflopImportSlots,
} from "../../src/data/ranges/mttPostflopImportSlots";
import type { FlopProductionStrategyPack } from "../../src/data/ranges/flopProductionStrategyPack";

function postflopPack(): FlopProductionStrategyPack {
  return {
    id: "mtt-full-ring-9-regular-flop-chip-ev-ante-on-production-v1",
    version: "slot-fixture-v1",
    createdAt: "2026-06-12",
    verifiedAt: "2026-06-12",
    confidence: "MEDIUM",
    licenseKind: "OWNED_SOLVER_EXPORT",
    licenseNote: "Synthetic slot fixture.",
    dimensions: {
      gameVariant: "MTT",
      tableFormat: "FULL_RING_9",
      blindSpeeds: ["REGULAR", "TURBO"],
      street: "FLOP",
      evModel: "CHIP_EV",
      antes: ["ON", "OFF"],
    },
    sourceEvidence: [
      {
        url: "https://example.test/flop-owned",
        verifiedAt: "2026-06-12",
        operator: "PKRTrainer",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Synthetic slot fixture.",
        licenseNote: "Owned fixture.",
      },
      {
        url: "https://example.test/flop-review",
        verifiedAt: "2026-06-12",
        operator: "PKRTrainer Review",
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        street: "FLOP",
        evModel: "CHIP_EV",
        methodology: "Synthetic review fixture.",
        licenseNote: "Review fixture.",
      },
    ],
    assumptions: ["Slot fixture only."],
    rules: [],
  };
}

describe("mttPostflopImportSlots", () => {
  it("vytvori legal import sloty pro vsechny neprodukcni MTT postflop profily", () => {
    const slots = buildMttPostflopImportSlots();

    expect(slots).toHaveLength(48);
    expect(slots.map((slot) => slot.slotId)).toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON");
    expect(slots.map((slot) => slot.slotId)).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(new Set(slots.map((slot) => slot.street))).toEqual(new Set(["FLOP", "TURN", "RIVER"]));
    expect(slots.every((slot) => slot.normalizedInputPath.endsWith("/normalized.json"))).toBe(true);
    expect(slots.every((slot) => slot.permissionManifestPath.endsWith("/permission.json"))).toBe(true);
    expect(slots.every((slot) => slot.requiredLicenseKinds.includes("OWNED_SOLVER_EXPORT"))).toBe(true);
  });

  it("pouziva stabilni pack id a kind pro konkretni river dolarEV slot", () => {
    const slots = buildMttPostflopImportSlots();
    const slot = slots.find((item) => item.slotId === "SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");

    expect(slot).toMatchObject({
      kind: "river-production",
      packId: "mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
      rawInputFolder: "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
      normalizedInputPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/normalized.json",
      permissionManifestPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/permission.json",
    });
    expect(slot?.missingReasons.length).toBeGreaterThan(0);
  });

  it("namapuje postflop pack podle deklarovane speed/ante coverage", () => {
    const slots = mttPostflopImportSlotsForPack(postflopPack());

    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.slotId)).toEqual([
      "FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON",
      "FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF",
      "FULL_RING_9|TURBO|CHIP_EV|FLOP|ON",
      "FULL_RING_9|TURBO|CHIP_EV|FLOP|OFF",
    ]);
  });

  it("renderuje source-free operator summary bez URL", () => {
    const text = renderMttPostflopImportSlots();

    expect(text).toContain("MTT postflop legal import slots");
    expect(text).toContain("slots: 48");
    expect(text).toContain("FULL_RING_9|REGULAR|CHIP_EV|FLOP|ON");
    expect(text).toContain("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(text).not.toContain("https://");
  });
});
