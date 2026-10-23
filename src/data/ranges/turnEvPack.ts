import { decodeComboMask, decodeEvDeltas } from "../../core/evCodec";

/**
 * EV turnových akcí jako samostatný obsah, čtený až když ho hráč chce.
 *
 * ## Proč zvlášť od strategie
 *
 * Táž úvaha jako u riveru: EV je funkce „po odpovědi". Kdyby seděla v packu se
 * strategií, platil by ji každý, kdo si otevře trénink. Vlastní chunk se
 * nenačte, dokud o něj někdo nepožádá - měřeno 62 az 99 KiB gzip na rodinu
 * (bod 211).
 *
 * ## Proč je to sourozenec `riverEvPack`, a ne sdílený modul
 *
 * Formát je stejný a čtečka taky. Riverová varianta se ale **dodává hráči** a
 * turnová zatím ne, takže ji přepisovat kvůli sdílení znamená sáhnout na
 * funkční obsah kvůli neověřenému. Až se turnová EV bude dodávat, patří ty dvě
 * čtečky sloučit - do té doby platí, že **oprava v jedné musí do druhé**.
 *
 * ## Proč po kombinacích, ne po třídách ruk
 *
 * Změřeno na riveru a na turnu to platí tím spíš: uvnitř jedné třídy se EV
 * rozchází a průměr přes třídu neodpovídá žádné konkrétní ruce. EV je číslo,
 * které hráč uvidí u každé akce.
 *
 * ## Proč otisk
 *
 * Tabulka platí pro jednu podobu packu. Přegenerovaný pack s nepřegenerovanou
 * tabulkou by ukazoval čísla k jiné strategii a nic by to neřeklo, protože tvar
 * dat zůstane platný.
 */
export interface TurnEvPack {
  schemaVersion: "PKRTRAINER_TURN_EV_V1";
  familyId: string;
  packId: string;
  /** Otisk packu, pro který tahle tabulka platí. */
  contentHash: string;
  unit: "BB";
  /**
   * Odkud EV je.
   *
   * `SOLVED_TREE` znamená dopočet ze solverovy strategie a rangí, ne solverovu
   * vlastní counterfactual value - tu solver nevypisuje. Na turnu se navíc část
   * hodnot skládá z **dojezdu po all-inu**, což je přesná matematika, a část
   * z vyřešených riverových vrstev, které nesou solverovu nepřesnost (bod 209).
   * Tabulka ty dva druhy nerozlišuje, protože hráči jsou k nerozeznání; rozdíl
   * patří do měření kvality, ne do dat.
   */
  source: "SOLVED_TREE";
  /** Kombinace, na které se řádky odkazují indexem. */
  combos: string[];
  /** Jeden záznam na pravidlo packu, ve stejném pořadí. `null` = bez EV. */
  rules: (TurnEvRule | null)[];
}

export interface TurnEvRule {
  /** Bitmapa kombinací do `combos`; hodnoty jdou v pořadí vzestupných indexů. */
  m: string;
  /** `combos × actions` hodnot jako rozdíly v desetinách blindu. */
  v: (number | null)[];
}

export interface TurnEvLookup {
  /** EV akcí pro jednu kombinaci, ve stejném pořadí jako `actions` pravidla. */
  forCombo(ruleIndex: number, combo: string): (number | null)[] | undefined;
}

/**
 * Čtečka nad jednou tabulkou.
 *
 * `actionCount` se bere z pravidla packu, ne z tabulky: tabulka nese jen hodnoty
 * a jejich počet na kombinaci je odvozený. Kdyby se ty dva rozešly, čtečka radši
 * nevrátí nic, než aby posunula hodnoty o jednu akci - to by hráči ukázalo EV
 * složení u sázky.
 */
export function readTurnEv(
  pack: Pick<TurnEvPack, "combos" | "rules">,
  actionCountOf: (ruleIndex: number) => number | undefined,
): TurnEvLookup {
  const cache = new Map<number, Map<string, (number | null)[]>>();

  return {
    forCombo(ruleIndex, combo) {
      const rule = pack.rules[ruleIndex];
      if (rule === null || rule === undefined) return undefined;
      const actions = actionCountOf(ruleIndex);
      if (actions === undefined || actions <= 0) return undefined;

      let byCombo = cache.get(ruleIndex);
      if (byCombo === undefined) {
        // Délka musí sedět na počet kombinací krát počet akcí. Nesedí-li, četly
        // by se hodnoty posunuté o akci a tvar dat by přitom zůstal platný,
        // takže jinde by se to nepoznalo.
        const indices = decodeComboMask(rule.m, pack.combos.length);
        if (rule.v.length !== indices.length * actions) return undefined;
        const values = decodeEvDeltas(rule.v, actions);
        byCombo = new Map();
        for (const [position, comboIndex] of indices.entries()) {
          const name = pack.combos[comboIndex];
          if (name === undefined) continue;
          byCombo.set(name, values.slice(position * actions, (position + 1) * actions));
        }
        cache.set(ruleIndex, byCombo);
      }
      return byCombo.get(combo);
    },
  };
}

/** Platí tahle tabulka pro tenhle pack? */
export function turnEvMatchesPack(
  ev: Pick<TurnEvPack, "packId" | "contentHash">,
  pack: { id: string; contentHash: string },
): boolean {
  return ev.packId === pack.id && ev.contentHash === pack.contentHash;
}
