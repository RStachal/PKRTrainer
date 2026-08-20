import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { heroSideOfNode, seatsOfFamily,
  trimToModuleBudget,
  supersededByRepair,
  fullTreeBoardsByFamily,
  MODULE_BUDGET_BYTES,
  PACK_ENVELOPE_BYTES,
} from "./lib/solvedPackBuilding.mts";
import { subgameDecisions } from "./lib/subgameDecisions.mts";
import { riverActionEv } from "../src/core/riverActionEv";
import { encodeEvTable } from "../src/core/evCodec";
import { actionNodeForSolvedHero } from "../src/data/ranges/solvedHeroActionNode";
import { buildRiverStrategyRule } from "../src/data/ranges/riverStrategyRuleBuilder";
import { buildRiverStrategyPack } from "../src/data/ranges/riverStrategyPack";
import { TURN_COVERAGE_TARGET, type TurnFamilyEvidence } from "../src/data/ranges/turnReviewGate";
import {
  parseTurnReviewVerdicts,
  type TurnReviewVerdictRecord,
} from "../src/data/ranges/turnReviewVerdict";

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
const EV_OUT_DIR = "src/data/ranges/river-ev";
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
/**
 * Adresáře desek rodiny, bez těch vyřešených na redukovaném stromě.
 *
 * Redukovaný strom je paměťově úsporná varianta pro review: nemá turnový donk
 * ani pozdější zvýšení, takže je to jiná hra. Riverová vrstva z něj vychází
 * stejně jako turnová, takže sem ten filtr patří ze stejného důvodu - a chyběl
 * tu, přestože turnový generátor ho má od začátku.
 */
let reportedReducedDrop = false;

function fullTreeBoardDirs(family: string): string[] {
  const allowed = fullTreeBoardsByFamily().get(family.toUpperCase());
  const all = readdirSync(ROOT).filter((name) => name.startsWith(`${family}__`));
  if (allowed === undefined) return all;
  const kept = all.filter((name) => allowed.has(name.split("__")[1] ?? ""));
  // Vynechaná deska je vědomé rozhodnutí, ne chybějící data, a musí to být
  // vidět. Bez hlášky vypadá výsledek jako neúplný rozklad a hledá se
  // neexistující chyba jinde. Hlásí se jednou za běh, protože se adresáře
  // procházejí dvakrát a dvojitý řádek by vypadal jako dvojí vynechání.
  if (!reportedReducedDrop && kept.length < all.length) {
    reportedReducedDrop = true;
    console.log(`  ${all.length - kept.length} boardů vynecháno: vyřešené na redukovaném stromě`);
  }
  return kept;
}

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
  for (const boardName of fullTreeBoardDirs(family)) {
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
  for (const boardName of fullTreeBoardDirs(family)) {
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

const VERDICTS_PATH = "Agents/turn-review/verdicts.json";

/** Zaznamenané verdikty hráčů; bez souboru se nic neděje a rodina zůstane LOW. */
function readVerdicts(): TurnReviewVerdictRecord[] {
  if (!existsSync(VERDICTS_PATH)) return [];
  return parseTurnReviewVerdicts(readFileSync(VERDICTS_PATH, "utf8"));
}

const familyArg = process.argv.find((item) => item.startsWith("--family="));
const write = process.argv.includes("--write");
// EV je drahé (kolem pěti minut na rodinu), takže se nepočítá při každém běhu.
const writeEv = write && process.argv.includes("--ev");
const family = familyArg?.split("=")[1];

if (family === undefined) {
  console.error("Usage: npm run mtt:river-pack -- --family=<FAMILY_ID> [--write]");
  process.exitCode = 2;
} else if (
  existsSync(MANIFEST_PATH) &&
  supersededByRepair(family, readFileSync(MANIFEST_PATH, "utf8")) !== undefined
) {
  // Stejná kontrola jako na turnu. Bez ní se dodávala riverová strategie z
  // rodiny, kterou produkt na ostatních ulicích odmítá.
  const winner = supersededByRepair(family, readFileSync(MANIFEST_PATH, "utf8"));
  console.error(
    `${family} už nahradila ${winner}; obě řeší tentýž spot a resolver by odpověděl `
    + "z té, která je v řetězci první. Postav a shipuj jen tu opravenou.",
  );
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
  /** Vstupy pro dopočet EV, klíčované pravidlem. Nedodává se, jen se počítá. */
  const evContext = new Map<object, {
    node: unknown;
    line: readonly string[];
    board: readonly string[];
    potChips: number;
    oop: Record<string, number>;
    ip: Record<string, number>;
    /** Žetonů na blind pro tuhle desku; EV se dodává v BB, ne v žetonech. */
    chipsPerBB: number;
  }>();
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

      // Každé rozhodnutí v podhře, ne jen to kořenové - stejně jako na turnu a ze
      // stejného důvodu: hráč, který na riveru čelí sázce, jinak nedostane
      // vyřešenou odpověď nikdy, ačkoli ta odpověď leží na disku.
      for (const decision of subgameDecisions(node, item.pot ?? 0, item.stack ?? 0)) {
        // Kořen podle překryvu ranží, které plán zapsal právě pro něj; hlouběji
        // je zúžily akce po cestě a platí solverův vlastní údaj o hráči na tahu.
        const side = decision.depth === 0
          ? (seats === undefined ? undefined : heroSideOfNode(node, item))
          : { side: decision.player === 1 ? "OOP" as const : "IP" as const, confidence: 1 };
        if (side === undefined || seats === undefined) {
          unidentified += 1;
          continue;
        }
        const seat = side.side === "OOP" ? seats.oop : seats.ip;
        const isAggressor = seat === seats.aggressor;
        const facingBet = decision.toCallChips > 0;
        // `RIVER_OOP_LEAD` znamená „mimo pozici"; hráč v pozici hrající po checku
        // bez iniciativy je jiná situace, pro kterou produkt uzel nemá, takže by
        // takové pravidlo neodpovědělo nikomu.
        if (!facingBet && !isAggressor && side.side === "IP") continue;

        // Pot a stack toho uzlu, ne kořene. Riverové pravidlo si pot nese s
        // sebou a resolver jím měří velikost sázky; kořenový pot by u uzlu za
        // sázkou označil malou sázku za velkou.
        const nodeItem = {
          ...item,
          pot: decision.potChips,
          stack: decision.stackChips,
          line: [...(item.line ?? []), ...decision.line],
        };
        const rule = buildRiverStrategyRule(riverDirectory, decision.node, nodeItem, {
          hero: {
            side: side.side,
            seat,
            villainSeat: side.side === "OOP" ? seats.ip : seats.oop,
            isAggressor,
            confidence: side.confidence,
            facingBet,
          },
          ...(inBB(decision.potChips) === undefined ? {} : { potBB: inBB(decision.potChips) }),
          ...(inBB(decision.stackChips) === undefined
            ? {}
            : { stackBehindBB: inBB(decision.stackChips) }),
        });
        if (rule) {
          rules.push(rule);
          // Kontext pro dopočet EV. Do packu nepatří - je to vstup výpočtu, ne
          // obsah - ale bez linky a kořenového uzlu se EV spočítat nedá a po
          // ořezu už se k nim nedostaneme. Klíčem je samotné pravidlo, které
          // filtry i ořez pouštějí dál jako tutéž referenci.
          evContext.set(rule, {
            node,
            line: decision.line,
            board: item.board ?? [],
            potChips: item.pot ?? 0,
            oop: item.oop ?? {},
            ip: item.ip ?? {},
            chipsPerBB,
          });
        }
      }
    }
  }

  // Jedna linka na desku a riverovou kartu, ta nejčastěji hraná.
  //
  // Tentýž river se dá dosáhnout několika turnovými linkami a resolver je od
  // sebe nerozliší, protože trenažér mu neřekne, kterou rozdal. Dodat obě by
  // znamenalo odmítnout každou desku, kde existují dvě - přesně to stálo u turnu
  // 5,7 % dosahu a pravidla zůstala v balíku.
  // Klíč nese i to, které rozhodnutí uzel drží a na které straně stolu hrdina
  // sedí - přesně to porovnává resolver, takže se slučuje to, co by se u něj
  // srazilo. Bez toho by se čtyři situace na téže desce přebily na jednu.
  const decisionKey = (rule: (typeof rules)[number]): string => {
    const hero = rule.spot?.hero;
    return `${actionNodeForSolvedHero(hero, "RIVER") ?? "?"}|${hero?.side ?? "?"}`;
  };
  const byLine = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) {
    const key = `${rule.riverSpot.turnBoard.join("")}|${rule.riverSpot.riverCard}|${rule.node}|${decisionKey(rule)}`;
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
  // Rozpočet rovným dílem mezi rozhodnutí, uvnitř rozhodnutí střídavě po
  // turnových podhrách. **Assumption:** poměr, ve kterém trenažér ty situace
  // rozdává, změřený není; bez dělení by nejčastější situace zabrala všechno.
  const byDecision = new Map<string, Map<string, typeof rules>>();
  for (const rule of rules) {
    const decision = decisionKey(rule);
    const parents = byDecision.get(decision) ?? new Map<string, typeof rules>();
    const bucket = parents.get(rule.sourceDirectory) ?? [];
    bucket.push(rule);
    parents.set(rule.sourceDirectory, bucket);
    byDecision.set(decision, parents);
  }
  const kept: typeof rules = [];
  const share = Math.max(1, Math.floor(RULE_BUDGET / Math.max(1, byDecision.size)));
  for (const parents of byDecision.values()) {
    for (const bucket of parents.values()) {
      bucket.sort((left, right) => (right.spot?.reach ?? 0) - (left.spot?.reach ?? 0));
    }
    const queues = [...parents.values()];
    let taken = 0;
    for (let round = 0; taken < share && kept.length < RULE_BUDGET; round += 1) {
      let placed = 0;
      for (const queue of queues) {
        if (round >= queue.length) continue;
        if (taken >= share || kept.length >= RULE_BUDGET) break;
        kept.push(queue[round]);
        taken += 1;
        placed += 1;
      }
      if (placed === 0) break;
    }
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

  const packId = `mtt-full-ring-9-river-solved-${family.toLowerCase().replace(/_/g, "-")}-v1`;
  const createdAt = new Date().toISOString().slice(0, 10);
  const verdicts = readVerdicts();
  const buildWith = (candidate: typeof rules) => buildRiverStrategyPack({
    id: packId, createdAt, evidence, rules: candidate, verdicts,
  });

  // Strop v bajtech, ne v pravidlech. `RULE_BUDGET` výš rozdělí rozpočet mezi
  // rozhodnutí, ale kolik místa pravidlo zabere, o tom nevypovídá.
  // Měří se pravidla, ne hotový pack: velikost packu závisí na textu o důvěře,
  // takže by přijatý verdikt měnil ořez a tím i otisk, na který je verdikt
  // vázaný. Viz `trimToModuleBudget`.
  const fitted = trimToModuleBudget(
    rules,
    (candidate) => JSON.stringify(candidate).length,
    MODULE_BUDGET_BYTES - PACK_ENVELOPE_BYTES,
  );
  if (fitted.dropped > 0) {
    console.log(`  ${fitted.dropped} riverů vynecháno, aby se modul vešel do rozpočtu svazku`);
    rules.length = 0;
    rules.push(...fitted.kept);
  }

  const result = buildWith(rules);

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

      // EV do vlastního souboru, ne do packu, a jen na vyžádání.
      //
      // Po kombinacích by EV zabralo kolem 0,6 MB na rodinu, tedy víc než celý
      // rozpočet modulu. EV je přitom funkce "po odpovědi" - hráč ji chce, až
      // když už rozhodl - takže patří do vlastního líného chunku, který se
      // natáhne jen když ho někdo otevře.
      //
      // Za přepínačem proto, že výpočet trvá kolem pěti minut na rodinu:
      // generování packů se pouští v cyklech přes všechny rodiny a nesmí se
      // tím zpomalit dvacetkrát.
      //
      // Formát je úsporný schválně. Hodnoty jdou ve stejném pořadí jako
      // `rule.actions`, takže se jména akcí neopakují vůbec, a třídy ruk se
      // odkazují indexem do jednoho seznamu. První verze psala jména akcí i tříd
      // ke každému řádku a měla 844 KB - víc, než je rozpočet jednoho chunku.
      //
      // Soubor nese otisk packu. Kdyby se pack přegeneroval a EV ne, runtime to
      // pozná a EV nepoužije, místo aby ukazoval čísla k jiné strategii.
      if (writeEv) {
        // Po kombinacích, ne po třídách ruk.
        //
        // Uvnitř jedné třídy se EV rozchází s mediánem 0,3 žetonu, ale p90 3,2 a
        // maximem přes sedmdesát - tedy kolem čtrnácti blindů. Průměr přes třídu
        // tam neodpovídá žádné konkrétní ruce, a EV je číslo, které hráč uvidí u
        // každé akce. Vidět je to i na rovnováze: po kombinacích má ztráta hrané
        // akce p90 nula, po třídách 3,5 BB.
        //
        // Jako obyčejná JSON čísla by to bylo přes 780 KB na rodinu proti
        // rozpočtu 512 KiB na chunk; kodek z toho udělá zhruba 175 KB.
        const comboIndex = new Map<string, number>();
        const comboList: string[] = [];
        const indexOfCombo = (combo: string) => {
          const known = comboIndex.get(combo);
          if (known !== undefined) return known;
          comboIndex.set(combo, comboList.length);
          comboList.push(combo);
          return comboList.length - 1;
        };

        const evRules = rules.map((rule) => {
          const context = evContext.get(rule);
          if (context === undefined) return null;
          const rows = riverActionEv({
            node: context.node as never,
            board: context.board,
            potChips: context.potChips,
            oop: context.oop,
            ip: context.ip,
            line: context.line,
          });
          if (rows.length === 0) return null;

          const byCombo = new Map<string, Map<string, number>>();
          for (const row of rows) {
            const actions = byCombo.get(row.combo) ?? new Map<string, number>();
            actions.set(row.action, row.evChips);
            byCombo.set(row.combo, actions);
          }
          const perBB = context.chipsPerBB > 0 ? context.chipsPerBB : 1;
          const combos: number[] = [];
          const values: (number | null)[] = [];
          for (const [combo, actions] of byCombo) {
            combos.push(indexOfCombo(combo));
            for (const action of rule.actions) {
              const chips = actions.get(action);
              // `null`, ne nula: nula je platné EV a u složení dokonce
              // nejčastější, takže by hráč u nedostupné akce viděl číslo.
              values.push(chips === undefined ? null : chips / perBB);
            }
          }
          return { c: combos, v: encodeEvTable(values) };
        });

        const evPath = join(EV_OUT_DIR, `${slug}.generated.json`);
        mkdirSync(dirname(evPath), { recursive: true });
        writeFileSync(evPath, JSON.stringify({
          schemaVersion: "PKRTRAINER_RIVER_EV_V2",
          familyId: family,
          packId: result.pack.id,
          contentHash: result.pack.contentHash,
          unit: "BB",
          source: "SOLVED_TREE",
          combos: comboList,
          rules: evRules,
        }), "utf8");
        const evBytes = statSync(evPath).size;
        const withEv = evRules.filter((row) => row !== null).length;
        console.log(`  EV: ${withEv}/${rules.length} pravidel, ${(evBytes / 1024).toFixed(0)} KB -> ${evPath}`);
      }
    }
  }
}
