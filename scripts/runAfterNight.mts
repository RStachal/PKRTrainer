import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus, freemem } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
 *
 * **Od 12. 9. 2026 jen pro rodiny, kterým kontrola verdikt změnila.** Pack z
 * prvního průchodu už čte verdikt při generování, takže u nezměněného verdiktu
 * by druhý průchod vyrobil bajt po bajtu týž soubor. Změřeno: river trvá
 * 97 minut na průchod a kontrola vydala 141 přijatých stejně jako předtím -
 * hodina a půl práce bez výsledku. Porovnává se výsledek, otisk a základ
 * verdiktu po (ulice, rodina).
 */

const write = process.argv.includes("--write");
const withEv = process.argv.includes("--ev");
/**
 * Jen turnová EV, bez přegenerování packů.
 *
 * Noc od bodu 238 dodává riverové vrstvy kvůli turnové EV, a ta se k hráči
 * dostane jedinou cestou: zastaralá tabulka → přepočet → manifest. Packy
 * strategie se přitom nemění (turnová fronta je vyčerpaná, riverové packy sedí
 * na stropu a jejich přegenerování je výměna, bod 219). Celý cyklus stojí
 * 4 az 6 h a river se generuje s haldou 16 GB - s virtuálem majitele (17 GB) to
 * na 31 GB stroji nejde souběžně, což je důvod, proč ranní cyklus nikdo
 * nespouštěl (bod 239). Tahle cesta stojí 4 běhy x ~0,6 GB a nejvýš 150 min,
 * takže se dá naplánovat na 07:05 bez ohledu na to, co jinak na stroji běží.
 * Plný cyklus zůstává na vyžádání.
 */
const turnEvOnly = process.argv.includes("--turn-ev-only");
/**
 * Jen některé ulice, `--streets=flop,turn`.
 *
 * Flopový pack se staví z monolitických checkpointů, takže po noci, která
 * dosolvila desky (`mtt:board-growth`), je flop k dodání hned ráno - bez
 * turnové vrstvy a bez riveru. Přestavět kvůli tomu river (97 min, halda
 * 16 GB) by bylo přesně to, kvůli čemu ranní cyklus nikdo nespouštěl.
 * Vynechaná ulice se negeneruje ani ve druhém průchodu a její EV se
 * neobnovuje - nezměnila se.
 */
const CHECKPOINT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const streetsWanted = new Set(
  (process.argv.find((arg) => arg.startsWith("--streets="))?.split("=")[1]
    ?? (process.argv.some((arg) => arg.startsWith("--streets-if-new=")) ? "" : "flop,turn,river"))
    .split(",").map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
);
/**
 * Ulice jen tehdy, když jí noc něco přinesla: `--streets-if-new=flop`.
 *
 * Ranní úloha v 07:05 nemá generovat 49 flopových packů každý den kvůli tomu,
 * že jednou za čas přibudou desky (`mtt:board-growth`): stojí to 11 minut,
 * haldu 4 GB a přepíše `createdAt` v 49 souborech, které se jinak nezměnily.
 * Ulice se proto vezme jen tehdy, když je v `CHECKPOINT_ROOT` checkpoint
 * novější než nejnovější pack té ulice - tedy noc doopravdy něco dosolvila.
 * Bez toho by nový flopový obsah čekal na ruku (bod 239 o ulici dřív).
 */
const STREET_PACK_DIR: Readonly<Record<string, string>> = {
  flop: "src/data/ranges/flop",
  turn: "src/data/ranges/turn",
  river: "src/data/ranges/river",
};
function newestMtime(directory: string, filter: (name: string) => boolean): number {
  if (!existsSync(directory)) return 0;
  let newest = 0;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      newest = Math.max(newest, newestMtime(path, filter));
    } else if (filter(name)) {
      newest = Math.max(newest, statSync(path).mtimeMs);
    }
  }
  return newest;
}
for (const street of (process.argv.find((arg) => arg.startsWith("--streets-if-new="))?.split("=")[1] ?? "")
  .split(",").map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0)) {
  const packs = newestMtime(STREET_PACK_DIR[street] ?? "", (name) => name.endsWith(".generated.json"));
  const checkpoints = newestMtime(CHECKPOINT_ROOT, (name) => name.startsWith("pkrtrainer_") && name.endsWith(".json"));
  if (checkpoints > packs) {
    streetsWanted.add(street);
    console.log(`--streets-if-new: ${street} - checkpoint novější než pack, ulice se generuje`);
  } else {
    console.log(`--streets-if-new: ${street} - žádný checkpoint novější než pack, ulice se přeskočí`);
  }
}
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
  "mtt:river-ev-stale": "scripts/checkRiverEvStaleness.mts",
  "mtt:turn-ev-stale": "scripts/checkTurnEvStaleness.mts",
  "mtt:turn-ev-pack": "scripts/buildTurnEvPacks.mts",
};

/**
 * Halda pro potomky.
 *
 * Výchozí 4 GB přestaly stačit 26. 8. 2026, kdy EV dostalo všech 47 riverových
 * rodin: přes `resolveJsonModule` se čte 14,4 MB JSONu a `tsc --noEmit` **spadl
 * na haldě**. Hláška vypadá jako porucha buildu, přitom je to zděděná mez.
 *
 * Platí i pro generátor EV: rodina `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` na
 * čtyřech gigabajtech spadla a v opravné smyčce by se to zapsalo jako
 * „generátor odmítl" - tedy tiše ztracená tabulka.
 *
 * **Zvednuto z 8 na 16 GB dne 31. 8. 2026, a nebylo to o pádech.** Generátor
 * packů se na osmi gigabajtech nezastavil, jen se dusil: naměřeno 8 157 z 8 190
 * MB obsazených a `average mu = 0,13`, tedy **87 % času v úklidu paměti místo
 * v práci**. Odtud ty nesmyslné časy obnovy - jedna rodina 5 656 s. Stroj má
 * přitom 31,2 GB a v tu chvíli **13,2 GB volných**, takže se dusil o strop,
 * který jsme si nastavili sami, když byla knihovna poloviční.
 */
const CHILD_HEAP = "--max-old-space-size=16384";

function run(script: string, args: string[] = []): string {
  const path = SCRIPT_PATH[script];
  if (path === undefined) throw new Error(`neznámý skript ${script}`);
  return execFileSync(process.execPath, [CHILD_HEAP, "scripts/run-cli.mjs", path, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

const execFileAsync = promisify(execFile);

/** Totéž jako `run`, ale nezdrží ostatní pruhy a haldu dostane přidělenou. */
async function runAsync(
  script: string,
  args: string[],
  heapMb: number,
  timeoutMs?: number,
): Promise<string> {
  const path = SCRIPT_PATH[script];
  if (path === undefined) throw new Error(`neznámý skript ${script}`);
  const { stdout } = await execFileAsync(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, "scripts/run-cli.mjs", path, ...args],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
    },
  );
  return stdout;
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

/**
 * Omezení na vyjmenované rodiny, `--family=A --family=B`.
 *
 * Kvůli ověřování, ne kvůli běžnému provozu: celý cyklus je 48 rodin krát tři
 * ulice krát dva průchody, tedy hodiny, a zkoušet na něm změnu v generování je
 * drahý způsob, jak zjistit překlep. Se dvěma rodinami je to pár minut a
 * pruhy se chovají stejně.
 */
const onlyFamilies = process.argv
  .filter((arg) => arg.startsWith("--family="))
  .map((arg) => arg.slice("--family=".length));

/**
 * Rodiny, které cyklus zkusí přegenerovat.
 *
 * Sjednocení dvou zdrojů, a to je celý ten trik: **rozklad a checkpointy nejsou
 * totéž**. Turnový a riverový pack potřebují rozložené podhry, ale flopový čte
 * monolitický checkpoint přímo - takže rodina odsolvená v noci má flopovou
 * odpověď hned, jenže rozkladový adresář dostane až o noc později.
 *
 * Dokud se četl jen rozklad, propadlo z tohohle cyklu **29 rodin se 192
 * odsolvenými deskami**: obsah existoval, měřicí brána o něm nevěděla a do
 * produktu se nedostal. Vyrobit ho a nedodat je horší než ho nevyrobit, protože
 * se za něj zaplatil strojový čas.
 */
function families(): string[] {
  if (onlyFamilies.length > 0) return [...onlyFamilies].sort();
  const decomposed = readdirSync(WORK)
    .filter((name) => name.includes("__"))
    .map((name) => name.split("__")[0]);
  const solved = existsSync(CHECKPOINT_ROOT)
    ? readdirSync(CHECKPOINT_ROOT).filter((name) => (
      existsSync(join(CHECKPOINT_ROOT, name, "raw"))
      && readdirSync(join(CHECKPOINT_ROOT, name, "raw")).some((file) => file.endsWith(".json"))
    ))
    : [];
  return [...new Set([...decomposed, ...solved])].sort();
}

// Bez zpětných lomítek schválně: v tomhle projektu se `\d` cestou přes vrstvy
// escapování ztratilo dnes už potřetí. Třída `[0-9]` znamená totéž a nedá se
// pokazit.
const BUDGET_DROP = /([0-9]+) [^ ]+ vynecháno, aby se modul vešel/g;

/**
 * Ulice, ne rodiny.
 *
 * Souběžné generování se nabízí u rodin - je jich čtyřicet osm a jsou na sobě
 * nezávislé. **Nesmí se to.** Manifest se přepisuje čtením a zápisem celého
 * souboru, takže dva procesy nad touž ulicí si navzájem přepíšou položku a
 * rodina z manifestu tiše zmizí: vyrobená, zaplacená strojovým časem,
 * nedodaná. Přesně ta ztráta, kterou tenhle cyklus jinde hlídá.
 *
 * Ulice mají manifesty tři různé, a proto se paralelizují ony. Jeden pruh na
 * ulici, uvnitř pruhu rodiny po jedné, žádné dva pruhy nesahají na týž soubor.
 * Zrychlení je tedy nejvýš na nejdelší ulici, ne trojnásobné - a přesně proto
 * se čas každého pruhu vypisuje, ať se to příště dá porovnat, ne odhadnout.
 */
const STREETS = ["flop", "turn", "river"] as const;

/**
 * Kolik pruhů poběží, rozhoduje **volná paměť, ne počet jader**.
 *
 * Změřeno 2. 9. 2026: stroj má 31,2 GB a 16 vláken, ale 14 GB držel virtuál a
 * volné byly 2,2 GB. Tři pruhy by v takové chvíli stránkovaly, ne počítaly -
 * tedy přesně ta situace z 31. 8., kdy generátor strávil 87 % času úklidem
 * paměti. Proto se pruh pustí jen tehdy, když na něj i po rezervě pro systém
 * zbývá halda nad podlahou; jinak jede cyklus po staru a nic se nezhorší.
 */
const SYSTEM_RESERVE_GB = 2;

/**
 * Kolik haldy která ulice **nejmíň potřebuje, aby nespadla**. Změřeno
 * 2. 9. 2026 na nejtěžší rodině (`MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR`,
 * 0,5 GB rozkladu na desku).
 *
 * Vrcholy pracovní množiny: flop 3 978 MB, turn 1 528 MB, river 4 090 MB. Dělit
 * haldu na tři stejné díly je proto špatně - a nejen neefektivní: při 3 948 MB
 * na pruh **riverový generátor spadl na haldě** (exit 134) a cyklus to zapsal
 * jako „generátor odmítl", tedy tiše ztracenou tabulku. Přesně ta záměna, před
 * kterou varuje komentář u `CHILD_HEAP`.
 *
 * River tedy chce osm gigabajtů (31. 8. naměřeno, že jich zaplní 8 157
 * z 8 190, takže míň mu nestačí), flop čtyři a turn tři.
 *
 * **Riverová podlaha zvednuta na 12 GB dne 3. 9. 2026, a vyvrací to měření
 * výš.** Vrchol 4 090 MB byl naměřen na jediné rodině a zobecnil se; při ruční
 * obnově spadly na osmi gigabajtech dvě jiné stobblindové rodiny s
 * `FATAL ERROR: Ineffective mark-compacts near heap limit` (exit 134).
 * `MTT9_100BB_BTN_BB_SRP_FACING_HIGHSPR` prošla na dvanácti. Že vrchol pracovní
 * množiny vyšel na 4 GB a strop 8 GB nestačí, znamená jediné: to měření
 * podměřilo - halda potřebuje nad pracovní množinou mnohem víc místa, než se
 * z ní dá odhadnout.
 *
 * `MTT9_100BB_CO_BB_SRP_CBET_HIGHSPR` nedoběhla ani na **14 GB** při 17,3 GB
 * volných. Ta se na tomhle stroji přegenerovat nedá a je to mez železa, ne
 * rozpočtu; zvedat podlahu kvůli ní by jen ubralo pruhy všem ostatním.
 *
 * **Je to podlaha, ne příděl.** Podlaha nad vrcholem pracovní množiny je totiž
 * přesně ten stav, který 31. 8. stál nejvíc: generátor se nezastavil, jen
 * strávil 87 % času úklidem paměti. U flopu je rozdíl 118 MB, takže dát mu
 * 4 096 MB a skončit by bylo dusno na povel. Podlaha rozhoduje jen o tom,
 * kolik pruhů se pustí; kolik halda opravdu dostane, říká `laneHeaps`.
 */
const LANE_HEAP_FLOOR_MB: Readonly<Record<(typeof STREETS)[number], number>> = {
  river: 12288,
  flop: 4096,
  turn: 3072,
};

/**
 * Strop na jednoho potomka, týž jako u `CHILD_HEAP` a ze stejného měření.
 * Nad ním se halda zvyšovat nemá, protože stroj má 31,2 GB a část z nich
 * drží virtuál (změřeno 2. 9. 2026: 14,03 GB).
 */
const LANE_HEAP_CEILING_MB = 16384;

/**
 * Ruční přepis počtu pruhů, `--lanes=N`.
 *
 * Rozpočet podle paměti je schválně přísný, takže když drží polovinu stroje
 * virtuál (2. 9. 2026: volné 2,2 GB z 31,2), vyjde jeden pruh a souběžná cesta
 * se nikdy nespustí - tedy ani neověří. Tohle je pro ověření a pro měření;
 * v běžném provozu se nezadává.
 *
 * **Paměťovou bránu proto obchází, ne jen zpřísňuje.** Kdyby se s ní jen
 * protínal, uměl by počet pruhů snížit a nikdy zvýšit - a to je právě ten
 * jediný případ, kvůli kterému existuje. Halda pak spadne na podlahy: víc
 * paměti si vynutit nelze, takže si vynucený souběh sáhne na odkládací
 * soubor. To je při ověřování v pořádku a v provozu nepřijatelné.
 */
const lanesOverride = Number(
  process.argv.find((arg) => arg.startsWith("--lanes="))?.split("=")[1] ?? 0,
);

/** Ulice od nejdražší po nejlevnější - pořadí, ve kterém se o paměť hlásí. */
const BY_NEED = [...STREETS].sort(
  (left, right) => LANE_HEAP_FLOOR_MB[right] - LANE_HEAP_FLOOR_MB[left],
);

/**
 * Kolik pruhů poběží a jakou haldu dostane která ulice.
 *
 * Dvě různé otázky, a to je celý ten trik. **Počet pruhů** se odvodí z podlah:
 * pustí se tolik ulic, kolik se jich podlahami vejde do volné paměti po
 * rezervě pro systém. Když se nevejde ani ta nejdražší, pustí se stejně -
 * sama: cyklus musí proběhnout i na stroji, kde je zrovna málo místa, a
 * sekvenčně to bylo vždycky, takže se tím nic nezhoršuje.
 *
 * **Halda** se pak dopočítá z toho, co po podlahách zbylo: zbytek se rozdělí
 * rovným dílem na pruh a přičte k podlaze, nejvýš do stropu. Součet přes
 * souběžně běžící pruhy proto vyjde právě na použitelnou paměť - nic se
 * nenechá ležet ladem a žádná ulice nesedí těsně nad svým vrcholem.
 *
 * Haldu dostane **každá** ulice, i ta, na kterou se pruh nenašel: pruhů může
 * být míň než ulic a fronta je jedna, takže levnou ulici stejně obslouží ten
 * pruh, který se zrovna uvolní. Souběžně jich přitom nikdy neběží víc než
 * `lanes`, takže se rozpočet drží.
 *
 * Proto se počítání pruhů na první nevejdoucí ulici **zastaví** a nepřeskočí na
 * levnější: fronta je jedna, takže se dvěma pruhy může běžet nejdražší dvojice.
 * Rozpočet musí sedět na ni, ne na tu, která se do něj náhodou vešla.
 */
function laneBudget(): { lanes: number; heapMb: Map<string, number>; freeGb: number } {
  const freeGb = freemem() / 1024 ** 3;
  const usableMb = Math.max(0, freeGb - SYSTEM_RESERVE_GB) * 1024;
  let remainingMb = usableMb;
  let lanes = 0;
  for (const street of BY_NEED) {
    if (lanesOverride > 0) {
      if (lanes >= lanesOverride) break;
    } else if (LANE_HEAP_FLOOR_MB[street] > remainingMb && lanes > 0) break;
    remainingMb -= LANE_HEAP_FLOOR_MB[street];
    lanes += 1;
  }
  const shareMb = Math.max(0, remainingMb) / lanes;
  const heapMb = new Map<string, number>(
    STREETS.map((street) => [
      street,
      Math.min(LANE_HEAP_CEILING_MB, Math.floor(LANE_HEAP_FLOOR_MB[street] + shareMb)),
    ]),
  );
  return { lanes, heapMb, freeGb };
}

/**
 * Otisk verdiktů po (ulice, rodina), aby se dalo poznat, kterým se kontrola
 * hnula. Porovnává se výsledek, otisk obsahu a základ - to jsou přesně ta pole,
 * ze kterých generátor odvozuje důvěru packu.
 */
function verdictSnapshot(): Map<string, string> {
  const path = "Agents/turn-review/verdicts.json";
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    verdicts?: { street?: string; familyId: string; outcome: string; contentHash: string; basis?: string }[];
  };
  for (const row of file.verdicts ?? []) {
    out.set(
      `${row.street ?? "TURN"}|${row.familyId}`,
      `${row.outcome}|${row.contentHash}|${row.basis ?? "PLAYER_READ"}`,
    );
  }
  return out;
}

async function generateAll(list: readonly string[], label: string): Promise<void> {
  const { lanes, heapMb, freeGb } = laneBudget();
  const heapFor = (street: string): number => heapMb.get(street) ?? LANE_HEAP_CEILING_MB;
  // Prázdný řádek zvlášť, ne `\n` v šabloně: přes vrstvy escapování se v tomhle
  // projektu zpětné lomítko ztratilo dnes už podruhé a stane se z něj skutečný
  // konec řádku uprostřed textu. Co se nedá pokazit, se nepokazí.
  console.log("");
  console.log(
    `[${label}] generuji packy pro ${list.length} rodin:`
    + ` ${lanes} ${lanes === 1 ? "pruh" : "pruhy"}`
    + ` (${BY_NEED.map((street) => `${street} ${heapFor(street)} MB`).join(", ")}),`
    + ` volno ${freeGb.toFixed(1)} GB`,
  );
  let failed = 0;
  // Pád na haldě **není odmítnutí**.
  //
  // Generátor odmítá neúplné rodiny schválně a hlásí proč; to je v pořádku a
  // počítá se do `failed`. Když ale potomek umře na haldě (exit 134), tabulka
  // se nevyrobí a dosud se to zapsalo týmž řádkem - tedy tiše ztracený obsah.
  // Změřeno 2. 9. 2026: při 3 948 MB na pruh takhle zmizel riverový pack
  // nejtěžší rodiny a v logu po něm zbylo jen „1 kombinace odmítnuta".
  let crashed = 0;
  // Kolik vyřešeného obsahu se nevešlo do rozpočtu chunku.
  //
  // Generátor to hlásí u každé rodiny, ale cyklus to dosud zahazoval - a byla
  // to nejdůležitější věta z celého běhu. Změřeno 31. 8. 2026: riverové packy
  // sedí na 496 až 497 kB proti stropu 512, jedna rodina zahodila 75 riverů,
  // a dodávaných desek ubylo z 983 na 882 za tři dny, zatímco pravidel přibylo
  // osm. Noc tedy přestala přidávat a začala vyměňovat; bez tohohle čísla to
  // nebylo vidět.
  const dropped = new Map<string, number>();
  // Od nejdražší ulice: kdyby paměť došla, ať čeká ta levná, ne ta drahá.
  const queue: string[] = BY_NEED.filter((street) => streetsWanted.has(street));
  /** Čas na ulici - jediné číslo, kterým se dá paralelizace obhájit nebo vyvrátit. */
  const spent = new Map<string, number>();

  async function lane(): Promise<void> {
    for (;;) {
      const street = queue.shift();
      if (street === undefined) return;
      const started = Date.now();
      for (const family of list) {
        const args = [`--family=${family}`, "--write", ...(withEv && street === "river" ? ["--ev"] : [])];
        try {
          const out = await runAsync(`mtt:${street}-pack`, args, heapFor(street));
        // **Jen rozpočet chunku.** V generátorech je „vynecháno" ve čtyřech
        // různých hláškách a první verze tohohle počitadla je sečetla všechny -
        // vyšlo 1 969 746 riverů, což je nesmysl: jedna rodina jich hlásí 75.
        // Ty ostatní nejsou ztráta rozpočtem, ale odstraněné duplicity („tutéž
        // desku dosahuje jiná linka") a uzly, u kterých nejde určit, čí je
        // strategie. Počítá se proto jen věta o modulu.
          for (const match of out.matchAll(BUDGET_DROP)) {
            dropped.set(street, (dropped.get(street) ?? 0) + Number(match[1]));
          }
        } catch (error) {
          // Odmítnutá rodina není chyba cyklu: generátor odmítá neúplné a nahrazené
          // rodiny schválně a hlásí proč. Cyklus jen nesmí kvůli tomu spadnout.
          //
          // Pád na haldě je ale něco jiného a musí být slyšet: obsah se nevyrobil,
          // ačkoli se vyrobit měl.
          const detail = error as { code?: number; stderr?: string };
          const heapDeath = detail.code === 134
            || /Reached heap limit|heap out of memory|FATAL ERROR/.test(detail.stderr ?? "");
          if (heapDeath) {
            crashed += 1;
            console.error(
              `[${label}] POZOR: ${family} / ${street} spadlo na haldě`
              + ` (${heapFor(street)} MB) - tabulka nevznikla`,
            );
            process.exitCode = 1;
          } else {
            failed += 1;
          }
        }
      }
      spent.set(street, Math.round((Date.now() - started) / 1000));
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => lane()));
  console.log(
    `[${label}] hotovo, ${failed} kombinací rodina+ulice generátor odmítl`
    + (crashed > 0 ? `, ${crashed} SPADLO NA HALDĚ` : "")
    + `; ${STREETS.map((street) => `${street} ${spent.get(street) ?? 0} s`).join(", ")}`,
  );
  const lost = [...dropped].filter(([, count]) => count > 0);
  if (lost.length > 0) {
    console.log(
      `[${label}] do rozpočtu chunku se nevešlo: `
      + lost.map(([street, count]) => `${street} ${count}`).join(", ")
      + " - tolik vyřešeného obsahu k hráči nedojde",
    );
  }
}

const before = snapshot();
console.log("Cyklus po noční práci");
console.log("");
console.log("stav před:");
for (const [key, value] of Object.entries(before)) console.log(`  ${key}: ${value}`);

if (!write) {
  console.log("");
  console.log("Nic se nespustilo. Provedení: npm run mtt:after-night -- --write");
  console.log("Přidej --ev, když se má přepočítat EV **všech** riverových rodin.");
  console.log("Zastaralé tabulky se obnovují samy; vypnout jde --skip-ev-repair.");
  console.log("Obnova má rozpočet 150 minut, jinak --ev-repair-minutes=N.");
  console.log("Jen turnová EV po noci, bez packů: --turn-ev-only (4 běhy, do 150 min).");
  console.log("Jen některé ulice: --streets=flop,turn (river se pak negeneruje ani neobnovuje EV).");
  console.log("Ulice jen když noc něco dosolvila: --streets-if-new=flop (ranní úloha).");
} else {
  const list = families();
  const generateNothing = turnEvOnly || streetsWanted.size === 0;
  if (turnEvOnly) console.log("\n--turn-ev-only: packy se negenerují, jde se rovnou na turnovou EV");
  else if (streetsWanted.size === 0) console.log("\nžádná ulice ke generování, jde se rovnou na turnovou EV");
  if (!generateNothing) await generateAll(list, "1/3");

  const verdictsBefore = verdictSnapshot();
  if (!generateNothing) {
    console.log("\n[2/3] mechanická kontrola");
    const review = run("mtt:mechanical-review", ["--write"]);
    for (const line of review.split("\n")) {
      if (/prošlo měřením|neprošlo|čteno člověkem|Zapsáno/.test(line)) console.log(`  ${line.trim()}`);
    }
  }

  /**
   * Druhý průchod jen tam, kde se verdikt hnul.
   *
   * Průchod existuje kvůli propsání důvěry do packu (viz hlavička). Jenže
   * důvěra rodiny se čte z verdiktu při generování - takže pack z prvního
   * průchodu už nese správnou důvěru u každé rodiny, jejíž verdikt kontrola
   * **nezměnila**: starý verdikt seděl na starý otisk a pack dostal LOW,
   * nebo seděl na nový a pack dostal MEDIUM; kontrola pak zapsala totéž.
   * Přegenerovat ji znovu vyrobí bajt po bajtu týž soubor.
   *
   * Změřeno 12. 9. 2026: celý cyklus 6,5 h, z toho river **97 minut na
   * průchod, dvakrát** - a kontrola přitom vydala 141 přijatých, stejně jako
   * předtím. Druhý průchod pro všech 49 rodin byl tedy hodina a půl práce,
   * která nezměnila nic. Přegeneruje se jen rodina, u které se liší verdikt
   * na kterékoli ulici (nový, změněný, nebo zmizelý).
   */
  const verdictsAfter = verdictSnapshot();
  const changed = list.filter((family) => (
    ["FLOP", "TURN", "RIVER"].some((street) => (
      verdictsBefore.get(`${street}|${family}`) !== verdictsAfter.get(`${street}|${family}`)
    ))
  ));
  if (generateNothing) {
    // Bez kontroly se verdikt hnout nemohl; hláška by jen mátla.
  } else if (changed.length === 0) {
    console.log("\n[3/3] žádné rodině se verdikt nezměnil, druhý průchod není potřeba");
  } else {
    console.log(`\n[3/3] verdikt se změnil u ${changed.length} z ${list.length} rodin, přegenerovávám jen ty`);
    await generateAll(changed, "3/3");
  }

  // Obnovit EV, kterou tenhle cyklus sám zneplatnil.
  //
  // Přegenerování packu změní `contentHash` a tabulka EV přestane sedět;
  // `loadRiverEvPack` tu neshodu **spolkne**, takže se za běhu tváří jako
  // „ještě nedorazila". Změřeno na dvou nocích po sobě: doručení EV spadlo ze
  // 17 packů na 3, tedy z 31,7 % na 5,8 % rozdaných riverových spotů. Jedna noc
  // smaže celý předchozí přepočet.
  //
  // Proto se to **nedělá na požádání, ale vždycky** - jen zúženě. `--ev` na
  // všech 47 rodinách stojí kolem 80 minut (změřeno 26. 8. 2026: 58 s na rodinu
  // typicky, jedna 2 129 s); zastaralých bývá hrstka a přepočítat se mají
  // právě ony. `--skip-ev-repair` je pro případ, kdy je potřeba cyklus urychlit
  // a člověk ví, že EV dopočítá zvlášť.
  if (!process.argv.includes("--skip-ev-repair") && !turnEvOnly && streetsWanted.has("river")) {
    console.log("\n[4/4] obnova EV, kterou cyklus zneplatnil");
    // Vlastní proces, ne import.
    //
    // Volané uvnitř tohohle procesu to **lhalo**: vstupní bod se balí esbuildem,
    // takže obsah packů je do balíčku vložený při startu - tedy ve stavu před
    // přegenerováním, které tenhle proces sám právě udělal. Kontrola porovnala
    // staré packy se starou EV, všechno sedělo, cyklus ohlásil „žádná tabulka
    // nezastarala" a sada pak spadla na 94 testech.
    //
    // Změřeno 27. 8. 2026 v jednu chvíli dvakrát: uvnitř 0 zastaralých, ve
    // svěžím procesu 44 ze 48.
    const stale = run("mtt:river-ev-stale")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (stale.length === 0) {
      console.log("  žádná tabulka nezastarala");
    } else {
      // Změřeno 26. 8. 2026 na všech 47 rodinách: **58 vteřin na rodinu**
      // typicky, ale rozptyl je velký - nejrychlejší 37 s, nejpomalejší
      // 2 129 s. Průměr by tady lhal, takže se říká obojí.
      //
      // **Pozor: tahle čísla jsou od 9. 9. 2026 horní mez, ne odhad.** Bod 220
      // zrychlil `riverActionEv`, který je na obnově to hlavní, **44x** při
      // nezměněném výstupu. Přeměřit se to dá jedině skutečnou obnovou, a ta
      // přegeneruje obsah - takže se nová čísla doplní až u nejbližšího cyklu,
      // který spustí majitel. Do té doby platí, že rozpočet je spíš velkorysý
      // než těsný.
      //
      // Rozpočet zvednut z 90 na 150 minut 28. 8. 2026: devadesát nestačilo.
      // Ten den zastaralo 40 tabulek, cyklus stihl 29 a zbytek se dodělával
      // ručně. Naměřený rozptyl na rodinu je 52 až 1 350 s, takže čtyřicet
      // rodin vyjde na dvě hodiny a rezerva patří dovnitř rozpočtu, ne do
      // ručního dodělávání po ránu.
      //
      // Rozpočet času existuje proto, že od téhož dne může zastarat 47 tabulek
      // místo sedmnácti; nejhorší případ je kolem 80 minut a to už je ráno,
      // kdy majitel čeká na dodání. Kontroluje se **před** rodinou, ne během -
      // dopředu se neví, jak dlouho poběží, takže se smí přetáhnout o jednu.
      // Zbytek se nezamlčí: vypíše se, co zbývá, a čím to dokončit.
      const budgetMinutes = Number(
        process.argv.find((arg) => arg.startsWith("--ev-repair-minutes="))?.split("=")[1] ?? 150,
      );
      const deadline = Date.now() + budgetMinutes * 60_000;
      console.log(
        `  zastaralo ${stale.length} tabulek, přepočítávám`
        + ` (58 s na rodinu typicky, nejhorší naměřená 2 129 s;`
        + ` rozpočet ${budgetMinutes} min)`,
      );
      let repaired = 0;
      const skipped: string[] = [];
      for (const [index, family] of stale.entries()) {
        if (Date.now() >= deadline) {
          skipped.push(...stale.slice(index));
          break;
        }
        const started = Date.now();
        try {
          run("mtt:river-pack", [`--family=${family}`, "--write", "--ev"]);
          repaired += 1;
          console.log(`  ${family}: ${Math.round((Date.now() - started) / 1000)} s`);
        } catch {
          // Odmítnutá rodina není chyba cyklu; generátor hlásí proč.
          console.log(`  ${family}: generátor odmítl`);
        }
      }
      console.log(`  přepočítáno ${repaired} z ${stale.length}`);
      // Zeptat se znovu, a zase zvenčí.
      //
      // Bez tohohle kroku cyklus tvrdil, že opravil, a nikdo to neověřil - což
      // je táž chyba o patro výš než ta, kvůli které se sem oprava psala.
      // Přepočet navíc mohl rodinu odmítnout, a to se pozná jen tady.
      const left = run("mtt:river-ev-stale")
        .split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
      console.log(`  po opravě zůstává zastaralých: ${left.length}`);
      if (left.length > 0) process.exitCode = 1;
      if (skipped.length > 0) {
        console.log(`  ROZPOČET ČASU VYPRŠEL, zbývá ${skipped.length} rodin bez EV:`);
        for (const family of skipped) console.log(`    ${family}`);
        console.log("  dokončit jde po jedné:");
        console.log(`    npm run mtt:river-pack -- --family=${skipped[0]} --write --ev`);
        // Nedokončená obnova není v pořádku: hráč uvidí u těch rodin spot bez
        // EV a nic mu neřekne proč. Cyklus proto skončí nenulově.
        process.exitCode = 1;
      }
    }
  }

  /**
   * Turnová EV zastarává úplně stejně jako riverová - jen o ni cyklus do
   * 10. 9. 2026 nevěděl.
   *
   * Tabulka se váže na otisk turnového packu (`matchesTurnPack`), a tenhle
   * cyklus packy **přegenerovává**. Každá přestavěná rodina by tím svou tabulku
   * odpojila a EV by hráči zmizela **bez jediné hlášky** - přesně ta tichá
   * ztráta, kvůli které vznikla riverová obdoba o pár řádků výš. Turnová EV
   * vznikla teprve dnes a dodává **49 % rozdaných turnových spotů**, takže by
   * první noc po dodání tiše sebrala skoro všechno.
   *
   * Ptá se **z vlastního procesu** ze stejného důvodu jako river: uvnitř tohohle
   * je obsah vložený esbuildem při startu, tedy před přegenerováním.
   */
  console.log("\nturnová EV");
  {
    // Souhrn detektor píše na stderr, jména rodin na stdout - a `run` vrací jen
    // stdout, takže se nic filtrovat nemusí. Táž dvojice jako u riveru, a
    // schválně stejná: dvě různá parsování téhož tvaru se rozejdou.
    const stale = run("mtt:turn-ev-stale")
      .split("\n").map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (stale.length === 0) {
      console.log("  žádná tabulka nezastarala");
    } else {
      // Rozpočet zvlášť, ne sdílený s riverem: měřeno 10. 9. 2026 na šesti
      // rodinách 95 az 1 242 s, medián kolem 300. Osmačtyřicet rodin je tím
      // sedm hodin, takže se stejně jako u riveru počítá s tím, že se dávka
      // nemusí stihnout - a co zbylo, se řekne nahlas.
      /**
       * Paralelně, ne po jedné.
       *
       * Od 14. 9. 2026 zastarává tabulka i novými vrstvami (viz
       * `turnEvStaleness`), a cílená noc jich dá 30 az 40 rodinám. Po jedné je
       * to 4 az 8 hodin a rozpočet 120 minut by nechal většinu tabulek
       * starých - tedy přesně ta tichá ztráta, kvůli které tahle fáze vznikla.
       * Rodiny na sobě nezávisí, takže se rozdělí mezi běhy stejně jako při
       * stavbě knihovny (bod 238): každý běh dostane seznam a svůj díl,
       * manifest se složí z disku až na konec. Čtyři běhy jsou půlka denního
       * stropu na jádra a dohromady kolem 2,5 GB paměti.
       */
      // Počet běhů podle jader **a paměti**. Ráno 17. 9. 2026 skončily čtyři
      // běhy po 17 minutách s kódem 0 a polovinou tabulek nedodělanou, stroj
      // měl 2,4 GB volných (virtuál a Obsidian majitele drží 13 GB, bod 244).
      // Běh turnové EV bere kolem 3 GB; víc běhů, než se vejde do volné
      // paměti, si navzájem vezmou stroj, ne práci.
      const memoryLanes = Math.floor(freemem() / (3 * 1024 ** 3));
      const lanes = Math.max(1, Math.min(4, Math.floor(cpus().length / 4), memoryLanes));
      const listPath = "artifacts/turn-ev-stale.txt";
      writeFileSync(listPath, `${stale.join("\n")}\n`, "utf8");
      // Časový strop na celou fázi, ne na rodinu. Změřeno 14. 9. 2026:
      // `MTT9_100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` stojí kolem tří hodin sama
      // (0,9 s na vrstvu proti mediánu 0,037), a bez stropu by jedna rodina
      // držela ranní cyklus přes celé dopoledne. Po vypršení se běh ukončí;
      // rodina, kterou zrovna počítal, zůstane u starší tabulky - ta je platná,
      // jen bez posledních vrstev - a detektor ji ohlásí zase zítra.
      const budgetMinutes = Number(
        process.argv.find((arg) => arg.startsWith("--turn-ev-minutes="))?.split("=")[1] ?? 150,
      );
      console.log(`  zastaralo ${stale.length} tabulek, přepočítávám ve ${lanes} bězích`
        + ` (strop ${budgetMinutes} min, volná paměť ${(freemem() / 1024 ** 3).toFixed(1)} GB)`);
      const started = Date.now();
      const results = await Promise.allSettled(
        Array.from({ length: lanes }, (_, index) => runAsync("mtt:turn-ev-pack", [
          `--families-file=${listPath}`, `--shard=${index + 1}/${lanes}`, "--write", "--no-manifest",
        ], 8192, budgetMinutes * 60_000)),
      );
      // Výstup každého běhu na disk. Do 17. 9. 2026 se zahazoval, takže ráno,
      // kdy běhy skončily v půlce s kódem 0, nebylo z čeho číst proč.
      for (const [index, result] of results.entries()) {
        const logPath = `artifacts/turn-ev-run-${index + 1}.log`;
        if (result.status === "fulfilled") {
          writeFileSync(logPath, result.value, "utf8");
          continue;
        }
        const reason = result.reason as { killed?: boolean; message?: string; stdout?: string; stderr?: string } | undefined;
        const killed = reason?.killed === true;
        writeFileSync(logPath, `${reason?.stdout ?? ""}\n--- stderr ---\n${reason?.stderr ?? ""}\n--- ${reason?.message ?? ""}\n`, "utf8");
        console.log(`  běh ${index + 1}/${lanes} ${killed ? "vypršel strop" : "selhal"} (${logPath})`);
      }
      // Manifest až na konec a z disku: běhy ho nepíšou, aby si ho nepřepsaly.
      run("mtt:turn-ev-pack", ["--manifest-only"]);
      const left = run("mtt:turn-ev-stale")
        .split("\n").map((line) => line.trim())
        .filter((line) => line.length > 0);
      console.log(`  hotovo za ${Math.round((Date.now() - started) / 60_000)} min,`
        + ` zůstává zastaralých: ${left.length}`);
      if (left.length > 0) {
        console.log(`  zbývá ${left.length} rodin bez turnové EV, první: ${left[0]}`);
        console.log(`    npm run mtt:turn-ev-pack -- --family=${left[0]} --write`);
        process.exitCode = 1;
      }
    }
  }

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
    execFileSync(process.execPath, [CHILD_HEAP, "node_modules/typescript/bin/tsc", "--noEmit"], {
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
