import { describe, expect, it } from "vitest";
import {
  handClassOfCombo,
  heroSideOfNode,
  seatsOfFamily,
} from "../../scripts/lib/solvedPackBuilding.mts";

/**
 * Společné části generátoru packů.
 *
 * Tahle logika rozhoduje, čí strategii hráč uvidí, a přitom na ni doteď nebyl
 * jediný test — ověřovala se jednorázovými sondami nad artefakty, které na disku
 * vývojáře být nemusí. Jedna taková sonda navíc párovala uzly se špatnými
 * položkami plánu a vydala nález, který neexistoval.
 *
 * Teď je logika v knihovně, kterou sdílí turnový a riverový generátor, takže
 * chyba v ní by se projevila na obou ulicích najednou. Případy níž jsou
 * vymyšlené schválně: mají držet pravidlo i tam, kde artefakty nejsou.
 */

/** Uzel s danými kombinacemi, tvarem odpovídající vyřešené podhře. */
function nodeOf(combos: readonly string[], player?: number) {
  const strategy: Record<string, unknown> = {};
  for (const combo of combos) strategy[combo] = [0.5, 0.5];
  return { player, strategy: { strategy } };
}

function rangeOf(classes: readonly string[]): Record<string, number> {
  return Object.fromEntries(classes.map((item) => [item, 1]));
}

describe("handClassOfCombo", () => {
  it("prevede kombinaci na tridu, kterou plan pojmenovava range", () => {
    expect(handClassOfCombo("AhKs")).toBe("AKo");
    expect(handClassOfCombo("AhKh")).toBe("AKs");
    expect(handClassOfCombo("7h7d")).toBe("77");
  });

  it("na necem, co kombinace neni, vrati undefined misto vymyslene tridy", () => {
    expect(handClassOfCombo("Ah")).toBeUndefined();
    expect(handClassOfCombo("")).toBeUndefined();
  });
});

describe("seatsOfFamily", () => {
  it("v SRP je agresor ten, kdo otevrel", () => {
    expect(seatsOfFamily("MTT9_25BB_CO_BB_SRP_CBET_LOWSPR")).toEqual({
      oop: "BB",
      ip: "CO",
      aggressor: "CO",
    });
  });

  it("ve 3BP je agresor ten druhy, protoze prvniho prehral", () => {
    expect(seatsOfFamily("MTT9_80BB_CO_BTN_3BP_MIDSPR")).toEqual({
      oop: "CO",
      ip: "BTN",
      aggressor: "BTN",
    });
  });

  it("blindy hraji prvni, takze BB je mimo pozici i proti tlacitku", () => {
    // Preflopové pořadí by řeklo opak; postflop jde SB, BB, teprve pak UTG a dál.
    expect(seatsOfFamily("MTT9_50BB_BTN_BB_SRP")?.oop).toBe("BB");
    expect(seatsOfFamily("MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR")).toEqual({
      oop: "SB",
      ip: "BB",
      aggressor: "SB",
    });
  });

  it("jmeno, ktere neni rodina, nema sedacky", () => {
    expect(seatsOfFamily("CASH100_CO_BB")).toBeUndefined();
    expect(seatsOfFamily("MTT9_25BB_ZZ_QQ_SRP")).toBeUndefined();
  });
});

describe("heroSideOfNode", () => {
  const item = {
    oop: rangeOf(["72o", "83o", "94o", "A5s", "K7s", "AKo"]),
    ip: rangeOf(["AKo", "AQs", "JJ", "TT"]),
  };

  it("rozhodne podle trid, ktere drzi jen jedna strana", () => {
    const node = nodeOf(["7h2d", "8h3d", "9h4d", "Ah5h", "Kh7h"], 1);
    expect(heroSideOfNode(node, item)).toEqual({ side: "OOP", confidence: 1, source: "OVERLAP" });
  });

  it("kdyz se prekryv a solveruv udaj neshodnou, turn se zahodi", () => {
    // Jeden z obou signálů je špatně a nevíme který. Vydat kterýkoli znamená
    // hádat, čí strategii hráči ukážeme.
    const node = nodeOf(["7h2d", "8h3d", "9h4d", "Ah5h", "Kh7h"], 0);
    expect(heroSideOfNode(node, item)).toBeUndefined();
  });

  it("kdyz prekryv nerozhodne, rozhodne hrac na tahu z uzlu", () => {
    // Obě range drží všechny třídy uzlu, takže výhradní důkaz je nula. Přesně
    // tenhle případ dřív zahazoval tisíce turnů u rodin blind proti blindu.
    const shared = { oop: rangeOf(["AKo", "AQs"]), ip: rangeOf(["AKo", "AQs"]) };
    expect(heroSideOfNode(nodeOf(["AhKs", "AhQh"], 0), shared)).toEqual({
      side: "IP",
      confidence: 1,
      source: "NODE_PLAYER",
    });
    expect(heroSideOfNode(nodeOf(["AhKs", "AhQh"], 1), shared)?.side).toBe("OOP");
  });

  it("bez rozhodnuteho prekryvu a bez udaje o hraci nevydá nic", () => {
    const shared = { oop: rangeOf(["AKo"]), ip: rangeOf(["AKo"]) };
    expect(heroSideOfNode(nodeOf(["AhKs"]), shared)).toBeUndefined();
  });

  it("uzel bez kombinaci nema stranu", () => {
    expect(heroSideOfNode(nodeOf([], 1), item)).toBeUndefined();
  });
});
