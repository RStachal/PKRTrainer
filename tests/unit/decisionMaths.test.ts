import { describe, expect, it } from "vitest";

import {
  callRequirement,
  explainDefenceFrequency,
  minimumDefenceFrequency,
  explainCallPrice,
  explainShovePrice,
  shoveRequirement,
} from "../../src/core/decisionMaths";
import { OPPONENT_STYLES, requiredFoldFrequency } from "../../src/core/opponentStyle";

// This is the layer that turns two models into something a player can act on.
// Until it existed the trainer taught which action and never why at this price,
// which teaches a rule rather than a method.

describe("what a call needs", () => {
  it("matches the required-equity table the owner's book prints", () => {
    // Half-pot bet: call 0.5 into a pot of 1.5 needs about 25 percent.
    expect(callRequirement({ potBB: 1.5, toCallBB: 0.5 }).chipEquity * 100).toBeCloseTo(25, 0);
    // Pot-sized: call 1 into 2 needs about a third.
    expect(callRequirement({ potBB: 2, toCallBB: 1 }).chipEquity * 100).toBeCloseTo(33.3, 1);
    // Two-thirds pot: into a pot of 1 the bet is 0.667, so the hero faces 1.667
    // and calls 0.667, needing about 29. Getting this fixture wrong the first time
    // is why the assertion states the construction rather than just the numbers.
    expect(callRequirement({ potBB: 1.667, toCallBB: 0.667 }).chipEquity * 100).toBeCloseTo(28.6, 1);
  });

  it("reproduces the SnG article's worked ICM conversion", () => {
    // Pot odds of 1.65:1 need 37.7 percent on chips, and 42 once the ladder is
    // counted at a bubble factor of 1.2. The article works exactly this example.
    const requirement = callRequirement({ potBB: 1.65, toCallBB: 1 }, 1.2);
    expect(requirement.chipEquity * 100).toBeCloseTo(37.7, 1);
    expect(requirement.icmEquity! * 100).toBeCloseTo(42.1, 1);
  });

  it("never lets the ladder make a call cheaper", () => {
    for (const factor of [1, 1.2, 1.9, 5]) {
      const requirement = callRequirement({ potBB: 3, toCallBB: 1 }, factor);
      expect(requirement.icmEquity!).toBeGreaterThanOrEqual(requirement.chipEquity - 1e-9);
    }
  });

  it("says nothing about ICM when no factor was supplied", () => {
    // The shipped packs are chipEV. Inventing a bubble factor to have something to
    // say would be teaching a context the data does not describe.
    const requirement = callRequirement({ potBB: 3, toCallBB: 1 });
    expect(requirement.icmEquity).toBeUndefined();
    expect(explainCallPrice(requirement)).not.toContain("bubble");
  });
});

describe("what a shove needs", () => {
  it("prices fold equity straight from the break-even identity", () => {
    expect(shoveRequirement(1, 1).requiredFolds * 100).toBeCloseTo(50, 1);
    expect(shoveRequirement(0.5, 1).requiredFolds * 100).toBeCloseTo(33.3, 1);
  });

  it("calls a steal good against a rock and bad against a station", () => {
    // Risking 3 into 1.5 needs 66.7 percent folds. A rock gives 82, a station 60,
    // so this size separates them - at 2 into 1.5 it needs only 57 and the station
    // pays for it too, which is worth knowing: the split depends on the sizing.
    const price = { risk: 3, pot: 1.5 };
    const rock = shoveRequirement(price.risk, price.pot, OPPONENT_STYLES.TIGHT_PASSIVE);
    const station = shoveRequirement(price.risk, price.pot, OPPONENT_STYLES.LOOSE_PASSIVE);
    expect(rock.profitableOnFoldsAlone).toBe(true);
    expect(station.profitableOnFoldsAlone).toBe(false);
  });
});

describe("what the player is told", () => {
  it("names the ladder only when it applies, and gives both numbers when it does", () => {
    const plain = explainCallPrice(callRequirement({ potBB: 3, toCallBB: 1 }));
    expect(plain).toContain("25,0 %");
    expect(plain).not.toContain("bubble");

    const laddered = explainCallPrice(callRequirement({ potBB: 3, toCallBB: 1 }, 1.9));
    expect(laddered).toContain("25,0 %");
    expect(laddered).toContain("bubble faktor 1,90");
    expect(laddered).toContain("38,8 %");
  });

  it("says a shove that clears on folds alone still has to be read as a floor", () => {
    const good = explainShovePrice(shoveRequirement(1, 3, OPPONENT_STYLES.TIGHT_PASSIVE));
    expect(good).toContain("i bez dojetí");
    const bad = explainShovePrice(shoveRequirement(3, 1, OPPONENT_STYLES.LOOSE_PASSIVE));
    expect(bad).toContain("až u showdownu");
  });
});

describe("minimum defence frequency", () => {
  it("reproduces the owner's own worked example", () => {
    // "Pokud SB zvyšuje na 3 BB, riskuje 2,5 BB, aby vyhrál 1,5 BB. Naše minimální
    // obranná frekvence je 1,5 / (2,5 + 1,5) = 37,5%." - PKR POZNATKY.
    expect(minimumDefenceFrequency(2.5, 1.5) * 100).toBeCloseTo(37.5, 1);
  });

  it("is exactly the complement of what the attacker needs", () => {
    // Same identity from the two sides, which is why both exist by name: the
    // attacker asks how often they need a fold, the defender how often they must not.
    for (const [bet, pot] of [[1, 1], [2.5, 1.5], [0.5, 3]] as const) {
      expect(minimumDefenceFrequency(bet, pot) + requiredFoldFrequency(bet, pot)).toBeCloseTo(1, 9);
    }
  });

  it("says it in the form the notes use", () => {
    expect(explainDefenceFrequency(2.5, 1.5)).toContain("37,5 %");
    expect(explainDefenceFrequency(2.5, 1.5)).toContain("s čímkoli");
  });
});
