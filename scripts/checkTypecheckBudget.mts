import { spawnSync } from "node:child_process";

/**
 * Typecheck aplikace se stropem na paměť.
 *
 *   npm run typecheck        # volá tohle místo holého `tsc`
 *
 * ## Proč strop
 *
 * Do 15. 10. 2026 potřeboval typecheck **6,37 GB paměti a 38,8 s** a halda se
 * kvůli tomu dvakrát zvedala (naposledy na 8 GB). Změřeno `--extendedDiagnostics`:
 * 92 % té paměti šlo na odvozování typů pro 267 datových JSONů, které manifesty
 * importovaly a typ hned zahodily (`as unknown as`). Po přechodu na `?raw`
 * (`scripts/lib/manifestEntries.mts`) je to **0,52 GB a 5,6 s**.
 *
 * Kdyby se data do typového systému vrátila - nový manifest psaný postaru,
 * import JSONu odjinud - nic by to neohlásilo: typecheck by jen zase pomalu
 * rostl s každou rodinou, a to je přesně to „aplikace je s každým rozvojem
 * pomalejší", kvůli kterému se to měřilo. Strop to udělá viditelným hned.
 *
 * ## Proč zrovna tahle čísla
 *
 * Paměť je deterministická, čas ne (skáče se souběhem), takže brána padá jen
 * na paměti. 1,5 GB je trojnásobek dnešní hodnoty: s rezervou na růst kódu,
 * ale hluboko pod tím, co by dala jediná vrácená tabulka dat. Halda pro samotný
 * proces je 3 GB jako pojistka, aby i pád na ní skončil zprávou níž.
 */

const MEMORY_CEILING_KB = 1_536 * 1_024;
const HEAP_MB = 3_072;

const result = spawnSync(
  process.execPath,
  [
    `--max-old-space-size=${HEAP_MB}`,
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "--extendedDiagnostics",
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const errors = output.split(/\r?\n/).filter((line) => /error TS\d+/.test(line));
const memoryKb = Number(/Memory used:\s+(\d+)K/.exec(output)?.[1] ?? Number.NaN);
const totalSeconds = /Total time:\s+([\d.]+)s/.exec(output)?.[1] ?? "?";
const jsonLines = /Lines of JSON:\s+(\d+)/.exec(output)?.[1] ?? "?";

for (const line of errors) console.error(line);

const memoryGb = (memoryKb / 1_024 / 1_024).toFixed(2);
console.log(
  `typecheck: ${Number.isFinite(memoryKb) ? memoryGb : "?"} GB paměti`
  + ` (strop ${(MEMORY_CEILING_KB / 1_024 / 1_024).toFixed(1)} GB), ${totalSeconds} s,`
  + ` řádků JSONu ${jsonLines}, chyb ${errors.length}`,
);

if (result.status !== 0 && errors.length === 0) {
  // tsc spadl bez typové chyby - nejspíš na haldě. To je právě ten případ,
  // kdy se data vrátila do typového systému, tak se to musí říct nahlas.
  console.error(`tsc skončil kódem ${result.status ?? "?"} bez typové chyby - nejspíš došla halda (${HEAP_MB} MB).`);
  console.error("Zkontroluj, jestli něco neimportuje datový JSON přímo místo `?raw` (viz manifestEntries.mts).");
  process.exit(1);
}
if (errors.length > 0) process.exit(1);
if (!Number.isFinite(memoryKb)) {
  console.error("Ve výstupu tsc chybí „Memory used“ - strop nejde ověřit, a neověřený strop nesmí projít.");
  process.exit(1);
}
if (memoryKb > MEMORY_CEILING_KB) {
  console.error(
    `Typecheck potřebuje ${memoryGb} GB, strop je ${(MEMORY_CEILING_KB / 1_024 / 1_024).toFixed(1)} GB.`
    + ` Řádků JSONu: ${jsonLines} - pokud je to víc než 0, vrátila se data do typového systému.`,
  );
  process.exit(1);
}
