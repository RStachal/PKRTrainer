import { beforeAll, describe, expect, it } from "vitest";

import { buildMttPostflopTrainingRuntime } from "../../src/data/ranges/mttPostflopTrainingRuntime";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import type { EntitlementGrant } from "../../src/core/paymentEntitlements";
import type { TrainingProfile } from "../../src/core/trainingProfile";

/**
 * Vyřešený turn obsah se k hráči nedostal vůbec.
 *
 * Jedenáct rodin a 3 082 vyřešených turnů se dodává jako lazy chunky a stahuje
 * na začátku relace - a runtime se jich nikdy na nic nezeptal. Produkční větev
 * je nepustí, dokud není celý profil PRODUCTION, a pilotní katalog byl flopový,
 * takže turn dostal `PREVIEW_FALLBACK` a `resolver: null`. Obsah byl dosažitelný
 * jen měřicím skriptem, což zvenku vypadá stejně, jako by neexistoval.
 */
const profile: TrainingProfile = {
  gameVariant: "MTT",
  tableFormat: "FULL_RING_9",
  blindSpeed: "REGULAR",
  street: "TURN",
  evModel: "CHIP_EV",
  ante: "OFF",
  rakeMode: "NONE",
};

const grant: EntitlementGrant = {
  entitlement: "mtt.postflop.turn.solved.pilot",
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: null,
  status: "ACTIVE",
};

describe("dodání vyřešeného turn obsahu", () => {
  beforeAll(async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("bez oprávnění obsah nevydá, ale řekne, že existuje", () => {
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants: [] });
    expect(runtime.mode).toBe("LOCKED_PILOT");
    expect(runtime.resolver).toBeNull();
    // Zamčeno je něco jiného než nedostupné: hráč má vědět, že je co koupit.
    expect(runtime.missingEntitlements).toContain("mtt.postflop.turn.solved.pilot");
  });

  it("s oprávněním vydá resolver nad vyřešenými rodinami", () => {
    const runtime = buildMttPostflopTrainingRuntime({ profile, grants: [grant] });
    expect(runtime.mode).toBe("SCOPED_PILOT");
    expect(runtime.resolver).not.toBeNull();
    // Není to plné pokrytí a hláška to musí říct, jinak by SCOPED_PILOT znamenal
    // totéž co PRODUCTION.
    expect(runtime.reason).toContain("není to plné produkční pokrytí");
  });

  it("nezasahuje do flopu ani riveru", () => {
    for (const street of ["FLOP", "RIVER"] as const) {
      const runtime = buildMttPostflopTrainingRuntime({
        profile: { ...profile, street },
        grants: [grant],
      });
      // Turnové oprávnění nesmí odemknout jinou ulici.
      expect(runtime.activeEntitlements).not.toContain("mtt.postflop.turn.solved.pilot");
    }
  });
});
