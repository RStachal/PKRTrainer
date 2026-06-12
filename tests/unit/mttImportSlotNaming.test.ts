import { describe, expect, it } from "vitest";

import {
  mttProductionImportPackId,
  mttProductionImportSlotId,
  mttProductionImportSlotKind,
  mttProductionImportSlotPaths,
} from "../../src/data/ranges/mttImportSlotNaming";

describe("mttImportSlotNaming", () => {
  it("sklada canonical slot id, pack id, kind a cesty pro MTT production import", () => {
    const identity = {
      tableFormat: "SIX_MAX",
      blindSpeed: "TURBO",
      evModel: "DOLAR_EV",
      street: "RIVER",
      ante: "OFF",
    } as const;
    const packId = mttProductionImportPackId(identity);

    expect(mttProductionImportSlotId(identity)).toBe("SIX_MAX|TURBO|DOLAR_EV|RIVER|OFF");
    expect(mttProductionImportSlotKind(identity.street)).toBe("river-production");
    expect(packId).toBe("mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1");
    expect(mttProductionImportSlotPaths(packId)).toEqual({
      rawInputFolder: "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1",
      normalizedInputPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/normalized.json",
      permissionManifestPath:
        "Agents/range-intake/raw/mtt-six-max-turbo-river-dolar-ev-ante-off-production-v1/permission.json",
    });
  });

  it("pouziva mtt-preflop kind a preflop street v canonical slot id", () => {
    const identity = {
      tableFormat: "FULL_RING_9",
      blindSpeed: "REGULAR",
      evModel: "CHIP_EV",
      street: "PREFLOP",
      ante: "ON",
    } as const;

    expect(mttProductionImportSlotId(identity)).toBe(
      "FULL_RING_9|REGULAR|CHIP_EV|PREFLOP|ON",
    );
    expect(mttProductionImportSlotKind(identity.street)).toBe("mtt-preflop");
    expect(mttProductionImportPackId(identity)).toBe(
      "mtt-full-ring-9-regular-preflop-chip-ev-ante-on-production-v1",
    );
  });
});
