import { createRangeStoreFromRangePack } from "../../src/data/rangeStore";
import { allMttPreflopRangePacks } from "../../src/data/ranges/mttPreflopRangePacks";
import type { AnteMode, Position, StackBucket } from "../../src/core/types";

/**
 * Compare the owner's purchased opening charts against the ranges we teach.
 *
 * The charts are the benchmark, not the content: they stay outside the
 * repository and nothing here copies them in. What crosses over is a width and a
 * list of disagreements, which is what makes them useful for checking our own
 * solver-derived ranges.
 *
 * Pure data and helpers. The CLI lives in scripts/compareChartsToPacks.mts.
 * Keeping them apart is the same fix the hero-range guard needed earlier today
 * and the same trap this file fell into an hour later: a module that reads argv
 * and throws at import time cannot be imported.
 */

const TOTAL_COMBOS = 1326;

/**
 * Seats in table order, and the names the charts use for them.
 *
 * The packs use LJ where the charts say MP and BTN where they say BU; the rest
 * agree. Recorded once here so a page naming a span can be expanded rather than
 * skipped, which is what earlier runs did with anything not naming exactly two
 * seats.
 */
const SEAT_ORDER: readonly Position[] = ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB"];

export const CHART_SEAT_NAMES: Readonly<Record<string, Position>> = {
  utg: "UTG",
  "utg1": "UTG+1",
  "utg+1": "UTG+1",
  "utg2": "UTG+2",
  "utg+2": "UTG+2",
  mp: "LJ",
  hj: "HJ",
  co: "CO",
  bu: "BTN",
  btn: "BTN",
  sb: "SB",
};

/**
 * The seats a page covers, from its name and the grid count.
 *
 * A name like "co-bu" is a span from the cutoff to the button; with two grids
 * that is exactly those two seats, and with three it would be one seat wider than
 * the name allows, so it is refused. Matching the span length against the grids
 * is what keeps this from quietly attributing a grid to the wrong seat.
 */
export function seatsForPage(page: string, gridCount: number): readonly Position[] | null {
  const stem = page.toLowerCase().replace(/\.(png|json)$/i, "");
  const match = /([a-z]+\+?[0-9]?)\s*-\s*([a-z]+\+?[0-9]?)/.exec(stem);
  if (match === null) return null;
  const from = CHART_SEAT_NAMES[match[1]];
  const to = CHART_SEAT_NAMES[match[2]];
  if (from === undefined || to === undefined) return null;

  const start = SEAT_ORDER.indexOf(from);
  const end = SEAT_ORDER.indexOf(to);
  if (start < 0 || end < 0 || end < start) return null;
  const span = SEAT_ORDER.slice(start, end + 1);
  return span.length === gridCount ? span : null;
}

/** Stack depth the page covers, from its name. */
export function bucketForPage(page: string): StackBucket | null {
  if (/10-20bb/i.test(page)) return 20 as StackBucket;
  if (/25bb/i.test(page)) return 25 as StackBucket;
  if (/100bb/i.test(page)) return 100 as StackBucket;
  // The pushing pages state their depth in the title, not the file name; 10BB is
  // what the sheet says and it is the only depth that folder covers.
  if (/pushing/i.test(page)) return 10 as StackBucket;
  return null;
}

export function combosInClass(handClass: string): number {
  if (handClass.length === 2) return handClass[0] === handClass[1] ? 6 : 16;
  if (handClass.endsWith("s")) return 4;
  if (handClass.endsWith("o")) return 12;
  return 0;
}

export interface Cluster { hex: string; count: number; hands: string[] }

/**
 * The hands a grid plays, being every class that is not the fold colour.
 *
 * Fold is taken as the lightest cluster. On every page examined it is a near
 * white, and it is always the palest thing present - the actions are saturated.
 */
export function clusterLuminance(hex: string): number {
  const v = hex.replace("#", "");
  return 0.2126 * Number.parseInt(v.slice(0, 2), 16)
    + 0.7152 * Number.parseInt(v.slice(2, 4), 16)
    + 0.0722 * Number.parseInt(v.slice(4, 6), 16);
}

/**
 * Lower and upper bounds on what a grid plays, when the palette is ambiguous.
 *
 * Fold is normally the palest colour by a wide margin. Some pages carry a second
 * near-white - the pushing sheets draw blue, white and a cream, and the cream is
 * within a luminance point of the white while covering as many hands as the blue.
 * Those pages have no legend, so whether the cream is a push or a fold is not
 * knowable from the image, and the two readings differ by a factor of two.
 *
 * Rather than pick one, both are reported: the lower bound excludes every pale
 * cluster, the upper only the palest. Where they agree there is no ambiguity and
 * the pair collapses to a single number.
 */
export function playedBounds(clusters: readonly Cluster[]): { lower: string[]; upper: string[] } {
  if (clusters.length === 0) return { lower: [], upper: [] };
  const sorted = [...clusters].sort((a, b) => clusterLuminance(b.hex) - clusterLuminance(a.hex));
  const palest = clusterLuminance(sorted[0].hex);
  const pale = sorted.filter((cluster) => palest - clusterLuminance(cluster.hex) <= 12);
  return {
    lower: clusters.filter((cluster) => !pale.includes(cluster)).flatMap((cluster) => cluster.hands),
    upper: clusters.filter((cluster) => cluster !== sorted[0]).flatMap((cluster) => cluster.hands),
  };
}

export function playedHands(clusters: readonly Cluster[]): string[] {
  if (clusters.length === 0) return [];
  const luminance = (hex: string) => {
    const v = hex.replace("#", "");
    return 0.2126 * Number.parseInt(v.slice(0, 2), 16)
      + 0.7152 * Number.parseInt(v.slice(2, 4), 16)
      + 0.0722 * Number.parseInt(v.slice(4, 6), 16);
  };
  const fold = [...clusters].sort((a, b) => luminance(b.hex) - luminance(a.hex))[0];
  return clusters.filter((cluster) => cluster !== fold).flatMap((cluster) => cluster.hands);
}

/**
 * Pack, který se má měřit: ten, co se dodává, ne ten, ze kterého vznikl.
 *
 * `allMttPreflopRangePacks` obsahuje kandidáta i produkční verzi a `find` bral
 * dosud první, co projde filtrem. Před načtením produkčního registru je to
 * kandidát, po něm produkční pack - takže totéž volání vracelo jednou 507
 * záznamů a jindy 487, podle toho, co se stihlo naimportovat dřív. Měření pak
 * popisovalo obsah, který hráč nedostane.
 *
 * Rozdíl není kosmetický: kandidát rozlišuje na UTG čtyři hloubkové vrstvy,
 * produkční pack dvě. Celá první várka porovnání s nezávislým zdrojem tím pádem
 * měřila lepší data, než se doopravdy dodávají.
 */
export function shippedPreflopPack(ante: AnteMode) {
  const matching = allMttPreflopRangePacks.filter((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.records.length > 0
  ));
  // Žádný fallback na kandidáta. Když produkční pack v katalogu není, znamená to,
  // že volající zapomněl načíst produkční registr - a tiché vrácení kandidáta
  // udělá z té chyby měření, které vypadá stejně důvěryhodně jako správné.
  // Prázdná odpověď je poznat hned; o deset bodů posunutá tabulka ne.
  return matching.find((item) => item.id.includes("-production-"));
}

/**
 * $EV (ICM) pack téhož formátu. Není produkční a nemá být - je odvozený z
 * bubliny, tedy přesně ten druh dat, který produkční brána odmítá pustit dál než
 * do náhledu. Měřit ho ale smysl má: dokud nevíme, jak daleko od nezávislého
 * ICM zdroje leží, nevíme ani, jestli je náhled užitečný, nebo matoucí.
 */
export function icmPreflopPack(ante: AnteMode) {
  return allMttPreflopRangePacks.find((item) => (
    item.dimensions.tableFormat === "FULL_RING_9" &&
    item.dimensions.blindSpeed === "REGULAR" &&
    item.dimensions.ante === ante &&
    item.dimensions.evModel === "DOLAR_EV" &&
    item.records.length > 0
  ));
}

/** Otevírací šířka konkrétního packu, aby šlo měřit i něco jiného než produkci. */
export function openingWidthOf(
  pack: ReturnType<typeof shippedPreflopPack>,
  ante: AnteMode,
  position: Position,
  bucket: StackBucket,
): { pct: number; opens: string[] } | null {
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const opens = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .map(([handClass]) => handClass);
  return { pct: opens.reduce((sum, h) => sum + combosInClass(h), 0) / TOTAL_COMBOS * 100, opens };
}

export function packWidth(ante: AnteMode, position: Position, bucket: StackBucket): { pct: number; opens: string[] } | null {
  const pack = shippedPreflopPack(ante);
  if (pack === undefined) return null;
  const entry = createRangeStoreFromRangePack(pack).lookup({ ante, position, bucket, context: "RFI" });
  if (entry === undefined) return null;
  const opens = Object.entries(entry.actions)
    .filter(([, actions]) => actions.some((action) => action !== "FOLD"))
    .map(([handClass]) => handClass);
  return { pct: opens.reduce((sum, h) => sum + combosInClass(h), 0) / TOTAL_COMBOS * 100, opens };
}

