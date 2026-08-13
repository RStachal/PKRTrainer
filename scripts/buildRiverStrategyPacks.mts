import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { heroSideOfNode, seatsOfFamily } from "./lib/solvedPackBuilding.mts";
import { buildRiverStrategyRule } from "../src/data/ranges/riverStrategyRuleBuilder";
import { buildRiverStrategyPack } from "../src/data/ranges/riverStrategyPack";
import { TURN_COVERAGE_TARGET, type TurnFamilyEvidence } from "../src/data/ranges/turnReviewGate";

/**
 * Postaví riverový pack z jedné rodiny.
 *
 *   npm run mtt:river-pack -- --family=MTT9_20BB_BTN_BB_SRP_LOWSPR [--write]
 *
 * Turnový protějšek téhož skriptu, o ulici dál. Společné části - určení strany
 * stolu ze dvou nezávislých signálů a mapování sedaček podle postflopového
 * pořadí - jsou ve sdílené knihovně, takže se tu neopisují; kopie by znamenala
 * dvě místa, kde se opravuje jedna chyba.
 *
 * ## Kde river leží
 *
 * Riverová vrstva se plánuje z jedné vyřešené turnové podhry, ne z desky:
 *
 *   artifacts/decomposition/<RODINA>__<deska>/river/<turnová-podhra>/plan.json
 *
 * Rodinu tedy pojmenovává adresář o dvě úrovně výš a jednotkou pokrytí je
 * turnová podhra. Rodina jich má stovky a vrstvu dostane hrstka - pack proto
 * odpovídá na pár desek a na zbytek se přizná.
 *
 * ## Proč to není součást turnového skriptu
 *
 * Protože rozpočet, pokrytí i jednotka jsou jiné, a hlavně proto, že riverové
 * pravidlo nese pátou kartu. Sdílet se dá to, co je stejné; slepit obě ulice do
 * jednoho skriptu by znamenalo v každé větvi ptát se, která to je.
 */

const ROOT = "artifacts/decomposition";
const OUT_DIR = "src/data/ranges/river";
const MANIFEST_PATH = "src/data/ranges/riverSolvedManifest.generated.ts";
const PROFILE_KEY = "FULL_RING_9|REGULAR|CHIP_EV|RIVER";

/**
 * Vyřešených riverů na rodinu.
 *
 * Stejné číslo jako u turnu a ze stejného důvodu: pravidlo stojí kolem kilobajtu
 * a tři sta jich zaplní třetinu limitu chunku. River navíc odpovídá na užší
 * množinu desek, takže rozpočet zatím není to, co ho omezuje - omezuje ho, kolik
 * vrstev noc udělala.
 */
const RULE_BUDGET = 300;

interface ManifestEntry { familyId: string; packId: string; slug: string }

/** Jak `solve_plan.py` pojmenoval soubor pro tuhle položku riverového plánu. */
function riverSubgameFileName(item: { line?: string[]; river: string }): string {
  const line = (item.line ?? []).map((action) => {
    const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
    if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
    return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
  }).join("_");
  return `${line || "ROOT"}__${item.river}.json`;
}

/** Adresáře s riverovou vrstvou pro tuhle rodinu, i s cestou k desce. */
function riverDirectories(family: string): { boardDirectory: string; riverDirectory: string }[] {
  const found: { boardDirectory: string; riverDirectory: string }[] = [];
  for (const boardName of readdirSync(ROOT).filter((name) => name.startsWith(`${family}__`))) {
    const riverRoot = join(ROOT, boardName, "river");
    if (!existsSync(riverRoot)) continue;
    for (const subgame of readdirSync(riverRoot)) {
      const directory = join(riverRoot, subgame);
      if (existsSync(join(directory, "plan.json"))) {
        found.push({ boardDirectory: join(ROOT, boardName), riverDirectory: directory });
      }
    }
  }
  return found;
}

/**
 * Kolik turnových podher rodiny mohlo riverovou vrstvu dostat.
 *
 * Bez tohohle čísla by brána hlásila plné pokrytí rodině, která má vrstvu na
 * jedné podhře ze šesti set. Jmenovatel je počet vyřešených turnových podher, ne
 * počet desek: riverová vrstva se plánuje z podhry.
 */
function turnSubgamesAvailable(family: string): number {
  let total = 0;
  for (const boardName of readdirSync(ROOT).filter((name) => name.startsWith(`${family}__`))) {
    const directory = join(ROOT, boardName);
    total += readdirSync(directory)
      .filter((name) => name.endsWith(".json") && name !== "plan.json").length;
  }
  return total;
}

/** Přepíše manifest s touhle rodinou, ostatní zachová. */
function writeManifestEntry(added: ManifestEntry): void {
  const existing: ManifestEntry[] = [];
  if (existsSync(MANIFEST_PATH)) {
    const source = readFileSync(MANIFEST_PATH, "utf8");
    // Přípona je ve vzoru volitelná schválně - stejná past jako u turnu, kde
    // změna `.generated` na `.generated.json` tiše smazala deset rodin z jedenácti.
    const pattern = /familyId: "([^"]+)",\s*\n\s*packId: "([^"]+)",[\s\S]*?import\("\.\/river\/([^"]+)\.generated(?:\.json)?"\)/g;
    for (const match of source.matchAll(pattern)) {
      existing.push({ familyId: match[1], packId: match[2], slug: match[3] });
    }
  }
  const entries = [...existing.filter((item) => item.familyId !== added.familyId), added]
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  const body = entries.map((entry) => `  {
    familyId: "${entry.familyId}",
    packId: "${entry.packId}",
    profileKey: "${PROFILE_KEY}",
    load: () => import("./river/${entry.slug}.generated.json").then((module) => module.default as unknown as RiverStrategyPack),
  },`).join("\n");

  writeFileSync(MANIFEST_PATH, `// Generated by \`npm run mtt:river-pack -- --write\`.
// Do not edit by hand.

import type { RiverStrategyPack } from "./riverStrategyPack";

export interface SolvedRiverManifestEntry {
  familyId: string;
  packId: string;
  profileKey: string;
  load(): Promise<RiverStrategyPack>;
}

export const solvedRiverManifest: readonly SolvedRiverManifestEntry[] = [
${body}
];
`, "utf8");
}

const familyArg = process.argv.find((item) => item.startsWith("--family="));
const write = process.argv.includes("--write");
const family = familyArg?.split("=")[1];

if (family === undefined) {
  console.error("Usage: npm run mtt:river-pack -- --family=<FAMILY_ID> [--write]");
  process.exitCode = 2;
} else if (!existsSync(ROOT)) {
  console.error(`${ROOT} is absent; nothing to build from.`);
  process.exitCode = 1;
} else {
  const directories = riverDirectories(family);
  const evidence: TurnFamilyEvidence = {
    familyId: family,
    boards: 0,
    boardsWithCheckpoint: turnSubgamesAvailable(family),
    plannedItems: 0, writtenItems: 0,
    minCoverage: 1, coverageTarget: TURN_COVERAGE_TARGET, sampledRules: [],
  };
  const rules = [];
  let unidentified = 0;

  for (const { boardDirectory, riverDirectory } of directories) {
    const plan = JSON.parse(readFileSync(join(riverDirectory, "plan.json"), "utf8"));
    const files = readdirSync(riverDirectory)
      .filter((name) => name.endsWith(".json") && name !== "plan.json");
    evidence.boards += 1;
    evidence.plannedItems += (plan.items ?? []).length;
    evidence.writtenItems += files.length;
    evidence.minCoverage = Math.min(evidence.minCoverage, plan.coverageAchieved ?? 0);

    // Blind v žetonech. Riverový plán zná pot a stack svého uzlu, ale poměr
    // žetonů k blindům drží až deskový plán s kořenovým stackem - a jméno rodiny
    // říká hloubku v blindech. Bez toho by pravidlo neumělo říct, na jaké
    // hloubce vzniklo, a resolver by ho nabídl na kterékoli.
    const seats = seatsOfFamily(boardDirectory.split(/[\\/]/).pop() ?? "");
    const boardPlanPath = join(boardDirectory, "plan.json");
    const boardPlan = existsSync(boardPlanPath)
      ? JSON.parse(readFileSync(boardPlanPath, "utf8"))
      : {};
    const familyStackBB = Number(/_(\d+)BB_/.exec(boardDirectory)?.[1] ?? 0);
    const chipsPerBB = familyStackBB > 0 && boardPlan.stack > 0
      ? boardPlan.stack / familyStackBB
      : 0;
    const inBB = (chips: number) => (
      chipsPerBB > 0 ? Math.round((chips / chipsPerBB) * 10) / 10 : undefined
    );

    for (const item of plan.items ?? []) {
      const path = join(riverDirectory, riverSubgameFileName(item));
      if (!existsSync(path)) continue;
      const node = JSON.parse(readFileSync(path, "utf8"));

      // Čí uzel to je, ze solvu a ne ze jména. Položka, u které to nejde určit,
      // se vynechá: pravidlo pod špatnou sedačkou ukáže jednomu hráči odpovědi
      // druhého, a to s cedulkou, že je vyrobil solver.
      const side = seats === undefined ? undefined : heroSideOfNode(node, item);
      if (side === undefined) {
        unidentified += 1;
        continue;
      }
      const actions: string[] = node.actions ?? [];
      const seat = side.side === "OOP" ? seats.oop : seats.ip;
      const rule = buildRiverStrategyRule(riverDirectory, node, item, {
        hero: {
          side: side.side,
          seat,
          villainSeat: side.side === "OOP" ? seats.ip : seats.oop,
          isAggressor: seat === seats.aggressor,
          confidence: side.confidence,
          facingBet: actions.some((action) => /^FOLD$/i.test(action.trim())),
        },
        ...(inBB(item.pot ?? 0) === undefined ? {} : { potBB: inBB(item.pot ?? 0) }),
        ...(inBB(item.stack ?? 0) === undefined ? {} : { stackBehindBB: inBB(item.stack ?? 0) }),
      });
      if (rule) rules.push(rule);
    }
  }

  // Jedna linka na desku a riverovou kartu, ta nejčastěji hraná.
  //
  // Tentýž river se dá dosáhnout několika turnovými linkami a resolver je od
  // sebe nerozliší, protože trenažér mu neřekne, kterou rozdal. Dodat obě by
  // znamenalo odmítnout každou desku, kde existují dvě - přesně to stálo u turnu
  // 5,7 % dosahu a pravidla zůstala v balíku.
  const byLine = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    const key = `${rule.riverSpot.turnBoard.join("")}|${rule.riverSpot.riverCard}|${rule.node}`;
    const held = byLine.get(key);
    if (held === undefined || (rule.spot?.reach ?? 0) > (held.spot?.reach ?? 0)) {
      byLine.set(key, rule);
    }
  }
  const collapsed = rules.length - byLine.size;
  rules.length = 0;
  rules.push(...byLine.values());
  if (collapsed > 0) {
    console.log(`  ${collapsed} riverů vynecháno: tutéž desku dosahuje jiná linka častěji`);
  }

  // Po jednom z každé turnové podhry, uvnitř podhry podle dosahu. Řadit celou
  // rodinu podle dosahu a uříznout by rozpočet utratilo na jedné podhře.
  const byParent = new Map<string, typeof rules>();
  for (const rule of rules) {
    const bucket = byParent.get(rule.sourceDirectory) ?? [];
    bucket.push(rule);
    byParent.set(rule.sourceDirectory, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((left, right) => (right.spot?.reach ?? 0) - (left.spot?.reach ?? 0));
  }
  const kept: typeof rules = [];
  const queues = [...byParent.values()];
  for (let round = 0; kept.length < RULE_BUDGET; round += 1) {
    let placed = 0;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      if (kept.length >= RULE_BUDGET) break;
      kept.push(queue[round]);
      placed += 1;
    }
    if (placed === 0) break;
  }
  const dropped = rules.length - kept.length;
  rules.length = 0;
  rules.push(...kept);
  evidence.sampledRules = rules.slice(0, 1);
  if (dropped > 0) console.log(`  ${dropped} méně dosahovaných riverů vynecháno kvůli rozpočtu`);

  // Komu vyřešené rivery patří, vypsané při každém běhu. Tohle je fakt, kterému
  // se u jména adresáře věřit nedalo, takže se hlásí, ne předpokládá.
  const identities = new Map<string, number>();
  for (const rule of rules) {
    const hero = rule.spot?.hero;
    if (hero === undefined) continue;
    const key = `${hero.side} ${hero.seat} vs ${hero.villainSeat}, `
      + `${hero.facingBet ? "čelí sázce" : "na tahu první"}`;
    identities.set(key, (identities.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...identities].sort()) {
    console.log(`  hrdina: ${key} - ${count} riverů`);
  }
  if (unidentified > 0) {
    console.log(`  ${unidentified} riverů vynecháno: nešlo určit, čí strategii uzel drží`);
  }

  const result = buildRiverStrategyPack({
    id: `mtt-full-ring-9-river-solved-${family.toLowerCase().replace(/_/g, "-")}-v1`,
    createdAt: new Date().toISOString().slice(0, 10),
    evidence,
    rules,
  });

  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  } else {
    const module = JSON.stringify(result.pack);
    const slug = family.toLowerCase().replace(/_/g, "-");
    const outPath = join(OUT_DIR, `${slug}.generated.json`);
    console.log(`family ${family}`);
    console.log(
      `  turnových podher s vrstvou ${evidence.boards} z ${evidence.boardsWithCheckpoint}, `
      + `pravidel ${rules.length}, modul ${(module.length / 1024).toFixed(0)} KB`,
    );
    console.log(`  důvěra ${result.pack.confidence}, otisk ${result.pack.contentHash}`);
    console.log(`  ${write ? "written" : "would write"}: ${outPath}`);
    if (write) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, module, "utf8");
      writeManifestEntry({ familyId: family, packId: result.pack.id, slug });
      console.log(`  manifest updated: ${MANIFEST_PATH}`);
    }
  }
}
