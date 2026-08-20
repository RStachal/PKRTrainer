import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Co běží, co čeká a co se smí spustit vedle sebe.
 *
 *   npm run mtt:processes
 *
 * ## Proč
 *
 * Práce v tomhle projektu se dělí na tři třídy a plést si je stojí hodiny.
 * Výhradní si berou celý stroj, paralelizovatelné ne, a některé souběhy jsou
 * přímo zakázané - ne z opatrnosti, ale protože se změřily.
 *
 * Nejdražší z nich: sada spuštěná vedle něčeho náročného trvala 764 vteřin místo
 * 250 a **deset testů spadlo, aniž by v kódu byla vada**. Tohle je jediné místo,
 * kde je ta znalost napsaná tak, že se dá přečíst před spuštěním, ne až po něm.
 *
 * ## Co to nedělá
 *
 * Nic nespouští ani nezastavuje. Je to pohled, ne řídicí panel: rozhodnout, že
 * se něco pustí nebo zabije, znamená vědět proč, a to z výpisu nevyplývá.
 */

const OUTPUT_BASE = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const STAGED = "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters/pkrtrainer_mtt_seat_pair_expansion_v1";
const WORK = "artifacts/decomposition";

interface TaskRow { name: string; state: string; next: string; last: string }

/** Naplánované úlohy projektu, přečtené z Windows, ne z našeho seznamu. */
function scheduledTasks(): TaskRow[] {
  try {
    const out = execFileSync("schtasks", ["/query", "/fo", "csv", "/v"], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    });
    const lines = out.split("\n").filter((line) => line.includes("PKRTrainer"));
    return lines.map((line) => {
      const cells = line.split('","').map((cell) => cell.replace(/^"|"$/g, ""));
      return {
        name: (cells[1] ?? "").replace(/^\\/, ""),
        next: cells[2] ?? "?",
        state: cells[3] ?? "?",
        last: cells[6] ?? "?",
      };
    }).filter((row) => row.name !== "");
  } catch {
    return [];
  }
}

/** Procesy, které si berou stroj. */
function runningHeavy(): { name: string; count: number }[] {
  const found: { name: string; count: number }[] = [];
  for (const name of ["console_solver", "python", "node"]) {
    try {
      const out = execFileSync("tasklist", ["/fi", `IMAGENAME eq ${name}.exe`, "/fo", "csv"], {
        encoding: "utf8",
      });
      const count = out.split("\n").filter((line) => line.toLowerCase().includes(`${name}.exe`)).length;
      if (count > 0) found.push({ name, count });
    } catch { /* proces prostě neběží */ }
  }
  return found;
}

function countStagedPending(): { total: number; pending: number } {
  if (!existsSync(STAGED)) return { total: 0, pending: 0 };
  let total = 0;
  let pending = 0;
  for (const name of readdirSync(STAGED)) {
    if (!name.endsWith(".txt")) continue;
    total += 1;
    const stem = name.replace(/^\d+_/, "").replace(/\.txt$/, "");
    const match = /^(MTT9_\d+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$/.exec(stem);
    if (match === null) continue;
    const checkpoint = join(OUTPUT_BASE, match[1], "raw", `pkrtrainer_${match[1]}_${match[2]}.json`);
    // Soubor, ne adresář: `raw/` zakládá generátor prázdný, aby měl solver kam
    // psát, takže existence adresáře o hotové práci neříká nic.
    if (!existsSync(checkpoint) || statSync(checkpoint).size === 0) pending += 1;
  }
  return { total, pending };
}

function countDecomposition(): { boards: number; riverLayers: number } {
  if (!existsSync(WORK)) return { boards: 0, riverLayers: 0 };
  let boards = 0;
  let riverLayers = 0;
  for (const name of readdirSync(WORK)) {
    if (!name.includes("__")) continue;
    boards += 1;
    const river = join(WORK, name, "river");
    if (existsSync(river)) riverLayers += readdirSync(river).length;
  }
  return { boards, riverLayers };
}

console.log("Procesy a fronty");
console.log("");

console.log("naplánované úlohy");
const tasks = scheduledTasks();
if (tasks.length === 0) {
  console.log("  žádné, nebo se nepodařilo zeptat plánovače");
} else {
  for (const task of tasks) {
    console.log(`  ${task.name.padEnd(34)} ${task.state.padEnd(10)} další: ${task.next}`);
  }
}

console.log("");
console.log("běží teď");
const heavy = runningHeavy();
if (heavy.length === 0) console.log("  nic těžkého");
else for (const row of heavy) console.log(`  ${row.name.padEnd(18)} ${row.count}x`);

console.log("");
console.log("fronty");
const staged = countStagedPending();
const decomposition = countDecomposition();
console.log(`  nastagované desky k solvu: ${staged.pending} z ${staged.total}` +
  (staged.pending > 0 ? `  (~${(staged.pending * 715 / 3600).toFixed(1)} h, měřeno 715 s na desku)` : ""));
console.log(`  rozložené desky:           ${decomposition.boards}`);
console.log(`  riverové vrstvy:           ${decomposition.riverLayers}`);

console.log("");
console.log("co se nesmí spustit vedle sebe, a proč");
console.log("  VÝHRADNÍ (berou celý stroj):");
console.log("    - noční solving (rozklad i expanze; navzájem se vylučují prioritou)");
console.log("    - plná sada testů");
console.log("    - balení release (spouští sadu, build i E2E)");
console.log("  PARALELNÍ (klidně vedle sebe):");
console.log("    - generování packů po rodinách, měření, čtení, práce v editoru");
console.log("  ZAKÁZANÉ SOUBĚHY:");
console.log("    - sada vedle čehokoli náročného: naměřeno 764 s místo 250 a deset");
console.log("      testů spadlo bez vady v kódu");
console.log("    - editace zdrojů během běhu sady nebo generátorů: běh si vezme");
console.log("      rozeditovanou verzi");
