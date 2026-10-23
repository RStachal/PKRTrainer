/**
 * Jak manifesty vyřešených packů načítají data, a jak se z nich čtou zpátky -
 * jedno místo pro všech pět manifestů (flop, turn, turn-ev, river, river-ev).
 *
 * ## Proč `?raw` a `JSON.parse`, a ne `import()` JSONu
 *
 * Změřeno 14. 10. 2026 `tsc --extendedDiagnostics`: s `resolveJsonModule`
 * odvozuje TypeScript typy pro všech 267 datových JSONů a stojí to **6,37 GB
 * paměti a 38,8 s**; bez nich 0,52 GB a 4,5 s. Manifesty přitom ten typ hned
 * zahazovaly (`module.default as unknown as TurnEvPack`) - TypeScript počítal
 * 6 GB typů, které nikdo nepoužil.
 *
 * `?raw` je pro TypeScript řetězec (deklarace `*?raw` z `vite/client`), takže
 * JSON nečte. U hráče se nemění nic: dřív Vite s `json: { stringify: true }`
 * emitoval `JSON.parse('…')` v chunku, teď emituje řetězec a `JSON.parse` udělá
 * loader. Je to tatáž práce na tomtéž místě, a spotřebitelé (`turnEvRuntime`
 * a spol.) drží načtený balík v mapě, takže se neparsuje dvakrát.
 *
 * ## Proč čtení bydlí tady a snese každý tvar
 *
 * Generátor manifest při každém zápisu **skládá z toho, co z něj přečetl** -
 * takže vzor, který nesedí, položky nezachová, ale tiše zahodí. Stalo se to
 * jednou při přechodu z `.generated` na `.generated.json`: první zápis smazal
 * deset rodin z jedenácti (komentář v `buildTurnStrategyPacks.mts`). Do
 * 15. 10. 2026 bylo těch vzorů pět, každý v jiném generátoru, a dva z nich
 * volitelnou příponu neměly vůbec. Přechod na `?raw` by bez sjednocení smazal
 * z produktu všechny dosavadní rodiny při prvním ranním cyklu.
 *
 * Proto jeden vzor, který snese `.generated`, `.generated.json` i
 * `.generated.json?raw`, a test, který ho zkouší na všech třech.
 */

export interface ManifestEntryRef {
  familyId: string;
  packId: string;
  slug: string;
}

/** Výraz pro pole `load` v manifestu. */
export function manifestLoadExpression(directory: string, slug: string, typeName: string): string {
  return `() => import("./${directory}/${slug}.generated.json?raw")`
    + `.then((module) => JSON.parse(module.default) as ${typeName})`;
}

/**
 * Položky manifestu, jak je generátor potřebuje zachovat.
 *
 * `directory` je podadresář dat (`flop`, `turn`, `turn-ev`, `river`,
 * `river-ev`); za ním musí přijít lomítko, takže `river` nechytí `river-ev`.
 * Slug nesmí obsahovat `?`, aby se `?raw` nedostalo do jména.
 */
export function readManifestEntries(source: string, directory: string): ManifestEntryRef[] {
  const pattern = new RegExp(
    String.raw`familyId: "([^"]+)",\s*\n\s*packId: "([^"]+)",[\s\S]*?`
      + String.raw`import\("\.\/${directory}\/([^"?]+)\.generated(?:\.json)?(?:\?raw)?"\)`,
    "g",
  );
  return [...source.matchAll(pattern)].map((match) => ({
    familyId: match[1],
    packId: match[2],
    slug: match[3],
  }));
}
