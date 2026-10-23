/**
 * Zůstal zpřesněný záznam dosažitelný, nebo osiřel?
 *
 * ## Proč to má vlastní soubor
 *
 * Vrstva 0 orchestrace se od začátku ptá „dojde odpověď k hráči". Měřila to ale
 * počtem záznamů a otiskem jejich obsahu, a 7. 10. 2026 se ukázalo, že to nestačí:
 * **záznam může zůstat v packu a přestat být dosažitelný.**
 *
 * Stalo se to při zavádění osy dorovnávajícího. Záznam dostal přesnější klíč
 * `… vsCO @BTN`, jenže na obecnější otázku („hrdina na BB proti otevření z CO")
 * pak v té buňce neodpovídal nikdo. Tři buňky tím přišly o obsah, který byl do
 * té chvíle dosažitelný.
 *
 * **Co to neodhalilo:** počet přijatých záznamů (69 před i po), sada testů ani
 * `valid true, productionReady true` z kontroly importu. Záznamy nezmizely, jen
 * se překlíčovaly. Je to tatáž třída vady jako u dodávky packů, kde se musí
 * počítat otisk pravidel a ne jejich počet - jen o vrstvu výš: ne „kolik
 * záznamů", ale „na kolik z nich se dá zeptat".
 *
 * ## Co se kontroluje
 *
 * Řetěz pádu v `getRangeRecord` jde od nejpřesnějšího klíče k obecnému a končí
 * u záznamu bez os. Každý zpřesněný záznam proto musí mít v packu sourozence
 * **o jednu osu obecnějšího**, jinak je v tom řetězu díra:
 *
 * - záznam s dorovnávajícími → musí existovat záznam téže buňky se sedačkou;
 * - záznam se scénářem → totéž;
 * - záznam se sedačkou → musí existovat obecný záznam té buňky.
 *
 * Nejde o to, že by hráč nedostal **žádnou** odpověď - obecný záznam základního
 * packu tam většinou je. Jde o to, že by dostal **obecnější odpověď, než jakou
 * pack obsahuje**, a nikdo by se to nedozvěděl. To je tichá ztráta obsahu.
 *
 * ## Proč chyba, a ne varování
 *
 * Změřeno 7. 10. 2026 na všech čtyřech produkčních packech (507, 566, 507, 566
 * záznamů) i na kandidátu s vrstvou RYE (576): **nula porušení**. Zavést to jako
 * chybu tedy nic neblokuje a brána padá zavřená - což je u doručení ta správná
 * strana, protože opačná chyba je neviditelná.
 */

import type { ActionContext, Position, StackBucket } from "../../core/types";

/** Záznam tak, jak ho kontrola potřebuje - stačí klíč, obsah ne. */
export interface ReachabilityRecord {
  position: Position;
  bucket: StackBucket;
  context: ActionContext;
  vsSeat?: Position;
  stackSetupId?: string;
  flatCallers?: readonly string[];
}

export interface OrphanedRefinement {
  /** Buňka a osa, která osiřela, v podobě pro hlášku. */
  cell: string;
  /** Která osa je navíc proti nejbližšímu existujícímu sourozenci. */
  axis: "flatCallers" | "stackSetupId" | "vsSeat";
}

const cellOf = (record: ReachabilityRecord): string => (
  `${record.context}|${record.position}|${record.bucket}`
);

const withSeat = (record: ReachabilityRecord): string => (
  `${cellOf(record)}|vs${record.vsSeat ?? ""}`
);

const hasFlat = (record: ReachabilityRecord): boolean => (record.flatCallers?.length ?? 0) > 0;

/**
 * Zpřesněné záznamy, které v packu nemají o osu obecnějšího sourozence.
 *
 * Pořadí os kopíruje řetěz pádu: dorovnávající padá dřív než scénář a ten dřív
 * než sedačka, takže se u každého záznamu ptáme jen na ten **nejbližší** krok.
 */
export function orphanedRefinements(
  records: readonly ReachabilityRecord[],
): OrphanedRefinement[] {
  const seatOnly = new Set<string>();
  const general = new Set<string>();
  for (const record of records) {
    if (!hasFlat(record) && record.stackSetupId === undefined) {
      if (record.vsSeat === undefined) general.add(cellOf(record));
      else seatOnly.add(withSeat(record));
    }
  }

  const orphans: OrphanedRefinement[] = [];
  for (const record of records) {
    if (hasFlat(record)) {
      if (!seatOnly.has(withSeat(record))) {
        orphans.push({ cell: `${withSeat(record)}|@${record.flatCallers?.join("+") ?? ""}`, axis: "flatCallers" });
      }
      continue;
    }
    if (record.stackSetupId !== undefined) {
      if (!seatOnly.has(withSeat(record))) {
        orphans.push({ cell: `${withSeat(record)}|#${record.stackSetupId}`, axis: "stackSetupId" });
      }
      continue;
    }
    if (record.vsSeat !== undefined && !general.has(cellOf(record))) {
      orphans.push({ cell: withSeat(record), axis: "vsSeat" });
    }
  }
  return orphans;
}

/** Hlášky pro kontrolu importu; prázdné pole znamená, že je řetěz pádu celý. */
export function reachabilityErrors(records: readonly ReachabilityRecord[]): string[] {
  return orphanedRefinements(records).map((orphan) => (
    `refined record is unreachable: ${orphan.cell} has no sibling without ${orphan.axis};`
    + " a more precise key must sit beside the general answer, not replace it"
  ));
}
