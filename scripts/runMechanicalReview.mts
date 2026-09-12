import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { runtimeSolvedTurnPacks } from "../src/data/ranges/turnSolvedRuntimeRegistry";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { runtimeSolvedFlopPacks } from "../src/data/ranges/flopSolvedRuntimeRegistry";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { runtimeSolvedRiverPacks } from "../src/data/ranges/riverSolvedRuntimeRegistry";
import { loadSolvedRiverPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import { mechanicalReview, type ReviewStreet } from "../src/data/ranges/mechanicalReview";
import {
  parseTurnReviewVerdicts,
  type TurnReviewVerdictRecord,
} from "../src/data/ranges/turnReviewVerdict";
import type { TurnStrategyPack } from "../src/data/ranges/turnStrategyPack";

/**
 * Pustí měřitelnou kontrolu na všechen vyřešený obsah a zapíše verdikty.
 *
 *   npm run mtt:mechanical-review              # co by prošlo a co ne
 *   npm run mtt:mechanical-review -- --write   # zapsat verdikty
 *
 * Proč to existuje, je popsané v `mechanicalReview.ts`. Krátce: review brána žádá
 * čtenáře, čtenář na 10 447 rozhodnutí není, a brána, kterou nikdo nemůže projít,
 * drží obsah mimo produkci navždy.
 *
 * Verdikt z téhle cesty nese `basis: "MECHANICAL"` a jméno kontroly místo jména
 * člověka. Kdo se na pack zeptá, dostane odpověď „mechanicky ověřeno", ne
 * „přečteno" - to je ten rozdíl, kvůli kterému se tohle nesmí zapisovat jako
 * obyčejný verdikt.
 *
 * Rodina, která některou kontrolou neprojde, verdikt **nedostane**. Zůstane na
 * LOW a vypíše se, co přesně selhalo - to je pak práce pro člověka, a je jí
 * podstatně míň než číst všechno.
 */

const VERDICTS_PATH = "Agents/turn-review/verdicts.json";
const REVIEWER = "PKRTRAINER_MECHANICAL_REVIEW_V1";

const write = process.argv.includes("--write");

await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

const byStreet: Readonly<Record<ReviewStreet, readonly TurnStrategyPack[]>> = {
  FLOP: runtimeSolvedFlopPacks as unknown as readonly TurnStrategyPack[],
  TURN: runtimeSolvedTurnPacks as unknown as readonly TurnStrategyPack[],
  RIVER: runtimeSolvedRiverPacks as unknown as readonly TurnStrategyPack[],
};

function readVerdicts(): TurnReviewVerdictRecord[] {
  if (!existsSync(VERDICTS_PATH)) return [];
  return parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"));
}

const existing = readVerdicts();
const reviewedAt = new Date().toISOString().slice(0, 10);
const accepted: TurnReviewVerdictRecord[] = [];
const refused: { street: ReviewStreet; familyId: string; failures: string[] }[] = [];
let humanKept = 0;

console.log("Měřitelná kontrola vyřešeného obsahu");
console.log("");

for (const street of ["FLOP", "TURN", "RIVER"] as const) {
  const packs = byStreet[street];
  for (const pack of packs) {
    const result = mechanicalReview(pack, street, packs);

    // Verdikt od člověka se nepřepisuje. Měření je slabší doklad a přepsat jím
    // něčí čtení by byl krok zpátky, i když by číslo vypadalo stejně.
    const human = existing.find((item) => (
      item.familyId === result.familyId
      && (item.street ?? "TURN") === street
      && (item.basis ?? "PLAYER_READ") === "PLAYER_READ"
    ));
    if (human !== undefined) {
      humanKept += 1;
      continue;
    }

    if (!result.passed) {
      refused.push({
        street,
        familyId: result.familyId,
        failures: result.checks.filter((check) => !check.passed)
          .map((check) => `${check.id}: ${check.detail}`),
      });
      continue;
    }
    accepted.push({
      street,
      familyId: result.familyId,
      contentHash: result.contentHash,
      outcome: "ACCEPTED",
      reviewedAt,
      reviewer: REVIEWER,
      basis: "MECHANICAL",
      notes: result.checks.map((check) => `${check.id}: ${check.detail}`).join(" | "),
    });
  }
}

const total = accepted.length + refused.length + humanKept;
console.log(`packů: ${total}`);
console.log(`  prošlo měřením:   ${accepted.length}`);
console.log(`  neprošlo:         ${refused.length}`);
// Dvě čísla, ne jedno. `humanKept` počítá lidské verdikty **mezi kontrolovanými
// packy**; flopoví piloti mají verdikt pod katalogovým id a tady nejsou, takže
// řádek hlásil „čteno člověkem: 0" i ve chvíli, kdy v souboru leželo sedm
// lidských verdiktů (9. 9. 2026). Nula, která vypadá jako „nikdo nic nečetl",
// je přesně ten prázdný výsledek, před kterým varuje pravidlo 6.
const humanTotal = existing.filter((item) => (item.basis ?? "PLAYER_READ") === "PLAYER_READ").length;
console.log(`  čteno člověkem:   ${humanKept} z kontrolovaných (měření je nepřepisuje);`
  + ` v souboru celkem ${humanTotal} lidských verdiktů`);

if (refused.length > 0) {
  console.log("");
  console.log("Neprošlo - tohle zůstává na LOW a je to práce pro člověka:");
  for (const row of refused) {
    console.log(`  ${row.street.padEnd(6)} ${row.familyId}`);
    for (const failure of row.failures) console.log(`      ${failure}`);
  }
}

if (!write) {
  console.log("");
  console.log("Nic nezapsáno. Zápis: npm run mtt:mechanical-review -- --write");
} else {
  const kept = existing.filter((item) => !accepted.some((row) => (
    row.familyId === item.familyId && (item.street ?? "TURN") === row.street
  )));
  mkdirSync(dirname(VERDICTS_PATH), { recursive: true });
  writeFileSync(VERDICTS_PATH, `${JSON.stringify({
    schemaVersion: "PKRTRAINER_TURN_REVIEW_V1",
    verdicts: [...kept, ...accepted].sort((left, right) => (
      left.familyId.localeCompare(right.familyId)
      || (left.street ?? "TURN").localeCompare(right.street ?? "TURN")
    )),
  }, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`Zapsáno ${accepted.length} verdiktů do ${VERDICTS_PATH}.`);
  console.log("Přegeneruj packy, aby se důvěra propsala:");
  console.log("  npm run mtt:flop-pack / mtt:turn-pack / mtt:river-pack -- --family=<ID> --write");
}
