import { decodeComboMask, decodeEvTable, evTableLength } from "../../core/evCodec";

/**
 * EV riverových akcí jako samostatný obsah, čtený až když ho hráč chce.
 *
 * ## Proč zvlášť od strategie
 *
 * EV je funkce „po odpovědi": hráč ji chce vidět, až když už rozhodl. Kdyby
 * seděla v packu se strategií, platil by za ni každý, kdo si otevře trénink -
 * a pack je už dnes na hranici rozpočtu, takže by se muselo zahodit pokrytí
 * desek. Vlastní chunk to řeší: nenačte se, dokud o něj někdo nepožádá.
 *
 * ## Proč po kombinacích, ne po třídách ruk
 *
 * Změřeno: uvnitř jedné třídy se EV rozchází s mediánem 0,3 žetonu, ale p90 3,2
 * a maximem přes sedmdesát - tedy kolem čtrnácti blindů. Průměr přes třídu by
 * tam neodpovídal žádné konkrétní ruce, a EV je číslo, které hráč uvidí u každé
 * akce. Rozdíl je vidět i na rovnováze: po kombinacích má ztráta hrané akce p90
 * nula, po třídách 3,5 BB.
 *
 * ## Proč otisk
 *
 * Tabulka platí pro jednu podobu packu. Kdyby se pack přegeneroval a EV ne,
 * ukazovala by čísla k jiné strategii - a nic by to neřeklo, protože tvar dat
 * zůstane platný. Runtime proto EV nepoužije, když se otisk neshoduje.
 */

export interface RiverEvPack {
  schemaVersion: "PKRTRAINER_RIVER_EV_V2";
  familyId: string;
  packId: string;
  /** Otisk packu, pro který tahle tabulka platí. */
  contentHash: string;
  unit: "BB";
  /**
   * Odkud EV je.
   *
   * `SOLVED_TREE` znamená dopočet ze solverovy strategie a rangí, ne solverovu
   * vlastní counterfactual value - solver ji nevypisuje. U zkonvergovaného solvu
   * jsou si ta čísla blízká, ale je to jiné tvrzení a nesmí se schovat.
   */
  source: "SOLVED_TREE";
  /** Kombinace, na které se řádky odkazují indexem. */
  combos: string[];
  /** Jeden záznam na pravidlo packu, ve stejném pořadí. `null` = bez EV. */
  rules: (RiverEvRule | null)[];
}

export interface RiverEvRule {
  /**
   * Bitmapa kombinací do `combos`; hodnoty jdou v pořadí vzestupných indexů.
   *
   * Jako pole čísel to zabíralo 205 kB na rodinu - třetinu souboru - protože
   * pravidlo pokrývá typicky 195 z 315 kombinací a každý index stojí v JSON
   * čtyři znaky. Bitmapa je 40 bajtů na pravidlo. Deduplikace seznamů by
   * neušetřila skoro nic: z 298 pravidel jich má 255 vlastní množinu.
   */
  m: string;
  /** `combos × actions` hodnot, zapsaných kodekem. */
  v: string;
}

export interface RiverEvLookup {
  /** EV akcí pro jednu kombinaci, ve stejném pořadí jako `actions` pravidla. */
  forCombo(ruleIndex: number, combo: string): (number | null)[] | undefined;
}

/**
 * Čtečka nad jednou tabulkou.
 *
 * `actionCount` se bere z pravidla packu, ne z tabulky: tabulka nese jen
 * hodnoty a jejich počet na kombinaci je odvozený. Kdyby se ty dva rozešly,
 * čtečka radši nevrátí nic, než aby posunula hodnoty o jednu akci - to by
 * hráči ukázalo EV složení u sázky.
 */
export function readRiverEv(
  pack: RiverEvPack,
  actionCountOf: (ruleIndex: number) => number | undefined,
): RiverEvLookup {
  const cache = new Map<number, Map<string, (number | null)[]>>();

  return {
    forCombo(ruleIndex, combo) {
      const rule = pack.rules[ruleIndex];
      if (rule === null || rule === undefined) return undefined;
      const actions = actionCountOf(ruleIndex);
      if (actions === undefined || actions <= 0) return undefined;

      let byCombo = cache.get(ruleIndex);
      if (byCombo === undefined) {
        // Skutečná délka zápisu, ne délka výsledku: `decodeEvTable` chybějící
        // doplní `null`, takže délka výsledku sedí vždycky a posun by se
        // nepoznal. Právě tenhle posun je ta tichá chyba, kvůli které je tady
        // kontrola - hráč by u sázky viděl EV složení.
        const indices = decodeComboMask(rule.m, pack.combos.length);
        if (evTableLength(rule.v) !== indices.length * actions) return undefined;
        const values = decodeEvTable(rule.v, indices.length * actions);
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
export function riverEvMatchesPack(
  ev: Pick<RiverEvPack, "packId" | "contentHash">,
  pack: { id: string; contentHash: string },
): boolean {
  return ev.packId === pack.id && ev.contentHash === pack.contentHash;
}
