/**
 * Je turnový pack starší než rozklad desek, ze kterých jsou jeho pravidla?
 *
 * ## Proč (od 22. 10. 2026)
 *
 * `MTT9_25BB_LJ_BTN_SRP` se 30. 9. 2026 přesolvovala na nové range a 5. 10. se
 * všech šest jejích desek rozložilo znovu (742r ze 234 podher na 156). Turnový
 * pack se ale nepřegeneroval - pořád je z 12. 9., tedy ze starého řešení - a
 * proč generování v plném cyklu 19. 10. selhalo, cyklus nezapsal. Ráno
 * 22. 10. pak přibyly riverové vrstvy, tabulka turnové EV zastarala a builder
 * ji přepočítal: pravidla starého packu spároval s podhrami nového rozkladu
 * **podle jmen linek**. Na pěti deskách tak vznikla EV z jiného řešení, než ze
 * kterého je strategie, a na 742r, kde se strom změnil, 31 pravidel o EV
 * přišlo (70,8 % hodnot → 52,5 %).
 *
 * Builder proto rodinu, jejíž pack je starší než rozklad některé jeho desky,
 * nepřepočítá: stará tabulka zůstane, protože sedí na starý pack, a hlásí se,
 * že je nejdřív potřeba přegenerovat turnový pack.
 *
 * `createdAt` packu je jen datum, takže se porovnává s koncem toho dne. Rozklad
 * týž den po cyklu se tím nepozná, jenže nový rozklad desky, kterou pack už
 * nese, přichází v noci po cyklu - tedy po půlnoci, a ten se pozná.
 */
export interface PackForAge {
  createdAt?: string;
  rules: readonly ({ sourceDirectory?: string } | null)[];
}

/** Desky packu, jejichž `plan.json` je novější než pack. Prázdné pole = v pořádku. */
export function boardsDecomposedAfterPack(
  pack: PackForAge,
  planMtimeMs: (boardDirectory: string) => number | undefined,
): string[] {
  if (pack.createdAt === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(pack.createdAt)) return [];
  const [year, month, day] = pack.createdAt.split("-").map(Number);
  const endOfCreatedDay = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  const boards = new Set<string>();
  for (const rule of pack.rules) {
    if (rule?.sourceDirectory !== undefined) boards.add(rule.sourceDirectory);
  }
  return [...boards]
    .filter((board) => {
      const planned = planMtimeMs(board);
      return planned !== undefined && planned > endOfCreatedDay;
    })
    .sort();
}
