import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildRiverStrategyRule,
  familyDirectoryOfRiverPath,
  type RiverPlanItem,
} from "../../src/data/ranges/riverStrategyRuleBuilder";
import { turnStrategyRuleProblems } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Riverové pravidlo ze skutečné vyřešené podhry, ne z vymyšlené.
 *
 * Vzorek vznikl průchodem celé cesty - `plan_river.py`, `solve_plan.py` - právě
 * proto, že opačný postup už jednou selhal: riverová fáze byla zapojená,
 * otestovaná na plánování a spadla na první položce, protože ji nikdo nespustil
 * až do konce.
 */
const node = JSON.parse(readFileSync("tests/fixtures/riverSubgame.sample.json", "utf8"));
const item = JSON.parse(
  readFileSync("tests/fixtures/riverPlanItem.sample.json", "utf8"),
) as RiverPlanItem;
const PATH = "MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c";

describe("riverový builder pravidel", () => {
  it("najde rodinu i z cesty zanořené pod turnovou podhrou", () => {
    // Rodinu pojmenovává adresář desky, ne adresář podhry, takže identita leží
    // o dvě úrovně výš než čtený soubor.
    expect(familyDirectoryOfRiverPath(PATH)).toBe("MTT9_20BB_BTN_BB_SRP_LOWSPR__999r");
    // Windows cesta se zpětnými lomítky, psaná přes String.raw, aby se z nich
    // nestaly escape sekvence.
    expect(familyDirectoryOfRiverPath(
      String.raw`C:\repo\artifacts\decomposition\MTT9_20BB_BTN_BB_SRP_LOWSPR__999r\river\CHECK_CHECK__2c`,
    )).toBe("MTT9_20BB_BTN_BB_SRP_LOWSPR__999r");
    expect(familyDirectoryOfRiverPath("bez-rodiny/river/x")).toBeUndefined();
  });

  it("postaví soudržné pravidlo ze skutečného solvu", () => {
    const rule = buildRiverStrategyRule(PATH, node, item);
    expect(rule).toBeDefined();
    if (rule === undefined) return;

    expect(rule.street).toBe("RIVER");
    expect(rule.familyId).toBe("MTT9_20BB_BTN_BB_SRP_LOWSPR");
    expect(rule.actions.length).toBeGreaterThan(1);
    expect(rule.buckets.length).toBeGreaterThan(0);
    // Stejná kontrola soudržnosti jako u turnu: prázdné kbelíky, ruka ve dvou
    // kbelících, akce mimo nabídku uzlu.
    expect(turnStrategyRuleProblems(rule)).toEqual([]);
  });

  it("nese pátou kartu, jinak by odpovídal na každou desku stejně", () => {
    const rule = buildRiverStrategyRule(PATH, node, item);
    if (rule === undefined) throw new Error("pravidlo nevzniklo");
    expect(rule.riverSpot.riverCard).toBe("2d");
    expect(rule.riverSpot.turnBoard).toEqual(["9s", "9h", "9d", "2c"]);
    expect(rule.riverSpot.potChips).toBeGreaterThan(0);
    // Zdroj je cesta k podhře, ne k desce: dvě riverové karty na téže desce se
    // jinak nedají odlišit.
    expect(rule.sourceDirectory).toContain("/river/");
  });

  it("odmítne položku, která nemá pět karet", () => {
    const short = { ...item, board: item.board.slice(0, 4) };
    expect(buildRiverStrategyRule(PATH, node, short)).toBeUndefined();
  });
});
