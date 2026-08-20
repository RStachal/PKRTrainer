import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

/**
 * Celý cyklus po noční práci jedním příkazem.
 *
 *   npm run mtt:after-night             # co by se změnilo, nic nezapíše
 *   npm run mtt:after-night -- --write  # provede
 *
 * ## Proč to existuje
 *
 * Noc dodá nový rozklad, ale k hráči se nedostane sám: packy se generují zvlášť,
 * důvěru zvedá až kontrola a ta se musí propsat dalším generováním. Ten sled je
 * pokaždé stejný a dělal se ručně - dvacet rodin krát tři ulice krát dva
 * průchody, mezi tím kontrola, na konci ověření. Zhruba dvacet pět minut
 * dohledu nad prací, ve které se nerozhoduje o ničem.
 *
 * Co se tím nemění: **necommituje se**. Rozhodnout, jestli je výsledek v pořádku
 * a jak se popíše, je úsudek, ne krok cyklu.
 *
 * ## Proč dvakrát generovat
 *
 * Napoprvé vznikne obsah a jeho otisk. Kontrola pak vydá verdikt vázaný právě na
 * ten otisk. Důvěra se ale do packu zapisuje při generování, takže se musí
 * proběhnout znovu - jinak verdikt existuje a pack o něm neví.
 *
 * Druhý průchod už otisk nemění: velikost packu na důvěře nezávisí, o což se
 * stará `trimToModuleBudget`. Kdyby závisela, točilo by se to donekonečna, a
 * přesně to se jednou stalo.
 */

const write = process.argv.includes("--write");
const withEv = process.argv.includes("--ev");
const WORK = "artifacts/decomposition";

/**
 * Skripty se volají přímo, ne přes `npm run`.
 *
 * Na Windows Node od dvacítky odmítá spustit `.cmd` bez shellu (EINVAL), a se
 * shellem hlásí DeprecationWarning o neescapovaných argumentech - a tenhle
 * cyklus volá přes stovku skriptů, takže by to byla stovka varování v logu, ve
 * kterém se má poznat, co selhalo. `mttContentRisks` naráží na totéž a řeší to
 * stejně: přímo `run-cli.mjs`.
 */
const SCRIPT_PATH: Readonly<Record<string, string>> = {
  "mtt:flop-pack": "scripts/buildFlopStrategyPacks.mts",
  "mtt:turn-pack": "scripts/buildTurnStrategyPacks.mts",
  "mtt:river-pack": "scripts/buildRiverStrategyPacks.mts",
  "mtt:mechanical-review": "scripts/runMechanicalReview.mts",
  "mtt:playable-beta": "scripts/checkMttPlayableBeta.mts",
  "bundle:budget": "scripts/checkBundleBudget.mts",
};

function run(script: string, args: string[] = []): string {
  const path = SCRIPT_PATH[script];
  if (path === undefined) throw new Error(`neznámý skript ${script}`);
  return execFileSync(process.execPath, ["scripts/run-cli.mjs", path, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Čísla, kterými se měří, jestli cyklus něco přinesl. */
function snapshot(): Record<string, string> {
  const out = run("mtt:playable-beta");
  const counts: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const match = /^(solved (?:TURN|FLOP|RIVER) families|preflop production|six-max production): (.+)$/.exec(line.trim());
    if (match !== null) counts[match[1]] = match[2].trim();
  }
  return counts;
}

function families(): string[] {
  return [...new Set(
    readdirSync(WORK)
      .filter((name) => name.includes("__"))
      .map((name) => name.split("__")[0]),
  )].sort();
}

function generateAll(list: readonly string[], label: string): void {
  console.log(`\n[${label}] generuji packy pro ${list.length} rodin`);
  let failed = 0;
  for (const family of list) {
    for (const street of ["flop", "turn", "river"] as const) {
      const args = [`--family=${family}`, "--write", ...(withEv && street === "river" ? ["--ev"] : [])];
      try {
        run(`mtt:${street}-pack`, args);
      } catch {
        // Odmítnutá rodina není chyba cyklu: generátor odmítá neúplné a nahrazené
        // rodiny schválně a hlásí proč. Cyklus jen nesmí kvůli tomu spadnout.
        failed += 1;
      }
    }
  }
  console.log(`[${label}] hotovo, ${failed} kombinací rodina+ulice generátor odmítl`);
}

const before = snapshot();
console.log("Cyklus po noční práci");
console.log("");
console.log("stav před:");
for (const [key, value] of Object.entries(before)) console.log(`  ${key}: ${value}`);

if (!write) {
  console.log("");
  console.log("Nic se nespustilo. Provedení: npm run mtt:after-night -- --write");
  console.log("Přidej --ev, když se má přepočítat i EV (kolem pěti minut na rodinu).");
} else {
  const list = families();
  generateAll(list, "1/3");

  console.log("\n[2/3] mechanická kontrola");
  const review = run("mtt:mechanical-review", ["--write"]);
  for (const line of review.split("\n")) {
    if (/prošlo měřením|neprošlo|čteno člověkem|Zapsáno/.test(line)) console.log(`  ${line.trim()}`);
  }

  generateAll(list, "3/3");

  const after = snapshot();
  console.log("\nstav po:");
  for (const [key, value] of Object.entries(after)) {
    const changed = before[key] !== value;
    console.log(`  ${key}: ${value}${changed ? `   (bylo: ${before[key]})` : ""}`);
  }

  console.log("\nověření");
  try {
    // `tsc --noEmit` přímo: build je npm skript, ne `.mts`, a typová kontrola je
    // ta půlka, která po přegenerování obsahu může spadnout.
    execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"], {
      encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
    console.log("  typová kontrola: ok");
  } catch (error) {
    console.log("  typová kontrola: SELHALA");
    console.log(String((error as { stdout?: string }).stdout ?? "").split("\n").slice(0, 5).join("\n"));
    process.exitCode = 1;
  }
  try {
    run("bundle:budget");
    console.log("  rozpočty: ok");
  } catch (error) {
    console.log("  rozpočty: SELHALY");
    console.log(String((error as { stdout?: string }).stdout ?? "").split("\n").slice(-3).join("\n"));
    process.exitCode = 1;
  }
  console.log("  sada: spusť zvlášť (npx vitest run) - trvá minuty a nemá smysl ji schovávat do cyklu");
  console.log("\nNecommitováno schválně: co se změnilo a jestli je to v pořádku, je úsudek.");
}
