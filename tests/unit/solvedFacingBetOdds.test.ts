import { describe, expect, it } from "vitest";

import { loadAllSolvedTurnPacks } from "../../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedTurnPacks } from "../../src/data/ranges/turnSolvedRuntimeRegistry";
import type { TurnStrategyRule } from "../../src/data/ranges/turnStrategyRuleBuilder";

/**
 * Jak často se skládá proti sázce, měřeno proti kurzům, které ta sázka nabízí.
 *
 * Čelení sázce je většina dodávaného turnového obsahu a vzniklo čtením uzlů pod
 * kořenem podhry - tedy strojově, z dat, která nikdo neprohlížel. Tenhle test je
 * jediná kontrola, která o té strategii něco tvrdí, aniž by ji četl člověk.
 *
 * Teorie dává tvrdý referenční bod. Kdo sází `B` do potu `P - B`, riskuje `B`,
 * aby vyhrál `P - B`; blaf je vyrovnaný, když soupeř složí `B / P`. Skutečná
 * frekvence se od toho odchýlí - obránce má pozici, equity a soupeřova range
 * není čistě polární - ale odchýlit se má o jednotky bodů, ne o řád.
 *
 * ## Co tím pádem chytí
 *
 * Hlavně vadný pot v uzlu. Ten se počítá při stavbě packu z linky, kterou hra
 * prošla, a slouží k převodu solverových žetonů na „malá" a „velká" sázka. Kdyby
 * se místo potu uzlu vzal pot kořene, byl by poměr sázky k potu mimo řád a
 * frekvence skládání by s ním nesouvisely vůbec. Chytí i špatně spárovaný uzel a
 * uzel označený jako čelení sázce, který sázce nečelí.
 *
 * Změřeno při zavedení: sázka za 20-30 % potu má teoretických 25,1 % a skutečných
 * 25,7 %; sázka za 40-60 % má 43,4 % proti 38,9 %, tedy obrana o něco širší, než
 * říká minimum - což je normální směr odchylky, ne chyba.
 */
const SIZED = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i;

/** Částka, které hrdina v tomhle pravidle čelí. */
function betFaced(rule: TurnStrategyRule): number | undefined {
  const line = rule.spot?.priorLine ?? [];
  for (let index = line.length - 1; index >= 0; index -= 1) {
    const sized = SIZED.exec(line[index].trim());
    if (sized !== null) return Number(sized[2]);
  }
  return undefined;
}

function foldShare(rule: TurnStrategyRule): number {
  const total = rule.buckets.reduce((sum, bucket) => sum + bucket.combos, 0);
  if (total === 0) return 0;
  const folds = rule.buckets
    .filter((bucket) => bucket.action.trim().toUpperCase() === "FOLD")
    .reduce((sum, bucket) => sum + bucket.combos, 0);
  return folds / total;
}

describe("skládání proti sázce odpovídá nabízeným kurzům", () => {
  it("každá rodina se skládá zhruba tak často, jak nabízí kurzy", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    expect(runtimeSolvedTurnPacks.length).toBeGreaterThan(0);

    const mean = (values: readonly number[]) => (
      values.reduce((sum, item) => sum + item, 0) / values.length
    );
    let checked = 0;

    for (const pack of runtimeSolvedTurnPacks) {
      const odds: number[] = [];
      const folds: number[] = [];
      for (const rule of pack.rules) {
        if (rule.spot?.hero?.facingBet !== true) continue;
        const pot = rule.spot.potChips;
        const bet = betFaced(rule);
        if (bet === undefined || pot <= 0) continue;
        odds.push(bet / pot);
        folds.push(foldShare(rule));
      }
      // Rodina bez čelících rozhodnutí se nekontroluje; ty existují (kde vypadl
      // uzel, pro který produkt nemá jméno) a nejsou vadou.
      if (odds.length < 20) continue;
      checked += 1;

      // Po rodinách, ne v součtu. Součet přes osmnáct rodin vadu v jedné z nich
      // rozředí: ověřeno tím, že se jedné rodině podstrčil kořenový pot místo
      // potu uzlu a agregátní verze testu prošla.
      const family = pack.familyIds[0];
      expect({ family, odchylka: Math.abs(mean(folds) - mean(odds)) < 0.12 })
        .toEqual({ family, odchylka: true });
    }
    // Kdyby se filtr rozešel s obsahem, test by tiše neověřil nic.
    expect(checked).toBeGreaterThan(10);
  });

  it("proti větší sázce se skládá víc", { timeout: 60000 }, async () => {
    await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
    const samples: { ratio: number; fold: number }[] = [];
    for (const pack of runtimeSolvedTurnPacks) {
      for (const rule of pack.rules) {
        if (rule.spot?.hero?.facingBet !== true) continue;
        const pot = rule.spot.potChips;
        const bet = betFaced(rule);
        if (bet === undefined || pot <= 0) continue;
        samples.push({ ratio: bet / pot, fold: foldShare(rule) });
      }
    }
    const band = (low: number, high: number) => {
      const inside = samples.filter((item) => item.ratio >= low && item.ratio < high);
      return inside.length === 0 ? undefined : {
        count: inside.length,
        fold: inside.reduce((sum, item) => sum + item.fold, 0) / inside.length,
      };
    };
    const small = band(0.2, 0.3);
    const big = band(0.4, 0.6);
    expect(small?.count ?? 0).toBeGreaterThan(100);
    expect(big?.count ?? 0).toBeGreaterThan(100);
    // Vztah, ne absolutní číslo: kdyby se pot bral odjinud, rozpadne se dřív.
    expect(big!.fold).toBeGreaterThan(small!.fold);
  });
});
