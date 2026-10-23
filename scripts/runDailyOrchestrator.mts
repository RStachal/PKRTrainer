import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  costForFamily, parseBoardSolves, readBoardCostTable, readRangeWidths,
} from "./lib/boardCost.mts";
import { formatThreadTrial, threadTrialResult } from "./lib/threadTrial.mts";
import {
  NIGHT_WINDOW_MINUTES,
  queueRunway,
  queuedFamilies,
  readExpansionQueue,
  RUNWAY_NIGHTS_MIN,
} from "./lib/expansionQueue.mts";
import { shouldYield, yieldThresholds } from "./lib/nightYield.mts";
import { alternateNight, nightKey, previousDecision, undecomposedBoards } from "./lib/nightAlternation.mts";
import { nightFamilyRows, riverPhaseRate } from "./lib/nightLog.mts";
import { MODULE_BUDGET_BYTES } from "./lib/solvedPackBuilding.mts";

/**
 * Šířka range rodiny pro cenu desky (`costForFamily`), načtená jednou a až
 * když je potřeba.
 *
 * Od 20. 10. 2026: cena se do té doby brala jen z hloubky, a nové dvojice
 * s obranou blindů vycházely o polovinu levnější, než jsou - výhled fronty
 * 186 desek hlásil 6,8 noci.
 */
let rangeWidths: Map<string, number> | undefined;
function rangeWidthOf(family: string): number | undefined {
  if (rangeWidths === undefined) {
    try {
      rangeWidths = readRangeWidths().byFamily;
    } catch {
      rangeWidths = new Map<string, number>();
    }
  }
  return rangeWidths.get(family);
}

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
const EXPANSION_LOG = "artifacts/decomposition/expansion.log";

function runScript(path: string, args: string[] = [], quietStderr = false): string {
  try {
    return execFileSync(process.execPath, ["scripts/run-cli.mjs", path, ...args], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Kontrola zastaralosti hlásí součet na stderr; ve zprávě má být jen
      // řádek odsud, ne dvakrát.
      stdio: quietStderr ? ["ignore", "pipe", "ignore"] : undefined,
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

/**
 * Kolik celých dní uplynulo od poslední noční práce.
 *
 * Řádky logu nesou jen `[HH:MM:SS]` bez data, takže stáří se čte z času souboru.
 * Bere se novější z obou logů: od chvíle, kdy expanze předává zbytek okna
 * rozkladu, může poslední zápis skončit v kterémkoli z nich.
 *
 * **Bez tohohle stroj nevidí noc, která nenastala.** Noc z 22. na 23. 8. 2026
 * vypadla a denní report vypsal předevčerejší běh, jako by právě proběhl -
 * jedenáct hodin placeného strojového času zmizelo a nic to neřeklo. U stroje,
 * který je celý postavený na tom, že je ten čas drahý, je tichá ztráta noci to
 * nejhorší, co se může stát.
 *
 * Příčina té konkrétní noci **zjištěná nebyla** a je fér to napsat sem, ne si
 * ji domyslet: úloha je denní a zapnutá, `StartWhenAvailable` i `WakeToRun` mají
 * `True`, stroj běžel od 21. 8. bez restartu a v žurnálu nemá kolem 21:00 ani
 * uspání, ani jediný záznam plánovače o pokusu tu úlohu spustit. Vím tedy **co**
 * se stalo, ne **proč**. Hláška níž proto radí, kde hledat, a netvrdí důvod.
 */
function nightAgeDays(): number | null {
  const stamps = [NIGHT_LOG, EXPANSION_LOG]
    .filter((path) => existsSync(path))
    .map((path) => statSync(path).mtime);
  if (stamps.length === 0) return null;
  const newest = stamps.reduce((best, item) => (item > best ? item : best));
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((day(new Date()) - day(newest)) / 86_400_000);
}

/**
 * Skončil poslední zápis do logu odmítnutím, místo prací?
 *
 * Čas souboru sám nestačí a **přestal stačit deset minut poté, co se na něj
 * detekce postavila.** Zmeškaná noc z 22. na 23. 8. se doháněla v 9:00 ráno,
 * runner ji správně odmítl („okno by trvalo 23 h") - a tím se logu dotkl.
 * Soubor tak vypadal čerstvě, přestože se neodpracovalo nic. Stáří souboru měří
 * pokus, ne práci.
 *
 * Odmítnutí se pozná podle vlastní hlášky runneru. Kdyby se ta hláška
 * přeformulovala, přestane to poznávat - proto se hledá i podle druhého,
 * nezávislého znaku: běh, který něco udělal, vypíše řádek o odpracovaných
 * deskách.
 */
function lastRunWasRefusal(): boolean {
  const tails = [NIGHT_LOG, EXPANSION_LOG]
    .filter((path) => existsSync(path))
    .map((path) => ({ at: statSync(path).mtime, text: readFileSync(path, "utf8") }));
  if (tails.length === 0) return false;
  // Ptá se každý log sám za sebe, ne jen ten čerstvější.
  //
  // Dva logy píšou dva různé runnery a jeden umí odmítnout, zatímco druhý
  // zrovna pracuje. Zpráva z 26. 9. 2026 proto tvrdila „NOC NEPROBĚHLA",
  // ačkoli noc odvedla **297 vrstev a 32 562 podher**: rozklad startoval o deset
  // minut později, expanze mezitím ve 21:10:50 zapsala „není co solvit", a
  // protože denní vyhodnocení běželo v 21:11:40, byl `expansion.log` čerstvější
  // než `night.log`, jehož poslední zápis byl z 06:55:38. Detekce se tak
  // zeptala toho logu, který o noci nic neříká.
  //
  // Odmítnutí platí jen tehdy, když **žádný** z logů nekončí prací. Stačí
  // jeden, který pracoval, a noc proběhla - ať je čerstvější kterýkoli.
  const refused = (text: string): boolean => {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    const last = lines[lines.length - 1] ?? "";
    return /spouští mimo noční okno|není co solvit|okno by trvalo/.test(last);
  };
  return tails.every((item) => refused(item.text));
}

/** Jak dopadla poslední noc, přečtené z jejího vlastního logu. */
/**
 * Riverové packy, které už sedí na stropu.
 *
 * Stropy jsou **dva** a packu stačí jeden: bajtový rozpočet modulu a strop
 * počtu pravidel (`RULE_BUDGET` = 300 v `buildRiverStrategyPacks.mts`). Dokud
 * se tu počítal jen ten bajtový, hlásil report **10 ze 48** a psal to číslo
 * i do `tonight.json` - jenže suchá zkouška z téhož dne (bod 201) změřila, že
 * místo nemá **žádná ze 48 rodin**: 39 na počtu pravidel, 10 bajtově, jedna na
 * obojím. Doporučení z toho vycházelo správné, ale číslo pod ním pětkrát
 * mírnější než skutečnost - a majitel podle něj rozhoduje o rozpočtu.
 *
 * Za nasycený se bere pack nad 97 % rozpočtu: generátor ořezává tak, aby se
 * vešel, takže přesně na stropu neskončí skoro nikdy. Naměřeno 1. 9. 2026:
 * největší packy 496 až 497 kB proti rozpočtu 500 kB.
 */
const riverPacks = existsSync("src/data/ranges/river")
  ? readdirSync("src/data/ranges/river").filter((name) => name.endsWith(".json"))
  : [];
const RIVER_RULE_BUDGET = 300;
const ruleCountOf = (name: string): number => {
  try {
    const pack = JSON.parse(readFileSync(join("src/data/ranges/river", name), "utf8")) as {
      rules?: unknown[];
    };
    return pack.rules?.length ?? 0;
  } catch {
    // Nečitelný pack není nasycený pack; ať se to pozná jinde než tady.
    return 0;
  }
};
const saturatedByBytes = riverPacks.filter((name) => (
  statSync(join("src/data/ranges/river", name)).size > MODULE_BUDGET_BYTES * 0.97
));
const saturatedByRules = riverPacks.filter((name) => ruleCountOf(name) >= RIVER_RULE_BUDGET);
const saturated = [...new Set([...saturatedByBytes, ...saturatedByRules])];

/**
 * Kolik noční práce padlo do rodin, které už sedí na stropu modulu.
 *
 * Přírůstek a výměna vypadají v logu stejně: obojí je „vrstva hotová". Rozdíl
 * je v tom, jestli se nový obsah do packu vejde, nebo jestli ořez musí něco
 * vyhodit, aby se vešel. Změřeno 8. 9. 2026 (bod 198): 80 vrstev z 203, ale
 * **56,6 % vyřešených podher**, protože nasycené rodiny jsou ty hluboké
 * s největšími podhrami. Bez téhle věty vypadá noc pokaždé stejně produktivně.
 */
function nightIntoFullFamilies(run: readonly string[]): string | undefined {
  const rows = nightFamilyRows(run);
  if (rows.length === 0) return undefined;
  let fullLayers = 0, fullGames = 0, layers = 0, games = 0, full = 0;
  for (const row of rows) {
    layers += row.layers;
    games += row.games;
    // Táž definice stropu jako u doporučení níž (bajty **nebo** počet pravidel).
    // Do 14. 9. 2026 se tu bral jen bajtový strop do 480 KiB, tedy 4 ze 48
    // rodin místo 48 - stejná vada, kterou bod 207 opravil o pár řádků níž.
    if (!saturated.includes(`${row.family.toLowerCase().replace(/_/g, "-")}.generated.json`)) continue;
    full += 1;
    fullLayers += row.layers;
    fullGames += row.games;
  }
  if (games === 0) return undefined;
  return `  do rodin na stropu: ${fullLayers} z ${layers} vrstev, ale ${fullGames} z ${games} podher`
    + ` (${((100 * fullGames) / games).toFixed(1)} % práce stroje, ${full} rodin)`
    // Od bodu 238 noc míří na turnovou EV, která z vrstvy bere hodnoty a strop
    // riverové strategie ji nezajímá; výměna je to jen pro riverový pack.
    + " - pro riverovou strategii výměna, ne přírůstek; turnová EV z nich bere hodnoty";
}
function lastNight(): { lines: string[]; riverLayers: number; overrunMinutes: number | null; startLine: number } {
  if (!existsSync(NIGHT_LOG)) return { lines: ["night.log chybí"], riverLayers: 0, overrunMinutes: null, startLine: 0 };
  const all = readFileSync(NIGHT_LOG, "utf8").split("\n");
  // Poslední běh začíná posledním řádkem o volném místě.
  let start = all.length - 1;
  for (let index = all.length - 1; index >= 0; index -= 1) {
    if (all[index].includes("na disku volno")) { start = index; break; }
  }
  const run = all.slice(start).filter((line) => line.trim() !== "");
  // „turnová fáze" od 20. 10. 2026: noc rozkladu dělí okno podílem
  // (`--turn-share`) a podíl se má přeměřit podle toho, co obě půlky daly -
  // bez těch řádků by zpráva ukázala river, ale ne kdy a s kolika deskami
  // turn skončil.
  const summary = run.filter((line) => (
    /boards worked|river phase|turnová fáze|deadline|stopping|volno/.test(line)
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
  const split = nightIntoFullFamilies(run);
  if (split !== undefined) summary.push(split);
  // Propustnost, ne počet vrstev: vrstvy mají 26 až 185 podher, takže „223
  // vrstev" proti „254" neříká, jestli noc jela rychleji. Podher za minutu ano.
  const rate = riverPhaseRate(run);
  if (rate !== undefined && rate.minutes > 0) {
    summary.push(`  riverová fáze: ${rate.games} podher za ${rate.minutes.toFixed(0)} min`
      + ` = ${(rate.games / rate.minutes).toFixed(1)}/min${rate.shape === undefined ? "" : ` (${rate.shape})`}`);
  }
  return { lines: summary, riverLayers: layers, overrunMinutes: overrun, startLine: start };
}

/**
 * Dvě čísla, která se po noci jinak ověřovala rukou.
 *
 * Mířila noc na dodávaná turnová pravidla (bod 238), a čeká něco na ranní
 * cyklus (bod 239)? Obě otázky měly od 12. 9. 2026 vlastní příkaz a stály
 * v plánu dne jako „co ověřit zítra ráno" - tedy jako úkol pro paměť člověka.
 * Zpráva, která se píše každý den sama, je jediné místo, kde se odpověď
 * nemůže zapomenout; a stojí to 4 + 35 s proti stropu 600 s.
 *
 * Zastaralost se měří ve vlastním procesu ze stejného důvodu jako v cyklu:
 * balíček by jinak nesl packy ze startu procesu (`checkTurnEvStaleness`).
 */
function turnEvAfterNight(startLine: number): string[] {
  const lines: string[] = [];
  const alignment = runScript("scripts/measureNightTurnEvAlignment.mts", [`--since=${startLine}`]);
  const layers = /nočních vrstev v logu od řádku \d+: (\d+)/.exec(alignment);
  const hits = /pod podhrou s dodávaným pravidlem: (\d+) \((\d+) %\)/.exec(alignment);
  if (layers === null || hits === null) {
    lines.push("  vrstev pod dodávaným turnovým pravidlem: nezměřeno (mtt:night-turn-ev nevydal čísla)");
  } else if (layers[1] === "0") {
    lines.push("  vrstev pod dodávaným turnovým pravidlem: noc žádnou vrstvu nedala");
  } else {
    lines.push(`  vrstev pod dodávaným turnovým pravidlem: ${hits[1]} z ${layers[1]} (${hits[2]} %)`);
  }
  const stale = runScript("scripts/checkTurnEvStaleness.mts", [], true).split("\n").filter((line) => /^MTT/.test(line.trim()));
  lines.push(stale.length === 0
    ? "  zastaralých turnových tabulek EV: 0"
    : `  zastaralých turnových tabulek EV: ${stale.length} - obnoví je až mtt:after-night (bod 239)`);
  return lines;
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
// Napřed stáří, teprve pak obsah. Vypsat běh starý dva dny bez tohohle řádku
// vypadá úplně stejně jako noc, která právě proběhla - a rozdíl je jedenáct
// hodin placeného strojového času.
const nightAge = nightAgeDays();
const refused = lastRunWasRefusal();
if (nightAge === null) {
  say("  NOC NEPROBĚHLA: log neexistuje, takže nikdy nic neběželo");
} else if (refused) {
  say("  NOC NEPROBĚHLA: poslední zápis do logu je odmítnutí, ne práce.");
  say("  Zmeškaný spouštěč se dohnal mimo noční okno a runner se správně");
  say("  nespustil - stroj by jinak počítal přes pracovní den.");
  say("  Následuje poslední běh, který doopravdy proběhl:");
} else if (nightAge >= 1) {
  say(`  NOC NEPROBĚHLA: poslední práce je stará ${nightAge} ${nightAge === 1 ? "den" : "dny/dní"}.`);
  say("  Co se hodí projít, v tomhle pořadí:");
  say("    Get-ScheduledTaskInfo -TaskName PKRTrainer-Night-*   (LastRunTime, LastTaskResult)");
  say("    žurnál Microsoft-Windows-TaskScheduler/Operational   (spustil se spouštěč vůbec?)");
  say("    Kernel-Power 42/107 v žurnálu System                 (spal stroj ve 21:00?)");
  say("  Následuje poslední běh, který doopravdy proběhl:");
}
// Dvanáct, ne osm (20. 10. 2026): noc s dělením turn/river přidala dva řádky
// turnové fáze na začátek souhrnu a při osmi by vypadly právě ty.
for (const line of night.lines.slice(-12)) say(`  ${line.trim()}`);
say(`  riverových vrstev: ${night.riverLayers}`);
say(night.overrunMinutes === null
  ? "  přetažení okna: nezjištěno z logu"
  : `  přetažení okna: ${night.overrunMinutes} min`);
for (const line of turnEvAfterNight(night.startLine)) say(line);
// Pokus o vlákna (deník 322) se vyhodnocuje tady, ne jen na vyžádání: zpráva,
// která se píše každý den sama, je jediné místo, kde se rozhodnutí nezapomene.
if (existsSync(EXPANSION_LOG)) {
  const trial = threadTrialResult(parseBoardSolves(readFileSync(EXPANSION_LOG, "utf8").split(/\r?\n/)));
  if (trial.boardsTrial + trial.boardsControl > 0) say(`  ${formatThreadTrial(trial)}`);
}

section("den vývoje");
out.push("", "## Den vývoje", "");
const commits = git(["log", "--oneline", "--since=24 hours ago"]).split("\n").filter(Boolean);
say(`  commitů za 24 h: ${commits.length}`);
for (const line of commits.slice(0, 6)) say(`    ${line}`);
// Ranní brána (od 22. 10. 2026, `after-night.ps1`): celá `verify:block` hned po
// cyklu, protože přes den se build do paměti nevejde a vývoj jede na verify:day.
try {
  const gate = JSON.parse(readFileSync("artifacts/verify-morning.json", "utf8")) as {
    date?: string; ran?: boolean; rc?: number; failedStep?: string; minutes?: number; reason?: string;
  };
  say(gate.ran
    ? `  ranní brána ${gate.date}: ${gate.rc === 0 ? "zelená" : `ČERVENÁ, spadl krok ${gate.failedStep || "?"}`}`
      + ` (${gate.minutes} min)`
    : `  ranní brána ${gate.date}: odložena - ${gate.reason ?? "bez důvodu"}`);
} catch {
  say("  ranní brána: zatím neběžela");
}

section("pokrytí rozdávaných spotů");
out.push("", "## Pokrytí rozdávaných spotů", "");
const coverage = runScript("scripts/checkSolvedSpotCoverage.mts", ["--spots=200"]);
for (const line of coverage.split("\n")) {
  // Katalogové řádky patří do reportu taky, a to jsou ta čísla, která popisují
  // produkt: trenažér desku vybírá, nelosuje ji. Bez nich by report ukazoval jen
  // nulu z náhodného losování a vypadalo by to, že obsah nikdo nepotká.
  if (/vzorů|dotazů na vzor|když desku vybíráme|^(FLOP|TURN|RIVER)\s/.test(line.trim())) {
    say(`  ${line.trim()}`);
  }
}

section("co má dělat dnešní noc");
out.push("", "## Co má dělat dnešní noc", "");
/**
 * Rodiny s nastagovanými parametry a bez jediné odsolvené desky.
 *
 * Čte se **týž adresář, kterým se řídí noční runner** (`STAGED_PARAMS` v
 * `run_night_decomposition.py`). Kdyby si to tenhle skript počítal po svém,
 * mohl by hlásit připravenou práci, na kterou runner nesáhne - a to je přesně
 * ten druh věrohodně vypadajícího nesmyslu, který se tu už dvakrát stal.
 */
/** Kořen checkpointů solveru; táž cesta, jakou čte cyklus po noci. */
const CHECKPOINT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

/**
 * Práh, od kterého noc ustoupí - **čtený z runneru**, ne vlastní.
 *
 * „Musí sedět na runneru" tu stálo od 29. 9. 2026 jako komentář, a nesedělo:
 * zpráva počítala rodiny bez checkpointu, runner desky. Teď ten literál vlastní
 * runner a tohle ho čte, takže se rozejít nemohou. Proč je v minutách a ne
 * v deskách, je v `nightYield`.
 */
const YIELD = yieldThresholds();

/**
 * Čerstvé desky ve frontě: bez checkpointu a bez značky `.failed`.
 *
 * **Týž filtr jako u ustoupení v runneru rozkladu** (`staged_work_without_checkpoint`):
 * deska odložená po pádu není práce, kvůli které má rozklad ustoupit. Bez toho
 * hlásil orchestrátor 155 desek tam, kde runner viděl 154, a u malé fronty by
 * se ty dva mohly rozejít i v rozhodnutí: orchestrátor by napsal
 * `willYield: true` a runner by neustoupil.
 *
 * Fronta se čte sdíleným modulem - deska jednou, i když ji nese víc souborů, a
 * hotová podle cesty checkpointu, ne podle podřetězce v názvu souboru, jak se
 * to tu dělalo do 15. 10. 2026.
 */
function freshStagedBoards() {
  return readExpansionQueue({ checkpointBase: CHECKPOINT_ROOT }).boards
    .filter((board) => board.state === "FRESH");
}

/** Nastagované desky, které ještě nemají odsolvený checkpoint. */
function stagedBoardsWithoutCheckpoint(): number {
  return freshStagedBoards().length;
}

/**
 * Minuty čekající práce podle **změřené** ceny desky, nebo `undefined`.
 *
 * `undefined` znamená „některá hloubka ve frontě cenu nemá", a tehdy se rozhoduje
 * po deskách jako do 7. 10. 2026. Tiše přičíst nulu by znamenalo tvrdit, že ta
 * deska je zdarma - a práh by pak mlčel přesně tam, kde má mluvit.
 */
function stagedMinutesWithoutCheckpoint(): number | undefined {
  let cost;
  try {
    cost = readBoardCostTable();
  } catch {
    return undefined;
  }
  let minutes = 0;
  for (const board of freshStagedBoards()) {
    const estimate = costForFamily(cost, board.familyId, rangeWidthOf(board.familyId));
    if (estimate === undefined) return undefined;
    minutes += estimate.planMinutes;
  }
  return minutes;
}

/** Rodiny ve frontě, které nemají jediný checkpoint - tatáž otázka jako v runneru rozkladu. */
function stagedFamiliesWithoutCheckpoint(): string[] {
  const families = new Set<string>();
  for (const family of queuedFamilies(readExpansionQueue({ checkpointBase: CHECKPOINT_ROOT }))) {
    const checkpoint = join(CHECKPOINT_ROOT, family, "raw");
    const solved = existsSync(checkpoint)
      && readdirSync(checkpoint).some((file) => file.endsWith(".json"));
    if (!solved) families.add(family);
  }
  return [...families].sort();
}

const pairs = seatPairs();
const askedMatch = /vzorů, na které se trenažér ptal: (\d+)/.exec(coverage);
const heldMatch = /vzorů, které vyřešený obsah vůbec drží: (\d+)/.exec(coverage);
const asked = askedMatch === null ? null : Number(askedMatch[1]);
const held = heldMatch === null ? null : Number(heldMatch[1]);

say(`  rozklad drží ${pairs.size} dvojic sedaček: ${[...pairs.keys()].join(", ")}`);

/**
 * Fronta noční expanze se doplňuje sama.
 *
 * Do 15. 10. 2026 tu bylo jen doporučení „mtt:seat-pair-expansion -- --write
 * založí N dvojic" a čekalo na člověka - a ptalo se jen na 25 bb, takže by po
 * založení 25bb rodin hlásilo „šířka vyčerpaná", i když na 40 a 50 bb zbývalo
 * 29 rodin. Doporučení, které stroj nečte, není doporučení.
 *
 * Doplňuje se jen na hloubkách se **změřenou cenou desky**. Hloubka bez ceny
 * (dnes 100 bb, kolem 2,5 h na desku) je rozhodnutí o tom, kam dát desítky
 * nocí, ne mechanika fronty - to se jen nahlásí. Zápis je idempotentní (drží
 * rodiny, které ve frontě leží, a zapisuje za její konec), takže opakovaný běh
 * nic nezdvojí. Práh a výpočet výdrže jsou tytéž, podle kterých barví hlídač.
 */
const COST_TABLE = (() => {
  try {
    return readBoardCostTable();
  } catch {
    return undefined;
  }
})();
// Jen změřené: extrapolovaný řádek je dohoda, ne cena, a podle dohody se
// desítky nocí nezakládají.
const MEASURED_DEPTHS = (COST_TABLE?.depths ?? [])
  .filter((row) => row.basis === "měřeno")
  .map((row) => row.depthBB)
  .sort((a, b) => a - b);
const planMinutesFor = (family: string): number | undefined => (
  COST_TABLE === undefined ? undefined : costForFamily(COST_TABLE, family, rangeWidthOf(family))?.planMinutes
);
const runwayBefore = queueRunway(readExpansionQueue({ checkpointBase: CHECKPOINT_ROOT }), planMinutesFor);
const nightsBefore = runwayBefore.minutes / NIGHT_WINDOW_MINUTES;
say(`  fronta expanze: ${runwayBefore.boards} desek, ~${Math.round(runwayBefore.minutes / 60)} h,`
  + ` tedy ${nightsBefore.toFixed(1)} noci (práh ${RUNWAY_NIGHTS_MIN})`);
if (nightsBefore < RUNWAY_NIGHTS_MIN) {
  if (MEASURED_DEPTHS.length === 0) {
    say("  POZOR: fronta dochází a cena desky není změřená pro žádnou hloubku - doplnit ji nejde.");
  } else {
    const depthsArg = `--depths=${MEASURED_DEPTHS.join(",")}`;
    const run = runScript("scripts/buildSeatPairExpansionBatch.mts", write ? [depthsArg, "--write"] : [depthsArg]);
    const families = Number(/k založení:\s+\d+ dvojic, (\d+) rodin/.exec(run)?.[1] ?? "0");
    const written = /Zapsáno (\d+) parametrů do .* \(čísla od (\d+)\)/.exec(run);
    if (families === 0) {
      say(`  POZOR: fronta je pod ${RUNWAY_NIGHTS_MIN} noci a na změřených hloubkách`
        + ` (${MEASURED_DEPTHS.join(", ")} bb) není co založit.`);
      say("  Další osa je rozhodnutí, ne mechanika: hloubka bez změřené ceny (100 bb),");
      say("  další desky existujícím rodinám (mtt:board-growth), nebo 3BP. Do té doby noc");
      say("  jede rozklad.");
    } else if (written !== null) {
      const after = queueRunway(readExpansionQueue({ checkpointBase: CHECKPOINT_ROOT }), planMinutesFor);
      say(`  DOPLNĚNO: ${families} rodin, ${written[1]} desek (čísla od ${written[2]});`
        + ` fronta teď vydrží ${(after.minutes / NIGHT_WINDOW_MINUTES).toFixed(1)} noci.`);
    } else {
      say(`  Fronta je pod ${RUNWAY_NIGHTS_MIN} noci; s --write se doplní ${families} rodin`
        + ` (${MEASURED_DEPTHS.join(", ")} bb).`);
    }
  }
}

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
} else if (saturated.length > 0) {
  // Hloubka, která se nevejde, není hloubka.
  //
  // Doporučení „pokračovat v hloubce" mlčky předpokládá, že se nový obsah
  // k hráči dostane. Změřeno 1. 9. 2026, že se nedostane: riverové packy sedí
  // na stropu modulu, generátor u nich vynechává nejméně dosahované rivery,
  // a dodávaných desek ubylo z 983 na 882 za tři dny, zatímco pravidel přibylo
  // osm. Noc tedy přestala přidávat a začala vyměňovat - a rozhodovací vrstva
  // o tom nevěděla, protože měřila jen produkci.
  // **Otázka po stropu je zodpovězená, měřeno 2. 9. 2026.** Dokud tu stálo
  // "rozhodnout o stropu na jeden chunk", ptalo se na to každý den znovu.
  //
  // Změřeno na postavených chuncích: riverová strategie sedí na 456 KiB raw
  // proti stropu 528, ale po drátě posílá **36 KiB gzip ze 128 dovolených** -
  // je tedy vázaná raw stropem, který hráče skoro nic nestojí, a zahazuje jím
  // 5 az 50 riverů na rodinu. Riverová EV je proti tomu na 120 KiB gzip
  // nadoraz, protože base64 nese šest bitů na znak a nekomprimuje se; ta
  // zahazuje **101 az 117 pravidel z ~250, tedy skoro polovinu**.
  //
  // Zvednout raw strop by tedy vrátilo desítky riverů a na EV by nesáhlo
  // vůbec. K tomu ořez bere odspodu nejméně dosahované rivery a u hráče je EV
  // pořád na 92 % rozdaných riverových spotů. Strop se proto nezvedá a noc
  // jde do šířky; kdyby EV měla růst, je to úloha pro hustší kódování nebo
  // rozdělení tabulky, ne pro strop.
  // **Zeptat se nástroje, ne tvrdit za něj.**
  //
  // Doporučení „poslat noc do šířky" i krok, který ho měl odemknout, tu do
  // 2. 9. 2026 stály natvrdo. Změřeno téhož dne: rozšíření hlásí **0 dvojic
  // k založení** - šířka je na 25BB vyčerpaná (drženo 34) a poslední tři
  // dvojice blokuje preflop pack, který nemá `VS_OPEN` pro UTG+1 a UTG+2, a to
  // na všech hloubkách. Radit šířku a vedle toho jmenovat krok, který se nedá
  // udělat, je táž vada jako v bodech 160 a 170 - tentokrát jsem si ji napsal
  // sám.
  //
  // Proto se odpověď **čte z toho skriptu**, který by ten krok dělal. Stojí to
  // jeden podproces navíc, ale orchestrátor běží jednou denně a tvrzení, které
  // nikdo nepřeměřuje, tady vydrželo devět nocí.
  const expansion = runScript("scripts/buildSeatPairExpansionBatch.mts",
    MEASURED_DEPTHS.length > 0 ? [`--depths=${MEASURED_DEPTHS.join(",")}`] : []);
  const pairsToCreate = Number(/k založení:\s+([0-9]+) dvojic/.exec(expansion)?.[1] ?? "0");
  const pairsBlocked = Number(/nezaloženo \(([0-9]+)\)/.exec(expansion)?.[1] ?? "0");

  say(`  DOPORUČENÍ: hloubku ne - ${saturated.length} z ${riverPacks.length} riverových packů`);
  say(`  sedí na stropu (${saturatedByRules.length} na počtu pravidel,`
    + ` ${saturatedByBytes.length} bajtově), takže nový obsah vytlačuje starý`);
  say("  místo aby přibyl.");
  if (pairsToCreate > 0) {
    say("  Krok: poslat noc do šířky. Strop na chunk se zvedat nemá - změřeno");
  } else {
    say("  Šířka ale došla taky, takže krok tudy nevede - viz níž.");
    say("  Strop na chunk se přitom zvedat nemá - změřeno");
  }
  say("  2. 9. 2026: strategii váže raw (36 KiB gzip ze 128), EV váže gzip,");
  say("  takže zvednutí raw stropu by na hlavní ztrátu nesáhlo.");
  // **Priorita musí říkat totéž co doporučení.**
  //
  // Do 2. 9. 2026 tady zůstávala výchozí `DECOMPOSITION`, zatímco text nad ní
  // radil poslat noc do šířky. Runner přitom čte **jen** priority soubor a
  // ustupuje jedině na `NEW_FAMILIES`, takže se noc řídila opakem toho, co se
  // psalo majiteli. Doporučení, které stroj nečte, není doporučení.
  //
  // Ustoupit se tím nevynucuje: runner ustoupí jen tehdy, když je vedle co
  // spustit (nastagovaná práce nad prahem z `nightYield`).
  // Když není, rozkládá dál - prázdná noc nikomu nepomůže.
  priority = "NEW_FAMILIES";
  priorityReason = `river je nasycený: ${saturated.length}/${riverPacks.length} packů na stropu`
    + ` (${saturatedByRules.length} na pravidlech, ${saturatedByBytes.length} bajtově)`;
  // **Doporučení, které se nedá splnit, to má říct.**
  //
  // Runner ustoupí monolitickému solveru jen tehdy, když jsou nastagované
  // parametry rodin bez checkpointu. Když nejsou, rozkládá dál - tedy přesně
  // tu hloubku, které se tohle doporučení vyhýbá. Změřeno 2. 9. 2026: rodin
  // nastagováno **nula**, takže priorita sama nezmění nic a čeká se na to,
  // aby někdo parametry vyrobil.
  const staged = stagedFamiliesWithoutCheckpoint();
  if (staged.length === 0) {
    say("  ALE: nastagováno je 0 rodin, takže noc stejně pojede rozklad -");
    say("  priorita sama nic nezmění.");
    if (pairsToCreate > 0) {
      say(`  Krok, který ji odemkne: mtt:seat-pair-expansion -- --write založí ${pairsToCreate} dvojic.`);
    } else {
      say(`  Rozšíření dvojic sedaček je ale vyčerpané na změřených hloubkách`
        + ` (${MEASURED_DEPTHS.join(", ")} bb): 0 k založení, ${pairsBlocked} zablokováno`);
      say("  chybějící obrannou preflop ranží (VS_OPEN pro UTG+1 a UTG+2 pack nemá");
      say("  na žádné hloubce). Nové rodiny odsud nepřibudou a vymyslet tu ranži");
      say("  nelze - je to rozhodnutí o zdroji dat, ne úloha na noc.");
    }
  } else {
    /*
     * Ustoupí se podle **minut práce**, ne podle desek a ne podle rodin.
     *
     * Věta ve zprávě musí říkat totéž, podle čeho se noc rozhodne - tahle dvojice
     * si už jednou odporovala. Proto se tu nepočítá nic vlastního: práh i pravidlo
     * jsou z `nightYield`, který literál čte z runneru.
     */
    const boards = stagedBoardsWithoutCheckpoint();
    const minutes = stagedMinutesWithoutCheckpoint();
    const yields = shouldYield({
      ...(minutes === undefined ? {} : { minutes }),
      boards,
      priority,
      thresholds: YIELD,
    });
    const work = minutes === undefined
      ? `${boards} desek bez checkpointu`
      : `${Math.round(minutes / 60)} h práce (${boards} desek)`;
    if (yields) {
      say(`  Nastagováno ${work} v ${staged.length} rodinách, noc jim ustoupí.`);
    } else {
      say(`  POZOR: priorita je NEW_FAMILIES, ale nastagováno je jen ${work}`);
      say(minutes === undefined
        ? `  proti prahu ${YIELD.boards} desek (cena desky není) - noc neustoupí.`
        : `  proti prahu ${YIELD.minutes} min - noc neustoupí a rozhodnutí se nekoná.`);
      say("  Dokud se nenastaguje nová práce, jede se rozklad do rodin na stropu.");
    }
  }
} else {
  say("  DOPORUČENÍ: pokračovat v hloubce - šířka vzorů je pokrytá.");
}

/*
 * Střídání nocí mezi šířkou a prvním rozkladem (od 19. 10. 2026, viz
 * `nightAlternation.mts`). Rozhoduje se až po všech pravidlech výš a mění jen
 * šířku za první rozklad, nikdy naopak: expanze rozkladu ustoupí v noci, která
 * mu patří (`decomposition_has_the_night` v runneru expanze).
 */
const undecomposed = undecomposedBoards(CHECKPOINT_ROOT, "artifacts/decomposition");
const alternation = alternateNight({
  wanted: priority,
  previous: previousDecision(join(REPORT_DIR, "tonight.json")),
  night: nightKey(new Date()),
  undecomposedBoards: undecomposed,
});
if (alternation.alternated) {
  priority = alternation.priority;
  priorityReason = alternation.reason ?? priorityReason;
}
say(`  první rozklad čeká: ${undecomposed} vyřešených desek bez turnových vrstev`);

say("");
say(`  priorita pro noc: ${priority} (${priorityReason})`);

if (write) {
  mkdirSync(REPORT_DIR, { recursive: true });
  // Strojově čitelné rozhodnutí vedle lidského reportu. Runner ho čte, aby
  // neprohluboval tam, kde chybí šířka - dosud to rozhodoval sám podle pravidla
  // ve svém kódu, které nikdo od napsání nepřeměřil.
  // Vedle rozhodnutí i čísla, ze kterých plyne.
  //
  // Priorita bez nich je tvrzení, které nikdo nepřepočítá. Od 25. do 29. 9.
  // 2026 stála v tomhle souboru `NEW_FAMILIES` a **nekonala se ani jednou**,
  // protože všech 348 nastagovaných desek už mělo checkpoint - a poznat to šlo
  // jen čtením dvou logů. S `willYield` je to vidět ráno na jeden pohled.
  const stagedBoards = stagedBoardsWithoutCheckpoint();
  const stagedMinutes = stagedMinutesWithoutCheckpoint();
  const stagedFamilies = stagedFamiliesWithoutCheckpoint().length;
  writeFileSync(join(REPORT_DIR, "tonight.json"), `${JSON.stringify({
    schemaVersion: "PKRTRAINER_NIGHT_PRIORITY_V2",
    decidedAt: today,
    priority,
    reason: priorityReason,
    stagedBoards,
    stagedFamilies,
    // Práce pro noc rozkladu - podle ní se střídá (viz výš).
    undecomposedBoards: undecomposed,
    // Minuty i desky: minuty rozhodují, desky zůstávají, aby starší čtenář
    // souboru (a hlídač po návratu k záloze) pořád našel, co zná.
    stagedMinutes: stagedMinutes === undefined ? null : Math.round(stagedMinutes),
    yieldMinMinutes: YIELD.minutes,
    yieldMinBoards: YIELD.boards,
    willYield: shouldYield({
      ...(stagedMinutes === undefined ? {} : { minutes: stagedMinutes }),
      boards: stagedBoards,
      priority,
      thresholds: YIELD,
    }),
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
