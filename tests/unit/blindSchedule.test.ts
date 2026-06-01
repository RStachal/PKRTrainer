import { describe, expect, it } from "vitest";

import {
  FIXED_BB_STACK_BUCKETS,
  blindScheduleFor,
  levelByNumber,
  roundedStackBucket,
  stackBucketAtLevel,
  stackInBigBlinds,
} from "../../src/core/blindSchedule";
import { STACK_BUCKETS } from "../../src/core/types";

describe("blindSchedule", () => {
  it("vraci regular a turbo schedule pro MTT bez zmeny fixed-BB kosu", () => {
    const regular = blindScheduleFor("MTT", "REGULAR");
    const turbo = blindScheduleFor("MTT", "TURBO");

    expect(regular.gameVariant).toBe("MTT");
    expect(turbo.gameVariant).toBe("MTT");
    expect(regular.blindSpeed).toBe("REGULAR");
    expect(turbo.blindSpeed).toBe("TURBO");
    expect(turbo.levels[0].durationMinutes).toBeLessThan(
      regular.levels[0].durationMinutes,
    );
    expect(FIXED_BB_STACK_BUCKETS).toEqual(STACK_BUCKETS);
  });

  it("vraci regular a turbo schedule pro SNG", () => {
    const regular = blindScheduleFor("SNG", "REGULAR");
    const turbo = blindScheduleFor("SNG", "TURBO");

    expect(regular.startingStack).toBe(1_500);
    expect(turbo.startingStack).toBe(1_500);
    expect(turbo.levels[1].bigBlind).toBeGreaterThan(regular.levels[1].bigBlind);
  });

  it("prepocita chip stack na BB a nejblizsi stack bucket", () => {
    const schedule = blindScheduleFor("MTT", "REGULAR");
    const level = levelByNumber(schedule, 4);

    expect(level).toEqual({
      level: 4,
      smallBlind: 300,
      bigBlind: 600,
      ante: 600,
      durationMinutes: 12,
    });

    expect(stackInBigBlinds(15_000, level!)).toBe(25);
    expect(stackBucketAtLevel(15_000, level!)).toBe(25);
    expect(roundedStackBucket(73)).toBe(75);
  });
});
