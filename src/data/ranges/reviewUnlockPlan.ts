import type { TurnStrategyPack } from "./turnStrategyPack";
import type { TurnReviewVerdictRecord } from "./turnReviewVerdict";

/**
 * Co přečíst, aby se odemklo nejvíc obsahu.
 *
 * Fronta ke čtení se dosud řadila podle odchylky obrany od nabízených kurzů. To
 * je dobré vodítko, **kde hledat chybu**, ale ne odpověď na otázku, kterou má
 * čtenář doopravdy: co mám přečíst, když mám dvě hodiny a rodin je přes padesát.
 * Na tu odpovídá jiné číslo - kolik rozhodnutí ten pack dodává.
 *
 * Rodina má pack na všech třech ulicích a jsou to tři obsahy se třemi otisky.
 * Čte se ale jeden spot: titíž hráči, tytéž stacky, jedna linka. Přečíst je
 * najednou stojí zlomek toho, co tři samostatná sezení, takže se plán počítá po
 * rodinách a ulice jsou uvnitř.
 *
 * Co tenhle modul **neříká**: že je přečtená rodina dobrá. Váha je objem, ne
 * kvalita - odemyká se tím obsah k posouzení, ne k důvěře.
 */

export type ReviewStreet = "FLOP" | "TURN" | "RIVER";

export interface StreetUnlock {
  street: ReviewStreet;
  rules: number;
  /** Pravda, když na ten obsah sedí platný verdikt. */
  alreadyRead: boolean;
}

export interface FamilyUnlock {
  familyId: string;
  streets: readonly StreetUnlock[];
  /** Pravidla, která přečtení odemkne - tedy jen dosud nepřečtená. */
  unlockableRules: number;
  /** Podíl na všech dodávaných pravidlech, 0 až 1. */
  shareOfShipped: number;
  /** Podíl včetně všech rodin před ní v pořadí. */
  cumulativeShare: number;
}

export interface ReviewUnlockPlan {
  rows: readonly FamilyUnlock[];
  /** Pravidla napříč všemi dodávanými packy tří ulic. */
  shippedRules: number;
  /** Pravidla, na která už sedí platný verdikt. */
  readRules: number;
}

function familyOf(pack: TurnStrategyPack): string {
  return pack.familyIds[0] ?? pack.id;
}

/**
 * Sedí na tenhle pack platný verdikt?
 *
 * Otisk se musí shodovat. Verdikt vydaný na jiný obsah neplatí - přesně proto
 * ho `confidenceForFamily` zahazuje - a plán, který by ho počítal jako přečtený,
 * by tvrdil, že je hotovo něco, co hotové není.
 */
function hasValidVerdict(
  pack: TurnStrategyPack,
  street: ReviewStreet,
  verdicts: readonly TurnReviewVerdictRecord[],
): boolean {
  return verdicts.some((item) => (
    item.familyId === familyOf(pack)
    && (item.street ?? "TURN") === street
    && item.contentHash === pack.contentHash
    && item.outcome === "ACCEPTED"
  ));
}

export function planReviewUnlock(
  byStreet: Readonly<Record<ReviewStreet, readonly TurnStrategyPack[]>>,
  verdicts: readonly TurnReviewVerdictRecord[],
): ReviewUnlockPlan {
  const families = new Map<string, StreetUnlock[]>();
  let shippedRules = 0;
  let readRules = 0;

  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    for (const pack of byStreet[street] ?? []) {
      const rules = pack.rules.length;
      shippedRules += rules;
      const alreadyRead = hasValidVerdict(pack, street, verdicts);
      if (alreadyRead) readRules += rules;
      const list = families.get(familyOf(pack)) ?? [];
      list.push({ street, rules, alreadyRead });
      families.set(familyOf(pack), list);
    }
  }

  const rows = [...families]
    .map(([familyId, streets]) => ({
      familyId,
      streets,
      unlockableRules: streets
        .filter((item) => !item.alreadyRead)
        .reduce((sum, item) => sum + item.rules, 0),
    }))
    // Nejvíc odemykající první. Při shodě podle jména, aby bylo pořadí
    // opakovatelné - jinak by se plán měnil mezi běhy a nešel by citovat.
    .sort((left, right) => (
      right.unlockableRules - left.unlockableRules
      || left.familyId.localeCompare(right.familyId)
    ));

  let running = 0;
  return {
    shippedRules,
    readRules,
    rows: rows.map((row) => {
      running += row.unlockableRules;
      return {
        ...row,
        shareOfShipped: shippedRules === 0 ? 0 : row.unlockableRules / shippedRules,
        cumulativeShare: shippedRules === 0 ? 0 : running / shippedRules,
      };
    }),
  };
}

/** Kolik rodin stačí přečíst, aby se odemkl aspoň zadaný podíl obsahu. */
export function familiesNeededFor(plan: ReviewUnlockPlan, targetShare: number): number {
  const index = plan.rows.findIndex((row) => row.cumulativeShare >= targetShare);
  return index === -1 ? plan.rows.length : index + 1;
}
