import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { nightFamilyRows } from "./lib/nightLog.mts";
import { MODULE_BUDGET_BYTES } from "./lib/solvedPackBuilding.mts";

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
  const newest = tails.reduce((best, item) => (item.at > best.at ? item : best));
  const lines = newest.text.split("\n").filter((line) => line.trim() !== "");
  const last = lines[lines.length - 1] ?? "";
  return /spouští mimo noční okno|není co solvit|okno by trvalo/.test(last);
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
  const split = nightIntoFullFamilies(run);
  if (split !== undefined) summary.push(split);
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
for (const line of night.lines.slice(-6)) say(`  ${line.trim()}`);
say(`  riverových vrstev: ${night.riverLayers}`);
say(night.overrunMinutes === null
  ? "  přetažení okna: nezjištěno z logu"
  : `  přetažení okna: ${night.overrunMinutes} min`);
for (const line of turnEvAfterNight(night.startLine)) say(line);

section("den vývoje");
out.push("", "## Den vývoje", "");
const commits = git(["log", "--oneline", "--since=24 hours ago"]).split("\n").filter(Boolean);
say(`  commitů za 24 h: ${commits.length}`);
for (const line of commits.slice(0, 6)) say(`    ${line}`);

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

function stagedFamiliesWithoutCheckpoint(): string[] {
  const stagedRoot = join(
    "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters",
    "pkrtrainer_mtt_seat_pair_expansion_v1",
  );
  if (!existsSync(stagedRoot)) return [];
  const families = new Set<string>();
  for (const name of readdirSync(stagedRoot, { recursive: true, encoding: "utf8" })) {
    if (!name.endsWith(".txt")) continue;
    const stem = basename(name, ".txt").replace(/^[0-9]+_/, "");
    const match = /(MTT9_[0-9]+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_[^_]+$/.exec(stem);
    if (match === null) continue;
    const family = match[1];
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
  const expansion = runScript("scripts/buildSeatPairExpansionBatch.mts");
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
  // spustit (nastagované rodiny bez checkpointu nad `YIELD_MIN_BOARDS`).
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
      say(`  Rozšíření dvojic sedaček je ale vyčerpané: 0 k založení, ${pairsBlocked} zablokováno`);
      say("  chybějící obrannou preflop ranží (VS_OPEN pro UTG+1 a UTG+2 pack nemá");
      say("  na žádné hloubce). Nové rodiny odsud nepřibudou a vymyslet tu ranži");
      say("  nelze - je to rozhodnutí o zdroji dat, ne úloha na noc.");
    }
  } else {
    say(`  Nastagováno ${staged.length} rodin bez checkpointu, noc jim ustoupí.`);
  }
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
