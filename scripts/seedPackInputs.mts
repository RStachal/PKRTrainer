/**
 * `npm run mtt:pack-inputs-seed` - zapíše, že dnešní packy jsou z dnešních vstupů.
 *
 * ## K čemu to je
 *
 * Brána v ranním cyklu přeskočí rodinu, o které **má záznam**, že její pack
 * vznikl z týchž vstupů. Záznam si cyklus píše sám, ale až když rodinu vyrobí -
 * takže první ráno po zavedení brány zaplatí celou fázi znovu a ušetří se teprve
 * to druhé. U rodiny `..._100BB_SB_BB_SRP_OOP_CBET_HIGHSPR` je to 112 minut.
 *
 * Tenhle skript to první ráno přeskočí tím, že záznam doplní pro packy, které
 * **prokazatelně** vznikly z dnešních vstupů.
 *
 * ## Co se tím tvrdí a čím je to podložené
 *
 * Tvrzení je „tenhle pack byl postavený z těchto sdílených vstupů". Dokazuje se
 * časem: bere se jen pack, který je **novější než zadaná hranice** (`--since`),
 * tedy vznikl v běhu, o kterém se ví, že jel proti dnešnímu obsahu
 * `postflopBetSizing.generated.ts` i dnešním generátorům.
 *
 * Proto se **nesmí** seedovat všechno, co na disku leží: ranní cyklus 7. 10. 2026
 * jednu kombinaci rodina+ulice odmítl, takže jeden pack je starý. Kdyby se
 * zaznamenal jako hotový, přeskakoval by se navždy a jeho obsah by u hráče tiše
 * zestárl. Hranice v čase tu rodinu vynechá sama.
 *
 * Bez `--write` se jen vypíše, co by se zapsalo.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  PACK_INPUTS_PATH,
  newestCheckpointMs,
  packSlug,
  sharedInputsHash,
  type PackInputsRecord,
} from "./lib/packInputs.mts";

const CHECKPOINT_ROOT = "Agents/solver-input/gto-plus/sample-postflop-v1/output/texas-solver";
const STREET_PACK_DIR: Readonly<Record<string, string>> = {
  flop: "src/data/ranges/flop",
  turn: "src/data/ranges/turn",
  river: "src/data/ranges/river",
};

const arg = (name: string): string | undefined => process.argv
  .find((item) => item.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const write = process.argv.includes("--write");
const since = arg("since");
if (since === undefined) {
  console.error("Chybí --since=<ISO čas>, od kterého jsou packy prokazatelně z dnešních vstupů.");
  console.error("  npm run mtt:pack-inputs-seed -- --since=\"2026-10-07T07:05\" [--write]");
  process.exit(2);
}
const sinceMs = Date.parse(since);
if (Number.isNaN(sinceMs)) {
  console.error(`--since=${since} není čas, který jde přečíst.`);
  process.exit(2);
}

const shared = sharedInputsHash();
const record: Record<string, PackInputsRecord> = (() => {
  try {
    return JSON.parse(readFileSync(PACK_INPUTS_PATH, "utf8")) as Record<string, PackInputsRecord>;
  } catch {
    return {};
  }
})();

const families = existsSync(CHECKPOINT_ROOT) ? readdirSync(CHECKPOINT_ROOT) : [];
let seeded = 0;
let tooOld = 0;
let missing = 0;
for (const street of Object.keys(STREET_PACK_DIR)) {
  for (const family of families) {
    const pack = join(STREET_PACK_DIR[street], `${packSlug(family)}.generated.json`);
    if (!existsSync(pack)) {
      missing += 1;
      continue;
    }
    if (statSync(pack).mtimeMs < sinceMs) {
      console.log(`  starší než hranice, vynechávám: ${family}/${street}`);
      tooOld += 1;
      continue;
    }
    const checkpointMs = newestCheckpointMs(CHECKPOINT_ROOT, family);
    // Rodina bez checkpointu se nezapisuje: brána takový záznam stejně nepustí
    // (shoda dvou nul není důkaz) a zapsat ho by jen vypadalo jako práce.
    if (checkpointMs === 0) continue;
    record[`${street}:${family}`] = { shared, checkpointMs };
    seeded += 1;
  }
}

console.log("");
console.log(`k zápisu ${seeded} rodin+ulic, vynecháno ${tooOld} starších a ${missing} bez packu`);
console.log(`otisk sdílených vstupů ${shared.slice(0, 12)}`);
if (!write) {
  console.log(`nic se nezapsalo; zapiš přes --write do ${PACK_INPUTS_PATH}`);
} else {
  writeFileSync(PACK_INPUTS_PATH, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`zapsáno do ${PACK_INPUTS_PATH}`);
}
