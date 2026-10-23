import { describe, expect, it } from "vitest";

import { trainingCapabilityForProfile } from "../../src/data/ranges/trainingCapability";
import { startableMttPreflopRangePack } from "../../src/data/ranges/mttPreflopRangePacks";
import type { TrainingProfile } from "../../src/core/trainingProfile";
import type { AnteMode } from "../../src/core/types";

// The postflop path refuses a blocked profile explicitly, on canStartTraining.
// The preflop path does not: it depends entirely on this returning nothing. That
// made "a profile with no data cannot be trained" an invariant held by a helper's
// internals rather than by the capability contract, stated nowhere and tested
// nowhere. These assertions state it.

const TABLE_FORMATS = ["FULL_RING_9", "SIX_MAX"] as const;
const BLIND_SPEEDS = ["REGULAR", "TURBO"] as const;
const ANTES: AnteMode[] = ["ON", "OFF"];

function preflopProfiles(): TrainingProfile[] {
  const profiles: TrainingProfile[] = [];
  for (const tableFormat of TABLE_FORMATS) {
    for (const blindSpeed of BLIND_SPEEDS) {
      for (const ante of ANTES) {
        profiles.push({
          gameVariant: "MTT",
          tableFormat,
          blindSpeed,
          street: "PREFLOP",
          evModel: "CHIP_EV",
          ante,
          rakeMode: "NONE",
        });
      }
    }
  }
  return profiles;
}

describe("startable MTT preflop range pack", () => {
  it("never hands a pack to a profile that cannot start training", () => {
    // The invariant that keeps an unfinished profile out of a paying player's
    // hands. Checked across every preflop profile rather than the one that
    // happens to be unfinished today, so finishing six-max cannot quietly make
    // some other combination startable without data.
    const offenders: string[] = [];
    for (const profile of preflopProfiles()) {
      const capability = trainingCapabilityForProfile(profile);
      if (capability.canStartTraining) continue;
      if (startableMttPreflopRangePack(profile, capability) !== undefined) {
        offenders.push(`${profile.tableFormat}|${profile.blindSpeed}|${profile.ante}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("lets six-max regular preview from derived data, and keeps turbo out", () => {
    // Six-max used to be refused outright, which was right while it had no
    // records at all. Regular now carries ranges derived from the nine-handed
    // pack by seats-behind, so it previews; turbo has nothing to derive from
    // that would not be the regular pack relabelled, so it stays out.
    const sixMax = preflopProfiles().filter((profile) => profile.tableFormat === "SIX_MAX");
    expect(sixMax).toHaveLength(4);
    for (const profile of sixMax) {
      const capability = trainingCapabilityForProfile(profile);
      const pack = startableMttPreflopRangePack(profile, capability);
      if (profile.blindSpeed === "REGULAR") {
        expect(pack, `${profile.blindSpeed} ${profile.ante}`).toBeDefined();
        expect(pack!.records.length).toBeGreaterThan(0);
        // Preview, never production: the pack is derived, and the production
        // gate refuses inferred chart values.
        expect(pack!.confidence).toBe("LOW");
        expect(pack!.id).toContain("derived");
      } else {
        expect(pack, `${profile.blindSpeed} ${profile.ante}`).toBeUndefined();
      }
    }
  });

  it("refuses a production profile whose pack is not the one readiness declared", () => {
    // A renamed or stale pack must not stand in for the reviewed one, or the id
    // check is decoration. Production packs are only in the runtime registry once
    // the app has loaded it, so this asserts the refusal rather than the
    // acceptance - the acceptance path is exercised by the app tests.
    const profile = preflopProfiles()[0];
    const impostor = {
      status: "PRODUCTION",
      mttReadiness: { productionReady: true, packId: "some-other-pack-id" },
    };
    expect(startableMttPreflopRangePack(profile, impostor)).toBeUndefined();
  });

  it("refuses production when readiness never declared the pack ready", () => {
    // productionReady false must not be reachable by claiming PRODUCTION status.
    const profile = preflopProfiles()[0];
    expect(startableMttPreflopRangePack(profile, {
      status: "PRODUCTION",
      mttReadiness: { productionReady: false, packId: "anything" },
    })).toBeUndefined();
    expect(startableMttPreflopRangePack(profile, {
      status: "PRODUCTION",
      mttReadiness: null,
    })).toBeUndefined();
  });

  it("does not treat an unknown capability status as startable", () => {
    const profile = preflopProfiles()[0];
    for (const status of ["BLOCKED", "UNSUPPORTED", ""]) {
      expect(startableMttPreflopRangePack(profile, { status, mttReadiness: null }), status)
        .toBeUndefined();
    }
  });
});
