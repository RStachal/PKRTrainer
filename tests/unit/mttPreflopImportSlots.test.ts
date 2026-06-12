import { describe, expect, it } from "vitest";

import {
  buildMttPreflopImportSlots,
  renderMttPreflopImportSlots,
} from "../../src/data/ranges/mttPreflopImportSlots";

describe("mttPreflopImportSlots", () => {
  it("vytvori legal import sloty pro vsechny neprodukcni MTT preflop profily", () => {
    const slots = buildMttPreflopImportSlots();

    expect(slots).toHaveLength(14);
    expect(slots.map((slot) => slot.slotId)).not.toContain("FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON");
    expect(slots.map((slot) => slot.slotId)).not.toContain("FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|OFF");
    expect(slots.map((slot) => slot.slotId)).toContain("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON");
    expect(slots.map((slot) => slot.slotId)).toContain("SIX_MAX|REGULAR|CHIP_EV|PREFLOP|OFF");
    expect(slots.map((slot) => slot.slotId)).toContain("SIX_MAX|TURBO|DOLAR_EV|PREFLOP|ON");
    expect(slots.every((slot) => slot.normalizedInputPath.endsWith("/normalized.json"))).toBe(true);
    expect(slots.every((slot) => slot.permissionManifestPath.endsWith("/permission.json"))).toBe(true);
    expect(slots.every((slot) => slot.requiredLicenseKinds.includes("OWNED_SOLVER_EXPORT"))).toBe(true);
  });

  it("pouziva stabilni pack id a raw folder pro konkretni dolarEV turbo slot", () => {
    const slots = buildMttPreflopImportSlots();
    const slot = slots.find((item) => item.slotId === "SIX_MAX|TURBO|DOLAR_EV|PREFLOP|OFF");

    expect(slot).toMatchObject({
      packId: "mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1",
      rawInputFolder: "Agents/range-intake/raw/mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1",
      normalizedInputPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1/normalized.json",
      permissionManifestPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-preflop-dolar-ev-ante-off-production-v1/permission.json",
    });
    expect(slot?.missingReasons.length).toBeGreaterThan(0);
  });

  it("renderuje source-free operator summary bez URL", () => {
    const text = renderMttPreflopImportSlots();

    expect(text).toContain("MTT preflop legal import slots");
    expect(text).toContain("slots: 14");
    expect(text).toContain("FULL_RING_9|TURBO|CHIP_EV|PREFLOP|ON");
    expect(text).toContain("SIX_MAX|REGULAR|DOLAR_EV|PREFLOP|OFF");
    expect(text).not.toContain("https://");
  });
});
