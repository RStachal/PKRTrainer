import { describe, expect, it } from "vitest";

import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";
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
describe("výpis rodiny mluví v blindech", () => {
  it("neukáže syrovou solverovou částku ani žetony", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    const packs = runtimeSolvedTurnPacks;
    expect(packs.length).toBeGreaterThan(0);

    for (const pack of packs) {
      const digest = renderTurnFamilyDigest(pack, turnRuleContentHash(pack.rules));
      const family = pack.familyIds[0] ?? pack.id;
      // Solverův formát: šest desetinných míst. Nikdy nesmí projít do výpisu.
      expect(digest, `${family} ukazuje syrovou solverovou akci`).not.toMatch(/\d\.000000/);
      // Nouzová větev pro pravidlo bez potBB. Že se nepoužívá, je tvrzení o
      // datech: všech 10 558 dodávaných pravidel má obě čísla.
      expect(digest, `${family} nemá čím převést na BB`).not.toContain("žetonů");
    }
  });

  it("sázky ve výpisu nesou blindy i podíl potu", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    const pack = runtimeSolvedTurnPacks[0];
    const digest = renderTurnFamilyDigest(pack, turnRuleContentHash(pack.rules));
    // Aspoň jedna sázka; rodina bez jediné sázky by znamenala, že test nekontroluje nic.
    expect(digest).toMatch(/BET \d+(\.\d+)? BB \(\d+ % potu\)/);
  });
});
