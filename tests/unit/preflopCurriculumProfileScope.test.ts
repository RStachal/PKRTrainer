import { describe, expect, it } from "vitest";

import type { PreflopResultIdentity, ResultRecord } from "../../src/persistence/statsStore";
import { PREFLOP_RESULT_IDENTITY_SCHEMA } from "../../src/persistence/statsStore";
import { migrateResultRecordsToV2 } from "../../src/persistence/statsRecordV2";
import { buildPreflopCurriculumPlan } from "../../src/persistence/preflopCurriculum";

// A leak is only actionable if it was measured where the player will train it.
// The store holds every profile the player has ever used - ante on and off,
// regular and turbo, nine-max and six-max - and the leak dimensions are context,
// position and stack, none of which carry a profile. Pooling them produces a
// percentage that is nobody's percentage, attached to a button that drills it in
// whichever profile happens to be loaded.

const ANTE_ON = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|ON|NONE";
const ANTE_OFF = "MTT|FULL_RING_9|REGULAR|PREFLOP|CHIP_EV|OFF|NONE";

function identity(profileId: string, scenarioId: string): PreflopResultIdentity {
  const [gameVariant, tableFormat, blindSpeed, street, evModel, ante, rakeMode] =
    profileId.split("|");
  return {
    schema: PREFLOP_RESULT_IDENTITY_SCHEMA,
    scenarioId,
    profileId,
    gameVariant: gameVariant as PreflopResultIdentity["gameVariant"],
    tableFormat: tableFormat as PreflopResultIdentity["tableFormat"],
    blindSpeed: blindSpeed as PreflopResultIdentity["blindSpeed"],
    street: street as PreflopResultIdentity["street"],
    evModel: evModel as PreflopResultIdentity["evModel"],
    ante: ante as PreflopResultIdentity["ante"],
    rakeMode: rakeMode as PreflopResultIdentity["rakeMode"],
    rangePackId: "mtt-pack",
    rangePackVersion: "1.0.0",
    sourceVerifiedAt: "2026-01-01",
    scoringMode: "LENIENT",
  };
}

function answer(profileId: string, index: number, correct: boolean): ResultRecord {
  return {
    qid: `RFI|BTN|25|AKs|${index}`,
    chosen: correct ? "OPEN_2X" : "FOLD",
    correct,
    context: "RFI",
    position: "BTN",
    bucket: 25,
    ts: index,
    identity: identity(profileId, `RFI|BTN|25|${index}`),
  };
}

// Strong on the ante-on table, weak on the ante-off one. Pooled, BTN looks like
// a 50% leak; in the profile the player is actually sitting in, it is not a leak
// at all. Ordered so the newest answers are the ante-on ones.
function twoProfiles() {
  const records: ResultRecord[] = [];
  for (let index = 1; index <= 10; index += 1) records.push(answer(ANTE_OFF, index, false));
  for (let index = 11; index <= 20; index += 1) records.push(answer(ANTE_ON, index, true));
  return migrateResultRecordsToV2(records);
}

describe("preflop curriculum, profile scope", () => {
  it("measures the leak in the profile being trained, not across all of them", () => {
    const plan = buildPreflopCurriculumPlan(twoProfiles(), {
      minLeakSample: 5,
      leakRateThreshold: 70,
      profileId: ANTE_ON,
    });

    // Ten out of ten correct on this table: nothing to drill.
    expect(plan.focus).toBeNull();
    expect(plan.available).toBe(false);
  });

  it("finds the leak in the profile that has one", () => {
    // The other half: scoping must not hide a real leak, only stop borrowing one.
    const plan = buildPreflopCurriculumPlan(twoProfiles(), {
      minLeakSample: 5,
      leakRateThreshold: 70,
      profileId: ANTE_OFF,
    });

    expect(plan.available).toBe(true);
    expect(plan.focus?.rate).toBe(0);
    expect(plan.focus?.total).toBe(10);
  });

  it("scopes to the newest answer when nobody said which profile", () => {
    // Callers that predate the option must not silently keep pooling: without a
    // profile the plan follows the table the player last sat at.
    const plan = buildPreflopCurriculumPlan(twoProfiles(), {
      minLeakSample: 5,
      leakRateThreshold: 70,
    });

    expect(plan.scope.profileId).toBe(ANTE_ON);
    expect(plan.focus).toBeNull();
  });

  it("says how many answers it set aside, rather than quietly dropping them", () => {
    const plan = buildPreflopCurriculumPlan(twoProfiles(), {
      minLeakSample: 5,
      leakRateThreshold: 70,
      profileId: ANTE_OFF,
    });

    expect(plan.scope.profileId).toBe(ANTE_OFF);
    expect(plan.scope.records).toBe(10);
    expect(plan.scope.setAside).toBe(10);
  });

  it("takes the ante from the scoped profile instead of voting on it", () => {
    // dominantAnte was a majority vote over pooled records, so a player with more
    // ante-off history would be sent to drill an ante-off table while sitting at
    // an ante-on one. Scoped, there is nothing to vote on.
    const plan = buildPreflopCurriculumPlan(twoProfiles(), {
      minLeakSample: 5,
      leakRateThreshold: 70,
      profileId: ANTE_OFF,
    });

    expect(plan.focus?.filters.ante).toBe("OFF");
  });

  it("leaves a single-profile store exactly as it was", () => {
    // The common case must not change: one profile in, the same plan out.
    const onlyWeak = migrateResultRecordsToV2(
      Array.from({ length: 10 }, (_, index) => answer(ANTE_OFF, index + 1, false)),
    );
    const plan = buildPreflopCurriculumPlan(onlyWeak, {
      minLeakSample: 5,
      leakRateThreshold: 70,
    });

    expect(plan.available).toBe(true);
    expect(plan.focus?.total).toBe(10);
    expect(plan.scope.setAside).toBe(0);
  });
});
