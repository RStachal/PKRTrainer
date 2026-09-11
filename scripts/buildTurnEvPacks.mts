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

import { windowNotice } from "./lib/machineWindow.mts";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { solvedTurnSpots } from "../src/data/ranges/solvedTurnSpotCatalogue";
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

/**
 * Vlastní strop tabulky turnové EV, ne sdílený `MODULE_BUDGET_BYTES`.
 *
 * **Zvednuto 11. 9. 2026 z 500 na 1 024 KiB raw a ze 120 na 256 KiB gzip na
 * rozhodnutí majitele** („zvednout obojí"). Důvod je změřený, ne odhadnutý:
 * při 500 KiB sedělo 21 ze 48 rodin na stropu a z řádků, které jsou nad prahem
 * a tedy dodatelné, **zahodil ořez čtvrtinu** (bod 236). Rozpočtová křivka
 * (`--budget-curve`) na 24 rodinách:
 *
 * | strop | +řádků EV | +velikost |
 * |---|---|---|
 * | 640 | +13,2 % | +11,6 % |
 * | 768 | +19,7 % | +17,5 % |
 * | **1024** | **+28,1 %** | **+25,8 %** |
 * | 1280 | +32,2 % | +30,4 % |
 * | 2048 | +35,0 % (nic se neořezává) | +34,2 % |
 *
 * Výnos je lineární - žádné koleno - takže volba je jen o tom, kolik knihovny
 * a kolik stahování na rodinu si dovolit. 1 024 bere 80 % možného zisku za
 * chunk, který hráč stáhne v gzipu kolem 150 az 200 KiB; 2 048 by bral všechno
 * za 300 az 400 KiB na rodinu. Strop sdílený se strategickými packy se
 * nezvedá: tam to nikdo neměřil a bod 157 říká, že river na něm sedí.
 *
 * Gzip strop se zvedá úměrně, protože `sizeOf` přepočítává gzip na měřítko raw
 * poměrem těch dvou čísel - kdyby zůstal na 120, stal by se z něj tichý ořez
 * o patro níž.
 */
const TURN_EV_BUDGET_BYTES = 1024 * 1024;
const TURN_EV_GZIP_BUDGET_BYTES = 256 * 1024;

const argv = process.argv.slice(2);
const shouldWrite = argv.includes("--write");
// Nehladově. S hladovým vzorem spolkl filtr i následující argument, takže
// "--family=X --write" hledalo rodinu jménem "X --write" a nenašlo nic.
const familyFilter = /--family=(\S+)/.exec(argv.join(" "))?.[1];
const limit = Number(/--limit=([0-9]+)/.exec(argv.join(" "))?.[1] ?? "0");
/**
 * Kolik KiB gzip smí dávka dohromady zabrat; 0 vypíná.
 *
 * Volno v součtu líné knihovny se čte z `bundle:budget` a k 10. 9. 2026 je to
 * 1 622 KiB. Rozhoduje **gzip**, ne raw - viz bod 228 a hlavička
 * `checkBundleBudget`.
 */
const budgetGzipKib = Number(/--budget-gzip-kib=([0-9]+)/.exec(argv.join(" "))?.[1] ?? "0");
/** Průměr ze šesti změřených rodin (bod 228), jen na odhad zbývajícího místa. */
const AVERAGE_TABLE_GZIP_BYTES = 84 * 1024;
/**
 * Přeskočit rodiny, které už tabulku mají.
 *
 * Celá dávka je sedm hodin jednoho jádra a denní okno končí ve 21:00, takže se
 * skoro jistě bude pokračovat druhý den. Bez tohohle by se běh pokaždé rozjel
 * odznova od nejrozdávanější rodiny - tedy hodiny práce na tom, co už hotové je.
 */
const skipExisting = argv.includes("--skip-existing");
/**
 * Seznam rodin ze souboru, jedna na řádek.
 *
 * Kvůli přerušené dávce: 11. 9. 2026 musela přestavba uhnout paměti (VMware
 * majitele 17 GB) po sedmi rodinách ze 48. `--skip-existing` tu nepomůže,
 * tabulku má každá rodina - jen sedm na novém stropu a zbytek na starém, a to
 * se ze souboru nepozná. Seznam říká přesně, které dodělat, a nic se
 * nepřepočítává dvakrát.
 */
const familiesFile = /--families-file=(\S+)/.exec(argv.join(" "))?.[1];
const familiesWanted = familiesFile === undefined
  ? undefined
  : new Set(readFileSync(familiesFile, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
/** Vypsat rozložení pokrytí u řádků, místo aby se jen zahodily. */
const coverageReport = argv.includes("--coverage-report");
/** Projit orez cely a vypsat, co by ktera vyse stropu koupila. */
const budgetCurve = argv.includes("--budget-curve");
const curveByFamily = new Map<string, { kept: number; rows: number; bytes: number }[]>();

const COVERAGE_EDGES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.01];
const COVERAGE_LABELS = [
  "0,0-0,1", "0,1-0,2", "0,2-0,3", "0,3-0,4", "0,4-0,5", "0,5-0,6",
  "0,6-0,7", "0,7-0,8", "0,8-0,9", "0,9-0,95", "0,95-0,99", "0,99 a vys (DODANO)",
];
const coverageBuckets = new Array<number>(COVERAGE_EDGES.length).fill(0);
function bucketOf(share: number): number {
  for (const [index, edge] of COVERAGE_EDGES.entries()) if (share < edge) return index;
  return COVERAGE_EDGES.length - 1;
}

/**
 * Rozdělení dávky na běhy, `--shard=1/4` az `--shard=4/4`.
 *
 * Výpočet je jednovláknový a celá dávka je hodiny. Majitel 10. 9. 2026 řekl,
 * že se dá „mírně navýšit" - Task Manager ukazoval 21 % CPU. Paralelizovat
 * uvnitř procesu by znamenalo workery a sdílenou paměť; rozdělit rodiny mezi
 * několik procesů je totéž bez rizika, protože rodiny na sobě nezávisí.
 *
 * Krájí se **po jedné dokola** (rodina i patří běhu i mod n), ne na souvislé
 * bloky: pořadí je podle dosahu, takže souvislé bloky by daly jednomu běhu
 * všechny drahé rodiny a jinému samé levné.
 */
const shard = /--shard=([0-9]+)\/([0-9]+)/.exec(argv.join(" "));
const shardIndex = shard === null ? 0 : Number(shard[1]) - 1;
const shardCount = shard === null ? 1 : Number(shard[2]);
/**
 * Nezapisovat manifest.
 *
 * Při běhu ve více procesech je manifest jediné sdílené místo: každý ho na
 * konci čte a přepisuje, takže dva běhy, které skončí blízko sebe, si navzájem
 * ztratí položky. Běhy proto zapisují **jen tabulky** a manifest se poskládá
 * z disku až potom (`--manifest-only`).
 */
const noManifest = argv.includes("--no-manifest");
const manifestOnly = argv.includes("--manifest-only");

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
  packId: string;
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
    // Pot a stack **na kořeni podhry**, v blindech. Odtud se EV měří, takže
    // odtud se berou i meze.
    const rootStackBB = (item.stack ?? 0) / chipsPerBB;
    const rootPotBB = (item.pot ?? 0) / chipsPerBB;

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
      // Rozložení pokrytí u řádků pod prahem.
      //
      // Bez něj se nedá odpovědět na otázku, která rozhoduje o rozvrhu nocí:
      // **jak daleko** jsou nedodané řádky. Změřeno 11. 9. 2026, že jedenáct
      // nových riverových vrstev pod jednou rodinou nezměnilo ani jednu
      // hodnotu - a z toho se nepozná, jestli jsou ty řádky na 0,2 nebo na
      // 0,98. První případ znamená roky nocí, druhý pár týdnů.
      if (coverageReport) {
        for (const row of result.rows) {
          // Horní pásmo se dělí jemněji schválně: práh je 0,99, takže
          // „0,9 az 1,0" míchá dodané řádky s těmi, kterým chybí poslední
          // procento - a to je celý rozdíl mezi „hotovo" a „zahozeno".
          coverageBuckets[bucketOf(row.coveredShare)] += 1;
        }
      }
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
      // plus soupeřův stack vyhrát taky ne. Měří se **od kořene podhry**, takže
      // se bere pot i stack tam, ne stack celé rodiny - ten je většinou větší a
      // mez by tím jen změkla. Tahle mez je jediné, co odliší špatnou EV od
      // správné bez druhého výpočtu: obojí přijde v blindech a obojí vypadá
      // rozumně. Chytila tak chybu v jednotkách, viz `chipsPerBB` výš.
      const floor = -(rootStackBB + 1);
      const ceiling = rootPotBB + rootStackBB + 1;
      for (const value of values) {
        if (value === null) continue;
        if (value < floor || value > ceiling) {
          throw new Error(`EV ${value.toFixed(1)} BB je mimo mez `
            + `${floor.toFixed(1)} az ${ceiling.toFixed(1)}`
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
  const sizeOf = (rows: readonly (EvRule | null)[]): number => {
    const text = documentOf(rows);
    return Math.max(
      Buffer.byteLength(text, "utf8"),
      gzipSync(Buffer.from(text, "utf8")).length * (TURN_EV_BUDGET_BYTES / TURN_EV_GZIP_BUDGET_BYTES),
    );
  };
  // Ořezává se od nejméně dosahovaného pravidla, ne od konce pole: turnový pack
  // není podle dosahu seřazený, takže ořez od konce by zahodil náhodné spoty.
  const byReach = [...built.keys()]
    .sort((left, right) => (pack.rules[left].spot?.reach ?? 0) - (pack.rules[right].spot?.reach ?? 0));
  let dropped = 0;
  /**
   * Křivka: co by která výše stropu koupila.
   *
   * Majitel 11. 9. 2026 rozhodl zvednout strop modulu i součtu a chtěl vědět
   * na kolik. Odhadnout to nejde - tabulka není lineární v počtu pravidel,
   * protože delta-kódování a gzip závisí na tom, **která** pravidla zůstanou.
   * Jediný poctivý způsob je projít ořez celý a zapsat, kde se protne s jakým
   * stropem. Stojí to tentýž průchod, co ořez dělá tak jako tak.
   */
  if (budgetCurve) {
    const trace: { kept: number; rows: number; bytes: number }[] = [];
    const scratch = [...rules];
    let cut = 0;
    const rowsOf = (list: readonly (EvRule | null)[]): number => list.reduce(
      (sum, rule) => sum + (rule === null ? 0 : rule.v.filter((value) => value !== null).length),
      0,
    );
    while (true) {
      trace.push({ kept: built.size - cut, rows: rowsOf(scratch), bytes: sizeOf(scratch) });
      if (cut >= byReach.length) break;
      for (let step = 0; step < 10 && cut < byReach.length; step += 1) {
        scratch[byReach[cut]] = null;
        cut += 1;
      }
    }
    curveByFamily.set(familyId, trace);
  }

  while (dropped < byReach.length && sizeOf(rules) > TURN_EV_BUDGET_BYTES) {
    // Po deseti, aby se dokument nestavěl pro každé jedno pravidlo znovu.
    for (let step = 0; step < 10 && dropped < byReach.length; step += 1) {
      rules[byReach[dropped]] = null;
      dropped += 1;
    }
  }

  const document = documentOf(rules);
  return {
    familyId,
    packId: pack.id,
    slug,
    document,
    filled: built.size - dropped,
    total: pack.rules.length,
    layers,
    fromShowdownOnly,
    dropped,
  };
}

/**
 * Manifest složený z toho, co na disku opravdu leží.
 *
 * Jediný způsob, jak ho po běhu ve více procesech dostat úplný. Čte se přímo
 * z tabulek, ne z toho, co si o nich který běh pamatuje - běh, který někdo
 * zastavil, si nepamatuje nic, a přesto jeho tabulky na disku jsou.
 */
if (manifestOnly) {
  const rows = (existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : [])
    .filter((name) => name.endsWith(".generated.json"))
    .map((name) => {
      const table = JSON.parse(readFileSync(join(OUT_DIR, name), "utf8")) as {
        familyId?: string; packId?: string;
      };
      return {
        familyId: table.familyId ?? "",
        packId: table.packId ?? "",
        slug: name.replace(/\.generated\.json$/, ""),
      };
    })
    .filter((row) => row.familyId !== "" && row.packId !== "");
  writeManifestFromDisk(rows);
  console.log(`manifest složen z disku: ${rows.length} tabulek`);
  process.exit(0);
}

const packs = existsSync(PACK_DIR)
  ? readdirSync(PACK_DIR).filter((name) => name.endsWith(".json")).sort()
  : [];
/**
 * Rodiny v pořadí, ve kterém se hráči rozdávají.
 *
 * Pořadí podle jména souboru je abecedа, tedy náhoda vůči tomu, co hráč
 * dostane. Když se nevejdou všechny (a nevejdou - viz bod 228), rozhoduje o
 * hodnotě právě tohle pořadí: prvních devatenáct rodin podle dosahu pokrývá
 * 48,8 % rozdaných turnových spotů, kdežto devatenáct podle abecedy nepokrývá
 * nic konkrétního.
 *
 * Váží se **dosahem**, ne počtem spotů: trenažér losuje přes
 * `pickSolvedSpotByReach`. Měřit kusy by dalo plochých 2,1 % na rodinu, protože
 * každý pack dodá ~260 pravidel podle stropu (bod 214).
 */
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
const reachByFamily = new Map<string, number>();
for (const spot of solvedTurnSpots()) {
  const family = spot.sourceDirectory.split("__")[0];
  reachByFamily.set(family, (reachByFamily.get(family) ?? 0) + spot.reach);
}
const familyOfFile = (name: string): string =>
  name.replace(/\.generated\.json$/, "").replace(/-/g, "_").toUpperCase();

const chosen = packs
  .filter((name) => familyFilter === undefined
    || name.toLowerCase().includes(familyFilter.toLowerCase().replace(/_/g, "-")))
  // Tabulka má stejné jméno jako pack, jen v jiném adresáři.
  .filter((name) => !skipExisting || !existsSync(join(OUT_DIR, name)))
  .filter((name) => familiesWanted === undefined || familiesWanted.has(familyOfFile(name)))
  .sort((left, right) => (
    (reachByFamily.get(familyOfFile(right)) ?? 0) - (reachByFamily.get(familyOfFile(left)) ?? 0)
  ))
  .filter((_, index) => index % shardCount === shardIndex)
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
const written: { familyId: string; packId: string; slug: string }[] = [];

// Odhad délky z šesti změřených rodin (bod 228): 485 az 789 s u hlubokých,
// méně u mělkých. Deset minut na rodinu je střed, se kterým se dá počítat.
// Jádra se hlásí podle počtu běhů, ne podle tohohle procesu. Jeden proces bere
// jedno jádro, ale čtyři běhy dohromady čtyři - a strop se týká stroje, ne
// procesu. Hlásit „1 z 16" ze čtyř míst najednou by bylo formálně pravdivé a
// věcně zavádějící.
console.log(windowNotice(shardCount, chosen.length * 10));
console.log("");

// Vypsat, co by se stavělo, a skončit. Bez tohohle se rozdělení na běhy nedá
// zkontrolovat jinak než tím, že se to celé spočítá - a to je právě ta práce,
// kvůli které se dělí. (Naběhl jsem si na to: kontrola čtyř běhů „nasucho"
// spustila čtyři plné výpočty.)
if (argv.includes("--list")) {
  for (const name of chosen) console.log(`  ${familyOfFile(name)}`);
  console.log(`celkem ${chosen.length}`);
  process.exit(0);
}

let stoppedAt = 0;

for (const name of chosen) {
  // Součtový rozpočet ukončí dávku podle **skutečných** velikostí, ne podle
  // průměru. Odhad z průměru dal 19 rodin, jenže hluboké rodiny jsou dražší
  // (86 a 102 KiB proti průměru 84) a zrovna ty jsou v první dvacítce - takže
  // by se buď nevešly, nebo by se místo nechalo ležet. Staví se v pořadí podle
  // dosahu a přestane se, až je plno.
  if (budgetGzipKib > 0 && (gzipTotal + AVERAGE_TABLE_GZIP_BYTES) / 1024 > budgetGzipKib) {
    console.log(`rozpočet ${budgetGzipKib} KiB gzip je plný, končím na ${stoppedAt} rodinách`);
    break;
  }
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
  stoppedAt += 1;
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
    written.push({ familyId: result.familyId, packId: result.packId, slug: result.slug });
  }
}

console.log("");
console.log(`celkem ${chosen.length} packů: pravidel s EV ${filledTotal} z ${ruleTotal}`
  + ` (${(100 * filledTotal / Math.max(1, ruleTotal)).toFixed(1)} %)`);
console.log(`  raw ${(rawTotal / 1024 / 1024).toFixed(2)} MB, gzip ${(gzipTotal / 1024 / 1024).toFixed(2)} MB`);
if (coverageReport) {
  const total = coverageBuckets.reduce((sum, value) => sum + value, 0);
  console.log("");
  console.log(`rozložení pokrytí řádků (celkem ${total}):`);
  for (const [index, count] of coverageBuckets.entries()) {
    if (count === 0) continue;
    console.log(`  ${(COVERAGE_LABELS[index] ?? "?").padEnd(20)} ${String(count).padStart(8)}`
      + `  ${(100 * count / Math.max(1, total)).toFixed(1)} %`);
  }
  console.log("  pásmo 0,95-0,99 je to, co se spočítalo a zahodilo o poslední procenta");
}
if (budgetCurve) {
  const LEVELS_KIB = [500, 640, 768, 1024, 1280, 1536, 2048];
  console.log("");
  console.log("co by koupila která výše stropu modulu (dnes 500 KiB):");
  console.log("  strop    pravidel   řádků EV   skutečně KiB");
  for (const level of LEVELS_KIB) {
    let kept = 0;
    let rows = 0;
    let bytes = 0;
    for (const trace of curveByFamily.values()) {
      // První bod odshora, který se do stropu vejde. Křivka jde od „všechno
      // ponecháno" dolů, takže se hledá první, co projde.
      const point = trace.find((item) => item.bytes <= level * 1024) ?? trace[trace.length - 1];
      kept += point.kept;
      rows += point.rows;
      bytes += point.bytes / 1024;
    }
    console.log(
      `  ${String(level).padStart(4)} KiB ${String(kept).padStart(9)} ${String(rows).padStart(10)}`
      + ` ${bytes.toFixed(0).padStart(13)}`,
    );
  }
  console.log("  (součty přes rodiny v tomhle běhu, ne přes všech 48)");
}
if (!shouldWrite) console.log("Nezapsáno. Zápis: přidat --write");
if (written.length > 0) console.log(`zapsáno ${written.length} tabulek do ${OUT_DIR}`);
/**
 * Manifest, ze kterého runtime tabulky načítá.
 *
 * Slučuje se, ne přepisuje: generátor se běžně pouští po jedné rodině
 * (`--family=`) a přepsání by tím pádem smazalo všechny ostatní. Riverová
 * obdoba to dělá stejně a ze stejného důvodu.
 *
 * Zapisuje se **až po** zápisu tabulek: manifest odkazující na soubor, který
 * neexistuje, je horší než chybějící řádek - runtime by se o něj pokusil a
 * spadl by až u hráče.
 */
/** Manifest přesně podle předaného seznamu, bez slučování se starým obsahem. */
function writeManifestFromDisk(
  rows: readonly { familyId: string; packId: string; slug: string }[],
): void {
  const sorted = [...rows].sort((left, right) => left.familyId.localeCompare(right.familyId));
  writeFileSync(MANIFEST_PATH, `// Generated by \`npm run mtt:turn-ev-pack -- --manifest-only\`.
// Do not edit by hand.

import type { TurnEvPack } from "./turnEvPack";

export interface TurnEvManifestEntry {
  familyId: string;
  /** Pack, ke kterému tabulka patří; otisk se ověřuje až po načtení. */
  packId: string;
  load(): Promise<TurnEvPack>;
}

export const turnEvManifest: readonly TurnEvManifestEntry[] = [
${sorted.map((row) => `  {
    familyId: "${row.familyId}",
    packId: "${row.packId}",
    load: () => import("./turn-ev/${row.slug}.generated.json").then((module) => module.default as unknown as TurnEvPack),
  },`).join("\n")}
];
`, "utf8");
}

function writeManifest(added: readonly { familyId: string; packId: string; slug: string }[]): void {
  const existing: { familyId: string; packId: string; slug: string }[] = [];
  if (existsSync(MANIFEST_PATH)) {
    const source = readFileSync(MANIFEST_PATH, "utf8");
    const pattern =
      /familyId: "([^"]+)",\s*\n\s*packId: "([^"]+)",[\s\S]*?import\("\.\/turn-ev\/([^"]+)\.generated\.json"\)/g;
    for (const match of source.matchAll(pattern)) {
      existing.push({ familyId: match[1], packId: match[2], slug: match[3] });
    }
  }
  const addedFamilies = new Set(added.map((entry) => entry.familyId));
  const entries = [...existing.filter((item) => !addedFamilies.has(item.familyId)), ...added]
    .sort((left, right) => left.familyId.localeCompare(right.familyId));

  const body = entries.map((entry) => `  {
    familyId: "${entry.familyId}",
    packId: "${entry.packId}",
    load: () => import("./turn-ev/${entry.slug}.generated.json").then((module) => module.default as unknown as TurnEvPack),
  },`).join("\n");

  writeFileSync(MANIFEST_PATH, `// Generated by \`npm run mtt:turn-ev-pack -- --write\`.
// Do not edit by hand.

import type { TurnEvPack } from "./turnEvPack";

export interface TurnEvManifestEntry {
  familyId: string;
  /** Pack, ke kterému tabulka patří; otisk se ověřuje až po načtení. */
  packId: string;
  load(): Promise<TurnEvPack>;
}

export const turnEvManifest: readonly TurnEvManifestEntry[] = [
${body}
];
`, "utf8");
}

if (written.length > 0 && !noManifest) {
  writeManifest(written);
  console.log(`manifest ${MANIFEST_PATH} nese ${written.length} nových rodin`);
} else if (noManifest && written.length > 0) {
  console.log(`manifest nezapsán (--no-manifest); slož ho z disku:`);
  console.log("  npm run mtt:turn-ev-pack -- --manifest-only");
}

