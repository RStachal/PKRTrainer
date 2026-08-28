import { generatePostflopSpot } from "../src/core/postflopGenerator";
import { postflopDecisionPrices } from "../src/core/postflopDecisionPrice";
import { POSTFLOP_FULL_RING_ALL_POSITION_CONTEXTS } from "../src/core/postflopGenerator";
import { createDefaultPostflopStrategyResolver } from "../src/data/ranges/postflopStrategyRegistry";
import { postflopSpotToTrainingSpot } from "../src/core/postflopTrainingSpot";
import { DISPLAYABLE_ACTION_EV_SOURCES, isActionEvSetUsable } from "../src/core/actionEv";
import { classifyFlopHand, flopzillaLaneForCategory } from "../src/core/flopHandCategory";
import { loadAllSolvedTurnPacks } from "../src/data/ranges/turnSolvedStrategyPacks";
import { loadSolvedFlopPacks } from "../src/data/ranges/flopSolvedStrategyPacks";
import { loadSolvedRiverPacks, riverSolvedStrategyPacks } from "../src/data/ranges/riverSolvedStrategyPacks";
import { riverEvManifest } from "../src/data/ranges/riverEvManifest.generated";
import { loadRiverEvPack, readyRiverEvPack, resetRiverEvCache } from "../src/data/ranges/riverEvRuntime";
import { primeRiverEvForPack } from "../src/data/ranges/riverEvPrefetch";
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
  /**
   * Spotů, kde hráč uvidí cenu dorovnání.
   *
   * Na flopu a turnu je to **jediné** číslo, které tam kdy bude: EV se tam
   * spočítat nedá (bod 131), zatímco cena ano - ze skutečné linie, kterou
   * solver hrál.
   */
  priced: number;
  /**
   * Spotů, kde hráč uvidí **frekvenci** - jak často solver tu akci hraje.
   *
   * Třetí druh čísla vedle EV a ceny, a jediný, který má co říct i tam, kde
   * hrdina jedná první: tam žádnou cenu neplatí a EV se spočítat nedá.
   */
  mixShown: number;
  /** Spotů, kde **obsah** blafovací lajnu má - ať už se vysvětlení ozve, nebo ne. */
  bluffsInContent: number;
  /** Z toho těch, kde vysvětlení mlčí. To je ta vada; zbytek je správně prázdno. */
  bluffsSilent: number;
  actionsSeen: Set<string>;
}

const rows: Row[] = [];

/**
 * Jedno kolo rozdávání nad jednou ulicí.
 *
 * Vytažené do funkce, aby šlo pustit dvakrát: jednou **cestou produktu**, tedy
 * s přednačtením tabulky EV, a jednou **bez něj**. Rozdíl mezi těmi dvěma čísly
 * říká, co přednačtení kupuje - a tím pádem i to, o co by se přišlo, kdyby se
 * rozbilo. Bez toho srovnání by regrese přednačtení vypadala jako chybějící
 * obsah a hledalo by se v solveru.
 */
async function measureStreet(
  entry: (typeof CATALOGUES)[number],
  prefetch = true,
): Promise<Row> {
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
    priced: 0,
    mixShown: 0,
    bluffsInContent: 0,
    bluffsSilent: 0,
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

    // Přednačtení tabulky EV, přesně jak to dělá trenažér před rozdáním.
    //
    // Bez tohohle by brána měřila cestu, kterou produkt od 25. 8. 2026 nejde -
    // a to je tatáž vada, kvůli které vrstva doručení vznikla. Volá se sdílená
    // funkce, ne kopie, aby se ty dvě cesty nemohly rozejít.
    if (prefetch && entry.street === "RIVER") {
      const packId = (chosen as { packId?: string }).packId;
      if (packId !== undefined) await primeRiverEvForPack(packId);
    }

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
    if (postflopDecisionPrices(spot).length > 0) row.priced += 1;
    const heroBucket = spot.explanation.source.kind === "STRATEGY_PACK"
      ? spot.explanation.source.heroRangeBucket
      : undefined;
    // **Podmínka UI, ne vlastní.** `actionMixText` ukáže procenta jen tehdy,
    // když jsou přesné *všechny* položky mixu; při jediné skryté vypíše samé
    // názvy akcí bez čísel. Měřit `some` by tenhle případ počítalo jako
    // doručený, přestože by hráč žádnou frekvenci neviděl.
    const mix = heroBucket?.actionMix;
    if (mix !== undefined && mix.length > 0
      && mix.every((item) => item.visibility === "EXACT")) {
      row.mixShown += 1;
    }

    const source = spot.explanation.source;
    const buckets = source.kind === "STRATEGY_PACK" ? source.rangeBuckets ?? [] : [];
    if (buckets.length > 0) row.withBuckets += 1;

    // Rozdíl mezi „blafy tu nejsou" a „blafy tu jsou a text o nich mlčí".
    //
    // Dokud se měřilo jen to druhé číslo, vypadaly obě možnosti stejně: spot bez
    // blafovací lajny je **správně** bez zmínky - hrdina v něm nic nepředstírá.
    // Zamlčený blaf je naopak přesně ta třída vady, kvůli které tenhle skript
    // vznikl: obsah ho spočítal a k hráči nedošel.
    const contentHasBluffs = buckets.some(
      (bucket) => bucket.lane === "BLUFF" && bucket.handClasses.length > 0,
    );
    if (contentHasBluffs) {
      row.bluffsInContent += 1;
      if (spot.explanation.bluffHands.length === 0) row.bluffsSilent += 1;
    }

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

for (const entry of CATALOGUES) rows.push(await measureStreet(entry));

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
    + "cena".padStart(9)
    + "frekvence".padStart(11)
    + "EV komb.".padStart(10)
    + "tříd s akcí".padStart(13)
    + "z toho blaf".padStart(13),
  );
  for (const row of rows) {
    console.log(
      row.street.padEnd(7)
      + String(row.dealt).padStart(8)
      + pct(row.actionEv, row.dealt).padStart(10)
      + pct(row.priced, row.dealt).padStart(9)
      + pct(row.mixShown, row.dealt).padStart(11)
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
  console.log("Blafy: co je v obsahu proti tomu, co se řekne");
  console.log(
    "ulice".padEnd(8) + "obsah má blaf".padStart(15)
    + "text mlčí".padStart(12) + "z toho".padStart(10),
  );
  for (const row of rows) {
    console.log(
      row.street.padEnd(8)
      + pct(row.bluffsInContent, row.dealt).padStart(15)
      + String(row.bluffsSilent).padStart(12)
      + pct(row.bluffsSilent, row.bluffsInContent).padStart(10),
    );
  }
  console.log(
    "\nSpot bez blafovací lajny je správně bez zmínky - hrdina v něm nic\n"
    + "nepředstírá. Vada je jen ten prostřední sloupec: obsah blaf spočítal\n"
    + "a k hráči nedošel.",
  );
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
resetRiverEvCache();
const withoutPrefetch = await measureStreet(CATALOGUES[2], false);

if (!asJson) {
  const shipped = rows.find((row) => row.street === "RIVER");
  console.log("");
  console.log("Co na riveru kupuje přednačtení tabulky EV");
  console.log("stav".padEnd(26) + "EV akcí".padStart(10) + "EV komb.".padStart(10));
  console.log(
    "cesta produktu".padEnd(26)
    + pct(shipped?.actionEv ?? 0, shipped?.dealt ?? 0).padStart(10)
    + pct(shipped?.comboEv ?? 0, shipped?.dealt ?? 0).padStart(10),
  );
  console.log(
    "bez přednačtení".padEnd(26)
    + pct(withoutPrefetch.actionEv, withoutPrefetch.dealt).padStart(10)
    + pct(withoutPrefetch.comboEv, withoutPrefetch.dealt).padStart(10),
  );
  const shippedShare = (shipped?.dealt ?? 0) === 0
    ? 0
    : (shipped?.actionEv ?? 0) / (shipped?.dealt ?? 1);
  const bareShare = withoutPrefetch.dealt === 0
    ? 0
    : withoutPrefetch.actionEv / withoutPrefetch.dealt;
  console.log("");
  console.log(
    shippedShare - bareShare > 0.05
      ? "Přednačtení drží. Bez něj se resolver ptá na tabulku uprostřed rozdání,"
        + " kdy ještě nedorazila, a první spot z každé rodiny EV neukáže."
      : "POZOR: přednačtení nic nepřidává. Buď se rozbilo, nebo EV chybí v datech"
        + " - rozliší to rozpad výš.",
  );
}

/**
 * Totéž měření, ale na preflopu - tedy na hlavní ploše produktu.
 *
 * ## Proč to sem přibylo
 *
 * `mtt:post-answer` vznikl 25. 8. 2026 proto, že se měřil vyrobený obsah místo
 * toho, co dojde k hráči. Jenže se ptal **jen na postflop**, a to je ta menší
 * část: preflopová otázka je to, co trenažér rozdává od začátku a co hráč vidí
 * nejčastěji. Měřit doručení jen tam, kde se zrovna staví nový obsah, je táž
 * chyba o patro výš.
 *
 * Měří se stejnou podmínkou, jakou má UI (`revealActionEvButtonBubbles`), a
 * rozdává se `spotSequence`, tedy tím, čím rozdává trenažér. Kdyby se sáhlo
 * o vrstvu níž, měřilo by se něco, co hráč nikdy nedostane.
 */
{
  const { buildPool } = await import("../src/core/drillEngine");
  const { rangeStore } = await import("../src/data/rangeStore");
  const { loadPreflopEquity } = await import("../src/core/preflopEquity");
  const { preflopDecisionPrices } = await import("../src/core/preflopDecisionPrice");

  // Tabulka ekvit se musí načíst, jinak měření lže.
  //
  // Aplikace ji natahuje při startu (`main.ts`), protože z ní se počítá cena
  // jamu; bez ní vrací `shoveEv` prázdno a **každý** spot vypadá jako spot bez
  // EV. Naměřeno oběma způsoby: bez tabulky 0 z 3 042 push/fold spotů, s ní
  // 3 042 z 3 042. To není rozdíl v produktu, to je rozdíl v tom, jestli měřím
  // aplikaci, nebo svoje vlastní zapomenutí.
  await loadPreflopEquity();

  const filters = {
    positions: [], buckets: [], contexts: [], ante: "OFF", scoringMode: "LENIENT",
  } as never;

  // Celý pool, ne prvních N ze `spotSequence`.
  //
  // Fronta cykluje od indexu nula a je poskládaná po kontextech, takže prvních
  // 300 spotů je **300x RFI**. První pokus tak naměřil „0,0 % EV" a znamenalo
  // to jen to, že RFI na hloubce, kde se nejamuje, cenu nefixuje - tedy nic
  // o produktu. Pool po kontextech je to, na co se trenažér doopravdy ptá.
  const CONTEXTS = [
    "PUSH_FOLD", "VS_ALLIN", "RFI", "VS_OPEN", "VS_3BET", "VS_4BET", "SQUEEZE",
    "VS_LIMP", "BLIND_VS_BLIND",
  ] as const;

  const byContext = new Map<string, { dealt: number; ev: number; sources: Map<string, number> }>();
  let dealt = 0;
  let withEv = 0;
  let withExplanation = 0;
  let withPrice = 0;
  const sources = new Map<string, number>();

  const pool = CONTEXTS.flatMap((context) => {
    try {
      return buildPool(20260826, context as never, filters, rangeStore);
    } catch {
      return [];
    }
  });

  for (const spot of pool) {
    dealt += 1;
    const row = byContext.get(spot.context)
      ?? { dealt: 0, ev: 0, sources: new Map<string, number>() };
    row.dealt += 1;

    // Přesně podmínka z `revealActionEvButtonBubbles`: nabízené akce jsou ty na
    // tlačítkách, tedy `answers`, a zdroje ty zobrazovací.
    const offered = spot.answers.map((answer) => answer.key);
    if (isActionEvSetUsable(spot.actionEvs, offered, DISPLAYABLE_ACTION_EV_SOURCES)) {
      withEv += 1;
      row.ev += 1;
      const source = String(spot.actionEvs?.source ?? "?");
      sources.set(source, (sources.get(source) ?? 0) + 1);
      row.sources.set(source, (row.sources.get(source) ?? 0) + 1);
    }
    if (spot.explanation.trim().length > 0) withExplanation += 1;
    if (preflopDecisionPrices(spot, rangeStore).some((price) => price.kind !== "BASELINE")) {
      withPrice += 1;
    }
    byContext.set(spot.context, row);
  }

  console.log("");
  console.log("Co hráč uvidí po odpovědi na preflopu (rozdáno `spotSequence`)");
  console.log(`vzorek: ${dealt} spotů = celý pool přes ${CONTEXTS.length} kontextů`);
  console.log("");
  console.log("kontext".padEnd(14) + "rozdáno".padStart(9) + "EV akcí".padStart(10));
  for (const [context, row] of [...byContext].sort((left, right) => right[1].dealt - left[1].dealt)) {
    console.log(
      context.padEnd(14) + String(row.dealt).padStart(9) + pct(row.ev, row.dealt).padStart(10),
    );
  }
  console.log("");
  console.log(
    `celkem: EV akcí ${pct(withEv, dealt)} | cena akce ${pct(withPrice, dealt)}`
    + ` | vysvětlení ${pct(withExplanation, dealt)}`,
  );
  console.log(
    "odkud EV je: "
    + ([...sources].sort((left, right) => right[1] - left[1])
      .map(([source, count]) => `${source} ${count}`).join(", ") || "odnikud"),
  );

  /**
   * Dno, pod které doručení spadnout nesmí.
   *
   * ## Proč to přibylo až teď
   *
   * Tenhle skript se od 25. 8. 2026 jmenuje brána a v `verify:block` stojí mezi
   * branami - jenže **nikdy nevrátil nenulový kód**. Byla to zpráva, kterou si
   * nikdo nemusel přečíst, a přesně to se 27. 8. 2026 vymstilo: ranní cyklus
   * odpojil 44 ze 48 tabulek EV, tenhle skript to ve svém výpisu **měl**
   * („bez tabulky / zastaralá"), a chain přesto pokračoval. Zastavila to až
   * sada, o dvě minuty a devadesát čtyři testů později.
   *
   * ## Jak jsou čísla zvolená
   *
   * Dvě podmínky jsou **přísné nuly**, protože každá jiná hodnota je vada:
   * zastaralá tabulka EV je spočítaná a zahozená práce, zamlčený blaf je obsah,
   * který se nedostal na obrazovku.
   *
   * Podíly mají rezervu, protože se legitimně hýbou s obsahem: noc přidá rodinu
   * bez EV a doručení klesne, aniž by se cokoli pokazilo. Dno je proto pod
   * naměřeným, ne na něm - má chytit propad, ne kolísání.
   *
   * | co | naměřeno 27. 8. 2026 | dno |
   * |---|---|---|
   * | EV na rozdaných riverech | 89,7 % | 75 % |
   * | EV na preflopu | 33,1 % | 28 % |
   * | zastaralých tabulek EV | 0 | 0 |
   * | zamlčených blafů | 0 | 0 |
   */
  const floor = (name: string, fallback: number): number => {
    const raw = process.env[name];
    const parsed = raw === undefined ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const riverRow = rows.find((row) => row.street === "RIVER");
  const riverEvShare = riverRow === undefined || riverRow.dealt === 0
    ? 0
    : (100 * riverRow.actionEv) / riverRow.dealt;
  const preflopEvShare = dealt === 0 ? 0 : (100 * withEv) / dealt;
  const silentBluffs = rows.reduce((sum, row) => sum + row.bluffsSilent, 0);
  // Cena akce má dno stejně jako EV, a ze stejného důvodu: je to spočítaný
  // obsah, který se dá ztratit tiše. Naměřeno 28. 8. 2026 při zavedení -
  // flop 25,0 %, turn 36,3 %, river 53,3 % - a dno je pod tím, ne na tom.
  const priceFloors: Record<string, number> = { FLOP: 20, TURN: 30, RIVER: 45 };
  const pricedShare = (street: string): number => {
    const row = rows.find((item) => item.street === street);
    return row === undefined || row.dealt === 0 ? 0 : (100 * row.priced) / row.dealt;
  };

  const failures: string[] = [];
  if (riverEvShare < floor("POST_ANSWER_MIN_RIVER_EV_PCT", 75)) {
    failures.push(`EV na riverech ${riverEvShare.toFixed(1)} % pod dnem ${floor("POST_ANSWER_MIN_RIVER_EV_PCT", 75)} %`);
  }
  // Cena na preflopu se počítá z velikostí, které produkt učí, takže ji dostane
  // každý spot. Dno je proto vysoko: propad by znamenal, že se rozpadl výpočet,
  // ne že ubyl obsah. Naměřeno 100,0 % z 78 585 spotů.
  const preflopPriceShare = dealt === 0 ? 0 : (100 * withPrice) / dealt;
  if (preflopPriceShare < floor("POST_ANSWER_MIN_PREFLOP_PRICE_PCT", 95)) {
    failures.push(
      `cena akce na preflopu ${preflopPriceShare.toFixed(1)} %`
      + ` pod dnem ${floor("POST_ANSWER_MIN_PREFLOP_PRICE_PCT", 95)} %`,
    );
  }
  if (preflopEvShare < floor("POST_ANSWER_MIN_PREFLOP_EV_PCT", 28)) {
    failures.push(`EV na preflopu ${preflopEvShare.toFixed(1)} % pod dnem ${floor("POST_ANSWER_MIN_PREFLOP_EV_PCT", 28)} %`);
  }
  if (evStale > 0) {
    failures.push(`${evStale} tabulek EV je spočítaných a zahozených (otisk nesedí na pack)`);
  }
  if (silentBluffs > 0) {
    failures.push(`${silentBluffs} spotů má blaf v obsahu a mlčí o něm`);
  }
  // Frekvence má dno vysoko, protože se nedopočítává: buď kbelík hrdinovy ruky
  // existuje, nebo pravidlo tu ruku vůbec neřešilo. Naměřeno 100,0 % na všech
  // třech ulicích hned při zapojení.
  for (const row of rows) {
    const share = row.dealt === 0 ? 0 : (100 * row.mixShown) / row.dealt;
    const limit = floor(`POST_ANSWER_MIN_${row.street}_MIX_PCT`, 90);
    if (share < limit) {
      failures.push(`frekvence na ${row.street} ${share.toFixed(1)} % pod dnem ${limit} %`);
    }
  }
  for (const [street, floorPct] of Object.entries(priceFloors)) {
    const limit = floor(`POST_ANSWER_MIN_${street}_PRICE_PCT`, floorPct);
    const share = pricedShare(street);
    if (share < limit) {
      failures.push(`cena akce na ${street} ${share.toFixed(1)} % pod dnem ${limit} %`);
    }
  }

  console.log("");
  if (failures.length === 0) {
    console.log("Doručení drží nad dnem.");
  } else {
    console.log("DORUČENÍ SPADLO POD DNO:");
    for (const line of failures) console.log(`  ${line}`);
    console.log("");
    console.log("Tohle není kosmetika: je to spočítaný obsah, který se k hráči nedostane.");
    process.exitCode = 1;
  }
}
