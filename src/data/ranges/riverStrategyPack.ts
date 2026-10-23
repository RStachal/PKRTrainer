import type { RiverStrategyRule } from "./riverStrategyRuleBuilder";
import { reviewTurnFamily, type TurnFamilyEvidence } from "./turnReviewGate";
import {
  confidenceForFamily,
  turnRuleContentHash,
  type TurnReviewVerdictRecord,
} from "./turnReviewVerdict";
import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Pack z jedné riverové rodiny, nebo důvod, proč ne.
 *
 * Tvar je turnový a to je záměr. Řádek strategie se mezi ulicemi neliší - deska,
 * hloubka, uzel, kbelíky ruk; liší se jen počet karet na stole a to, že po
 * riveru už nic nenásleduje. Druhý skoro totožný typ by znamenal dvě místa, kde
 * se opravuje jedna chyba.
 *
 * ## Co znamená „deska" na riveru
 *
 * U turnu je jednotka pokrytí flop deska: rodina jich má dvacet až třicet a
 * brána se ptá, kolik z nich se rozložilo. Na riveru je jednotka turnová podhra,
 * protože riverová vrstva se plánuje z jedné vyřešené turnové podhry. Rodina
 * jich má stovky a vrstvu dostane hrstka - takže pokrytí bude nízké a má být
 * vidět. Pack odpovídá jen na desky, které vyřešil, a na ostatní se přizná.
 *
 * ## Důvěra
 *
 * LOW a zůstává LOW. Turnová cesta z LOW ven vede přes hráčovo čtení; riverová
 * zatím žádnou nemá, takže tvrdit víc než LOW by znamenalo vydávat neprověřený
 * obsah za prověřený. Brána kontroluje tvar solvu, ne jestli je strategie dobrá.
 */
export type RiverStrategyPack = Omit<TurnStrategyPack, "dimensions" | "rules"> & {
  dimensions: Omit<TurnStrategyPack["dimensions"], "street"> & { street: "RIVER" };
  rules: readonly RiverStrategyRule[];
};

export interface RiverPackBuildInput {
  id: string;
  createdAt: string;
  /**
   * Důkazy o rodině, v riverových jednotkách.
   *
   * `boards` jsou turnové podhry, které dostaly riverovou vrstvu, a
   * `boardsWithCheckpoint` ty, které ji dostat mohly. Brána je turnová a její
   * kontroly - dohledatelnost, úplnost, pokrytí - na riveru platí beze změny,
   * jen ta slova znamenají o ulici dál.
   */
  evidence: TurnFamilyEvidence;
  /** Zaznamenané verdikty hráčů. Bez nich zůstává rodina na LOW. */
  verdicts?: readonly TurnReviewVerdictRecord[];
  rules: readonly RiverStrategyRule[];
}

export type RiverPackBuildResult =
  | { ok: true; pack: RiverStrategyPack }
  | { ok: false; reason: string };

export function buildRiverStrategyPack(input: RiverPackBuildInput): RiverPackBuildResult {
  const verdict = reviewTurnFamily(input.evidence);
  if (!verdict.readyForReview) {
    const first = verdict.findings[0]?.detail ?? "no detail";
    return { ok: false, reason: `${input.evidence.familyId} blocked at ${verdict.failedTier}: ${first}` };
  }
  if (input.rules.length === 0) {
    return { ok: false, reason: `${input.evidence.familyId} passed the gate but produced no rules` };
  }

  const mismatched = input.rules.find((rule) => rule.familyId !== input.evidence.familyId);
  if (mismatched !== undefined) {
    // Pravidlo z jiné rodiny by dodalo strategii jednoho solvu pod jménem
    // druhého, a to je selhání, které dál po cestě nikdo nepozná.
    return {
      ok: false,
      reason: `${input.evidence.familyId}: rule from ${mismatched.familyId} in the same pack`,
    };
  }
  const wrongStreet = input.rules.find((rule) => rule.street !== "RIVER");
  if (wrongStreet !== undefined) {
    return { ok: false, reason: `${input.evidence.familyId}: rule that is not a river rule` };
  }

  const first = input.rules[0];
  // Důvěra se řídí verdiktem, ne přáním, a stejným pravidlem jako u turnu.
  // Natvrdo LOW znamenalo, že přečíst tuhle ulici nešlo ani teoreticky.
  const contentHash = turnRuleContentHash(input.rules);
  const { confidence, reason } = confidenceForFamily(
    input.evidence.familyId,
    contentHash,
    input.verdicts ?? [],
    "RIVER",
  );
  const boardsAnswered = new Set(
    input.rules.map((rule) => `${rule.riverSpot.turnBoard.join("")}${rule.riverSpot.riverCard}`),
  ).size;

  return {
    ok: true,
    pack: {
      id: input.id,
      version: "river-solved-v1",
      createdAt: input.createdAt,
      provenance: "SOLVER_BACKED",
      confidence,
      contentHash,
      dimensions: {
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeeds: ["REGULAR"],
        street: "RIVER",
        evModel: "CHIP_EV",
        antes: ["OFF", "ON"],
      },
      familyIds: [input.evidence.familyId],
      assumptions: [
        `Postaveno z ${input.rules.length} vyřešených riverových podher nad ${input.evidence.boards} turnovými podhrami.`,
        `Odpovídá na ${boardsAnswered} konkrétních pětikaretních desek a na žádnou jinou.`,
        ...(verdict.boardCoverage < 1 ? [
          `Riverovou vrstvu dostalo ${(verdict.boardCoverage * 100).toFixed(1)} % turnových podher rodiny; na zbytek pack neodpovídá.`,
        ] : []),
        `Position pattern ${verdict.positionPattern}, ${first.node}, ${first.stackBB}BB effective.`,
        "Velikosti sázek nesou solverovy vlastní popisky v žetonech; překlad potřebuje pot v uzlu.",
        "Frekvence uvnitř třídy ruk jsou průměr přes její kombinace, takže třída nerozliší preferenci mezi nimi.",
        `Důvěra ${confidence}: ${reason}. Brána kontroluje tvar solvu, ne jestli je strategie dobrá - to pozná jen hráč.`,
        "Každé pravidlo nese adresář, ve kterém vzniklo, takže každá odpověď je dohledatelná ke svému běhu.",
      ],
      rules: input.rules,
    },
  };
}
