import { createMttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";
import type { RangePack } from "../src/data/ranges/rangePack";
import { REFINEMENT_AXES, refinementValueOf } from "../src/data/ranges/rangePack";

/**
 * Co z RYE má hráč dnes v ruce - zpřesněné záznamy v **dodávaných** packech.
 *
 *   npm run mtt:shipped-refinements
 *
 * ## Proč zvlášť od kandidáta
 *
 * Povýšení jde `artifacts/rye-import/candidate` → `build:range-module` →
 * `src/data/ranges/<pack>.ts`. **Nejde** přes `Agents/range-intake/raw`, kde
 * zůstává jen obecný základ - srovnat kandidáta proti `raw/` proto vypadá jako
 * velký nedodaný balík a je to srovnání základu se základem plus vrstvou.
 *
 * 13. 10. 2026 jsem na to narazil: z „raw má 11 zpřesněných, kandidát 69" jsem
 * usoudil, že chybí 58 záznamů, a pak našel commit `a466929`, který dodal 57
 * záznamů do modulu a `raw/` nechal být. Jediné číslo, které o hráči něco
 * tvrdí, je tedy to z načteného packu - a to tenhle skript tiskne.
 *
 * Provenience se počítá zvlášť, protože rozhodnutí 7a vlastníka (22. 9. 2026)
 * říká, že RYE vrstva patří jen do profilů s **ante ON**; ante OFF zůstává
 * u vlastního exportu. Jestli se to drží, se bez rozpadu podle provenience
 * ověřit nedá.
 */

function isRangePack(pack: unknown): pack is RangePack {
  return (
    typeof pack === "object" &&
    pack !== null &&
    Array.isArray((pack as { records?: unknown }).records)
  );
}

async function main(): Promise<void> {
  const packs = await createMttProductionLazyLoader().loadAll();

  console.log("Zpřesněné záznamy v dodávaných packech\n");

  for (const pack of packs) {
    if (!isRangePack(pack)) continue;

    let refined = 0;
    const byAxes = new Map<string, number>();
    let rye = 0;
    let other = 0;
    let noProvenance = 0;

    for (const record of pack.records) {
      const present = REFINEMENT_AXES.filter(
        (axis) => refinementValueOf(record, axis) !== undefined,
      );
      if (present.length === 0) continue;
      refined += 1;
      const key = present.join("+");
      byAxes.set(key, (byAxes.get(key) ?? 0) + 1);

      const provenance = String(
        (record as { provenance?: string }).provenance ?? "",
      );
      if (provenance === "") noProvenance += 1;
      else if (provenance.includes("RYE")) rye += 1;
      else other += 1;
    }

    if (refined === 0 && pack.records.length === 0) continue;

    console.log(String(pack.id));
    console.log(
      `  záznamů ${pack.records.length}, zpřesněných ${refined}` +
        `  (RYE ${rye}, jiný zdroj ${other}, bez provenience ${noProvenance})`,
    );
    if (byAxes.size > 0) {
      const detail = [...byAxes.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `${key} ${count}`);
      console.log(`  po osách: ${detail.join(", ")}`);
    }
    // Rozhodnutí 7a: RYE jen do ante ON. Porušení se musí ozvat, ne čekat
    // na to, že si někdo projde provenience ručně.
    const anteOff = String(pack.id).includes("ante-off");
    if (anteOff && rye > 0) {
      console.log(
        `  !! ${rye} RYE záznamů v profilu s ante OFF - proti rozhodnutí 7a (22. 9. 2026)`,
      );
    }
    console.log("");
  }
}

await main();
