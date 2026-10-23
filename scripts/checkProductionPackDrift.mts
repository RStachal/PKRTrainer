import type { AnteMode } from "../src/core/types";
import { allMttPreflopRangePacks } from "../src/data/ranges/mttPreflopRangePacks";
import type { RangePack } from "../src/data/ranges/rangePack";
import { createMttProductionLazyLoader } from "../src/data/ranges/mttProductionLazyLoader";
import { RYE_PROVENANCE } from "./lib/ryeRefinedCandidate.mts";

/**
 * Drží produkční preflop packy krok s legacy daty, nad kterými se měří?
 *
 *   npm run mtt:preflop-drift
 *
 * ## Proč to musí vzniknout
 *
 * Změřeno 17. 9. 2026: produkční packy (to, co hráč ve čtyřech chipEV
 * profilech doopravdy dostane) byly snímek legacy dat z **16. 7. 2026**.
 * Všechno, co se od té doby v ranžích opravilo podle vlastníkových chartů -
 * push/fold na jeho baseline (4. 8.), re-jam 15-30 bb a range, která ho
 * dorovnává (31. 7.), BB proti limpu (4. 8.), shove malých párů na 15 bb,
 * opravy časných sedaček (6.-7. 8.) - šlo do `strategy.ts` a generovaných
 * legacy souborů, tedy do packu `…-ante-off-v1` (1.0.0). Ten měří celá sada
 * (`btnOpenRangeWidth`, `actionEvCoverage`, `mtt:post-answer`), ale hráč ho
 * nevidí: `startableMttPreflopRangePack` dá produkčnímu profilu produkční pack.
 * Rozdíl byl 2 971 tříd v ante OFF a 2 884 v ante ON (RFI 65-84 buněk z 88,
 * VS_OPEN 31, VS_LIMP 11, PUSH_FOLD 13-16, VS_ALLIN 15-30 bb chybělo úplně).
 *
 * Dvě měsíce nikdo nic nepoznal, protože sada i brány měřily legacy pack a
 * produkční pack neměřilo nic. Tohle je ta brána: obecné záznamy produkčního
 * packu se musí rovnat legacy packu téhož profilu, s výjimkou záznamů, které
 * nesou původ RYE (vrstva zpřesněných záznamů a push/fold 10 bb, rozhodnutí
 * vlastníka 16. a 17. 9. 2026). Turbo profily se porovnávají s regular legacy
 * packem, protože tak vznikají (reuse BLIND_SPEED).
 *
 * Nenulový kód znamená: přestagovat základ (`mtt:p1-preflop-drafts`,
 * `mtt:p1-stage-reviewed-preflop`), pak `mtt:rye-candidate`, validate, build.
 */

const key = (record: RangePack["records"][number]): string => `${record.context}|${record.position}|${record.bucket}|${record.vsSeat ?? ""}`;
// Stejná kanonizace jako v `buildMttP1PreflopDrafts` (`canonicalActionForContext`):
// legacy `VS_LIMP` říká `LIMP`, import `OVERLIMP`. Jinak by brána hlásila
// drift na 11 buňkách BB proti limpu, který je jen jiným jménem téhož.
const canonical = (context: string, action: string): string => (context === "VS_LIMP" && action === "LIMP" ? "OVERLIMP" : action);
const body = (record: RangePack["records"][number]): string => JSON.stringify(
  Object.entries(record.strict)
    .map(([hand, actions]) => [hand, actions.map((action) => canonical(record.context, action)).sort()] as const)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .sort(),
);

function findPack(ante: AnteMode, blindSpeed: "REGULAR" | "TURBO", production: boolean): RangePack | undefined {
  return allMttPreflopRangePacks.find((pack) => (
    pack.dimensions.tableFormat === "FULL_RING_9" && pack.dimensions.evModel === "CHIP_EV"
    && pack.dimensions.blindSpeed === blindSpeed && pack.dimensions.ante === ante
    && pack.records.length > 0 && /-production-v\d+$/.test(pack.id) === production
  ));
}

await createMttProductionLazyLoader().loadAll();

let failures = 0;
console.log("Drift produkčních preflop packů proti legacy datům");
console.log("");
for (const blindSpeed of ["REGULAR", "TURBO"] as const) {
  for (const ante of ["OFF", "ON"] as AnteMode[]) {
    const legacy = findPack(ante, "REGULAR", false);
    const production = findPack(ante, blindSpeed, true);
    if (legacy === undefined || production === undefined) {
      console.log(`${blindSpeed} / ante ${ante}: chybí ${legacy === undefined ? "legacy" : "produkční"} pack`);
      failures += 1;
      continue;
    }
    const L = new Map(legacy.records.map((record) => [key(record), record]));
    let same = 0;
    let exempt = 0;
    const drifted: string[] = [];
    const missing: string[] = [];
    for (const record of production.records) {
      if ((record.provenance ?? "").startsWith(RYE_PROVENANCE)) { exempt += 1; continue; }
      const twin = L.get(key(record));
      if (twin === undefined) { missing.push(key(record)); continue; }
      if (body(twin) === body(record)) same += 1;
      else drifted.push(key(record));
    }
    const onlyLegacy = [...L.keys()].filter((cell) => !production.records.some((record) => key(record) === cell));
    const ok = drifted.length === 0 && missing.length === 0 && onlyLegacy.length === 0;
    if (!ok) failures += 1;
    console.log(`${production.id} (${production.version})`);
    console.log(`  proti ${legacy.id} (${legacy.version}): shodných ${same}, z RYE ${exempt}, ` +
      `liší se ${drifted.length}, jen v produkci ${missing.length}, jen v legacy ${onlyLegacy.length} → ${ok ? "OK" : "DRIFT"}`);
    for (const cell of [...drifted.slice(0, 6), ...missing.slice(0, 3), ...onlyLegacy.slice(0, 3)]) console.log(`    ${cell}`);
  }
}
console.log("");
if (failures > 0) {
  console.log("Produkční pack se rozešel s legacy daty: přestagovat základ (mtt:p1-preflop-drafts, mtt:p1-stage-reviewed-preflop), pak mtt:rye-candidate, validate:range-import, build:range-module.");
  process.exitCode = 1;
} else {
  console.log("Hráč dostává totéž, co měří sada - plus vrstvu RYE.");
}
