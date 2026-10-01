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

/** Kolik desek stihne noc; z naměřeného tempa 8,8 min/deska za 587 minut okna. */
const BOARDS_PER_NIGHT = 66;

type Check = { label: string; ok: boolean; got: string; want: string };
const checks: Check[] = [];
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

// Víko na síti kontroluju, ale **nepočítám na něj**: hodnotu vrací něco zpátky
// na hibernaci (30. 9. po restartu ve všech čtyřech schématech), takže ji
// nastavuje znovu wrapper na začátku každé noci. Tenhle řádek proto říká, jak
// to vypadá **teď** - před nocí to ještě jednou přepíše `lib-night-window.ps1`.
const lidAc = powershell(LID_READ("AC"));
add("víko na síti nic nedělá (nastaví i wrapper)", lidAc === "0", lidAc === "" ? "nepřečteno" : lidAc, "0 (nedělat nic)");

// Na baterii se hodnota **nemá** měnit: notebook v tašce se jinak uvaří.
const lidDc = powershell(LID_READ("DC"));
add("víko na baterii pořád uspává", lidDc !== "" && lidDc !== "0", lidDc === "" ? "nepřečteno" : lidDc, "1 nebo 2");

/** Nastagované desky a jejich checkpointy, po rodinách. */
function stagedProgress(): Map<string, { have: number; want: number; failed: number; order: number }> {
  const progress = new Map<string, { have: number; want: number; failed: number; order: number }>();
  if (!existsSync(STAGED_PARAMS)) return progress;
  for (const name of readdirSync(STAGED_PARAMS).sort()) {
    if (!name.endsWith(".txt")) continue;
    const stem = name.slice(0, -4).replace(/^[0-9]+_/, "");
    const match = /(MTT9_[0-9]+BB_[A-Z0-9_]+?_(?:SRP|3BP)[A-Z0-9_]*)_([^_]+)$/.exec(stem);
    if (match === null) continue;
    const [, family, board] = match;
    const row = progress.get(family) ?? { have: 0, want: 0, failed: 0, order: Number.MAX_SAFE_INTEGER };
    row.want += 1;
    const checkpoint = join(CHECKPOINT_ROOT, family, "raw", `pkrtrainer_${family}_${board}.json`);
    if (existsSync(checkpoint) && statSync(checkpoint).size > 0) row.have += 1;
    // Deska s `.failed` už se nikdy nenabídne, takže ji noc nedokončí a rodina
    // zůstane navždy nehotová. Do „kolik stihne noc" se počítat nesmí.
    else if (existsSync(`${checkpoint}.failed`)) row.failed += 1;
    else row.order = Math.min(row.order, Number(/^([0-9]+)_/.exec(name)?.[1] ?? Number.MAX_SAFE_INTEGER));
    progress.set(family, row);
  }
  return progress;
}

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
  const threshold = Number(tonight.yieldMinBoards ?? 8);
  add("rozklad monolitu ustoupí", pending >= threshold && tonight.priority === "NEW_FAMILIES",
    `${pending} desek, priorita ${String(tonight.priority)}`, `aspoň ${threshold} a NEW_FAMILIES`);
}

// Tohle je ta otázka, kterou si nikdo nepoložil a stála celou noc (bod 279):
// noc může odsolvit 67 desek a nedodat **nic**, když žádnou rodinu nedokončí.
const willFinish = [...progress.entries()]
  .filter(([, row]) => row.have < row.want)
  .sort((a, b) => a[1].order - b[1].order)
  .reduce<{ seen: number; families: string[] }>((acc, [family, row]) => {
    const next = acc.seen + (row.want - row.have);
    if (next <= BOARDS_PER_NIGHT) return { seen: next, families: [...acc.families, family] };
    return acc;
  }, { seen: 0, families: [] });

add("noc dokončí aspoň jednu rodinu", willFinish.families.length > 0,
  `${willFinish.families.length} rodin do ${BOARDS_PER_NIGHT} desek`, "aspoň 1");

// Rodina, které zbývají jen desky s `.failed`, se sama nedokončí **nikdy** -
// a bez téhle kontroly by „18 z 18 sedí" mlčelo o tom, že její obsah je zamčený
// (naměřeno 1. 10. 2026 na CO_BTN: dvě desky na timeout 30 min).
const stuck = [...progress.entries()].filter(
  ([, row]) => row.have < row.want && row.have + row.failed >= row.want,
);
add("žádná rodina není zaseknutá na spadlé desce", stuck.length === 0,
  stuck.length === 0 ? "žádná" : stuck.map(([family, row]) => `${family} ${row.have}/${row.want}`).join(", "),
  "žádná");

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
const failed = checks.filter((check) => !check.ok);
if (failed.length === 0) {
  console.log(`${checks.length} z ${checks.length} sedí; noc poběží i bez přihlášení, přes zavřené víko a po restartu.`);
} else {
  console.log(`${failed.length} z ${checks.length} nesedí. Stroj spraví (jako správce):`);
  console.log("  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/scheduled/install-night-tasks.ps1");
  console.log("Prázdnou frontu tím nespravíš - ta chce mtt:resolve-stage nebo mtt:seat-pair-expansion.");
  if (stuck.length > 0) {
    console.log("Zaseknutou rodinu taky ne: deska opakovaně spadla a monolit ji už nenabídne.");
    console.log("Buď smazat její `.failed` a zkusit znovu s vyšším stropem času, nebo ji z dávky");
    console.log("vyřadit. Obojí je rozhodnutí o rozpočtu noci, ne úklid - proto to nedělá skript.");
  }
  process.exitCode = 1;
}
