import { beforeAll, describe, expect, it } from "vitest";

import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, generatePostflopSpot } from "../../src/core/postflopGenerator";
import {
  pickSolvedTurnSpot,
  solvedTurnSpotConfig,
  solvedTurnSpots,
} from "../../src/data/ranges/solvedTurnSpotCatalogue";
import {
  createTurnSolvedStrategyResolverChain,
  loadAllSolvedTurnPacks,
} from "../../src/data/ranges/turnSolvedStrategyPacks";

/**
 * Text u vyřešeného turnu je pro hráče, ne pro toho, kdo ladí generátor.
 *
 * Stálo tu `Solved turn strategy for SRP_CO_VS_BB at 25BB effective` a názvy akcí
 * jako `BET 28.000000` - anglicky, v české aplikaci, s interním enumem, který
 * hráči neřekne nic a jen prozradí, jak je aplikace uvnitř poskládaná. Existující
 * kontrola na citace zdrojů to nechytila, protože prochází jen flopovou
 * heuristickou cestu a vyřešeného turnu se nedotkne.
 */
const ENUM_LEAKS = [
  "SRP_", "3BP_", "_VS_", "CBET", "FACING_BET",
  "TURN_OOP_LEAD", "TURN_BARREL", "SINGLE_RAISED", "THREE_BET_POT",
  "BET 2", "BET 1", "BET 3", "BET 5", "BET 6",
];

describe("hráčský text u vyřešeného turnu", () => {
  beforeAll(async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  });

  it("neobsahuje interní enumy ani syrové velikosti sázek", () => {
    const resolver = createTurnSolvedStrategyResolverChain();
    const candidates = solvedTurnSpots();
    let checked = 0;
    for (let seed = 0; seed < 120; seed += 1) {
      const random = (seed + 0.5) / 120;
      const picked = pickSolvedTurnSpot(random, candidates);
      if (picked === undefined) continue;
      const config = solvedTurnSpotConfig(picked, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, random);
      if (config === undefined) continue;
      const spot = generatePostflopSpot({
        seed,
        strategyResolver: resolver,
        allowFallback: true,
        ...config,
      });
      if (spot.strategySource.kind !== "STRATEGY_PACK") continue;
      if (spot.strategySource.provenance !== "SOLVER_BACKED") continue;
      checked += 1;
      for (const leak of ENUM_LEAKS) {
        expect(spot.explanation).not.toContain(leak);
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("řekne hloubku a velikost skupiny, protože to hráči něco říká", () => {
    const resolver = createTurnSolvedStrategyResolverChain();
    const picked = pickSolvedTurnSpot(0.5, solvedTurnSpots());
    expect(picked).toBeDefined();
    if (picked === undefined) return;
    const config = solvedTurnSpotConfig(picked, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, 0.5);
    if (config === undefined) return;
    const spot = generatePostflopSpot({
      seed: 7, strategyResolver: resolver, allowFallback: true, ...config,
    });
    expect(spot.explanation).toContain("Vyřešený turn");
    expect(spot.explanation).toContain("kombinací");
  });
});
