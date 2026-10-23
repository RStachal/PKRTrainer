import type { TurnReviewVerdictRecord } from "./turnReviewVerdict";

/**
 * Čím je podložená důvěra, kterou pack o sobě tvrdí.
 *
 * V produktu znamená `MEDIUM` na dvou místech dvě různé věci, a to je problém,
 * protože `MEDIUM` je zároveň brána do produkce - `LOW` ji nikde neprojde.
 *
 * - Turn: `MEDIUM` znamená, že obsah přečetl hráč a zapsal verdikt vázaný na
 *   otisk toho, co četl.
 * - Flop: `MEDIUM` znamená, že pack má dohledatelný solverový export a draft
 *   report. O tom, jestli je strategie dobrá, to neříká nic - přesně tu větu má
 *   turnová brána napsanou v komentáři jako důvod, proč zůstává na LOW.
 *
 * Ani jeden standard není sám o sobě nesmysl. Nesmysl je mít oba pod jedním
 * jménem a nikde to neříct, protože pak nikdo nepozná, co `MEDIUM` u konkrétního
 * packu vlastně znamená - a při povyšování do produkce se rozhoduje podle slova,
 * ne podle toho, co za ním stojí.
 *
 * Tenhle modul nic nepřeznačuje. Jen k důvěře dopočítá, čím je podložená, aby to
 * šlo vypsat a změřit. Srovnat ty dva standardy je produktové rozhodnutí, ne
 * úklid v kódu.
 */

export type ConfidenceBacking =
  /** Obsah přečetl člověk a verdikt sedí na aktuální otisk. */
  | "PLAYER_REVIEW"
  /**
   * Obsah prošel měřením, ne čtením.
   *
   * Vlastní hodnota, ne podmnožina `PLAYER_REVIEW`, protože tenhle výpis existuje
   * právě kvůli tomu, aby bylo poznat, co za důvěrou stojí. Mechanická kontrola
   * chytá hrubé rozbití, ne kvalitu hry; dodávat se s ní smí - je to vědomé
   * rozhodnutí, alternativou není přísnější brána, ale obsah, který se k hráči
   * nedostane nikdy - ale říkat jí „přečteno" by byl přesně ten druh záměny,
   * kvůli kterému je provenience v tomhle projektu strukturní pole.
   */
  | "MECHANICAL_REVIEW"
  /** Verdikt existuje, ale byl vydán na jiný obsah. */
  | "STALE_REVIEW"
  /** Pack se odvolává na solverový export nebo review soubor. */
  | "SOLVE_PROVENANCE"
  /** Pack tvrdí důvěru a nic za ní nestojí. */
  | "UNBACKED";

export interface ConfidenceClaim {
  packId: string;
  street: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  backing: ConfidenceBacking;
  /** Pravda, když pack tvrdí víc, než na co má doklad. */
  overclaims: boolean;
  detail: string;
}

export interface ConfidenceClaimInput {
  packId: string;
  street: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  /** Rodina, pod kterou se hledá verdikt hráče. Packy bez rodiny ho mít nemohou. */
  familyId?: string;
  /** Otisk obsahu, proti kterému se ověřuje platnost verdiktu. */
  contentHash?: string;
  /** Kolik dokladů o původu solvu pack nese. */
  sourceEvidenceCount: number;
}

export function classifyConfidenceClaim(
  input: ConfidenceClaimInput,
  verdicts: readonly TurnReviewVerdictRecord[],
): ConfidenceClaim {
  // Rodina **a ulice**. Verdikty jsou po ulicích, takže hledání jen podle rodiny
  // spároval turnový pack s flopovým verdiktem, otisky se nemohly shodovat a
  // výpis hlásil 25 packů jako „verdikt byl vydán na jiný obsah". Ve
  // skutečnosti byl zastaralý jediný. Strážce, který takhle křičí, je horší než
  // žádný: opravdové zastarání se v tom šumu ztratí.
  const street = input.street === "FLOP" || input.street === "RIVER" ? input.street : "TURN";
  const verdict = input.familyId === undefined
    ? undefined
    : verdicts.find((item) => (
      item.familyId === input.familyId && (item.street ?? "TURN") === street
    ));

  let backing: ConfidenceBacking;
  let detail: string;
  if (verdict?.outcome === "ACCEPTED" && verdict.contentHash === input.contentHash) {
    const mechanical = (verdict.basis ?? "PLAYER_READ") === "MECHANICAL";
    backing = mechanical ? "MECHANICAL_REVIEW" : "PLAYER_REVIEW";
    detail = mechanical
      ? `měřením ověřeno ${verdict.reviewedAt} (${verdict.reviewer}); nikdo to nečetl`
      : `přečteno ${verdict.reviewedAt} (${verdict.reviewer})`;
  } else if (verdict !== undefined) {
    backing = "STALE_REVIEW";
    detail = verdict.contentHash === input.contentHash
      ? `verdikt ${verdict.outcome}, ne přijetí`
      : "verdikt byl vydán na jiný obsah";
  } else if (input.sourceEvidenceCount > 0) {
    backing = "SOLVE_PROVENANCE";
    detail = `${input.sourceEvidenceCount} dokladů o původu solvu, ale nikdo strategii nečetl`;
  } else {
    backing = "UNBACKED";
    detail = "žádný doklad";
  }

  // Nad LOW smí jít obsah, který někdo přečetl, nebo který prošel měřením.
  // Mechanická kontrola je vědomě přijatý standard, ne výjimka - ale drží se
  // stranou od čtení, aby šlo změřit, kolik obsahu stojí jen na ní.
  //
  // Dohledatelnost solvu mezi ně nepatří: to je doklad o tom, odkud data jsou,
  // ne o tom, že jsou dobrá.
  const reviewed = backing === "PLAYER_REVIEW" || backing === "MECHANICAL_REVIEW";
  const overclaims = input.confidence !== "LOW" && !reviewed;
  return {
    packId: input.packId,
    street: input.street,
    confidence: input.confidence,
    backing,
    overclaims,
    detail,
  };
}

export function renderConfidenceReport(claims: readonly ConfidenceClaim[]): string {
  const lines = ["Čím je podložená důvěra dodávaných packů", ""];
  for (const claim of [...claims].sort((left, right) => left.packId.localeCompare(right.packId))) {
    const flag = claim.overclaims ? "!" : " ";
    lines.push(
      `${flag} ${claim.confidence.padEnd(6)} ${claim.backing.padEnd(18)} ` +
      `${claim.street.padEnd(6)} ${claim.packId}`,
    );
    lines.push(`      ${claim.detail}`);
  }
  const over = claims.filter((claim) => claim.overclaims);
  const mechanical = claims.filter((claim) => claim.backing === "MECHANICAL_REVIEW");
  const read = claims.filter((claim) => claim.backing === "PLAYER_REVIEW");
  const provenanceOnly = over.filter((claim) => claim.backing === "SOLVE_PROVENANCE");
  const stale = over.filter((claim) => claim.backing === "STALE_REVIEW");
  const unbacked = over.filter((claim) => claim.backing === "UNBACKED");
  lines.push("");
  // **Říct, co chybí, ne že nechybí nic.**
  //
  // Tahle věta zněla „tvrdí víc než LOW, aniž by za tím cokoli stálo", což je o
  // kategorii vedle: `UNBACKED` znamená „žádný doklad" a měřeno 3. 9. 2026 je
  // prázdná. Všech sedm hlášených packů doklad o původu solvu **má** - jen ho
  // nikdo nečetl, a tenhle modul schválně rozlišuje, že dohledatelnost není
  // doklad kvality. Shrnutí to slévalo zpátky dohromady a poslalo by čtenáře
  // hledat chybějící provenienci místo chybějícího čtenáře.
  //
  // Vlastní test tohohle výpisu se přitom celou dobu jmenuje správně: „kolik
  // packů tvrdí víc, **než na co má doklad**". Odchýlila se hláška od něj.
  lines.push(over.length === 0
    ? "Každý pack nad LOW má zapsaný doklad o přečtení nebo měření."
    : `${over.length} packů tvrdí víc než LOW, než na co má doklad`
      + ` (jen původ solvu ${provenanceOnly.length},`
      + ` propadlý verdikt ${stale.length}, bez dokladu ${unbacked.length}).`);
  // Dvě čísla, ne jedno: kolik obsahu stojí na měření a kolik na čtení, je ta
  // otázka, kvůli které tenhle výpis vznikl.
  // Tři čísla, ne dvě. Kolik obsahu stojí jen na dohledatelnosti solvu je právě
  // ten druhý standard, kvůli kterému `MEDIUM` znamená na dvou místech dvě
  // různé věci - bez něj se ta nesrovnalost dá jen popsat, ne změřit.
  lines.push(
    `z toho podloženo měřením ${mechanical.length}, čtením ${read.length},`
    + ` jen dohledatelností solvu ${claims.filter((c) => c.backing === "SOLVE_PROVENANCE").length}`,
  );
  return lines.join("\n");
}
