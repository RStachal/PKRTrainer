import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  committedAfterAction,
  subgameDecisions,
  type SubgameNode,
} from "../../scripts/lib/subgameDecisions.mts";

/**
 * Aritmetika potu uvnitř podhry, ověřená proti nezávislé implementaci.
 *
 * `plan_river.py` počítá totéž pro linky, které doběhnou na river: `pot + 2 *
 * level` a `stack - level`, kde `level` je poslední sázená částka. Jeho výstup
 * je ověřený skutečným solvem, takže se dá použít jako reference - a obě
 * implementace musí na dokončených linkách dát stejná čísla do žetonu.
 *
 * Bez tohohle ověření by šlo o odhad, a špatný pot znamená, že se hráči ukáže
 * jiná velikost sázky, než jakou solver počítal: solver píše žetony, produkt
 * mluví o podílu potu, a převod mezi tím je právě tenhle údaj.
 */
const SUBGAME = "artifacts/decomposition/MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/CHECK_CHECK__2c.json";
const RIVER_PLAN = "artifacts/decomposition/MTT9_20BB_BTN_BB_SRP_LOWSPR__999r/river/CHECK_CHECK__2c/plan.json";

describe("rozhodnutí uvnitř podhry", () => {
  it("na vymyšleném stromě počítá vklady po hráčích", () => {
    // "BET 17" znamená do sedmnácti, ne o sedmnáct. Kdo to přičte, dostane na
    // druhé sázce nesmysl.
    const tree: SubgameNode = {
      node_type: "action_node",
      player: 1,
      actions: ["CHECK", "BET 17.000000"],
      strategy: { strategy: { AhKs: [0.5, 0.5] } },
      childrens: {
        "BET 17.000000": {
          node_type: "action_node",
          player: 0,
          actions: ["CALL", "RAISE 50.000000", "FOLD"],
          strategy: { strategy: { AhKs: [0.3, 0.3, 0.4] } },
          childrens: {
            "RAISE 50.000000": {
              node_type: "action_node",
              player: 1,
              actions: ["CALL", "FOLD"],
              strategy: { strategy: { AhKs: [0.5, 0.5] } },
              childrens: {},
            },
          },
        },
      },
    };

    const decisions = subgameDecisions(tree, 50, 100);
    expect(decisions).toHaveLength(3);

    const [root, facingBet, facingRaise] = decisions;
    expect({ pot: root.potChips, stack: root.stackChips, toCall: root.toCallChips })
      .toEqual({ pot: 50, stack: 100, toCall: 0 });
    // IP čelí sázce sedmnáct: v potu je jen ta sázka, IP zatím nevložil nic.
    expect({ pot: facingBet.potChips, stack: facingBet.stackChips, toCall: facingBet.toCallChips })
      .toEqual({ pot: 67, stack: 100, toCall: 17 });
    // OOP čelí raisu na padesát: v potu je jeho sázka i raise, dorovnat má 33.
    expect({ pot: facingRaise.potChips, stack: facingRaise.stackChips, toCall: facingRaise.toCallChips })
      .toEqual({ pot: 117, stack: 83, toCall: 33 });
  });

  it("na skutečné podhře sedí s tím, co spočítal plánovač riveru", () => {
    if (!existsSync(SUBGAME) || !existsSync(RIVER_PLAN)) return;
    const root = JSON.parse(readFileSync(SUBGAME, "utf8")) as SubgameNode;
    const plan = JSON.parse(readFileSync(RIVER_PLAN, "utf8")) as {
      pot: number;
      stack: number;
      items: { line: string[]; pot: number; stack: number }[];
    };

    // Uzly podhry podle linky, která k nim vede.
    const byLine = new Map(
      subgameDecisions(root, plan.pot, plan.stack).map((item) => [item.line.join("|"), item]),
    );

    let checked = 0;
    for (const item of plan.items) {
      // Položka plánu popisuje stav po dokončené lince. Uzel s toutéž linkou v
      // podhře už není - následuje chance uzel - takže se vezme poslední
      // rozhodnutí na té lince a jeho poslední akce se dohraje stejnými pravidly,
      // jaká používá procházení stromu.
      const parent = byLine.get(item.line.slice(0, -1).join("|"));
      if (parent === undefined) continue;
      // Poslední akce se dohraje toutéž funkcí, kterou používá procházení
      // stromu. Kopie pravidla v testu by ověřovala samu sebe.
      const committed = committedAfterAction(
        item.line[item.line.length - 1],
        parent.player,
        parent.committed,
      );

      expect({
        line: item.line.join(" "),
        pot: plan.pot + committed[0] + committed[1],
        stack: plan.stack - Math.max(committed[0], committed[1]),
      }).toEqual({ line: item.line.join(" "), pot: item.pot, stack: item.stack });
      checked += 1;
    }
    // Kdyby se párování rozpadlo, test by tiše neověřil nic.
    expect(checked).toBeGreaterThan(20);
  });
});
