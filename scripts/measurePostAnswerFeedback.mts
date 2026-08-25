import { generatePostflopSpot } from "../src/core/postflopGenerator";
import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../src/data/ranges/postflopStrategyRegistry";
import { postflopSpotToTrainingSpot } from "../src/core/postflopTrainingSpot";
import { DISPLAYABLE_ACTION_EV_SOURCES, isActionEvSetUsable } from "../src/core/actionEv";
import { classifyFlopHand, flopzillaLaneForCategory } from "../src/core/flopHandCategory";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadSolvedRiverPacks, riverSolvedStrategyPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import { riverEvManifest } from "../src/data/ranges/riverEvManifest.generated";
import { loadRiverEvPack, readyRiverEvPack } from "../src/data/ranges/riverEvRuntime";
import { mulberry32 } from "../src/core/rng";
import {
  pickSolvedFlopSpot, solvedFlopSpotConfig, solvedFlopSpots,
} from "../src/data/ranges/solvedFlopSpotCatalogue";
import {
  pickSolvedTurnSpot, solvedTurnSpotConfig, solvedTurnSpots,
} from "../src/data/ranges/solvedTurnSpotCatalogue";
import {
  pickSolvedRiverSpot, solvedRiverSpotConfig, solvedRiverSpots,
} from "../src/data/ranges/solvedRiverSpotCatalogue";

/**
 * Co hráč doopravdy uvidí, když odpoví.
 *
 *   npm run mtt:post-answer -- [--spots=300]
 *
 * ## Proč zvlášť od `mtt:solved-coverage`
 *
 * To měření odpovídá na otázku „přišla vyřešená odpověď". Tohle na otázku
 * „**co z ní hráč uvidí**", a jsou to různá čísla. Spot může být plně podložený
 * a hráč přesto nevidí ani EV, ani které kombinace se blafují - přesně tak to
 * 25. 8. 2026 bylo naměřeno: odpověď 100 %, akce v matici 0 %, EV 4,7 %.
 *
 * Měří se čtyři věci, každá jako podíl rozdaných spotů:
 *
 * - **EV akcí**: `actionEvs` prošlé `isActionEvSetUsable`, tedy přesně to, co
 *   `revealActionEvButtonBubbles` zobrazí. Ne „tabulka existuje".
 * - **EV kombinací**: `comboEvs`, čísla uvnitř buněk matice.
 * - **akce v matici**: kolik ze 169 tříd má z `rangeBuckets` přiřazenou akci.
 *   Bez toho matice neumí obarvit ani jednu buňku podle toho, co se s ní dělá.
 * - **blafy v matici**: kolik tříd sedí v lajně BLUFF, tedy kolik by jich
 *   barevná mapa akcí ukázala jako blaf.
 *
 * Poslední sloupec je ten, který odhalí rozpor: pokud obsah blafy zná a hráč je
 * nevidí, je to vada zobrazení. Pokud je nezná, je to vada obsahu. Bez měření se
 * to nedá rozlišit a obě chyby vypadají stejně.
 */

const asJson = process.argv.includes("--json");
const spots = Number(
  process.argv.find((arg) => arg.startsWith("--spots="))?.split("=")[1] ?? 300,
);

await loadSolvedFlopPacks("FULL_RING_9|REGULAR|CHIP_EV|FLOP|OFF");
await loadAllSolvedTurnPacks("FULL_RING_9|REGULAR|CHIP_EV|TURN|OFF");
await loadSolvedRiverPacks("FULL_RING_9|REGULAR|CHIP_EV|RIVER|OFF");

const CATALOGUES = [
  { street: "FLOP", spots: solvedFlopSpots, pick: pickSolvedFlopSpot, config: solvedFlopSpotConfig },
  { street: "TURN", spots: solvedTurnSpots, pick: pickSolvedTurnSpot, config: solvedTurnSpotConfig },
  { street: "RIVER", spots: solvedRiverSpots, pick: pickSolvedRiverSpot, config: solvedRiverSpotConfig },
] as const;

interface Row {
  street: string;
  dealt: number;
  actionEv: number;
  comboEv: number;
  withBuckets: number;
  bucketClasses: number[];
  bluffClasses: number[];
  bluffActions: Set<string>;
  explanationBluffs: number;
  actionsSeen: Set<string>;
}

const rows: Row[] = [];

/**
 * Jedno kolo rozdávání nad jednou ulicí.
 *
 * Vytažené do funkce, aby šlo pustit dvakrát: jednou **studeně**, tak jak to
 * potká hráč u prvního spotu z rodiny, a jednou s **načtenými tabulkami EV**.
 * Rozdíl mezi těmi dvěma čísly je celá odpověď na otázku, jestli EV chybí,
 * nebo jestli jen nestihne dorazit.
 */
function measureStreet(entry: (typeof CATALOGUES)[number]): Row {
  const available = entry.spots();
  const row: Row = {
    street: entry.street,
    dealt: 0,
    actionEv: 0,
    comboEv: 0,
    withBuckets: 0,
    bucketClasses: [],
    bluffClasses: [],
    bluffActions: new Set(),
    explanationBluffs: 0,
    actionsSeen: new Set(),
  };
  if (available.length === 0) return row;

  for (let index = 0; index < spots; index += 1) {
    const rng = mulberry32(2000 + index);
    rng();
    const chosen = (entry.pick as (r: number, s: readonly never[]) => unknown)(
      rng(), available as readonly never[],
    );
    if (chosen === undefined) continue;
    const config = (entry.config as (s: unknown, c: unknown, r: number) => unknown)(
      chosen, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng(),
    );
    if (config === undefined) continue;

    let generated;
    try {
      generated = generatePostflopSpot({
        seed: 2000 + index,
        strategyResolver: createDefaultPostflopStrategyResolver(),
        ...(config as object),
      } as never);
    } catch {
      continue;
    }
    if (generated.strategySource === undefined) continue;

    const spot = postflopSpotToTrainingSpot(generated);
    row.dealt += 1;

    // Přesně ta podmínka, kterou se řídí bubliny s EV nad tlačítky - včetně
    // seznamu nabízených akcí a povolených zdrojů. Bez nich by se měřilo něco
    // jiného než to, co UI zobrazí, a to je přesně ta chyba, kvůli které tenhle
    // skript vznikl.
    const legal = spot.actions.map((item) => item.action);
    if (isActionEvSetUsable(spot.actionEvs, legal, DISPLAYABLE_ACTION_EV_SOURCES)) {
      row.actionEv += 1;
    }
    if ((spot.comboEvs?.length ?? 0) > 0) row.comboEv += 1;
    if (spot.explanation.bluffHands.length > 0) row.explanationBluffs += 1;

    const source = spot.explanation.source;
    const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
    if (buckets.length > 0) row.withBuckets += 1;

    const byHand = new Map<string, { lane: string; action: string }>();
    for (const bucket of buckets) {
      for (const hand of bucket.handClasses) {
        if (!byHand.has(hand)) byHand.set(hand, { lane: bucket.lane, action: bucket.action });
      }
    }
    row.bucketClasses.push(byHand.size);
    let bluffs = 0;
    for (const [hand, cell] of byHand) {
      row.actionsSeen.add(cell.action);
      if (cell.lane === "BLUFF") {
        bluffs += 1;
        row.bluffActions.add(cell.action);
      }
      // Kontrola proti taxonomii: buňka, kterou dnešní barva ukáže jako slabou
      // ruku, ale obsah s ní hraje agresivně, je přesně ten neviditelný blaf.
      void hand;
    }
    row.bluffClasses.push(bluffs);
  }
  return row;
}

for (const entry of CATALOGUES) rows.push(measureStreet(entry));

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "-" : `${((part / whole) * 100).toFixed(1)} %`;
}

if (!asJson) {
  console.log("Co hráč uvidí po odpovědi (rozdáno z katalogu, tak jak rozdává trenažér)");
  console.log(`vzorek: ${spots} pokusů na ulici`);
  console.log("");
  console.log(
    "ulice".padEnd(7)
    + "rozdáno".padStart(8)
    + "EV akcí".padStart(10)
    + "EV komb.".padStart(10)
    + "tříd s akcí".padStart(13)
    + "z toho blaf".padStart(13),
  );
  for (const row of rows) {
    console.log(
      row.street.padEnd(7)
      + String(row.dealt).padStart(8)
      + pct(row.actionEv, row.dealt).padStart(10)
      + pct(row.comboEv, row.dealt).padStart(10)
      + String(median(row.bucketClasses)).padStart(13)
      + String(median(row.bluffClasses)).padStart(13),
    );
  }
  console.log("");
  for (const row of rows) {
    console.log(
      `${row.street}: akce v maticích ${[...row.actionsSeen].sort().join(", ") || "žádné"}`
      + ` | blafovací akce ${[...row.bluffActions].sort().join(", ") || "žádné"}`
      + ` | vysvětlení jmenuje blafy v ${pct(row.explanationBluffs, row.dealt)} spotů`,
    );
  }
  console.log("");
  console.log(
    "Pozn.: „tříd s akcí\" je medián počtu ze 169 buněk matice, které mají\n"
    + "z obsahu přiřazenou akci. Zbytek ze 169 jsou třídy, které hrdina v tomhle\n"
    + "spotu nedrží - ty zůstávají prázdné, a je to tak správně.",
  );
} else {
  console.log(JSON.stringify(rows.map((row) => ({
    street: row.street,
    dealt: row.dealt,
    actionEvShare: row.dealt === 0 ? 0 : row.actionEv / row.dealt,
    comboEvShare: row.dealt === 0 ? 0 : row.comboEv / row.dealt,
    bucketClassesMedian: median(row.bucketClasses),
    bluffClassesMedian: median(row.bluffClasses),
    actions: [...row.actionsSeen].sort(),
    bluffActions: [...row.bluffActions].sort(),
  })), null, 2));
}

// Taxonomie proti obsahu: kolik tříd by dnešní barva ukázala jako "nic", ale
// obsah s nimi hraje agresivně. To je ten blaf, který hráč nevidí.
let hidden = 0;
let checkedClasses = 0;
for (const entry of CATALOGUES) {
  const available = entry.spots();
  if (available.length === 0) continue;
  for (let index = 0; index < Math.min(spots, 60); index += 1) {
    const rng = mulberry32(4000 + index);
    rng();
    const chosen = (entry.pick as (r: number, s: readonly never[]) => unknown)(
      rng(), available as readonly never[],
    );
    if (chosen === undefined) continue;
    const config = (entry.config as (s: unknown, c: unknown, r: number) => unknown)(
      chosen, POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS, rng(),
    );
    if (config === undefined) continue;
    let generated;
    try {
      generated = generatePostflopSpot({
        seed: 4000 + index,
        strategyResolver: createDefaultPostflopStrategyResolver(),
        ...(config as object),
      } as never);
    } catch {
      continue;
    }
    if (generated.strategySource === undefined) continue;
    const spot = postflopSpotToTrainingSpot(generated);
    const source = spot.explanation.source;
    const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
    const seen = new Set<string>();
    for (const bucket of buckets) {
      for (const hand of bucket.handClasses) {
        if (seen.has(hand)) continue;
        seen.add(hand);
        checkedClasses += 1;
        const taxonomyLane = flopzillaLaneForCategory(
          classifyFlopHand(hand as never, spot.board),
        );
        const aggressive = bucket.action === "BET_SMALL" || bucket.action === "BET_BIG"
          || bucket.action === "RAISE";
        if (aggressive && taxonomyLane !== "VALUE") hidden += 1;
      }
    }
  }
}
if (!asJson) {
  console.log("");
  console.log(
    `tříd, se kterými obsah hraje agresivně, ale taxonomie je nemá za hodnotu: `
    + `${hidden} z ${checkedClasses} (${pct(hidden, checkedClasses)})`,
  );
  console.log(
    "To je ta blafovací range, kterou barvení podle kategorie ruky nedokázalo\n"
    + "odlišit od stejně silných rukou, které se vzdávají. Od 25. 8. 2026 se\n"
    + "matice barví podle akce, takže tyhle třídy mají vlastní barvu.",
  );
}

/**
 * Kde se riverová EV ztrácí, a hlavně: kolik jí je spočítané a zahozené.
 *
 * EV se váže na `contentHash` packu a `loadRiverEvPack` neshodu **spolkne** -
 * vrátí `undefined`, což z resolveru vypadá stejně jako „tabulka ještě
 * nedorazila". Noční `mtt:after-night` packy přegeneruje, otisk se změní a EV
 * zmizí, aniž by to kdokoli ohlásil.
 *
 * Otisk je správně: čísla spočítaná z jiného obsahu by lhala. Vada je v tom, že
 * se ztráta neohlásí, takže **každá úspěšná noc snižuje doručení** a produkční
 * čísla přitom rostou. Tenhle rozpad je ta chybějící hláška.
 */
const evPacks = riverSolvedStrategyPacks as readonly {
  id: string; contentHash?: string; rules?: readonly unknown[];
}[];
const evIds = new Set(riverEvManifest.map((entry) => entry.packId));
let evMissing = 0;
let evStale = 0;
let evReady = 0;
let rulesMissing = 0;
let rulesStale = 0;
let rulesReady = 0;
const staleNames: string[] = [];
for (const pack of evPacks) {
  const rules = pack.rules?.length ?? 0;
  if (!evIds.has(pack.id)) {
    evMissing += 1;
    rulesMissing += rules;
    continue;
  }
  await loadRiverEvPack(pack as never);
  if (readyRiverEvPack(pack.id) !== undefined) {
    evReady += 1;
    rulesReady += rules;
  } else {
    evStale += 1;
    rulesStale += rules;
    if (staleNames.length < 6) {
      staleNames.push(pack.id.replace("mtt-full-ring-9-river-solved-", "").replace("-v1", ""));
    }
  }
}

if (!asJson) {
  console.log("");
  console.log("Kde se ztrácí riverová EV");
  console.log(
    "stav".padEnd(22) + "packů".padStart(7) + "pravidel".padStart(10),
  );
  console.log("bez tabulky".padEnd(22) + String(evMissing).padStart(7) + String(rulesMissing).padStart(10));
  console.log("tabulka zastaralá".padEnd(22) + String(evStale).padStart(7) + String(rulesStale).padStart(10));
  console.log("doručeno".padEnd(22) + String(evReady).padStart(7) + String(rulesReady).padStart(10));
  if (evStale > 0) {
    console.log("");
    console.log(
      `POZOR: ${evStale} tabulek EV je spočítaných a zahozených, protože se`
      + " přegeneroval pack a otisk přestal sedět.",
    );
    console.log(`  ${staleNames.join(", ")}${evStale > staleNames.length ? ", ..." : ""}`);
    console.log("  Spraví to přepočet EV těch rodin; do té doby je ta práce ztracená.");
  }
}

/**
 * Totéž rozdávání ještě jednou, ale s **načtenými tabulkami EV**.
 *
 * Nahoře se měří studená cesta, protože tu potká hráč: `actionEvsFor` se ptá
 * `readyRiverEvPack` uprostřed rozdání, a když tabulka ještě nedorazila, vrátí
 * nic a jen nastartuje stahování. První spot z rodiny tedy EV nikdy nemá.
 *
 * Rozdíl mezi těmito dvěma čísly rozděluje vinu, a to je jediné, co tu jde měřit
 * bez hádání:
 *
 * - **teplá ≈ studená** znamená, že EV chybí v datech; pomůže jen dopočet.
 * - **teplá >> studená** znamená, že data jsou a nestíhá načasování; pomůže
 *   přednačtení, ne další solvování.
 */
const warmRiver = measureStreet(CATALOGUES[2]);

if (!asJson) {
  const cold = rows.find((row) => row.street === "RIVER");
  console.log("");
  console.log("EV na riveru: studeně proti načteným tabulkám");
  console.log(
    "stav".padEnd(24) + "EV akcí".padStart(10) + "EV komb.".padStart(10),
  );
  console.log(
    "jak to potká hráč".padEnd(24)
    + pct(cold?.actionEv ?? 0, cold?.dealt ?? 0).padStart(10)
    + pct(cold?.comboEv ?? 0, cold?.dealt ?? 0).padStart(10),
  );
  console.log(
    "s načtenou tabulkou".padEnd(24)
    + pct(warmRiver.actionEv, warmRiver.dealt).padStart(10)
    + pct(warmRiver.comboEv, warmRiver.dealt).padStart(10),
  );
  const gap = (warmRiver.dealt === 0 ? 0 : warmRiver.actionEv / warmRiver.dealt)
    - ((cold?.dealt ?? 0) === 0 ? 0 : (cold?.actionEv ?? 0) / (cold?.dealt ?? 1));
  console.log("");
  console.log(
    gap > 0.05
      ? "Data jsou, nestíhá načasování: tabulka dorazí až po rozdání, takže"
        + "\nprvní spot z rodiny EV nikdy neukáže. Pomůže přednačtení, ne solvování."
      : "Rozdíl je malý, takže EV chybí v datech, ne v načasování.",
  );
}
