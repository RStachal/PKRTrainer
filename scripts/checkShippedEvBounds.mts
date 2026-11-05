/**
 * Leží některá dodávaná EV mimo to, co pravidla pokeru dovolují?
 *
 *   npm run mtt:ev-bounds
 *
 * ## Proč to je potřeba
 *
 * EV je číslo v blindech a **špatná EV je taky číslo v blindech**. Nepozná se
 * podle tvaru, jen podle hodnoty. Za dva dny stavění turnové EV se tenhle tvar
 * chyby objevil šestkrát a pokaždé prošel testy: obrácená konvence OOP/IP,
 * nevážená chybějící váha, kombinace mimo jmenovatel, dělení špatným stackem.
 * Poslední z nich našla právě fyzikální mez, ne test - EV 75,5 BB tam, kde je
 * strop 74,5 (bod 210).
 *
 * Riverová EV se přitom hráči **dodává** - 48 packů, 14 094 pravidel - a takovou
 * kontrolou nikdy neprošla. Tohle ji dodělává.
 *
 * ## Jaká mez
 *
 * Záměrně **volná**, aby nález znamenal vadu a ne spor o konvenci:
 *
 * - hrdina nemůže prohrát víc, než měl na začátku ulice, tedy stack rodiny,
 * - nemůže vyhrát víc než pot u rozhodnutí plus soupeřův celý stack.
 *
 * EV se měří od kořene riverového uzlu (`riverActionEv` startuje s nulovým
 * vkladem a linku teprve prochází), takže se porovnává se stackem rodiny, ne
 * se zbytkem u rozhodnutí - cestou k němu má hrdina co vsadit. Přísnější mez by
 * hlásila spory o to, odkud se měří; tahle hlásí jen nemožné.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { decodeComboMask, decodeEvDeltas } from "../src/core/evCodec";

/**
 * Obě ulice, které tabulku EV mají nebo mít mohou.
 *
 * Turnová se zatím nedodává (rozhodnutí o místě a strojovém čase, body 211
 * a 214), ale generátor ji umí postavit - a kdyby se postavila mimo tuhle
 * kontrolu, prošla by k hráči bez jediného ověření hodnot. Prázdný adresář
 * proto není chyba, jen nula pravidel.
 */
const STREETS = [
  { label: "riverová", evDir: "src/data/ranges/river-ev", packDir: "src/data/ranges/river" },
  { label: "turnová", evDir: "src/data/ranges/turn-ev", packDir: "src/data/ranges/turn" },
] as const;
/** Rezerva na zaokrouhlení kodeku, v blindech. */
const SLACK_BB = 1;

interface EvRule { m: string; v: (number | null)[] }
interface EvPack {
  familyId?: string;
  packId?: string;
  contentHash?: string;
  combos?: string[];
  rules?: (EvRule | null)[];
}
interface PackRule {
  actions?: string[];
  spot?: { potBB?: number; stackBehindBB?: number };
}
interface StrategyPack { id?: string; contentHash?: string; rules?: PackRule[] }

const stackBBOf = (familyId: string): number => Number(/_(\d+)BB_/.exec(familyId)?.[1] ?? "0");

interface Violation {
  family: string;
  rule: number;
  value: number;
  floor: number;
  ceiling: number;
}

const violations: Violation[] = [];
let packs = 0;
let checkedRules = 0;
let checkedValues = 0;
let mismatchedHash = 0;
let lowest = Infinity;
let highest = -Infinity;

for (const street of STREETS) {
  const { evDir: EV_DIR, packDir: PACK_DIR } = street;
  for (const name of existsSync(EV_DIR) ? readdirSync(EV_DIR).sort() : []) {
    if (!name.endsWith(".json")) continue;
    const table = JSON.parse(readFileSync(join(EV_DIR, name), "utf8")) as EvPack;
    const strategyPath = join(PACK_DIR, name);
    if (!existsSync(strategyPath)) continue;
    const pack = JSON.parse(readFileSync(strategyPath, "utf8")) as StrategyPack;
    packs += 1;

    // Tabulka platí pro jednu podobu packu. Neshoda otisku je vada sama o sobě a
    // meze by se počítaly proti jinému obsahu, takže se to hlásí zvlášť.
    if (table.contentHash !== pack.contentHash) {
      mismatchedHash += 1;
      continue;
    }

    const familyId = table.familyId ?? name;
    const stackBB = stackBBOf(familyId);
    if (stackBB <= 0) continue;

    for (const [index, encoded] of (table.rules ?? []).entries()) {
      if (encoded === null || encoded === undefined) continue;
      const rule = pack.rules?.[index];
      const actionCount = rule?.actions?.length ?? 0;
      if (actionCount <= 0) continue;
      const potBB = rule?.spot?.potBB ?? 0;
      const floor = -(stackBB + SLACK_BB);
      const ceiling = potBB + stackBB + SLACK_BB;

      // Bitmapa se dekóduje taky: kdyby počet kombinací neseděl s počtem hodnot,
      // četly by se hodnoty posunuté a mez by měřila cizí ruce.
      const combos = decodeComboMask(encoded.m, (table.combos ?? []).length);
      const values = decodeEvDeltas(encoded.v, actionCount);
      if (combos.length * actionCount !== values.length) {
        violations.push({ family: familyId, rule: index, value: NaN, floor, ceiling });
        continue;
      }

      checkedRules += 1;
      for (const value of values) {
        if (value === null) continue;
        checkedValues += 1;
        lowest = Math.min(lowest, value);
        highest = Math.max(highest, value);
        if (value < floor || value > ceiling) {
          violations.push({ family: familyId, rule: index, value, floor, ceiling });
        }
      }
    }
  }
}


console.log("Fyzikální mez dodávané EV");
console.log(`  packů ${packs}, pravidel s tabulkou ${checkedRules}, hodnot ${checkedValues}`);
if (mismatchedHash > 0) console.log(`  POZOR: ${mismatchedHash} tabulek má jiný otisk než pack`);
if (checkedValues > 0) {
  console.log(`  rozsah EV: ${lowest.toFixed(1)} az ${highest.toFixed(1)} BB`);
}
console.log(`  mimo mez: ${violations.length}`);

for (const row of violations.slice(0, 15)) {
  console.log(`    ${row.family} pravidlo ${row.rule}: ${Number.isNaN(row.value)
    ? "počet hodnot nesedí s bitmapou"
    : `${row.value.toFixed(1)} BB mimo ${row.floor.toFixed(1)} az ${row.ceiling.toFixed(1)}`}`);
}
if (violations.length > 15) console.log(`    … a dalších ${violations.length - 15}`);

if (violations.length > 0 || mismatchedHash > 0) process.exitCode = 1;
