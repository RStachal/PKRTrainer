import { describe, expect, it } from "vitest";

import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadSolvedFlopPacks } from "../../src/data/ranges/flopSolvedStrategyPacks";
import { runtimeSolvedFlopPacks } from "../../src/data/ranges/flopSolvedRuntimeRegistry";
import { loadSolvedRiverPacks } from "../../src/data/ranges/riverSolvedStrategyPacks";
import { runtimeSolvedRiverPacks } from "../../src/data/ranges/riverSolvedRuntimeRegistry";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import { renderTurnFamilyDigest } from "../../src/data/ranges/turnReviewDigest";
import { turnRuleContentHash } from "../../src/data/ranges/turnReviewVerdict";

/**
 * Výpis ke čtení mluví v blindech, ne v žetonech.
 *
 * Solver píše částky v žetonech a produkt mluví v blindech všude jinde. Ve
 * výpisu, nad kterým má člověk strávit hodiny, se žetony objevovaly - a hloubka
 * spotu byla přitom o dva řádky výš uvedená v BB, takže se v jednom odstavci
 * míchaly dvě měřítka.
 *
 * Tenhle test renderuje skutečnou dodávanou rodinu, ne vymyšlenou: převod stojí
 * na tom, že každé pravidlo nese `potChips` i `potBB`, a to je vlastnost dat, ne
 * kódu. Kdyby ji nový generátor přestal dodržovat, projde to jednotkovým testům
 * a spadne až tady.
 */
async function everyShippedPack(): Promise<{ street: string; packs: readonly TurnStrategyPack[] }[]> {
  await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
  await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
  await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");
  return [
    { street: "FLOP", packs: runtimeSolvedFlopPacks as unknown as readonly TurnStrategyPack[] },
    { street: "TURN", packs: runtimeSolvedTurnPacks as readonly TurnStrategyPack[] },
    { street: "RIVER", packs: runtimeSolvedRiverPacks as unknown as readonly TurnStrategyPack[] },
  ];
}

describe("výpis rodiny mluví v blindech", () => {
  it("žádná ulice neukáže syrovou solverovou částku ani žetony", { timeout: 120000 }, async () => {
    // Původně se kontroloval jen turn, což byla polovina tvrzení: flop i river
    // renderuje týž kód, ale nesou jiná data, a převod stojí právě na datech.
    const streets = await everyShippedPack();
    let checked = 0;
    for (const { street, packs } of streets) {
      expect(packs.length, `${street} nedodává žádný pack`).toBeGreaterThan(0);
      for (const pack of packs) {
        const digest = renderTurnFamilyDigest(pack, turnRuleContentHash(pack.rules));
        const where = `${street} ${pack.familyIds[0] ?? pack.id}`;
        checked += 1;
        expect(digest, `${where} ukazuje syrovou solverovou akci`).not.toMatch(/\d\.000000/);
        expect(digest, `${where} nemá čím převést na BB`).not.toContain("žetonů");
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("blindy ve výpisu sedí s potem, ne jen s formátem", { timeout: 120000 }, async () => {
    // První verze tohohle testu kontrolovala jen tvar `BET x BB (y % potu)` a
    // prošla i s rozbitým převodem: `bb = chips` vypíše `BET 17.0 BB (34 %
    // potu)`, což tvaru vyhovuje a je to o řád vedle. Kontroluje se proto
    // vztah: sázka v blindech musí sedět s potem v blindech a podílem potu,
    // které výpis uvádí o pár řádků výš.
    const streets = await everyShippedPack();
    let checkedBets = 0;
    for (const { street, packs } of streets) {
      for (const pack of packs) {
        const digest = renderTurnFamilyDigest(pack, turnRuleContentHash(pack.rules));
        let potBB: number | undefined;
        for (const line of digest.split("\n")) {
          const pot = /pot ([\d.]+) BB/.exec(line);
          if (pot !== null) { potBB = Number(pot[1]); continue; }
          // Jen řádky legendy konkrétní desky - ty nesou "komb.". Souhrnné
          // rozdělení výš žádný pot nemá a vztahovalo by se k potu jiné desky.
          if (!line.includes("komb.")) continue;
          const bet = /BET ([\d.]+) BB \((\d+) % potu\)/.exec(line);
          if (bet === null || potBB === undefined) continue;
          const shown = Number(bet[1]);
          const expected = potBB * Number(bet[2]) / 100;
          // Tolerance kryje zaokrouhlení: blindy na desetinu, procenta na celé.
          const tolerance = potBB * 0.006 + 0.06;
          checkedBets += 1;
          expect(
            Math.abs(shown - expected),
            `${street} ${pack.familyIds[0]}: ${line.trim()} proti potu ${potBB} BB`,
          ).toBeLessThanOrEqual(tolerance);
        }
      }
    }
    // Kdyby se přestaly vypisovat sázky, test by mlčky nekontroloval nic.
    expect(checkedBets).toBeGreaterThan(20);
  });
});
