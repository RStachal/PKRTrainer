import { describe, expect, it } from "vitest";

import {
  bettingShare,
  digestDecisions,
  digestSamples,
  heroSentence,
  renderTurnFamilyDigest,
} from "../../src/data/ranges/turnReviewDigest";
import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";
import type { TurnStrategyPack } from "../../src/data/ranges/turnStrategyPack";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Výpis, nad kterým člověk vydává verdikt.
 *
 * Chyba tady je horší než chyba v generátoru. Generátor se dá přegenerovat;
 * verdikt vydaný nad zavádějícím výpisem se zapíše jako „člověk to viděl a
 * schválil" a zvedne rodinu na MEDIUM, tedy do produkce.
 */
function ruleWith(overrides: Partial<TurnStrategyRule> = {}): TurnStrategyRule {
  return {
    sourceDirectory: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR__654r",
    familyId: "MTT9_25BB_CO_BB_SRP_CBET_LOWSPR",
    positionPattern: "SRP_CO_VS_BB",
    node: "CBET",
    potType: "SINGLE_RAISED",
    stackBB: 25,
    heroOutOfPosition: true,
    actions: ["CHECK", "BET 17.000000"],
    classCount: 2,
    buckets: [
      { action: "CHECK", handClasses: ["72o"], combos: 12, mix: [] },
      { action: "BET 17.000000", handClasses: ["AA"], combos: 6, mix: [] },
    ],
    spot: {
      flop: ["6s", "5d", "4c"],
      turnCards: ["2c", "2d"],
      priorLine: ["BET 17.000000", "CALL"],
      potChips: 84,
      stackChips: 108,
      potBB: 16.8,
      stackBehindBB: 21.6,
      reach: 0.3,
      hero: {
        side: "OOP",
        seat: "BB",
        villainSeat: "CO",
        isAggressor: false,
        confidence: 1,
        facingBet: false,
      },
    },
    ...overrides,
  } as TurnStrategyRule;
}

function packWith(rules: readonly TurnStrategyRule[]): TurnStrategyPack {
  return {
    id: "test-pack",
    familyIds: ["MTT9_25BB_CO_BB_SRP_CBET_LOWSPR"],
    confidence: "LOW",
    rules,
  } as unknown as TurnStrategyPack;
}

describe("digest ke čtení: čí strategii čtenář vidí", () => {
  it("jmenuje hrdinu dřív, než ukáže jeho mřížku", () => {
    // Rodina drží víc rozhodnutí, takže hlavička nemůže jmenovat jednoho hrdinu
    // za všechny. Co platit musí: než čtenář uvidí mřížku, ví, čí je.
    const text = renderTurnFamilyDigest(packWith([ruleWith()]), "abc-123");
    const lines = text.split("\n");
    const heroLine = lines.findIndex((line) => line.includes("čteš strategii"));
    const firstGrid = lines.findIndex((line) => line.includes("A K Q J T 9 8 7 6 5 4 3 2"));
    expect(heroLine).toBeGreaterThanOrEqual(0);
    expect(firstGrid).toBeGreaterThan(heroLine);
    expect(text).toContain("BB (mimo pozici) proti CO");
  });

  it("čte každé rozhodnutí zvlášť, ne všechna dohromady", () => {
    // Smíchat je znamená hlásit `CALL` vedle `BET` v jednom rozdělení a skládat
    // range hráče, který sází, s range hráče, který se rozhoduje o dorovnání.
    const facing = ruleWith({
      sourceDirectory: "B",
      actions: ["CALL", "FOLD"],
      buckets: [{ action: "CALL", handClasses: ["AA"], combos: 6, mix: [] }],
      spot: {
        ...(ruleWith().spot!),
        hero: { ...(ruleWith().spot!.hero!), facingBet: true },
      },
    } as Partial<TurnStrategyRule>);

    const decisions = digestDecisions([ruleWith(), facing]);
    expect(decisions).toHaveLength(2);
    expect(new Set(decisions.map((item) => item.hero)).size).toBe(2);

    const text = renderTurnFamilyDigest(packWith([ruleWith(), facing]), "abc-123");
    expect(text).toContain("rodina drží 2 různých rozhodnutí");
    expect(text).toContain("1/2:");
    expect(text).toContain("2/2:");
  });

  it("u vzoru řekne, že jmenuje preflopovou akci, ne hráče na tahu", () => {
    // `SRP_CO_VS_BB` se přirozeně čte jako strategie cutoffu. Ve třinácti
    // rodinách ze šestnácti drží uzly strategii toho druhého hráče.
    const text = renderTurnFamilyDigest(packWith([ruleWith()]), "abc-123");
    expect(text).toContain("vzor jmenuje preflopovou akci, ne hráče na tahu");
  });

  it("bez identity hráče se výpis nesmí tvářit, že ji zná", () => {
    const bare = ruleWith({ spot: undefined });
    expect(heroSentence(bare)).toContain("NEZNÁMÁ");
    expect(renderTurnFamilyDigest(packWith([bare]), "abc-123")).toContain("NEZNÁMÁ");
  });

  it("řekne, co přijetí znamená", () => {
    const text = renderTurnFamilyDigest(packWith([ruleWith()]), "abc-123");
    expect(text).toContain("z LOW na MEDIUM");
  });
});

describe("digest ke čtení: výběr ukázek", () => {
  const quiet = ruleWith({
    sourceDirectory: "A",
    buckets: [{ action: "CHECK", handClasses: ["72o"], combos: 12, mix: [] }],
  } as Partial<TurnStrategyRule>);
  const loud = ruleWith({
    sourceDirectory: "B",
    buckets: [{ action: "BET 17.000000", handClasses: ["AA"], combos: 6, mix: [] }],
  } as Partial<TurnStrategyRule>);
  const common = ruleWith({
    sourceDirectory: "C",
    spot: { ...(ruleWith().spot!), reach: 0.9 },
  } as Partial<TurnStrategyRule>);

  it("spočítá podíl sázejících kombinací", () => {
    expect(bettingShare(quiet)).toBe(0);
    expect(bettingShare(loud)).toBe(1);
  });

  it("vybere nejdosahovanější, nejsázivější a nejméně sázivý spot", () => {
    // Dřív se braly první tři v pořadí generátoru, což je pořadí podle dosahu v
    // rámci desky - všechny tři pak často pocházely z jedné desky a lišily se
    // jen turnovou kartou. Čtenář viděl totéž třikrát.
    const samples = digestSamples([quiet, loud, common]);
    expect(samples.map((item) => item.rule.sourceDirectory)).toEqual(["C", "B", "A"]);
    expect(samples[0].label).toContain("dosahovaný");
  });

  it("neukáže tentýž spot dvakrát", () => {
    const samples = digestSamples([loud]);
    expect(samples).toHaveLength(1);
  });

  it("pojmenuje ukázku deskou a turnovou kartou, ne adresářem", () => {
    const text = renderTurnFamilyDigest(packWith([ruleWith()]), "abc-123");
    expect(text).toContain("flop 6s 5d 4c, turn 2c");
    expect(text).toContain("a stejně pro 2d");
  });
});

describe("digest ke čtení: skutečné dodávané rodiny", () => {
  it("každá dodávaná rodina ví, čí strategii nese", { timeout: 30000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    expect(runtimeSolvedTurnPacks.length).toBeGreaterThan(0);
    for (const pack of runtimeSolvedTurnPacks) {
      // Každé rozhodnutí, ne jen první pravidlo. Rodina jich drží několik a
      // stačí jedno bez identity, aby čtenář schvaloval něco, o čem neví, čí to
      // je.
      const unknown = digestDecisions(pack.rules)
        .filter((decision) => decision.hero.includes("NEZNÁMÁ"));
      expect({ family: pack.familyIds[0], unknown: unknown.length })
        .toEqual({ family: pack.familyIds[0], unknown: 0 });
    }
  });

  it("rodina drží víc rozhodnutí a digest je nesmíchá", async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    for (const pack of runtimeSolvedTurnPacks) {
      const decisions = digestDecisions(pack.rules);
      // Součet pravidel po rozhodnutích musí sedět na pack: kdyby se některé
      // ztratilo, čtenář by schválil obsah, který nikdy neviděl.
      const counted = decisions.reduce((sum, item) => sum + item.rules.length, 0);
      expect({ family: pack.familyIds[0], counted }).toEqual({
        family: pack.familyIds[0],
        counted: pack.rules.length,
      });
      expect(decisions.length).toBeGreaterThan(1);
    }
  }, 30000);
});
