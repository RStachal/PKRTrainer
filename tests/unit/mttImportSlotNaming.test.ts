import { describe, expect, it } from "vitest";

import {
  mttProductionImportIdentityFromPackId,
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

  it("udrzi round-trip identity pro vsech 64 produkcnich MTT slotu", () => {
    const identities = (["FULL_RING_9", "SIX_MAX"] as const).flatMap((tableFormat) =>
      (["REGULAR", "TURBO"] as const).flatMap((blindSpeed) =>
        (["CHIP_EV", "DOLAR_EV"] as const).flatMap((evModel) =>
          (["PREFLOP", "FLOP", "TURN", "RIVER"] as const).flatMap((street) =>
            (["ON", "OFF"] as const).map((ante) => ({
              tableFormat,
              blindSpeed,
              evModel,
              street,
              ante,
            })),
          ),
        ),
      ),
    );

    expect(identities).toHaveLength(64);
    for (const identity of identities) {
      expect(mttProductionImportIdentityFromPackId(
        mttProductionImportPackId(identity),
      )).toEqual(identity);
    }
    expect(mttProductionImportIdentityFromPackId("mtt-invalid-production-v1")).toBeNull();
  });
});
