import { callRequirement, shoveRequirement } from "./decisionMaths";
import type { ActionKey } from "./types";

/**
 * Co musí každá nabízená akce vydělat, aby se zaplatila.
 *
 * ## Proč to není EV a nikdy se tak nesmí jmenovat
 *
 * EV říká, **co akce vynese**. Tohle říká, **kolik musí vydělat, aby se
 * vyrovnala složení** - je to práh, ne hodnota. Rozdíl není slovíčkaření:
 * dorovnání, které splní svůj práh, pořád musíš uhrát po flopu, a mimo pozici
 * z ekvity realizuješ míň, než kolik jí máš.
 *
 * Míchat ta dvě čísla by znamenalo vyrobit údaj, který vypadá stejně
 * autoritativně jako spočítaná EV a přitom tvrdí něco jiného. Panel ceny
 * rozhodnutí to má zapsané od začátku a tenhle modul tu hranici drží taky.
 *
 * ## Proč to vzniklo
 *
 * Změřeno 28. 8. 2026: přesnou EV má **33,1 %** rozdávaných preflopových spotů,
 * protože se počítá jen tam, kde je cena akce pevná - tedy all-in. Zbytek
 * zůstával bez jakéhokoli čísla. Práh se přitom spočítat dá skoro všude: akci
 * s dorovnáním nabízí 63,0 % spotů, se zvýšením 78,1 %, a **aspoň jednu
 * cenitelnou akci má 96,1 %**.
 *
 * ## Proč to bere velikosti jako vstup
 *
 * Aby si nic nedomýšlel. Velikost otevření produkt učí, tři-bet a čtyři-bet má
 * jako přiznaný předpoklad - a obojí patří tomu, kdo tenhle modul volá. Kdyby
 * si je bral sám, schoval by tím rozhodnutí, které má být vidět.
 */

export type DecisionPriceKind = "BASELINE" | "EQUITY_NEEDED" | "FOLDS_NEEDED";

export interface DecisionPrice {
  action: ActionKey;
  kind: DecisionPriceKind;
  /** Požadovaný podíl, 0..1. U základny chybí - složení nic nepotřebuje. */
  required?: number;
  /** Týž práh pod tlakem ICM, když se počítá s bubble factorem. */
  requiredWithIcm?: number;
  /** Jak často se ta akce podle zdroje hraje, 0..100. Jen u mixu. */
  sourceShare?: number;
}

export interface DecisionPriceInput {
  /** Akce, které jsou hráči nabídnuté; pořadí se zachová. */
  actions: readonly ActionKey[];
  /** Pot před hrdinovou akcí, v BB. */
  potBB: number;
  /** Kolik stojí dorovnání. Nula znamená, že se nedorovnává. */
  toCallBB: number;
  /** Kolik hrdina riskuje danou akcí; jen pro akce, které zvyšují. */
  riskByAction: Partial<Record<ActionKey, number>>;
  /** Bubble factor, když spot běží pod ICM tlakem. */
  bubbleFactor?: number;
  /** Frekvence ze zdroje, když je známá. */
  sourceShareByAction?: Partial<Record<ActionKey, number>>;
}

const CALLING_ACTIONS: readonly ActionKey[] = ["CALL", "CALL_JAM"];

/**
 * Práh pro každou nabízenou akci, nebo prázdno tam, kde ho spot neurčuje.
 *
 * Akce bez ceny se **vynechá**, ne vynuluje: nula je platný práh (složení) a
 * chybějící údaj se od něj musí dát rozeznat.
 */
export function decisionPrices(input: DecisionPriceInput): DecisionPrice[] {
  const out: DecisionPrice[] = [];
  for (const action of input.actions) {
    const sourceShare = input.sourceShareByAction?.[action];
    if (action === "FOLD") {
      out.push({ action, kind: "BASELINE", ...(sourceShare === undefined ? {} : { sourceShare }) });
      continue;
    }
    if (CALLING_ACTIONS.includes(action)) {
      if (input.toCallBB <= 0) continue;
      const requirement = callRequirement(
        { potBB: input.potBB, toCallBB: input.toCallBB },
        input.bubbleFactor,
      );
      out.push({
        action,
        kind: "EQUITY_NEEDED",
        required: requirement.chipEquity,
        ...(requirement.icmEquity === undefined ? {} : { requiredWithIcm: requirement.icmEquity }),
        ...(sourceShare === undefined ? {} : { sourceShare }),
      });
      continue;
    }
    const risk = input.riskByAction[action];
    if (risk === undefined || risk <= 0) continue;
    out.push({
      action,
      kind: "FOLDS_NEEDED",
      required: shoveRequirement(risk, input.potBB).requiredFolds,
      ...(sourceShare === undefined ? {} : { sourceShare }),
    });
  }
  return out;
}
