import type { FlopStrategyRule } from "./flopStrategyRuleBuilder";
import { reviewTurnFamily, type TurnFamilyEvidence } from "./turnReviewGate";
import {
  confidenceForFamily,
  turnRuleContentHash,
  type TurnReviewVerdictRecord,
} from "./turnReviewVerdict";
import type { TurnStrategyPack } from "./turnStrategyPack";

/**
 * Pack z jedné flopové rodiny, nebo důvod, proč ne.
 *
 * Tvar je turnový, protože řádek strategie je mezi ulicemi tentýž. Jednotkou
 * pokrytí je flopová deska: rodina jich má dvacet až třicet a brána se ptá,
 * kolik z nich má checkpoint.
 *
 * ## Důvěra
 *
 * LOW a zůstává LOW. Platí totéž co pro turn a river: brána kontroluje tvar
 * solvu, ne jestli je strategie dobrá, a to pozná až hráč.
 *
 * ## Vztah k pilotnímu flopu
 *
 * Tenhle obsah pilotní packy nenahrazuje. Ty odpovídají na třídy textur, tedy
 * skoro vždycky; tenhle odpovídá na konkrétní desku a na ostatní se přizná.
 * V řetězci proto stojí před nimi: kde je přesná odpověď, má přednost, a kde
 * není, odpoví agregát jako dosud.
 */
export type FlopSolvedStrategyPack = Omit<TurnStrategyPack, "dimensions" | "rules"> & {
  dimensions: Omit<TurnStrategyPack["dimensions"], "street"> & { street: "FLOP" };
  rules: readonly FlopStrategyRule[];
};

export interface FlopPackBuildInput {
  id: string;
  createdAt: string;
  evidence: TurnFamilyEvidence;
  /** Zaznamenané verdikty hráčů. Bez nich zůstává rodina na LOW. */
  verdicts?: readonly TurnReviewVerdictRecord[];
  rules: readonly FlopStrategyRule[];
}

export type FlopPackBuildResult =
  | { ok: true; pack: FlopSolvedStrategyPack }
  | { ok: false; reason: string };

export function buildFlopSolvedStrategyPack(input: FlopPackBuildInput): FlopPackBuildResult {
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
    return {
      ok: false,
      reason: `${input.evidence.familyId}: rule from ${mismatched.familyId} in the same pack`,
    };
  }
  const wrongStreet = input.rules.find((rule) => rule.street !== "FLOP");
  if (wrongStreet !== undefined) {
    return { ok: false, reason: `${input.evidence.familyId}: rule that is not a flop rule` };
  }

  const first = input.rules[0];
  // Důvěra se řídí verdiktem, ne přáním, a stejným pravidlem jako u turnu.
  // Natvrdo LOW znamenalo, že přečíst tuhle ulici nešlo ani teoreticky.
  const contentHash = turnRuleContentHash(input.rules);
  const { confidence, reason } = confidenceForFamily(
    input.evidence.familyId,
    contentHash,
    input.verdicts ?? [],
    "FLOP",
  );
  const boardsAnswered = new Set(input.rules.map((rule) => rule.flopSpot.flop.join(""))).size;

  return {
    ok: true,
    pack: {
      id: input.id,
      version: "flop-solved-v1",
      createdAt: input.createdAt,
      provenance: "SOLVER_BACKED",
      confidence,
      contentHash,
      dimensions: {
        gameVariant: "MTT",
        tableFormat: "FULL_RING_9",
        blindSpeeds: ["REGULAR"],
        street: "FLOP",
        evModel: "CHIP_EV",
        antes: ["OFF", "ON"],
      },
      familyIds: [input.evidence.familyId],
      assumptions: [
        `Postaveno z ${input.rules.length} vyřešených flopových rozhodnutí na ${boardsAnswered} deskách.`,
        "Odpovídá na ty desky a na žádnou jinou; na ostatní dál platí texturní agregát.",
        ...(verdict.boardCoverage < 1 ? [
          `Rodina pokrývá ${(verdict.boardCoverage * 100).toFixed(0)} % dostupných desek; zbytek nemá checkpoint.`,
        ] : []),
        `Position pattern ${verdict.positionPattern}, ${first.node}, ${first.stackBB}BB effective.`,
        "Velikosti sázek nesou solverovy vlastní popisky v žetonech; překlad potřebuje pot v uzlu.",
        "Frekvence uvnitř třídy ruk jsou průměr přes její kombinace, takže třída nerozliší preferenci mezi nimi.",
        `Důvěra ${confidence}: ${reason}. Brána kontroluje tvar solvu, ne jestli je strategie dobrá - to pozná jen hráč.`,
        "Každé pravidlo nese rodinu, ve které vzniklo, takže každá odpověď je dohledatelná ke svému běhu.",
      ],
      rules: input.rules,
    },
  };
}
