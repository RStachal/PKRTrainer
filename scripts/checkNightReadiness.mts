/**
 * Přinese dnešní noc výsledek, nebo jen proběhne?
 *
 *   npm run mtt:night-ready
 *
 * ## Proč to je potřeba
 *
 * Projekt má pravidlo „měř, co dorazí k hráči". Tohle je jeho protějšek na
 * druhém konci: **měř, že stroj v noci opravdu poběží a že z toho něco bude.**
 * Do 29. 9. 2026 se to neměřilo vůbec a stálo to tři věci naráz:
 *
 * - Všechny tři noční úlohy běžely jako `InteractiveToken`, takže bez přihlášené
 *   relace nespustí **nic**. Restart ve 23:30 by stál až deset hodin okna.
 * - Akce při zavření víka byla hibernace na síti i na baterii - a víko je
 *   nejčastější důvod uspání, 11 ze 13 za 14 dní. Softwarový zámek to nepřebije
 *   (bod 158: 72 minut stání, událost 42 „Button or Lid").
 * - Fronta noční práce byla pět nocí prázdná a nikdo se to nedozvěděl (bod 274).
 *
 * A 30. 9. přibyl čtvrtý způsob, jak mít bezvadnou noc a nulový výsledek: noc
 * odsolvila 67 desek, ale **žádnou rodinu nedokončila**, protože číslování
 * fronty dávalo první šestky všech rodin před dokončením kterékoli (bod 279).
 * Hotová půlka rodiny se navíc nesmí přegenerovat, jinak pack **ubere** obsah
 * (bod 280, -248 pravidel).
 *
 * Proto se tu neptám jen „poběží stroj", ale i „**dokončí to aspoň jednu
 * rodinu**" - protože rodina je nejmenší jednotka, která smí k hráči.
 *
 * ## Jak to čte
 *
 * Každé tvrzení má naměřenou a očekávanou hodnotu. Nenulový exit, když některé
 * neplatí - **brána padá do zavřena**: co se nepodařilo změřit, se počítá za
 * vadu, ne za „asi dobré". Kontrola je čtecí, nic nemění a nepotřebuje správce;
 * spravit stroj umí `scripts/scheduled/install-night-tasks.ps1` (ten správce
 * potřebuje), prázdnou frontu `mtt:resolve-stage` nebo `mtt:seat-pair-expansion`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

import { costForDepth, depthOfFamily, readBoardCostTable } from "./lib/boardCost.mts";
import { escalationSteps, failureLevel } from "./lib/nightEscalation.mts";
import { shouldYield, yieldThresholds } from "./lib/nightYield.mts";
import { join } from "node:path";

const TASKS = [
  { name: "PKRTrainer-Night-Decomposition", night: true },
  { name: "PKRTrainer-Night-Expansion", night: true },
  { name: "PKRTrainer-After-Night-TurnEv", night: false },
] as const;

/**
 * Akce víka se čte z registru, ne přes `powercfg /q`.
 *
 * Nastavení je schované atributem (`Attributes=1`), takže `powercfg /q` skončí
 * s kódem 0 a **hodnotu nevypíše** - vrátí jen hlavičku schématu. Instalátor
 * atribut odkrývá, ale kontrola se na to spoléhat nesmí: registr platí vždycky.
 */
/**
 * Schéma se zjišťuje **aktivní**, ne zadrátované.
 *
 * Stroj má čtyři schémata a hodnotu vrací něco, co ji přepisuje ve všech
 * (naměřeno 30. 9. 2026). Kontrola, která čte pevný GUID, by po přepnutí
 * schématu měřila to, na kterém stroj neběží - a hlásila by „ok" k ničemu.
 */
const LID_READ = (which: "AC" | "DC"): string => [
  "$s = ((powercfg /getactivescheme) -replace '.*GUID: ([0-9a-f-]+).*', '$1').Trim()",
  "$k = \"HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\$s"
    + "\\4f971e89-eebd-4455-a8de-9e59040e7347\\5ca83367-6e45-459f-a27b-476b1d01c936\"",
  `(Get-ItemProperty -Path $k -ErrorAction Stop).${which}SettingIndex`,
].join("; ");

const TONIGHT = "Agents/daily/tonight.json";
const STAGED_PARAMS = join(
  "Agents/solver-input/texas-solver/mtt-safe-flops-v1/parameters",
  "pkrtrainer_mtt_seat_pair_expansion_v1",
);
const CHECKPOINT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";

/** Kolik minut má noční okno (21:00-07:00 minus rezerva na konci). */
const WINDOW_MINUTES = 587;

/*
 * Kolik minut stojí deska, podle hloubky. **Nečte se to odsud** - čte se to
 * z `board-cost.generated.json`, který měří `npm run mtt:board-cost` z nočního
 * logu. Do 6. 10. 2026 to tu byla ručně psaná tabulka a byla to jedna z pěti
 * kopií téhož čísla; proč to nejde sjednotit do jedné konstanty, je rozepsané
 * v `scripts/lib/boardCost.mts`.
 *
 * Dvě věci, které tu do 6. 10. stály špatně, ať se nevrátí:
 *
 * 1. Stálo tu, že **nadsazený odhad škodí méně**, protože „výhled fronty vyjde
 *    kratší". Je to naopak. Výhled je `minuty / okno`, takže dražší deska dá
 *    **víc** nahlášených nocí. Kdo cenu nadsadí, ohlásí zásobu, která není, a
 *    noc běží naprázdno. Bezpečné je cenu podstřelit, tedy medián - a `plán`
 *    v té tabulce je přesně medián.
 * 2. Stálo tu, že `A72r` na 40 bb byla nejrychlejší deska rodiny (9,3 proti
 *    mediánu 19,3). Noc z 5. na 6. 10. to vyvrátila: `A72r` je na 40 bb ve
 *    třech sesterských rodinách **nejdražší** textura (26,5, 28,6, 29,1).
 *    Těch 9,3 byla ruční sonda přes den, a ta cenu noci neříká.
 */
/*
 * Chybějící tabulka nesmí hlídače **shodit**. Nenulový konec by sice byl taky
 * červená, ale výstupem by byl stack trace místo pojmenovaného řádku - a hlídač
 * má říkat, co je špatně, ne že spadl. Prázdná tabulka proto projde dál a
 * zčervená na řádku „každá hloubka ve frontě má změřenou cenu".
 */
const BOARD_COST = (() => {
  try {
    return readBoardCostTable();
  } catch {
    return { measuredAt: "chybí", source: "chybí", solves: 0, depths: [] };
  }
})();

/**
 * Kolik minut si deska té rodiny vezme.
 *
 * Neznámá hloubka vrací `undefined`, ne číslo. Dřív tu bylo
 * `MINUTES_PER_BOARD_DEEP = 40`, tedy tichá odpověď na hloubku, kterou nikdo
 * nezměřil - a hlídač má o takové hloubce **zčervenat**, ne ji ocenit.
 */
function minutesPerBoard(family: string): number | undefined {
  return costForDepth(BOARD_COST, depthOfFamily(family))?.planMinutes;
}

type Check = { label: string; ok: boolean; got: string; want: string };
const checks: Check[] = [];
const ESCALATION_STEPS = escalationSteps();

const add = (label: string, ok: boolean, got: string, want: string): void => {
  checks.push({ label, ok, got, want });
};

/** PowerShell vrací prázdno i při chybě; prázdný výstup je proto vada. */
function powershell(script: string): string {
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

for (const task of TASKS) {
  const xml = powershell(`[xml]$x = Export-ScheduledTask -TaskName '${task.name}'; $x.OuterXml`);
  if (xml === "") {
    add(`${task.name}: úloha existuje`, false, "nenalezena", "existuje");
    continue;
  }
  const logon = /<LogonType>([^<]+)<\/LogonType>/.exec(xml)?.[1] ?? "chybí";
  add(`${task.name}: běží i bez přihlášení`, logon === "S4U", logon, "S4U");

  const state = powershell(`(Get-ScheduledTask -TaskName '${task.name}').State`);
  add(`${task.name}: není vypnutá`, state !== "" && state !== "Disabled", state || "neznámý", "Ready/Running");

  const wake = /<WakeToRun>([^<]+)<\/WakeToRun>/.exec(xml)?.[1] ?? "chybí";
  add(`${task.name}: umí probudit stroj`, wake === "true", wake, "true");

  if (task.night) {
    // Opakování je to jediné, co chytí restart **i pád runneru**: po restartu
    // žádná instance nežije, takže další tik noc znovu nastartuje.
    const repeat = /<Interval>(PT\d+M)<\/Interval>/.exec(xml)?.[1] ?? "chybí";
    add(`${task.name}: opakuje se uvnitř okna`, repeat === "PT30M", repeat, "PT30M");
    add(`${task.name}: startuje i po restartu`, /<BootTrigger>/.test(xml), /<BootTrigger>/.test(xml) ? "je" : "chybí", "BootTrigger");
  }
}

/*
 * Je stroj v zásuvce?
 *
 * Tohle je ta kontrola, která tu do 2. 10. 2026 chyběla - a kvůli tomu měl
 * hlídač 21 zelených řádků nad nocí, která přišla o **8 hodin 21 minut**.
 * Noc 1.-2. 10. 2026 usnula v 23:15:51 a probudila se v 7:36:50; systémový log
 * uvádí důvod bez obalu: `Důvod spánku: Battery`. Z pětatřiceti desek udělala
 * čtrnáct.
 *
 * Proč to ostatní řádky nechytily: `víko na síti`, `na síti neusne nečinností`
 * i `časovače probuzení` čtou `ACSettingIndex`, tedy chování **při napájení ze
 * sítě**. Když stroj na síti není, platí hodnoty pro baterii - a tam víko
 * uspává (správně, notebook v tašce se jinak uvaří). Všechny tři tedy mohou
 * být zelené a noc přesto spí. Kontrolovaly nastavení, ne skutečnost.
 *
 * `keep_system_awake` v runneru proti tomu nepomůže a pomoct nemůže:
 * `PowerSetRequest(PowerRequestExecutionRequired)` říká „tenhle proces musí
 * běžet dál", ne „nevypínej se, až dojde baterie".
 *
 * Řádek je varování, ne zákaz: pár desek na baterii je lepší než žádná a
 * runner kvůli tomu neskončí. Jen to už nikdo nesmí přehlédnout.
 */
/*
 * Řádky se spojují **novou řádkou, ne středníkem**: `; elseif` ani `; else`
 * PowerShell nebere a celý příkaz spadne na „The term 'elseif' is not
 * recognized". Ostatní čtení v tomhle souboru středník snesou, protože žádné
 * z nich nemá větev.
 *
 * `BatteryStatus -eq 2` znamená „na síti" (`Win32_Battery`). Stroj bez baterie
 * žádnou instanci nemá, a ten v zásuvce je vždycky.
 */
const POWER_READ = [
  "$b = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)",
  "if ($b.Count -eq 0) { 'sit-bez-baterie' }",
  "elseif ($b[0].BatteryStatus -eq 2) { 'sit' }",
  "else { 'baterie ' + $b[0].EstimatedChargeRemaining + ' %' }",
].join("\n");
const power = powershell(POWER_READ);
add(
  "stroj je v zásuvce (na baterii noc usne)",
  power.startsWith("sit"),
  power === "" ? "nepřečteno" : power,
  "sit",
);

/*
 * Prospala poslední noc část okna?
 *
 * Zpětná kontrola, ne předpověď - a jediná, která o uplynulé noci říká pravdu
 * nezávisle na runneru. Noc 1.-2. 10. 2026 ohlásila „hotovo 14, selhalo 0",
 * což zní jako úspěch; teprve systémový log ukázal, že mezi 23:15:51 a 7:36:50
 * stroj spal, takže čtrnáct desek je třetina toho, co okno uneslo.
 *
 * Čte se `Kernel-Power` ID 42 („Systém přechází do režimu spánku"), protože
 * ten nese i důvod - u té noci `Battery`. ID 506/507 (moderní úsporný režim)
 * se tu nepočítají: těch je i za normální noci hodně a o ztrátě okna neříkají
 * nic.
 */
const NIGHT_SLEPT_READ = [
  "$now = Get-Date",
  "$end = $now.Date.AddHours(7)",
  "if ($end -gt $now) { $end = $end.AddDays(-1) }",
  "$start = $end.AddHours(-10)",
  "$e = Get-WinEvent -FilterHashtable @{LogName='System';"
    + "StartTime=$start;EndTime=$end;ID=42} -ErrorAction SilentlyContinue",
  "if ($null -eq $e) { 'nespala' } else {"
    + " $d = ($e | ForEach-Object { if ($_.Message -match 'Dů?vod spánku: *(.+)') "
    + "{ $Matches[1].Trim() } else { 'neuveden' } }) -join ','; "
    + "\"spala {0}x ({1})\" -f @($e).Count, $d }",
].join("; ");
const slept = powershell(NIGHT_SLEPT_READ);
add(
  "poslední noc neprospala část okna",
  slept === "nespala",
  slept === "" ? "nepřečteno" : slept,
  "nespala",
);

// Víko na síti kontroluju, ale **nepočítám na něj**: hodnotu vrací něco zpátky
// na hibernaci (30. 9. po restartu ve všech čtyřech schématech), takže ji
// nastavuje znovu wrapper na začátku každé noci. Tenhle řádek proto říká, jak
// to vypadá **teď** - před nocí to ještě jednou přepíše `lib-night-window.ps1`.
const lidAc = powershell(LID_READ("AC"));
add("víko na síti nic nedělá (nastaví i wrapper)", lidAc === "0", lidAc === "" ? "nepřečteno" : lidAc, "0 (nedělat nic)");

// Na baterii se hodnota **nemá** měnit: notebook v tašce se jinak uvaří.
const lidDc = powershell(LID_READ("DC"));
add("víko na baterii pořád uspává", lidDc !== "" && lidDc !== "0", lidDc === "" ? "nepřečteno" : lidDc, "1 nebo 2");

/*
 * Uspání nečinností a časovače probuzení.
 *
 * Víko není jediná cesta, jak noc zastavit. Kdyby se na síti zapnulo uspávání
 * nečinností, stroj usne uprostřed vrstvy a žádný softwarový zámek to nepřebije
 * (bod 158). Naměřeno 1. 10. 2026: dnes je `STANDBYIDLE AC=0` (nikdy) a
 * `RTCWAKE AC=1`, takže je to v pořádku - **ale víko se po restartu vrátilo
 * z 0 na 2**, takže se na trvalost spoléhat nedá a kontrolovat se to musí.
 *
 * Časovače probuzení jsou tu proto, že bez nich nemá `WakeToRun` čím probudit.
 * Pozor na výklad: za 20 dní **nezpůsobil probuzení ani jeden časovač**
 * (`WakeSource` je u všech probuzení prázdný), takže že se stroj ve 21:00
 * probudí, není odpozorované - jen umožněné. Spolehlivá cesta je neuspat ho.
 */
const SLEEP_READ = (setting: string): string => [
  "$s = ((powercfg /getactivescheme) -replace '.*GUID: ([0-9a-f-]+).*', '$1').Trim()",
  "$k = \"HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\$s"
    + `\\238c9fa8-0aad-41ed-83f4-97be242c8f20\\${setting}"`,
  "(Get-ItemProperty -Path $k -ErrorAction Stop).ACSettingIndex",
].join("; ");

const idleSleep = powershell(SLEEP_READ("29f6c1db-86da-48c5-9fdb-f2b67b1f44da"));
add("na síti neusne nečinností", idleSleep === "0", idleSleep === "" ? "nepřečteno" : `${idleSleep} s`, "0 (nikdy)");

const wakeTimers = powershell(SLEEP_READ("bd3b718a-0680-4d9d-8ab2-e1d2b4ac806d"));
add("časovače probuzení na síti povolené", wakeTimers === "1", wakeTimers === "" ? "nepřečteno" : wakeTimers, "1");

/** Nastagované desky a jejich checkpointy, po rodinách. */
function stagedProgress(): Map<string, { have: number; want: number; retrying: number; exhausted: number; order: number }> {
  const progress = new Map<string, { have: number; want: number; retrying: number; exhausted: number; order: number }>();
  if (!existsSync(STAGED_PARAMS)) return progress;
  for (const name of readdirSync(STAGED_PARAMS).sort()) {
    if (!name.endsWith(".txt")) continue;
    const stem = name.slice(0, -4).replace(/^[0-9]+_/, "");
    const match = /(MTT9_[0-9]+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$/.exec(stem);
    if (match === null) continue;
    const [, family, board] = match;
    const row = progress.get(family) ?? { have: 0, want: 0, retrying: 0, exhausted: 0, order: Number.MAX_SAFE_INTEGER };
    row.want += 1;
    const checkpoint = join(CHECKPOINT_ROOT, family, "raw", `pkrtrainer_${family}_${board}.json`);
    if (existsSync(checkpoint) && statSync(checkpoint).size > 0) row.have += 1;
    /*
     * Spadlá deska je od 2. 10. 2026 dvojí, a splést je dohromady by znamenalo
     * lhát v obě strany.
     *
     * Runner má žebřík tří stupňů (rozhodnutí vlastníka 3a): 30 min, 60 min,
     * 60 min s přesností 1 %. Deska, které stupně zbývají, se **příští noc
     * nabídne** - je to čekající práce, ne mrtvý konec. Teprve deska, která
     * žebřík vyčerpala, drží rodinu nehotovou navždy.
     *
     * Do 2. 10. tu stálo „deska s `.failed` už se nikdy nenabídne", což tehdy
     * platilo a dnes neplatí; nechat to tak by hlásilo zaseknutou rodinu nad
     * deskou, která má dnes v noci přijít na řadu.
     */
    else if (existsSync(`${checkpoint}.failed`)) {
      if (failureLevel(`${checkpoint}.failed`) >= ESCALATION_STEPS) row.exhausted += 1;
      else row.retrying += 1;
    }
    else row.order = Math.min(row.order, Number(/^([0-9]+)_/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER));
    progress.set(family, row);
  }
  return progress;
}

/*
 * Že se žebřík podařilo přečíst, je samo kontrola.
 *
 * `escalationSteps()` padá na 1, když vzor v runneru nenajde - a to je bezpečná
 * strana (každá spadlá deska se počítá za vyčerpanou), ale **tiše** by to
 * hlásilo zaseknuté rodiny nad deskami, které mají dnes v noci přijít na řadu.
 * Radši jeden řádek, který zčervená, než sedm, které lžou.
 */
add("žebřík pokusů se přečetl z runneru", ESCALATION_STEPS > 1,
  `${ESCALATION_STEPS} ${ESCALATION_STEPS === 1 ? "stupeň (nepřečteno?)" : "stupně"}`,
  "víc než 1");

const progress = stagedProgress();
const pending = [...progress.values()].reduce((sum, row) => sum + (row.want - row.have), 0);

if (!existsSync(TONIGHT)) {
  add("rozhodnutí o noci existuje", false, "tonight.json chybí", "schéma V2");
} else {
  let tonight: Record<string, unknown> = {};
  try {
    tonight = JSON.parse(readFileSync(TONIGHT, "utf8")) as Record<string, unknown>;
  } catch {
    tonight = {};
  }
  const schema = String(tonight.schemaVersion ?? "chybí");
  add("rozhodnutí o noci je čitelné strojem", schema === "PKRTRAINER_NIGHT_PRIORITY_V2",
    schema, "PKRTRAINER_NIGHT_PRIORITY_V2");
  /*
   * Kontroluje se to, podle čeho runner **doopravdy** rozhoduje.
   *
   * Od 7. 10. 2026 je to práh v **minutách** (`YIELD_MIN_MINUTES`), ne v deskách:
   * osm desek je podle hloubky 51 minut, nebo 5,3 hodiny. Hlídač, který by se
   * ptal po deskách, by u fronty na 50 bb hlásil „neustoupí" tam, kde runner
   * ustoupí - a tahle dvojice si už jednou odporovala (29. 9. 2026 počítala
   * zpráva rodiny a runner desky).
   *
   * Desky zůstávají jako záloha pro případ, že cena desky není; tehdy se podle
   * nich rozhoduje i runner.
   */
  const limits = yieldThresholds();
  const minutesHave = tonight.stagedMinutes === null || tonight.stagedMinutes === undefined
    ? undefined
    : Number(tonight.stagedMinutes);
  const boardsHave = Number(tonight.stagedBoards ?? pending);
  const yields = shouldYield({
    ...(minutesHave === undefined ? {} : { minutes: minutesHave }),
    boards: boardsHave,
    priority: String(tonight.priority),
    thresholds: limits,
  });
  add("rozklad monolitu ustoupí", yields,
    minutesHave === undefined
      ? `${boardsHave} desek (cena desky není), priorita ${String(tonight.priority)}`
      : `${Math.round(minutesHave / 60)} h práce (${boardsHave} desek), priorita ${String(tonight.priority)}`,
    minutesHave === undefined
      ? `aspoň ${limits.boards} desek a NEW_FAMILIES`
      : `aspoň ${limits.minutes} min a NEW_FAMILIES`);
  // Práh přečtený ze runneru je sám předpoklad: kdyby se literál přejmenoval,
  // hlídač by tiše hlásil podle zálohy a noc by se rozhodovala podle něčeho
  // jiného. Tentýž řádek má žebřík pokusů.
  add("práh ustoupení se přečetl z runneru", limits.fromRunner,
    limits.fromRunner ? `${limits.minutes} min, záloha ${limits.boards} desek` : "čte se záloha",
    "YIELD_MIN_MINUTES v run_night_decomposition.py");
}

// Tohle je ta otázka, kterou si nikdo nepoložil a stála celou noc (bod 279):
// noc může odsolvit 67 desek a nedodat **nic**, když žádnou rodinu nedokončí.
const willFinish = [...progress.entries()]
  .filter(([, row]) => row.have < row.want)
  .sort((a, b) => a[1].order - b[1].order)
  .reduce<{ seen: number; families: string[] }>((acc, [family, row]) => {
    // Rozpočet noci je v **minutách**, ne v deskách: deska na 40 bb stojí
    // dvakrát tolik co na 25, takže počítat je po kusech nadhodnocuje průtok.
    const minutes = minutesPerBoard(family);
    // Rodina bez ceny se do „dokončí se" nepočítá: tvrdit, že doběhne, by
    // znamenalo mít její cenu za nulovou, a to je ta nejhorší možná odpověď.
    // Že cena chybí, hlásí vlastní řádek níž.
    if (minutes === undefined) return acc;
    const next = acc.seen + (row.want - row.have) * minutes;
    if (next <= WINDOW_MINUTES) return { seen: next, families: [...acc.families, family] };
    return acc;
  }, { seen: 0, families: [] });

add("noc dokončí aspoň jednu rodinu", willFinish.families.length > 0,
  `${willFinish.families.length} rodin do ${Math.round(willFinish.seen)} z ${WINDOW_MINUTES} min`,
  "aspoň 1");

/*
 * Na kolik nocí práce ve frontě vydrží.
 *
 * Tohle je pohled dopředu, a do 5. 10. 2026 ho hlídač neměl. Všechny ostatní
 * řádky se ptají „je připravená **dnešní** noc" - a ta otázka má zelenou
 * odpověď i večer předtím, než fronta doběhne. Změřeno: 2. 10. zbývalo 151
 * desek, noci 2.-5. 10. udělaly 70, 64 a 17, takže 4. 10. v 01:13 byla fronta
 * na nule a 5. 10. v 19:07 neměla noc na čem jet. Útes byl spočitatelný tři
 * dny dopředu a nikdo se nedíval.
 *
 * Práh je dvě noci: nastagovat další dávku stojí minuty, ale vědět se o tom
 * musí den dopředu, ne v devatenáct hodin.
 *
 * Prázdná fronta **neznamená prázdnou noc**: rozklad si okno vezme na riverové
 * vrstvy, jak udělal 4. 10. od 01:13 do 06:37. Znamená ale, že se nedodá žádná
 * nová rodina, a to je ta dražší polovina.
 */
const NIGHTS_AHEAD_MIN = 2;
const queue = [...progress.entries()].reduce((acc, [family, row]) => {
  const boards = Math.max(0, row.want - row.have - row.exhausted);
  // Rodina bez změřené ceny přidá desky, ale **nula minut**. Je to schválně na
  // tuhle stranu: výhled tím vyjde kratší, hlídač zčervená dřív a nastaguje se
  // dávka. Opačná volba by ohlásila zásobu, která není.
  const minutes = minutesPerBoard(family) ?? 0;
  return { boards: acc.boards + boards, minutes: acc.minutes + boards * minutes };
}, { boards: 0, minutes: 0 });
const nightsAhead = queue.minutes / WINDOW_MINUTES;
add("fronta vydrží aspoň dvě noci", nightsAhead >= NIGHTS_AHEAD_MIN,
  `${queue.boards} desek za ~${Math.round(queue.minutes / 60)} h, tedy ${nightsAhead.toFixed(1)} noci`,
  `aspoň ${NIGHTS_AHEAD_MIN} noci (${Math.round(NIGHTS_AHEAD_MIN * WINDOW_MINUTES / 60)} h práce)`);

/*
 * Má každá nastagovaná hloubka změřenou cenu?
 *
 * Bez tohohle řádku je výhled fronty **tiše nepravdivý**: hloubka bez ceny
 * přidá nula minut, takže 96 desek na 50 bb vypadá jako nic. Nula je správná
 * volba uvnitř výpočtu (chybí na bezpečnou stranu), ale nesmí být nevidět.
 *
 * Extrapolovaný řádek projde, ale řekne se to: je to dohoda, ne měření, a do
 * tabulky se dostal proto, že nastagovat hloubku jde dřív, než ji noc změří.
 */
const pricedDepths = new Set(BOARD_COST.depths.map((row) => row.depthBB));
const unpriced = [...new Set([...progress.entries()]
  .filter(([, row]) => row.want - row.have - row.exhausted > 0)
  .map(([family]) => depthOfFamily(family)))]
  .filter((depth) => !pricedDepths.has(depth))
  .sort((left, right) => left - right);
add("každá hloubka ve frontě má změřenou cenu", unpriced.length === 0,
  unpriced.length === 0
    ? `${BOARD_COST.depths.map((row) => `${row.depthBB}bb ${row.planMinutes} min`
      + `${row.basis === "měřeno" ? "" : " (extrapolace)"}`).join(", ")}`
    : `bez ceny: ${unpriced.map((depth) => `${depth}bb`).join(", ")}`,
  "npm run mtt:board-cost -- --write");

// Rodina, které zbývají jen desky s `.failed`, se sama nedokončí **nikdy** -
// a bez téhle kontroly by „18 z 18 sedí" mlčelo o tom, že její obsah je zamčený
// (naměřeno 1. 10. 2026 na CO_BTN: dvě desky na timeout 30 min).
const stuck = [...progress.entries()].filter(
  ([, row]) => row.have < row.want && row.have + row.exhausted >= row.want,
);
add("žádná rodina není zaseknutá na spadlé desce", stuck.length === 0,
  stuck.length === 0 ? "žádná" : stuck.map(([family, row]) => `${family} ${row.have}/${row.want}`).join(", "),
  "žádná");

/*
 * Dobral ranní cyklus, nebo jen začal?
 *
 * Naměřeno 1. 10. 2026: cyklus v 07:05 vypsal hlavičku „[1/3] generuji packy pro
 * 32 rodin" a **skončil** - žádné „[1/3] hotovo", žádná fáze 2 ani 3, žádné
 * ověření. Plánovač přitom hlásil `LastTaskResult: 0` a stav `Ready`, takže
 * ráno vypadalo úspěšně. Packy po něm zůstaly v pořádku (změřeno: 2013 → 2013
 * pravidel, nic neubráno), ale to je štěstí, ne zásluha: stejná smrt o minutu
 * později by nechala rozepsaný pack.
 *
 * Cyklus svůj konec hlásí sám („Necommitováno schválně…"), jen to nikdo nečetl.
 * Tahle kontrola čte **poslední** blok logu, protože běhy se do něj přidávají
 * za sebou.
 */
const CYCLE_LOG = "artifacts/after-night-turn-ev.log";
const CYCLE_START = "Cyklus po noční práci";
const CYCLE_END = "Necommitováno schválně";
/*
 * ...a **běžící cyklus není mrtvý cyklus.**
 *
 * Tohle je přesně ta záměna, kterou jsem 6. 10. 2026 udělal čtyřikrát za jedno
 * dopoledne: log končil uprostřed fáze, tak jsem tvrdil, že cyklus umřel, visí
 * nebo stojí - a každé z těch tvrzení vyvrátilo měření, protože cyklus celou
 * dobu pracoval (83 minut CPU, +27 s za 30 s). Rozdíl mezi „log končí uprostřed,
 * protože proces umřel" a „log končí uprostřed, protože proces zrovna píše", se
 * z logu přečíst **nedá**; ví to jen Plánovač.
 *
 * Bez tohohle se hlídač ptal v devět ráno, jestli cyklus dobral, a červenal
 * pokaždé, když ještě běžel - tedy na věc, která je v pořádku. Hlídač, který
 * křičí na normální stav, přestane být čtený.
 */
const CYCLE_TASK = "PKRTrainer-After-Night-TurnEv";
if (!existsSync(CYCLE_LOG)) {
  add("poslední ranní cyklus dobral", false, "log chybí", `blok končí „${CYCLE_END}“`);
} else {
  const log = readFileSync(CYCLE_LOG, "utf8");
  const lastRun = log.slice(log.lastIndexOf(CYCLE_START));
  const finished = lastRun.includes(CYCLE_END);
  const running = powershell(`(Get-ScheduledTask -TaskName '${CYCLE_TASK}').State`) === "Running";
  add("poslední ranní cyklus dobral", finished || running,
    finished ? "ano" : running ? "ještě běží, log zatím bez konce" : "skončil uprostřed, bez ověření",
    `blok končí „${CYCLE_END}“, nebo úloha ještě běží`);
}

console.log("Připravenost noci 21:00-07:00");
console.log("");
for (const check of checks) {
  console.log(`${check.ok ? "  ok  " : "  !!  "}${check.label.padEnd(46)} ${check.got}${check.ok ? "" : `   (čekáno: ${check.want})`}`);
}
console.log("");
if (willFinish.families.length > 0) {
  console.log(`rodiny, které má noc dokončit (a ráno smí do packu): ${willFinish.families.length}`);
  for (const family of willFinish.families) console.log(`  ${family}`);
  console.log("");
}

// Opakované pokusy se vypisují zvlášť: jdou **na konec** noci a mají vlastní
// strop, takže do „kolik rodin noc dokončí" nepatří, ale vědět se o nich má.
const retrying = [...progress.entries()].filter(([, row]) => row.retrying > 0);
if (retrying.length > 0) {
  console.log(`desky na opakovaný pokus (až po čerstvých, s vyšším stropem): `
    + `${retrying.reduce((sum, [, row]) => sum + row.retrying, 0)}`);
  for (const [family, row] of retrying) {
    console.log(`  ${family} ${row.have}/${row.want}, k opakování ${row.retrying}`);
  }
  console.log("");
}
const failed = checks.filter((check) => !check.ok);
if (failed.length === 0) {
  console.log(`${checks.length} z ${checks.length} sedí; noc poběží i bez přihlášení, přes zavřené víko a po restartu.`);
} else {
  console.log(`${failed.length} z ${checks.length} nesedí. Stroj spraví (jako správce):`);
  console.log("  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/scheduled/install-night-tasks.ps1");
  console.log("Prázdnou frontu tím nespravíš - ta chce mtt:resolve-stage nebo mtt:seat-pair-expansion.");
  /*
   * A když ani ty nic nevrátí, je to rozhodnutí, ne úklid. K 5. 10. 2026 je osa
   * 25 bb vyčerpaná na všech třech směrech (dvojice 29/29, šablona textur došla,
   * přesolvení hlásí „liší se 0"), takže další práce znamená jinou hloubku - a
   * ta stojí jinak: 25 bb je 148 s na desku, 100 bb přes 2,5 h. Hlídač to
   * nerozhodne a nemá předstírat, že na to má příkaz.
   */
  if (nightsAhead < NIGHTS_AHEAD_MIN) {
    console.log("Když obojí vrátí nulu, je osa vyčerpaná a další práce chce rozhodnutí");
    console.log("o hloubce - měřené ceny a možnosti jsou v Agents/MTT_ORCHESTRATOR.md, vrstva 7.");
  }
  if (stuck.length > 0) {
    console.log(`Zaseknutou rodinu taky ne: deska vyčerpala všechny ${ESCALATION_STEPS} stupně`);
    console.log("žebříku pokusů, takže ji runner už nenabídne. Zbývá ji z dávky vyřadit, nebo");
    console.log("rodinu nechat na starém packu - rozhodnutí o rozpočtu, ne úklid.");
  }
  process.exitCode = 1;
}
