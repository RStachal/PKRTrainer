import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  srpSolverInputGap,
  srpSolverInputRanges,
} from "../src/data/ranges/solverInputRanges.ts";
import {
  CHECKPOINT_BASE,
  CHIPS_PER_BB,
  EXPANSION_PARAMS_DIR,
  OPEN_TO_BB,
  SRP_POT_BB,
  srpMonolithParams,
} from "./lib/srpMonolithParams.mts";
import { loadCompleteMttProductionRegistry } from "./loadMttProductionRegistry.mts";
import type { Position, StackBucket } from "../src/core/types";

/**
 * Parametry pro solver na dvojice sedaček, které rozklad nemá.
 *
 *   npm run mtt:seat-pair-expansion            # co by vzniklo
 *   npm run mtt:seat-pair-expansion -- --write # zapsat
 *
 * ## Proč
 *
 * Rozklad drží pět dvojic sedaček a trenažér se ptá na dvaatřicet vzorů, takže
 * dvanáct procent dotazů míří na spot, který vůbec máme. Dosud se nová rodina
 * zakládala tak, že někdo do skriptu napsal ranže ručně - to jde pro šest rodin,
 * ne pro sedmadvacet dvojic krát hloubky.
 *
 * Ranže se proto berou z produkčních preflop packů (`srpSolverInputRanges`) a
 * tenhle skript k nim doplní pot, stack a desky.
 *
 * ## Konvence potu, a proč nová
 *
 * Existující rodiny mají `set_pot 50` úplně všechny, ale žetonů na blind mají od
 * 4 do 6,5 - takže tentýž zápis znamená pot od 7,7 do 12,5 blindu. Ta
 * nejednotnost vznikla postupně a kopírovat ji do nových rodin by znamenalo
 * rozšířit zmatek na dvaatřicet vzorů.
 *
 * Nové rodiny proto počítají pot z pravidel hry: otvírač zvýší na 2,5 BB,
 * obránce dorovná, malý blind složí půl blindu. Pot je tedy 5,5 BB a za ním
 * zbývá hloubka minus 2,5 BB. Jeden blind je sto žetonů, aby se váhy ranží
 * vešly do celých čísel.
 *
 * Znamená to, že nové rodiny nebudou přímo srovnatelné se starými. Je to vědomé:
 * srovnatelnost s nejednotností nemá cenu.
 */

const write = process.argv.includes("--write");
/** Kolik rodin nejvýš založit. 522 desek nikdo neodsolví najednou. */
const limit = Number(
  process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0,
);

/**
 * Jak často se trenažér na který vzor ptá.
 *
 * Bez toho by rozšíření vznikalo v abecedním pořadí, tedy náhodně vzhledem k
 * tomu, co hráč doopravdy potkává. Měření běží nad skutečným rozdáváním, takže
 * první odsolvené rodiny jsou ty, které nejdřív někdo uvidí.
 *
 * Když měření neproběhne, řadí se abecedně a **řekne se to** - tiché seřazení
 * podle ničeho by vypadalo stejně důvěryhodně jako podle poptávky.
 */
function demandByPattern(): { counts: Map<string, number>; measured: boolean } {
  try {
    const out = execFileSync(process.execPath, [
      "scripts/run-cli.mjs", "scripts/checkSolvedSpotCoverage.mts", "--spots=200", "--json",
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const start = out.lastIndexOf("{\"schemaVersion");
    if (start < 0) return { counts: new Map(), measured: false };
    const parsed = JSON.parse(out.slice(start)) as {
      askedPatterns?: { pattern: string; count: number }[];
    };
    const counts = new Map<string, number>();
    for (const row of parsed.askedPatterns ?? []) counts.set(row.pattern, row.count);
    return { counts, measured: counts.size > 0 };
  } catch {
    return { counts: new Map(), measured: false };
  }
}
const OUTPUT_DIR = EXPANSION_PARAMS_DIR;
const WORK = "artifacts/decomposition";

/**
 * Desky, na kterých se rodina zakládá.
 *
 * Šest textur, ne víc: každá deska je samostatný solve a rodina se dodává až
 * úplná, takže široký záběr na začátku znamená, že se nedodá nic. Výběr drží
 * jednu suchou vysokou, jednu spárovanou, jednu spojenou, jednu monotónní, jednu
 * nízkou a jednu se dvěma stejnými barvami - to jsou třídy, které se od sebe
 * strategicky liší nejvíc.
 */
const BOARD_IDS = ["A72r", "883r", "986tt", "AT4mono", "742r", "K98tt"] as const;

/**
 * Hloubky, které se zakládají. Jen mělká, a je to změřené.
 *
 * Solve jedné desky téhle rodiny trvá podle hloubky řádově jinak dlouho -
 * naměřeno 20. 8. 2026 na `LJ_HJ_SRP`, deska A72r, plný strom, 1200 iterací:
 *
 * - **25BB: 148 vteřin**, commit 1,68 GB, doběhlo na exploitability 1,3 %
 * - 50BB: po pěti minutách pořád pod stou iterací z dvanácti set
 * - 100BB: po čtrnácti minutách totéž, commit 8,36 GB, odhad přes 2,5 hodiny
 *
 * Při jedenáctihodinovém okně to znamená kolem 260 desek za noc na 25BB, ale
 * sotva čtyři na 100BB. Šířka vzorů je dnes to, co chybí - dvaatřicet vzorů
 * proti pěti - takže mělká hloubka napříč vzory přinese mnohem víc než hloubka
 * u jednoho. Hlubší jde zapnout přes `--depths`, ale má se to dělat vědomě.
 *
 * ## 40BB změřeno 5. 10. 2026
 *
 * Osa 25BB se toho dne vyčerpala (dvojice 29/29, šablona textur došla,
 * přesolvení hlásí „liší se 0"), takže další hloubka přestala být volbou a
 * stala se nutností. Místo odhadu jedna deska:
 * `MTT9_40BB_UTG_2_HJ_SRP A72r` doběhla za **546 s, tedy 9,3 min**, s celkovou
 * exploitabilitou 0,40 % - pod cílem 0,5 %, takže konvergovala.
 *
 * Proti 148 s na 25BB je to **3,7x dráž** při 1,6x hloubce; efektivní stack
 * roste z 2250 na 3750 žetonů, tedy SPR 4,1 na 6,8.
 *
 * Je to **jedna deska, ne rozdělení**: A72r je ace-high rainbow, a textura
 * s cenou hýbe (na 25BB šly rainbow desky 20-23 min proti 4-6 min u ostatních).
 *
 * ## Co z toho noc 5.-6. 10. vyvrátila
 *
 * Z těch 9,3 min jsem tady odvodil, že 96 desek je asi patnáct hodin, tedy půl
 * druhé noci, a že se to vejde pod třicetiminutový strop runneru. **Obojí bylo
 * špatně.** Noc naměřila na 40 bb medián 19,3 min (17 desek), takže 96 desek je
 * kolem 31 hodin, tedy spíš tři noci; a dvě desky `742r` na třicetiminutový
 * strop **narazily**, takže se strop musel zvednout na 60.
 *
 * Příčina: 9,3 min byla ruční sonda přes den, a ta cenu noci neříká. Noc tutéž
 * texturu ve třech sesterských rodinách solvila 26,5, 28,6 a 29,1 min - `A72r`
 * je na 40 bb **nejdražší** textura, ne nejlevnější. Odsud se tedy nemá plánovat
 * dávka; cena je měřená v `board-cost.generated.json` (`npm run mtt:board-cost`).
 */
const DEPTHS: readonly StackBucket[] = ((): readonly StackBucket[] => {
  const raw = process.argv.find((arg) => arg.startsWith("--depths="))?.split("=")[1];
  if (raw === undefined) return [25] as StackBucket[];
  return raw.split(",").map((value) => Number(value.trim())).filter((value) => value > 0) as StackBucket[];
})();

/** Sedačky v preflopovém pořadí; dvojice se berou jen "dřívější otevře". */
const SEATS: readonly Position[] = [
  "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB",
];

/**
 * Rodiny, které už máme - podle **hloubky**, a podle checkpointů, ne rozkladu.
 *
 * ## Dvě vady, které tenhle výpočet měl, a obě bránily stagovat novou práci
 *
 * **Byl slepý vůči hloubce.** Klíčoval se jen dvojicí sedaček
 * (`MTT9_\d+BB_(pair)`), takže dvojice vyřešená na 25 bb platila za hotovou
 * i pro 40 a 50. Běh s `--depths=40` proto ty opravdu chybějící dvojice
 * přeskočil a hloubka se nedala rozšířit vůbec.
 *
 * **A četl rozklad místo checkpointů.** `artifacts/decomposition` má 33 rodin,
 * kdežto checkpointy 81 - rozklad běží až po solvu a zdaleka ne všude. Rodina
 * vyřešená, ale nerozložená, tedy platila za chybějící a skript pro ni vyrobil
 * parametry znovu.
 *
 * Dohromady to dávalo tohle: 14. 10. 2026 zapsal běh s `--depths=40`
 * **96 parametrů** a práce pro noc přitom **klesla ze 16 na 14 desek**, protože
 * všech 96 už checkpoint mělo. Fronta se takhle nedala naplnit a vypadalo to,
 * že osa je vyčerpaná - přitom na 40 bb chybělo třináct dvojic, které se nikdy
 * nenabídly.
 *
 * Drží se proto celé jméno rodiny (`MTT9_40BB_HJ_BB_SRP`) a sjednocení obou
 * zdrojů: co je vyřešené **nebo** rozložené, se znovu nestaguje.
 */
function heldFamilies(): Set<string> {
  const held = new Set<string>();

  if (existsSync(WORK)) {
    for (const name of readdirSync(WORK)) {
      if (!name.includes("__")) continue;
      held.add(name.split("__")[0]);
    }
  }

  if (existsSync(CHECKPOINT_BASE)) {
    for (const name of readdirSync(CHECKPOINT_BASE)) {
      // Prázdná složka rodiny neznamená vyřešeno; rozhoduje aspoň jeden
      // neprázdný checkpoint, stejně jako to počítá hlídač nocí.
      const raw = join(CHECKPOINT_BASE, name, "raw");
      if (!existsSync(raw)) continue;
      const solved = readdirSync(raw).some((file) => {
        if (!file.endsWith(".json")) return false;
        try {
          return statSync(join(raw, file)).size > 0;
        } catch {
          return false;
        }
      });
      if (solved) held.add(name);
    }
  }

  return held;
}

/** `UTG` + `BB` na `UTG_BB_SRP`, tedy tvar, jaký nesou jména rodin. */
function pairId(opener: Position, defender: Position): string {
  const clean = (seat: string) => seat.replace("+", "_");
  return `${clean(opener)}_${clean(defender)}_SRP`;
}

await loadCompleteMttProductionRegistry();

const held = heldFamilies();
const planned: {
  familyId: string;
  pair: string;
  depth: number;
  files: { name: string; body: string }[];
}[] = [];
const skipped: string[] = [];

for (const [openerIndex, opener] of SEATS.entries()) {
  for (const defender of SEATS.slice(openerIndex + 1)) {
    const pair = pairId(opener, defender);
    for (const depth of DEPTHS) {
      // Drží se **rodina**, ne dvojice: táž dvojice na jiné hloubce je jiná
      // práce. Dokud se to testovalo na dvojici, nešla hloubka rozšířit vůbec.
      if (held.has(`MTT9_${depth}BB_${pair}`)) continue;
      const ranges = srpSolverInputRanges({
        openerSeat: opener, defenderSeat: defender, bucket: depth, ante: "OFF",
      });
      if (ranges === undefined) {
        // Říct **která** chybí. Bez toho se mezera stopuje ručně pokaždé znovu;
        // změřeno 27. 8. 2026, že je to vždycky ta obranná.
        const gap = srpSolverInputGap({
          openerSeat: opener, defenderSeat: defender, bucket: depth, ante: "OFF",
        });
        skipped.push(`${pair} @ ${depth}BB: preflop pack nemá ${gap.join(" ani ")}`);
        continue;
      }
      const familyId = `MTT9_${depth}BB_${pair}`;
      const potChips = Math.round(SRP_POT_BB * CHIPS_PER_BB);
      const stackChips = Math.round((depth - OPEN_TO_BB) * CHIPS_PER_BB);

      const files = BOARD_IDS.map((boardId) => ({
        name: `${familyId}_${boardId}.txt`,
        // Strom, kola dumpu i cesta checkpointu jsou v jedné sdílené šabloně
        // (`srpMonolithParams`), společné s dosolvováním desek existujícím
        // rodinám - dvě kopie by se rozešly v první úpravě.
        body: srpMonolithParams({
          familyId, boardId, potChips, stackChips, oop: ranges.oop, ip: ranges.ip,
        }),
      }));
      planned.push({ familyId, pair, depth, files });
    }
  }
}

const demand = demandByPattern();

/** Sedačka tak, jak ji píše jméno dvojice: `UTG+1` je v něm `UTG_1`. */
const asToken = (seat: Position) => seat.replace("+", "_");

/**
 * Rozdělí `UTG_2_BTN_SRP` na otevírajícího a bránícího.
 *
 * Delší jméno se zkouší napřed, protože podtržítko je tu zároveň oddělovač i
 * součást názvu sedačky. Líný regex `^(.+?)_(.+?)_SRP$` vzal první rozdělení,
 * které projde, takže z `UTG_2_BTN_SRP` udělal `SRP_UTG_VS_2_BTN` - vzor, na
 * který se trenažér nikdy nezeptá. Poptávka těch dvanácti rodin proto vyšla
 * nula a seřadily se na konec, přestože se o ně hráči hlásí. **Stroj, který má
 * rozhodovat podle měření, si tím měření pokazil sám.**
 */
function seatsOfPair(pair: string): { opener: Position; defender: Position } | undefined {
  const body = pair.replace(/_(?:SRP|3BP)$/, "");
  const byLongest = [...SEATS].sort((left, right) => asToken(right).length - asToken(left).length);
  const opener = byLongest.find((seat) => body.startsWith(`${asToken(seat)}_`));
  if (opener === undefined) return undefined;
  const rest = body.slice(asToken(opener).length + 1);
  const defender = SEATS.find((seat) => asToken(seat) === rest);
  return defender === undefined ? undefined : { opener, defender };
}

/** `UTG_BB_SRP` na `SRP_UTG_VS_BB`, tedy tvar, jakým se ptá trenažér. */
const askedForm = (pair: string) => {
  const seats = seatsOfPair(pair);
  return seats === undefined
    ? pair
    : `SRP_${asToken(seats.opener)}_VS_${asToken(seats.defender)}`;
};
planned.sort((left, right) => {
  const byDemand = (demand.counts.get(askedForm(right.pair)) ?? 0)
    - (demand.counts.get(askedForm(left.pair)) ?? 0);
  return byDemand !== 0 ? byDemand : left.familyId.localeCompare(right.familyId);
});
const selected = limit > 0 ? planned.slice(0, limit) : planned;

const pairs = new Set(selected.map((row) => row.pair));
console.log("Rozšíření na chybějící dvojice sedaček");
console.log("");
console.log(`drženo dnes: ${held.size} rodin (vyřešených nebo rozložených)`);
console.log(`k založení:  ${pairs.size} dvojic, ${selected.length} rodin, ${selected.length * BOARD_IDS.length} desek`);
console.log(demand.measured
  ? "pořadí:      podle změřené poptávky trenažéru"
  : "pořadí:      ABECEDNĚ - měření poptávky neproběhlo, takže první rodiny nejsou ty nejžádanější");
if (limit > 0 && planned.length > selected.length) {
  console.log(`omezeno:     ${selected.length} z ${planned.length} rodin (--limit)`);
}
console.log(`hloubky:     ${DEPTHS.join(", ")} BB (měřeno: 25BB je 148 s na desku, 100BB přes 2,5 h)`);
console.log(`konvence:    pot ${SRP_POT_BB} BB (otevření na ${OPEN_TO_BB}, dorovnání, složený SB), ${CHIPS_PER_BB} žetonů na blind`);
if (skipped.length > 0) {
  console.log("");
  console.log(`nezaloženo (${skipped.length}):`);
  for (const line of skipped.slice(0, 6)) console.log(`  ${line}`);
}

const sample = selected[0];
if (sample !== undefined) {
  const ranges = srpSolverInputRanges({
    // Tatáž past jako u `askedForm`: `startsWith` uspěje na „UTG" i u dvojice,
    // která začíná „UTG_1", takže by se ranže ukázaly za jinou sedačku.
    openerSeat: seatsOfPair(sample.pair)?.opener ?? "UTG",
    defenderSeat: "BB",
    bucket: sample.depth as StackBucket,
    ante: "OFF",
  });
  console.log("");
  console.log("co si musí přečíst, kdo z toho solví:");
  for (const caveat of ranges?.caveats ?? []) console.log(`  - ${caveat}`);
}

if (!write) {
  console.log("");
  console.log("Nic nezapsáno. Zápis: npm run mtt:seat-pair-expansion -- --write");
} else {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  // Solver adresář sám nezaloží a na chybějící cestu neupozorní - jen soubor
  // nevznikne.
  for (const family of selected) {
    mkdirSync(join(CHECKPOINT_BASE, family.familyId, "raw"), { recursive: true });
  }
  let index = 0;
  for (const family of selected) {
    for (const file of family.files) {
      index += 1;
      writeFileSync(
        join(OUTPUT_DIR, `${String(index).padStart(4, "0")}_${file.name}`),
        file.body,
        "utf8",
      );
    }
  }
  console.log("");
  console.log(`Zapsáno ${index} parametrů do ${OUTPUT_DIR}`);
  console.log("Solve je monolitický běh; tenhle skript ho nespouští.");
}
