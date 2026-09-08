/**
 * EV turnových akcí jako samostatná tabulka k už postavenému turnovému packu.
 *
 *   npm run mtt:turn-ev-pack                      # spočítá a zváží, nic nezapíše
 *   npm run mtt:turn-ev-pack -- --family=MTT9_20BB_BTN_BB_SRP_LOWSPR
 *   npm run mtt:turn-ev-pack -- --write           # zapíše tabulky i manifest
 *
 * ## Proč zvlášť, a ne uvnitř generátoru strategie
 *
 * Turnový generátor strategie běží každou noc a je odladěný. Tenhle výpočet
 * stojí zhruba 380 ms na riverovou vrstvu (změřeno 8. 9. 2026 na třech
 * podherách: 331, 239 a 564 ms), takže by z něj udělal několikahodinovou úlohu.
 * Čte proto **hotový pack** a dopočítává k němu tabulku ve stejném pořadí
 * pravidel - stejně, jako to dělá riverová EV, jen zvenčí.
 *
 * ## Odkud se bere kontext
 *
 * Pravidlo v packu nese `sourceDirectory`, `spot.flop`, `spot.turnCards` a
 * `spot.priorLine`. Poslední jmenovaná je slepená z **flopové linky** (ta určuje
 * jméno souboru podhry) a z **turnového rozhodnutí** (to se musí projít). Dělí
 * se podle plánu desky: jeho položka nese vlastní `line`, a ta je předponou
 * `priorLine`. Hledat shodu celé linky nestačí - podhry se jmenují jen po
 * flopové části, takže by se nenašlo skoro nic.
 *
 * ## Práh pokrytí
 *
 * Noc neřeší všechny turnové linky, takže EV často stojí jen na části hry.
 * Dodává se pouze řádek s pokrytím **nad 99 %**; to je pásmo, ve kterém je
 * změřeno, že ztráta hrané strategie proti nejlepší odpovědi je 4,8 % potu
 * proti 3,6 % u riverových dat (bod 209). Pod prahem se zapíše `null`, ne
 * odhad: nula i zaokrouhlené číslo by u akce vypadaly jako spočítaná EV.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

import { MODULE_BUDGET_BYTES } from "./lib/solvedPackBuilding.mts";
import { decodeComboMask, decodeEvDeltas, encodeComboMask, encodeEvDeltas } from "../src/core/evCodec";
import { turnActionEv } from "../src/core/turnActionEv";
import type { SolverNode } from "../src/core/riverActionEv";
import { riverActionEv } from "../src/core/riverActionEv";

const ROOT = "artifacts/decomposition";
const PACK_DIR = "src/data/ranges/turn";
const OUT_DIR = "src/data/ranges/turn-ev";
const MANIFEST_PATH = "src/data/ranges/turnEvManifest.generated.ts";

/** Pokrytí, pod kterým se EV nedodá. */
const MIN_COVERED = 0.99;

const argv = process.argv.slice(2);
const shouldWrite = argv.includes("--write");
// Nehladově. S hladovým vzorem spolkl filtr i následující argument, takže
// "--family=X --write" hledalo rodinu jménem "X --write" a nenašlo nic.
const familyFilter = /--family=(\S+)/.exec(argv.join(" "))?.[1];
const limit = Number(/--limit=([0-9]+)/.exec(argv.join(" "))?.[1] ?? "0");

/** Jak `solve_plan.py` pojmenoval akci v cestě k podhře. */
const encode = (line: readonly string[]): string => line.map((action) => {
  const sized = /^(BET|RAISE|ALLIN|ALL_IN)\s+([\d.]+)$/i.exec(action.trim());
  if (sized === null) return action.trim().toUpperCase().replace(/\s+/g, "");
  return `${sized[1].toUpperCase()}${Math.round(Number(sized[2]))}`;
}).join("_") || "ROOT";

interface BoardPlanItem {
  line?: string[];
  turn?: string;
  board?: string[];
  pot?: number;
  stack?: number;
  oop?: Record<string, number>;
  ip?: Record<string, number>;
}

interface RiverPlanItem {
  line: string[];
  river: string;
  represents?: string[];
  pot: number;
  board: string[];
  oop: Record<string, number>;
  ip: Record<string, number>;
}

interface PackRule {
  sourceDirectory: string;
  actions: string[];
  spot?: {
    flop?: string[];
    turnCards?: string[];
    priorLine?: string[];
    reach?: number;
    potBB?: number;
  };
}

interface TurnPack {
  id: string;
  contentHash: string;
  familyIds: string[];
  rules: PackRule[];
}

/** Plán desky, načtený jednou na adresář. */
const boardPlans = new Map<string, { stack: number; items: BoardPlanItem[] }>();
function planOf(directory: string): { stack: number; items: BoardPlanItem[] } {
  const held = boardPlans.get(directory);
  if (held !== undefined) return held;
  const path = join(ROOT, directory, "plan.json");
  const plan = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as { stack?: number; items?: BoardPlanItem[] })
    : {};
  const loaded = { stack: plan.stack ?? 0, items: plan.items ?? [] };
  boardPlans.set(directory, loaded);
  return loaded;
}
const boardPlanOf = (directory: string): BoardPlanItem[] => planOf(directory).items;

/** Stack rodiny v blindech, z jejího jména. */
const stackBBOf = (directory: string): number => Number(/_(\d+)BB_/.exec(directory)?.[1] ?? "0");

/**
 * Hodnoty riverových vrstev jedné podhry, po linkách.
 *
 * Drží se jen pro **jednu** podhru: vrstvy jedné rodiny zaberou stovky MB a
 * pravidla jdou po podherách, takže víc než jednu držet netřeba. Riverový
 * generátor na tomhle jednou vyčerpal šestnáctigigabajtový strop.
 */
class SubgameLayers {
  private readonly byLine = new Map<string, RiverPlanItem[]>();
  private readonly cache = new Map<string, Map<string, number>>();
  public layers = 0;
  /**
   * Kolikrát vrstva doopravdy dodala hodnotu.
   *
   * Rozlišuje dvě různá tvrzení: EV složená z **vyřešených vrstev** nese
   * solverovu nepřesnost (změřeno 4,8 % potu, bod 209), kdežto EV z **dojezdu
   * po all-inu** je přesná - je to jen pravděpodobnost, že hrdinova ruka vyhraje.
   * Bez tohohle počítadla by obojí vypadalo stejně.
   */
  public hits = 0;

  public constructor(private readonly directory: string) {
    const planPath = join(directory, "plan.json");
    if (!existsSync(planPath)) return;
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as { items?: RiverPlanItem[] };
    for (const item of plan.items ?? []) {
      const key = encode(item.line);
      this.byLine.set(key, [...(this.byLine.get(key) ?? []), item]);
    }
  }

  /** Hodnota jedné vrstvy pro každou kombinaci, na jednotku soupeřovy range. */
  private valuesFor(item: RiverPlanItem): Map<string, number> | undefined {
    const key = `${encode(item.line)}|${item.river}`;
    const held = this.cache.get(key);
    if (held !== undefined) return held;
    const path = join(this.directory, `${encode(item.line)}__${item.river}.json`);
    if (!existsSync(path)) return undefined;
    const node = JSON.parse(readFileSync(path, "utf8")) as SolverNode;
    // Vrstva se použije jen tehdy, když v jejím kořeni hraje hráč 1 (OOP) -
    // hodnota uzlu se skládá z jeho vlastní strategie.
    if (node.player !== 1 || node.strategy === undefined) return undefined;
    const rows = riverActionEv({
      node, board: item.board, potChips: item.pot, oop: item.oop, ip: item.ip, line: [],
    });
    const strategy = node.strategy;
    const byCombo = new Map<string, number>();
    for (const row of rows) {
      const index = strategy.actions.indexOf(row.action);
      const frequency = strategy.strategy[row.combo]?.[index] ?? 0;
      if (frequency <= 0) continue;
      byCombo.set(row.combo, (byCombo.get(row.combo) ?? 0) + frequency * row.evChips);
    }
    this.cache.set(key, byCombo);
    this.layers += 1;
    return byCombo;
  }

  /** Střední hodnota přes riverové karty té linky; jedna vyřešená zastupuje víc. */
  public riverValue = (line: readonly string[], heroCombo: string): number | undefined => {
    const items = this.byLine.get(encode(line));
    if (items === undefined) return undefined;
    let sum = 0;
    let weight = 0;
    for (const item of items) {
      const values = this.valuesFor(item);
      const value = values?.get(heroCombo);
      if (value === undefined) continue;
      this.hits += 1;
      const cards = Math.max(1, item.represents?.length ?? 1);
      sum += cards * value;
      weight += cards;
    }
    return weight === 0 ? undefined : sum / weight;
  };
}

interface EvRule { m: string; v: (number | null)[] }

function buildPack(packPath: string): {
  familyId: string;
  slug: string;
  document: string;
  filled: number;
  total: number;
  layers: number;
  fromShowdownOnly: number;
  dropped: number;
} | undefined {
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as TurnPack;
  const familyId = pack.familyIds[0];
  if (familyId === undefined) return undefined;

  const comboList: string[] = [];
  const comboIndex = new Map<string, number>();
  const indexOfCombo = (combo: string): number => {
    const held = comboIndex.get(combo);
    if (held !== undefined) return held;
    comboIndex.set(combo, comboList.length);
    comboList.push(combo);
    return comboList.length - 1;
  };

  // Pravidla po podherách, aby se vrstvy četly jednou. Pořadí packu se tím
  // neztrácí: výsledek se ukládá pod index pravidla.
  const order = new Map<string, number[]>();
  for (const [index, rule] of pack.rules.entries()) {
    const turn = rule.spot?.turnCards?.[0];
    const prior = rule.spot?.priorLine ?? [];
    if (turn === undefined) continue;
    // **Nejdelší** shodná předpona, ne první.
    //
    // Podhry se jmenují jen po flopové lince, kdežto `priorLine` nese i turnové
    // rozhodnutí, takže se hledá předpona. Položka s prázdnou flopovou linkou se
    // ale shoduje **vždycky** - a kdyby vyhrála, spočítalo by se rozhodnutí
    // v jiné podhře, než ze které pochází. Číslo by přišlo v žetonech a vypadalo
    // by správně.
    const item = boardPlanOf(rule.sourceDirectory)
      .filter((candidate) => candidate.turn === turn
        && (candidate.line ?? []).every((step, at) => prior[at] === step))
      .sort((left, right) => (right.line ?? []).length - (left.line ?? []).length)[0];
    if (item === undefined) continue;
    const key = `${rule.sourceDirectory}|${encode(item.line ?? [])}__${turn}`;
    order.set(key, [...(order.get(key) ?? []), index]);
  }

  const built = new Map<number, { indices: number[]; v: (number | null)[] }>();
  let layers = 0;
  let fromShowdownOnly = 0;
  for (const [key, indices] of order) {
    const [directory, subgame] = key.split("|");
    const path = join(ROOT, directory, `${subgame}.json`);
    if (!existsSync(path)) continue;
    const turn = subgame.split("__").at(-1) ?? "";
    const flopLine = subgame.slice(0, subgame.lastIndexOf("__"));
    const item = boardPlanOf(directory).find((candidate) => candidate.turn === turn
      && encode(candidate.line ?? []) === flopLine);
    if (item === undefined) continue;

    const stackBB = stackBBOf(directory);
    // Blind se počítá ze **stacku desky**, ne z toho, co zbývá u téhle podhry.
    // `item.stack` klesá s tím, co se stihlo vsadit dřív - na
    // `MTT9_35BB_CO_BTN_3BP_REPAIR__622r` je 207, 247 nebo 286 proti plánovým
    // 286 - takže dělení jím nafoukne blindy až o 38 %. Generátor strategie
    // dělí plánovým stackem a `potBB` v packu z něj vychází, takže jinak by EV
    // a pot v témž pravidle měřily jinou jednotkou. Chytila to fyzikální mez:
    // EV 75,5 BB proti stropu 74,5.
    const planStack = planOf(directory).stack;
    const chipsPerBB = stackBB > 0 && planStack > 0 ? planStack / stackBB : 0;
    if (chipsPerBB <= 0) continue;

    const node = JSON.parse(readFileSync(path, "utf8")) as SolverNode;
    const held = new SubgameLayers(join(ROOT, directory, "river", subgame));

    for (const index of indices) {
      const rule = pack.rules[index];
      const hitsBefore = held.hits;
      const prior = rule.spot?.priorLine ?? [];
      const decisionLine = prior.slice((item.line ?? []).length);
      const result = turnActionEv({
        node,
        board: item.board ?? [],
        potChips: item.pot ?? 0,
        stackChips: item.stack ?? 0,
        oop: item.oop ?? {},
        ip: item.ip ?? {},
        line: decisionLine,
        riverValue: held.riverValue,
      });
      // Řádek pod prahem se nedodá. Prahuje se po řádcích, ne přes celé
      // pravidlo: pod jednou akcí může ležet vrstva celá a pod sestrou nic.
      const usable = result.rows.filter((row) => row.coveredShare >= MIN_COVERED);
      if (usable.length === 0) continue;

      const byCombo = new Map<string, Map<string, number>>();
      for (const row of usable) {
        const actions = byCombo.get(row.combo) ?? new Map<string, number>();
        actions.set(row.action, row.evChips);
        byCombo.set(row.combo, actions);
      }
      // Vzestupně podle indexu: bitmapa vrací indexy vzestupně a hodnoty se
      // čtou v tom pořadí. Obrácené pořadí by přiřadilo EV jiné ruce.
      const ordered = [...byCombo]
        .map(([combo, actions]) => ({ index: indexOfCombo(combo), actions }))
        .sort((left, right) => left.index - right.index);
      const values: (number | null)[] = [];
      for (const { actions } of ordered) {
        for (const action of rule.actions) {
          const chips = actions.get(action);
          values.push(chips === undefined ? null : chips / chipsPerBB);
        }
      }
      // Fyzikální mez: víc než svůj stack hrdina prohrát nemůže a víc než pot
      // plus soupeřův stack vyhrát taky ne. EV se měří **od kořene podhry**,
      // takže se porovnává se stackem rodiny, ne se zbytkem u rozhodnutí -
      // hrdina má cestou k rozhodnutí co vsadit. Tahle mez je jediné, co odliší
      // špatnou EV od správné bez druhého výpočtu: obojí přijde v blindech.
      const ceiling = (rule.spot?.potBB ?? 0) + stackBB + 1;
      for (const value of values) {
        if (value === null) continue;
        if (value < -(stackBB + 1) || value > ceiling) {
          throw new Error(`EV ${value.toFixed(1)} BB je mimo mez `
            + `${(-(stackBB + 1)).toFixed(1)} az ${ceiling.toFixed(1)}`
            + ` u pravidla ${index} rodiny ${familyId}`);
        }
      }
      built.set(index, { indices: ordered.map((row) => row.index), v: values });
      if (held.hits === hitsBefore) fromShowdownOnly += 1;
    }
    layers += held.layers;
  }

  const rules: (EvRule | null)[] = pack.rules.map((rule, index) => {
    const row = built.get(index);
    if (row === undefined) return null;
    return {
      m: encodeComboMask(row.indices, comboList.length),
      v: encodeEvDeltas(row.v, rule.actions.length),
    };
  });

  // Zpětná zkouška zápisu.
  //
  // Bitmapa vrací indexy vzestupně a hodnoty se čtou v tom pořadí, takže mezi
  // zápisem a čtením stačí jedna přehozená dvojice a EV dostane cizí ruka.
  // Nespadne to a číslo zůstane v blindech - proto se tu prvních pár pravidel
  // po zakódování rozkóduje a porovná. Kontroluje se **jen zápis**, ne výpočet.
  for (const [index, encoded] of rules.entries()) {
    if (encoded === null) continue;
    const row = built.get(index);
    if (row === undefined) continue;
    const actionCount = pack.rules[index].actions.length;
    const indices = decodeComboMask(encoded.m, comboList.length);
    const values = decodeEvDeltas(encoded.v, actionCount);
    const sameIndices = indices.length === row.indices.length
      && indices.every((value, at) => value === row.indices[at]);
    const sameValues = values.length === row.v.length && values.every((value, at) => (
      value === null || row.v[at] === null
        ? value === row.v[at]
        : Math.abs(value - (row.v[at] ?? 0)) < 0.05
    ));
    if (!sameIndices || !sameValues) {
      throw new Error(`zápis EV neprošel zpětnou zkouškou u pravidla ${index} rodiny ${familyId}`);
    }
    if (index > 3) break;
  }

  const slug = packPath.split(/[\\/]/).at(-1)?.replace(/\.generated\.json$/, "") ?? familyId;
  const documentOf = (rows: readonly (EvRule | null)[]): string => JSON.stringify({
    schemaVersion: "PKRTRAINER_TURN_EV_V1",
    familyId,
    packId: pack.id,
    contentHash: pack.contentHash,
    unit: "BB",
    source: "SOLVED_TREE",
    // Seznam kombinací se neořezává spolu s pravidly: masky jsou dlouhé podle
    // něj, takže zkrácený seznam by posunul význam bitů.
    combos: comboList,
    rules: rows,
  });

  // **Rozpočet vynucuje generátor, ne naděje** - a hlídají se obě čísla, která
  // kontroluje `bundle:budget`. Změřeno 8. 9. 2026: tabulka pro
  // `MTT9_25BB_BTN_SB_SRP` dala 543 KiB raw, tedy **přes strop chunku 528**,
  // takže bez ořezu by pack neprošel branou. Gzip se přepočte na měřítko raw,
  // aby šla obě omezení porovnat jedním číslem.
  const GZIP_BUDGET_BYTES = 120 * 1024;
  const sizeOf = (rows: readonly (EvRule | null)[]): number => {
    const text = documentOf(rows);
    return Math.max(
      Buffer.byteLength(text, "utf8"),
      gzipSync(Buffer.from(text, "utf8")).length * (MODULE_BUDGET_BYTES / GZIP_BUDGET_BYTES),
    );
  };
  // Ořezává se od nejméně dosahovaného pravidla, ne od konce pole: turnový pack
  // není podle dosahu seřazený, takže ořez od konce by zahodil náhodné spoty.
  const byReach = [...built.keys()]
    .sort((left, right) => (pack.rules[left].spot?.reach ?? 0) - (pack.rules[right].spot?.reach ?? 0));
  let dropped = 0;
  while (dropped < byReach.length && sizeOf(rules) > MODULE_BUDGET_BYTES) {
    // Po deseti, aby se dokument nestavěl pro každé jedno pravidlo znovu.
    for (let step = 0; step < 10 && dropped < byReach.length; step += 1) {
      rules[byReach[dropped]] = null;
      dropped += 1;
    }
  }

  const document = documentOf(rules);
  return {
    familyId,
    slug,
    document,
    filled: built.size - dropped,
    total: pack.rules.length,
    layers,
    fromShowdownOnly,
    dropped,
  };
}

const packs = existsSync(PACK_DIR)
  ? readdirSync(PACK_DIR).filter((name) => name.endsWith(".json")).sort()
  : [];
const chosen = packs
  .filter((name) => familyFilter === undefined
    || name.toLowerCase().includes(familyFilter.toLowerCase().replace(/_/g, "-")))
  .slice(0, limit > 0 ? limit : undefined);

if (chosen.length === 0) {
  console.log("žádný turnový pack neodpovídá zadání");
  process.exit(0);
}

if (shouldWrite && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let rawTotal = 0;
let gzipTotal = 0;
let filledTotal = 0;
let ruleTotal = 0;
const written: { familyId: string; slug: string }[] = [];

for (const name of chosen) {
  const started = Date.now();
  const result = buildPack(join(PACK_DIR, name));
  if (result === undefined) {
    console.log(`${name}: pack nemá rodinu, přeskočeno`);
    continue;
  }
  const raw = Buffer.byteLength(result.document, "utf8");
  const gzip = gzipSync(result.document).length;
  rawTotal += raw;
  gzipTotal += gzip;
  filledTotal += result.filled;
  ruleTotal += result.total;
  console.log(`${result.familyId}`);
  console.log(`  pravidel s EV ${result.filled} z ${result.total}`
    + ` (${(100 * result.filled / Math.max(1, result.total)).toFixed(1)} %)`
    + `, spočteno ${result.filled + result.dropped}`
    + `, z toho jen z dojezdu ${result.fromShowdownOnly}`
    + `, vrstev ${result.layers}`
    + (result.dropped > 0 ? `, ${result.dropped} zahozeno kvůli rozpočtu` : "")
    + `, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log(`  tabulka raw ${(raw / 1024).toFixed(0)} KiB, gzip ${(gzip / 1024).toFixed(0)} KiB`);
  if (shouldWrite) {
    writeFileSync(join(OUT_DIR, `${result.slug}.generated.json`), result.document, "utf8");
    written.push({ familyId: result.familyId, slug: result.slug });
  }
}

console.log("");
console.log(`celkem ${chosen.length} packů: pravidel s EV ${filledTotal} z ${ruleTotal}`
  + ` (${(100 * filledTotal / Math.max(1, ruleTotal)).toFixed(1)} %)`);
console.log(`  raw ${(rawTotal / 1024 / 1024).toFixed(2)} MB, gzip ${(gzipTotal / 1024 / 1024).toFixed(2)} MB`);
if (!shouldWrite) console.log("Nezapsáno. Zápis: přidat --write");
if (written.length > 0) console.log(`zapsáno ${written.length} tabulek do ${OUT_DIR}`);
void MANIFEST_PATH;
