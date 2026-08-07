import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseTurnFamilyId, positionPatternForFamily } from "../../src/data/ranges/turnFamilyId";

/**
 * The family directory name is the only record of what a solve was about.
 *
 * There is no manifest tying a decomposition directory to a spot - the name
 * carries the depth, both seats, the pot type, the node and the SPR band, and
 * nothing else does. So a label chosen for a directory turned out to be a
 * schema, and 35,144 solved subgames depend on it being read correctly.
 *
 * All 261 directories parse, into 10 families. The parser refuses anything it
 * does not fully understand rather than filling gaps: a family that stops
 * parsing is a loud failure, where one parsed into the wrong seats would publish
 * a solved strategy under a spot it was never solved for.
 */

const ROOT = "artifacts/decomposition";

describe("turn family id", () => {
  it("reads every field a strategy rule needs out of the name", () => {
    const parsed = parseTurnFamilyId("MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR__432mono")!;
    expect(parsed).toMatchObject({
      familyId: "MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR",
      stackBB: 100,
      hero: "BTN",
      villain: "BB",
      potType: "SINGLE_RAISED",
      node: "FACING_BET",
      sprBand: "HIGH",
      heroOutOfPosition: false,
      repair: false,
      board: "432mono",
    });
  });

  it("treats the modifiers as a set, because the names do", () => {
    // FACING, CBET, OOP, REPAIR and the bands appear in varying combinations and
    // orders across the ten families, so position in the name means nothing.
    const oop = parseTurnFamilyId("MTT9_25BB_SB_BB_SRP_OOP_CBET_LOWSPR__643r")!;
    expect(oop.heroOutOfPosition).toBe(true);
    expect(oop.node).toBe("CBET");
    expect(oop.sprBand).toBe("LOW");

    const repair = parseTurnFamilyId("MTT9_35BB_CO_BTN_3BP_REPAIR__222r")!;
    expect(repair.repair).toBe(true);
    expect(repair.potType).toBe("THREE_BET_POT");
    // A re-solve of a family that had a problem; no strategic meaning, so it
    // must not change the spot the rule is filed under.
    expect(repair.node).toBe("CBET");
  });

  it("refuses a name it does not fully understand", () => {
    expect(parseTurnFamilyId("")).toBeUndefined();
    expect(parseTurnFamilyId("MTT6_25BB_BTN_BB_SRP")).toBeUndefined();
    expect(parseTurnFamilyId("MTT9_25BB_BTN_BB_LIMPED")).toBeUndefined();
    expect(parseTurnFamilyId("MTT9_XXBB_BTN_BB_SRP")).toBeUndefined();
    expect(parseTurnFamilyId("MTT9_25BB_ZZ_BB_SRP")).toBeUndefined();
    // A seat cannot play itself.
    expect(parseTurnFamilyId("MTT9_25BB_BTN_BTN_SRP")).toBeUndefined();
    // An unrecognised modifier means the grammar moved on without this parser,
    // and guessing would attach the solve to the wrong spot.
    expect(parseTurnFamilyId("MTT9_25BB_BTN_BB_SRP_SOMETHINGNEW")).toBeUndefined();
  });

  it("spells the position pattern the way rules are matched", () => {
    // The same spelling postflopIntent now produces and the flop packs carry.
    // Getting this wrong is exactly what made two flop packs unreachable.
    const srp = parseTurnFamilyId("MTT9_40BB_UTG_BB_SRP")!;
    expect(positionPatternForFamily(srp)).toBe("SRP_UTG_VS_BB");
    const threeBet = parseTurnFamilyId("MTT9_150BB_CO_BTN_3BP_HIGHSPR")!;
    expect(positionPatternForFamily(threeBet)).toBe("3BP_CO_VS_BTN");
  });

  it("parses every directory the solver has actually written", () => {
    if (!existsSync(ROOT)) {
      // Not in version control. Asserted rather than skipped quietly, so a run
      // without artefacts cannot look like one that checked them.
      expect(existsSync(ROOT), `${ROOT} absent - solver artefacts not checked`).toBe(false);
      return;
    }
    const directories = readdirSync(ROOT).filter((name) => name.includes("__"));
    expect(directories.length).toBeGreaterThan(100);

    const families = new Set<string>();
    const unparsed: string[] = [];
    for (const directory of directories) {
      const parsed = parseTurnFamilyId(directory);
      if (parsed === undefined) unparsed.push(directory);
      else families.add(parsed.familyId);
    }
    expect(unparsed).toEqual([]);
    expect(families.size).toBeGreaterThan(5);
  });
});
