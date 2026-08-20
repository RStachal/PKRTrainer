import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Denní vyhodnocení a rozvrh noční práce.
 *
 *   npm run mtt:daily              # vyhodnotí a vypíše
 *   npm run mtt:daily -- --write   # navíc uloží report do Agents/daily/
 *
 * ## Co to je
 *
 * Strojový čas v noci stojí peníze a dosud o něm rozhodovalo jedno pravidlo
 * zapsané v runneru: „turn napřed, pak river podle dosahu". To pravidlo bylo
 * správné, dokud turn chyběl. Dnes je turn hotový a **měření říká, že river do
 * hloubky už nic neodemyká**: trenažér se ptá na 32 vzorů pozic, obsah drží 5,
 * a další riverové vrstvy v těch pěti ten poměr nezmění.
 *
 * Tenhle nástroj proto každý den před solvingem změří, kde jsme, porovná to s
 * cílem a **řekne, co má noc dělat a proč**. Rozhodnutí se opírá o čísla, ne o
 * pravidlo napsané před měsícem.
 *
 * ## Odkud bere, co ví
 *
 * - `mtt:playable-beta` - stav dodávaného obsahu a přiznané limity
 * - `mtt:solved-coverage` - kolik rozdávaných spotů obsah zodpoví
 * - `night.log` - co dělala poslední noc a jak skončila
 * - `git log` - co se za den změnilo
 * - rozklad na disku - které rodiny a vzory existují
 *
 * Když něco neví, **řekne to** místo odhadu. Chybějící měření je informace, ne
 * důvod si něco domyslet.
 *
 * ## Co nedělá
 *
 * Nespouští solver a nemění plánovač. Vydá doporučení s důvodem; zapnout je je
 * krok, u kterého má být člověk, protože se tím utrácí strojový čas na celou noc.
 */

const write = process.argv.includes("--write");
const REPORT_DIR = "Agents/daily";
const WORK = "artifacts/decomposition";
const NIGHT_LOG = "artifacts/decomposition/night.log";

function runScript(path: string, args: string[] = []): string {
  try {
    return execFileSync(process.execPath, ["scripts/run-cli.mjs", path, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    return String((error as { stdout?: string }).stdout ?? "");
  }
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return "";
  }
}

/** Vzory pozic, které rozklad drží. Odvozeno z jmen rodin, ne z odhadu. */
function seatPairs(): Map<string, number> {
  const pairs = new Map<string, number>();
  if (!existsSync(WORK)) return pairs;
  const families = new Set(
    readdirSync(WORK).filter((name) => name.includes("__")).map((name) => name.split("__")[0]),
  );
  for (const family of families) {
    const match = /^MTT9_\d+BB_([A-Z0-9_]+?_[A-Z0-9_]+?_(?:SRP|3BP))/.exec(family);
    if (match === null) continue;
    pairs.set(match[1], (pairs.get(match[1]) ?? 0) + 1);
  }
  return pairs;
}

/** Jak dopadla poslední noc, přečtené z jejího vlastního logu. */
function lastNight(): { lines: string[]; riverLayers: number; overrunMinutes: number | null } {
  if (!existsSync(NIGHT_LOG)) return { lines: ["night.log chybí"], riverLayers: 0, overrunMinutes: null };
  const all = readFileSync(NIGHT_LOG, "utf8").split("\n");
  // Poslední běh začíná posledním řádkem o volném místě.
  let start = all.length - 1;
  for (let index = all.length - 1; index >= 0; index -= 1) {
    if (all[index].includes("na disku volno")) { start = index; break; }
  }
  const run = all.slice(start).filter((line) => line.trim() !== "");
  const summary = run.filter((line) => (
    /boards worked|river phase|deadline|stopping|volno/.test(line)
  ));
  const layers = run.filter((line) => /solving river/.test(line)).length;

  // Přetažení: rozdíl mezi deadlinem v logu a časem posledního řádku.
  let overrun: number | null = null;
  const deadline = /deadline (\d{2}):(\d{2})/.exec(run.join("\n"));
  const lastStamp = /\[(\d{2}):(\d{2}):\d{2}\]/.exec(run[run.length - 1] ?? "");
  if (deadline !== null && lastStamp !== null) {
    const target = Number(deadline[1]) * 60 + Number(deadline[2]);
    const actual = Number(lastStamp[1]) * 60 + Number(lastStamp[2]);
    overrun = actual >= target ? actual - target : null;
  }
  return { lines: summary, riverLayers: layers, overrunMinutes: overrun };
}

function section(title: string): void {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

const today = new Date().toISOString().slice(0, 10);
const out: string[] = [];
const say = (line: string) => { console.log(line); out.push(line); };

console.log(`Denní vyhodnocení ${today}`);
out.push(`# Denní vyhodnocení ${today}`, "");

section("stav dodávaného obsahu");
out.push("## Stav dodávaného obsahu", "");
const gate = runScript("scripts/checkMttPlayableBeta.mts");
for (const line of gate.split("\n")) {
  if (/^(preflop production|six-max production|solved (TURN|FLOP|RIVER) families|errors):/.test(line.trim())) {
    say(`  ${line.trim()}`);
  }
}
const limitCount = gate.split("\n").filter((line) => line.startsWith("limit:")).length;
say(`  přiznaných limitů: ${limitCount}`);

section("poslední noc");
out.push("", "## Poslední noc", "");
const night = lastNight();
for (const line of night.lines.slice(-6)) say(`  ${line.trim()}`);
say(`  riverových vrstev: ${night.riverLayers}`);
say(night.overrunMinutes === null
  ? "  přetažení okna: nezjištěno z logu"
  : `  přetažení okna: ${night.overrunMinutes} min`);

section("den vývoje");
out.push("", "## Den vývoje", "");
const commits = git(["log", "--oneline", "--since=24 hours ago"]).split("\n").filter(Boolean);
say(`  commitů za 24 h: ${commits.length}`);
for (const line of commits.slice(0, 6)) say(`    ${line}`);

section("pokrytí rozdávaných spotů");
out.push("", "## Pokrytí rozdávaných spotů", "");
const coverage = runScript("scripts/checkSolvedSpotCoverage.mts", ["--spots=200"]);
for (const line of coverage.split("\n")) {
  if (/vzorů|dotazů na vzor/.test(line)) say(`  ${line.trim()}`);
}

section("co má dělat dnešní noc");
out.push("", "## Co má dělat dnešní noc", "");
const pairs = seatPairs();
const askedMatch = /vzorů, na které se trenažér ptal: (\d+)/.exec(coverage);
const heldMatch = /vzorů, které vyřešený obsah vůbec drží: (\d+)/.exec(coverage);
const asked = askedMatch === null ? null : Number(askedMatch[1]);
const held = heldMatch === null ? null : Number(heldMatch[1]);

say(`  rozklad drží ${pairs.size} dvojic sedaček: ${[...pairs.keys()].join(", ")}`);

/**
 * Rozhodnutí pro noc ve strojově čitelné podobě.
 *
 * Noc dělá dvě různé práce a **nemůže obě naráz**, protože každá si vezme celý
 * stroj: rozkládat existující checkpointy na turnové a riverové podhry, nebo
 * monoliticky odsolvit nové rodiny z nastagovaných parametrů. Runner rozkladu
 * to dosud rozhodoval sám podle pravidla ve svém kódu a nevěděl, že vedle leží
 * nastagované rodiny, které trenažér potřebuje víc.
 */
type NightPriority = "DECOMPOSITION" | "NEW_FAMILIES";
let priority: NightPriority = "DECOMPOSITION";
let priorityReason = "výchozí: prohlubovat, co je odsolvené";

if (asked === null || held === null) {
  // Chybějící měření je informace, ne důvod si domyslet doporučení.
  say("  DOPORUČENÍ NEDÁM: měření pokrytí neproběhlo, takže nevím, kde je mezera.");
  priorityReason = "měření pokrytí neproběhlo, zůstává výchozí práce";
} else if (held < asked / 2) {
  say(`  DOPORUČENÍ: solvit nové dvojice sedaček, ne další desky ve stávajících.`);
  say(`  Důvod: trenažér se ptá na ${asked} vzorů, obsah drží ${held}.`);
  say("  Další riverové vrstvy v držených vzorech ten poměr nezmění, protože");
  say("  odemykají hloubku tam, kde už odpověď je.");
  say("  Krok: vyrobit parametry pro chybějící dvojice (viz *ExpansionBatch skripty),");
  say("  ranže vzít z produkčních preflop packů - RFI pro otvírače, VS_OPEN pro obranu.");
  say("  POZOR: VS_OPEN nerozlišuje, kdo otevřel (viz deník, bod 62), takže odvozená");
  say("  obranná range nese tuhle vadu dál. Je to vědomý ústupek, ne přehlédnutí.");
  priority = "NEW_FAMILIES";
  priorityReason = `trenažér se ptá na ${asked} vzorů, obsah drží ${held}`;
} else {
  say("  DOPORUČENÍ: pokračovat v hloubce - šířka vzorů je pokrytá.");
}

say("");
say(`  priorita pro noc: ${priority} (${priorityReason})`);

if (write) {
  mkdirSync(REPORT_DIR, { recursive: true });
  // Strojově čitelné rozhodnutí vedle lidského reportu. Runner ho čte, aby
  // neprohluboval tam, kde chybí šířka - dosud to rozhodoval sám podle pravidla
  // ve svém kódu, které nikdo od napsání nepřeměřil.
  writeFileSync(join(REPORT_DIR, "tonight.json"), `${JSON.stringify({
    schemaVersion: "PKRTRAINER_NIGHT_PRIORITY_V1",
    decidedAt: today,
    priority,
    reason: priorityReason,
  }, null, 2)}
`, "utf8");
  const path = join(REPORT_DIR, `${today}.md`);
  writeFileSync(path, `${out.join("\n")}\n`, "utf8");
  console.log("");
  console.log(`Uloženo: ${path}`);
} else {
  console.log("");
  console.log("Neuloženo. Uložení reportu: npm run mtt:daily -- --write");
}
