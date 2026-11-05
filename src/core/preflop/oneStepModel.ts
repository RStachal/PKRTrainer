import { combosInClass, equityVsRange, TOTAL_COMBOS } from "../preflopEquity";
import { ALL_HAND_CLASSES } from "../poker";
import { preflopRaiseSizes } from "../preflopSizes";
import {
  POSITION_ORDER,
  type ActionContext,
  type ActionKey,
  type AnteMode,
  type HandLabel,
  type Position,
  type RealVersusGto,
  type Spot,
  type StackBucket,
} from "../types";
import type { VillainArchetype } from "../villain/archetypes";
import { comboCount, preflopVillainModel, resizedRange } from "../villain/preflopModel";
import type { TablePlayers } from "../villain/tableCast";
import { REJAM_EV_OPENER_BY_HERO, openSizeAtDepth } from "./preflopEv";
import type { RangeStore } from "../../data/rangeStore";

/**
 * Open, 3-bet a call proti typům hráčů: jeden krok kotvený na chart
 * (Agents/plan-gto-real-2026-11.md, 4.4 a 4.5).
 *
 * Tady se všechno nerozhodne all-inem, takže přesné EV neexistuje. Model jednoho
 * kroku - kolik se složí, co hráč zrealizuje, když ho dorovnají, a co ztratí, když
 * ho přezvednou - absolutní hodnotu netrefí: měřeno 5. 11. 2026 říkal na VS_OPEN
 * „3-betuj všechno“, protože soupeř v chartu po 3-betu skládá víc, než kolik by
 * jednokroková matematika snesla. Věřit se dá jen **změně**: o kolik víc kámen složí
 * a o kolik užší má range. Proto:
 *
 * 1. **Kotva.** Pro každou buňku (sedadlo, hloubka, soupeř) se najde posun, se kterým
 *    model nejlépe zopakuje chart. Shoda na produkčním packu: RFI 90,7 %, VS_OPEN
 *    87,6 % (cíl plánu 85 až 90 %). Kde model chart nezopakuje ani bez typu, hodnotí
 *    se jen podle chartu.
 * 2. **Chart váží víc než typ** (`CHART_WEIGHT`). Mezi rukama je model příliš plochý,
 *    protože nezná hratelnost po flopu, a bez téhle váhy by malá změna přepnula skoro
 *    všechno: proti kameni 97 % rukou na 3-bet.
 * 3. **Pojistka šířky** (`MAX_WIDTH_SHIFT`). Range proti typu nesmí být o víc než
 *    tenhle násobek širší ani užší než v chartu. Bezpečná exploitace z plánu: hráč se
 *    má naučit odchylku, ne hrát proti karikatuře.
 * 4. **Proti tomu, kdo skládá míň než chart, se neblafuje.** Přezvednout navíc smí jen
 *    ruka, kterou chart hraje a která se vyplatí dorovnat; co chart skládá, smí nejvýš
 *    dorovnat.
 *
 * Výsledek je proto směr, ne číslo v BB: říká, jak hrát, a neukazuje EV, které by
 * tvrdilo přesnost, kterou nemá. Konstanty jsou odhad z měření na 40 a 50 BB
 * (`npm run mtt:real-pricing`) a doladí se čtením spotů (plán, 4.6).
 */

/** Podíl equity, který hráč zrealizuje v pozici a mimo ni; přesnost tu nese kotva. */
const REALIZATION = { inPosition: 0.85, outOfPosition: 0.7 };

/**
 * O kolik víc equity hráč proti typu zrealizuje díky jeho chybám po flopu. Bez toho
 * model radil proti velrybě otevírat užší, protože vidí jen to, že skládá míň, a plán
 * říká opak: izolovat široce.
 */
const POSTFLOP_EDGE: Readonly<Record<VillainArchetype, number>> = {
  SHARK: 1,
  EAGLE: 1.03,
  ROCK: 1.05,
  DICE: 1.1,
  WHALE: 1.2,
};

/** Kolikrát váží rozdíl mezi rukama z kotvy víc než změna podle typu. */
const CHART_WEIGHT = 4;

/** O kolik smí být range proti typu širší nebo užší než v chartu. */
const MAX_WIDTH_SHIFT = 1.3;

/** Co hráč s rukou udělá: zvýší (open, 3-bet, 4-bet), dorovná, nebo složí. */
type Decision = "RAISE" | "CALL" | "FOLD";

/** Hodnota akcí proti foldu v BB, bez kotvy. */
interface Values {
  raise: number;
  call?: number;
}

type SeatTypes = Partial<Record<Position, VillainArchetype>>;

const HANDS = ALL_HAND_CLASSES as readonly HandLabel[];
const POSTFLOP_ORDER: readonly Position[] = ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"];

function posted(seat: Position): number {
  return seat === "SB" ? 0.5 : seat === "BB" ? 1 : 0;
}

function realization(hero: Position, other: Position, type: VillainArchetype | undefined): number {
  const base = POSTFLOP_ORDER.indexOf(hero) > POSTFLOP_ORDER.indexOf(other)
    ? REALIZATION.inPosition
    : REALIZATION.outOfPosition;
  return base * (type === undefined ? 1 : POSTFLOP_EDGE[type]);
}

function widths(type: VillainArchetype | undefined): { callWidth: number; raiseWidth: number } {
  return type === undefined ? { callWidth: 1, raiseWidth: 1 } : preflopVillainModel(type);
}

/** Přezvednutý hráč buď složí, nebo jde všechno; dorovnat bez pozice se nevyplácí. */
function whenReraised(hand: HandLabel, raisers: readonly HandLabel[], invested: number, pot: number, stack: number, heroPosted: number): number {
  const equity = equityVsRange(hand, raisers);
  if (equity === undefined) return -invested;
  return Math.max(-invested, equity * (pot + 2 * stack) - (stack - heroPosted));
}

interface CellWhy {
  foldFrequency?: RealVersusGto;
  foldAgainst?: "3BET" | "4BET";
  raiseShare?: RealVersusGto;
  raiseKind?: "OPEN" | "3BET";
}

/** Buňka modelu: co říká chart a co model o akcích hráče. */
interface Cell {
  key: string;
  hasCall: boolean;
  chart(hand: HandLabel): Decision | null;
  values(hand: HandLabel, types: SeatTypes): Values;
  /** Jak často všechno složí na akci hráče. */
  foldShare(types: SeatTypes): number;
  /** Klíč akce hráče pro každé rozhodnutí. */
  actionKey: Readonly<Record<Decision, ActionKey | undefined>>;
  /** Smí proti těmto typům přezvednout i ruka, kterou chart nepřezvedá? */
  addsRaises(types: SeatTypes): boolean;
  why(types: SeatTypes): CellWhy;
}

interface Lookups {
  ante: AnteMode;
  bucket: StackBucket;
  store: RangeStore;
  classes(position: Position, context: ActionContext, vsSeat: Position | undefined, match: (key: string) => boolean): HandLabel[];
}

function lookups(store: RangeStore, ante: AnteMode, bucket: StackBucket): Lookups {
  return {
    ante,
    bucket,
    store,
    classes(position, context, vsSeat, match) {
      const entry = store.lookup({ ante, position, bucket, context, ...(vsSeat === undefined ? {} : { vsSeat }) });
      if (entry === undefined) return [];
      return Object.entries(entry.strict)
        .filter(([, keys]) => keys.some(match))
        .map(([hand]) => hand as HandLabel);
    },
  };
}

function chartDecision(
  keys: readonly ActionKey[] | undefined,
  isRaise: (key: string) => boolean,
): Decision | null {
  if (keys === undefined || keys.length === 0) return "FOLD";
  // Shove rozhoduje all-in výpočet (`preflopEv.ts`), tenhle model ho nezná.
  if (keys.includes("JAM" as ActionKey) || keys.includes("CALL_JAM" as ActionKey)) return null;
  if (keys.some(isRaise)) return "RAISE";
  if (keys.includes("CALL" as ActionKey)) return "CALL";
  if (keys.every((key) => key === "FOLD")) return "FOLD";
  return null;
}

/** Otevření: složí všichni za hráčem, nebo první, kdo pokračuje. */
function openCell(spot: Spot, store: RangeStore, order: readonly Position[]): Cell | undefined {
  const { heroPos: hero, effStack: bucket, ante } = spot;
  const size = openSizeAtDepth(bucket, ante, store);
  const openKey = spot.answers.find((answer) => answer.key.startsWith("OPEN"))?.key;
  if (size === undefined || openKey === undefined) return undefined;
  const data = lookups(store, ante, bucket);
  const pot = spot.startingPot ?? (ante === "ON" ? 2.5 : 1.5);
  const heroIn = size - posted(hero);
  const behind = order.slice(order.indexOf(hero) + 1);
  const ranges = new Map(behind.map((seat) => [seat, {
    call: data.classes(seat, "VS_OPEN", hero, (key) => key === "CALL"),
    raise: data.classes(seat, "VS_OPEN", hero, (key) => key === "3BET" || key === "JAM" || key === "SQUEEZE"),
  }]));
  const typed = (seat: Position, types: SeatTypes) => {
    const model = widths(types[seat]);
    const range = ranges.get(seat)!;
    return {
      call: resizedRange(range.call, model.callWidth),
      raise: resizedRange(range.raise, model.raiseWidth),
    };
  };
  const foldShare = (types: SeatTypes): number => behind.reduce((share, seat) => {
    const { call, raise } = typed(seat, types);
    return share * Math.max(0, 1 - (comboCount(call) + comboCount(raise)) / TOTAL_COMBOS);
  }, 1);
  const entry = store.lookup({ ante, position: hero, bucket, context: "RFI" });
  return {
    key: `RFI|${hero}|${bucket}|${ante}`,
    hasCall: false,
    chart: (hand) => chartDecision(entry?.strict[hand], (key) => key.startsWith("OPEN")),
    values(hand, types) {
      let reached = 1;
      let ev = 0;
      for (const seat of behind) {
        const { call, raise } = typed(seat, types);
        const callShare = comboCount(call) / TOTAL_COMBOS;
        const raiseShare = comboCount(raise) / TOTAL_COMBOS;
        if (callShare > 0) {
          const realized = realization(hero, seat, types[seat]) * (equityVsRange(hand, call) ?? 0);
          ev += reached * callShare * (realized * (pot + heroIn + (size - posted(seat))) - heroIn);
        }
        if (raiseShare > 0) ev += reached * raiseShare * whenReraised(hand, raise, heroIn, pot, bucket, posted(hero));
        reached *= Math.max(0, 1 - callShare - raiseShare);
      }
      return { raise: ev + reached * pot };
    },
    foldShare,
    actionKey: { RAISE: openKey, CALL: undefined, FOLD: "FOLD" as ActionKey },
    addsRaises: () => true,
    why: (types) => ({ foldFrequency: { real: foldShare(types), gto: foldShare({}) } }),
  };
}

/**
 * Hráč čelí zvýšení: dorovnat, přezvednout, nebo složit. Tentýž tvar pro obranu proti
 * otevření (3-bet) i proti 3-betu (4-bet), liší se ceny a odkud jsou range soupeře.
 */
function facingRaiseCell(
  spot: Spot,
  store: RangeStore,
  villain: Position,
  shape: {
    context: "VS_OPEN" | "VS_3BET";
    raiseKey: ActionKey;
    /** Co už hráč vložil před rozhodnutím. */
    heroIn: number;
    /** Na kolik zvýšil soupeř a kolik tím sám vložil do potu. */
    facing: number;
    /** Na kolik zvýší hráč. */
    raiseTo: number;
    pot: number;
    villainRange: readonly HandLabel[];
    flat: readonly HandLabel[];
    reraise: readonly HandLabel[];
    foldAgainst: "3BET" | "4BET";
    raiseKind: "OPEN" | "3BET";
  },
): Cell | undefined {
  const { heroPos: hero, effStack: bucket, ante } = spot;
  const hasKey = spot.answers.some((answer) => answer.key === shape.raiseKey);
  const rangeCombos = comboCount(shape.villainRange);
  if (!hasKey || rangeCombos === 0) return undefined;
  const entry = store.lookup({
    ante, position: hero, bucket, context: shape.context, ...(villain === undefined ? {} : { vsSeat: villain }),
  });
  const typeOf = (types: SeatTypes) => types[villain];
  const shares = (types: SeatTypes) => {
    const model = widths(typeOf(types));
    const flat = Math.min(1, (comboCount(shape.flat) / rangeCombos) * model.callWidth);
    const reraise = Math.min(1 - flat, (comboCount(shape.reraise) / rangeCombos) * model.raiseWidth);
    return { flat, reraise, fold: Math.max(0, 1 - flat - reraise) };
  };
  const toCall = shape.facing - shape.heroIn - posted(hero);
  const raiseIn = shape.raiseTo - posted(hero);
  const startingPot = spot.startingPot ?? (ante === "ON" ? 2.5 : 1.5);
  return {
    key: `${shape.context}|${hero}|${bucket}|${ante}|${villain}`,
    hasCall: true,
    chart: (hand) => chartDecision(entry?.strict[hand], (key) => key === shape.raiseKey),
    values(hand, types) {
      const type = typeOf(types);
      const model = widths(type);
      const range = resizedRange(shape.villainRange, model.raiseWidth);
      const realize = realization(hero, villain, type);
      const call = realize * (equityVsRange(hand, range) ?? 0) * (shape.pot + toCall) - toCall;
      const share = shares(types);
      let raise = share.fold * shape.pot;
      if (share.flat > 0) {
        const potCalled = shape.pot + (raiseIn - shape.heroIn) + (shape.raiseTo - shape.facing);
        raise += share.flat * (realize * (equityVsRange(hand, shape.flat) ?? 0) * potCalled - (raiseIn - shape.heroIn));
      }
      if (share.reraise > 0) {
        raise += share.reraise * whenReraised(hand, shape.reraise, raiseIn - shape.heroIn, startingPot, bucket, posted(hero) + shape.heroIn);
      }
      return { raise, call };
    },
    foldShare: (types) => shares(types).fold,
    actionKey: { RAISE: shape.raiseKey, CALL: "CALL" as ActionKey, FOLD: "FOLD" as ActionKey },
    // Kdo 3-betuje úžeji než chart, tomu se 4-bet nepřidává, ani když model říká, že
    // skládá víc. Měřeno 5. 11. 2026: chtěl proti 3-betu kamene 4-betovat TT na 125 BB,
    // a jeho range je přitom ta nejsilnější u stolu. Podíl foldu je tu odvozený ze šířky
    // charty a sílu užší range nezná. Open proti tomu kámen opravdu skládá často, proto
    // pravidlo platí jen pro 4-bet.
    addsRaises: (types) => shape.context !== "VS_3BET" || widths(typeOf(types)).raiseWidth > 1,
    why(types) {
      const width = (seatTypes: SeatTypes) => comboCount(
        resizedRange(shape.villainRange, widths(typeOf(seatTypes)).raiseWidth),
      ) / TOTAL_COMBOS;
      return {
        foldFrequency: { real: shares(types).fold, gto: shares({}).fold },
        foldAgainst: shape.foldAgainst,
        raiseShare: { real: width(types), gto: width({}) },
        raiseKind: shape.raiseKind,
      };
    },
  };
}

function vsOpenCell(spot: Spot, store: RangeStore, villain: Position): Cell | undefined {
  const { heroPos: hero, effStack: bucket, ante } = spot;
  const open = openSizeAtDepth(bucket, ante, store);
  if (open === undefined) return undefined;
  const data = lookups(store, ante, bucket);
  const pot = (spot.startingPot ?? (ante === "ON" ? 2.5 : 1.5)) + open;
  return facingRaiseCell(spot, store, villain, {
    context: "VS_OPEN",
    raiseKey: "3BET" as ActionKey,
    heroIn: 0,
    facing: open,
    raiseTo: preflopRaiseSizes(hero, bucket, open).threeBetBB,
    pot,
    villainRange: data.classes(villain, "RFI", undefined, (key) => key.startsWith("OPEN")),
    flat: data.classes(villain, "VS_3BET", hero, (key) => key === "CALL"),
    reraise: data.classes(villain, "VS_3BET", hero, (key) => key === "4BET" || key === "JAM"),
    foldAgainst: "3BET",
    raiseKind: "OPEN",
  });
}

function vs3BetCell(spot: Spot, store: RangeStore, villain: Position): Cell | undefined {
  const { heroPos: hero, effStack: bucket, ante } = spot;
  const open = openSizeAtDepth(bucket, ante, store);
  if (open === undefined) return undefined;
  const data = lookups(store, ante, bucket);
  const { threeBetBB, fourBetBB } = preflopRaiseSizes(villain, bucket, open);
  const heroIn = open - posted(hero);
  const pot = (spot.startingPot ?? (ante === "ON" ? 2.5 : 1.5)) + heroIn + (threeBetBB - posted(villain));
  return facingRaiseCell(spot, store, villain, {
    context: "VS_3BET",
    raiseKey: "4BET" as ActionKey,
    heroIn,
    facing: threeBetBB,
    raiseTo: fourBetBB,
    pot,
    villainRange: data.classes(villain, "VS_OPEN", hero, (key) => key === "3BET"),
    flat: data.classes(villain, "VS_4BET", undefined, (key) => key === "CALL"),
    reraise: data.classes(villain, "VS_4BET", undefined, (key) => key === "JAM"),
    foldAgainst: "4BET",
    raiseKind: "3BET",
  });
}

function buildCell(spot: Spot, table: TablePlayers, store: RangeStore, order: readonly Position[]): Cell | undefined {
  switch (spot.context) {
    case "RFI":
      return openCell(spot, store, order);
    case "VS_OPEN": {
      const villain = spot.tableState.vsSeat ?? REJAM_EV_OPENER_BY_HERO[spot.heroPos];
      return villain === undefined ? undefined : vsOpenCell(spot, store, villain);
    }
    case "VS_3BET": {
      const villain = spot.tableState.vsSeat ?? table.focusSeat;
      return villain === undefined ? undefined : vs3BetCell(spot, store, villain);
    }
    default:
      return undefined;
  }
}

function quantiles(values: readonly number[], count: number): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  return Array.from({ length: count + 1 }, (_, index) => (
    sorted[Math.min(sorted.length - 1, Math.floor((index / count) * sorted.length))]
  ));
}

function decide(raise: number, call: number | undefined): Decision {
  const callValue = call ?? Number.NEGATIVE_INFINITY;
  if (raise > 0 && raise > callValue) return "RAISE";
  return callValue > 0 ? "CALL" : "FOLD";
}

interface Calibration {
  base: Map<HandLabel, Values>;
  raiseOffset: number;
  callOffset: number;
  agreement: number;
}

/** Kotva buňky: posuny, se kterými model nejlépe zopakuje chart. */
function calibrate(cell: Cell): Calibration {
  const known = HANDS.filter((hand) => cell.chart(hand) !== null);
  const base = new Map(HANDS.map((hand) => [hand, cell.values(hand, {})]));
  const raises = quantiles(known.map((hand) => base.get(hand)!.raise), cell.hasCall ? 24 : 60);
  const calls = cell.hasCall ? quantiles(known.map((hand) => base.get(hand)!.call ?? 0), 24) : [0];
  let best = { agreed: -1, raiseOffset: 0, callOffset: 0 };
  for (const raiseOffset of raises) {
    for (const callOffset of calls) {
      let agreed = 0;
      for (const hand of known) {
        const value = base.get(hand)!;
        const call = value.call === undefined ? undefined : value.call - callOffset;
        if (decide(value.raise - raiseOffset, call) === cell.chart(hand)) agreed += 1;
      }
      if (agreed > best.agreed) best = { agreed, raiseOffset, callOffset };
    }
  }
  return {
    base,
    raiseOffset: best.raiseOffset,
    callOffset: best.callOffset,
    agreement: known.length === 0 ? 0 : best.agreed / known.length,
  };
}

const calibrations = new WeakMap<RangeStore, Map<string, Calibration>>();

function calibrationFor(cell: Cell, store: RangeStore): Calibration {
  const forStore = calibrations.get(store) ?? new Map<string, Calibration>();
  calibrations.set(store, forStore);
  const cached = forStore.get(cell.key);
  if (cached !== undefined) return cached;
  const fresh = calibrate(cell);
  forStore.set(cell.key, fresh);
  return fresh;
}

/** Range po přesunu: přidává se a ubírá podle skóre, ale jen do pojistky šířky. */
function withinWidth(
  chart: readonly HandLabel[],
  proposed: readonly HandLabel[],
  score: (hand: HandLabel) => number,
): Set<HandLabel> {
  const chartCombos = comboCount(chart);
  const upper = chartCombos * MAX_WIDTH_SHIFT;
  const lower = chartCombos / MAX_WIDTH_SHIFT;
  const inChart = new Set(chart);
  const inProposed = new Set(proposed);
  const result = new Set(chart);
  let combos = chartCombos;
  for (const hand of proposed.filter((item) => !inChart.has(item)).sort((left, right) => score(right) - score(left))) {
    if (combos + combosInClass(hand) > upper) break;
    result.add(hand);
    combos += combosInClass(hand);
  }
  for (const hand of chart.filter((item) => !inProposed.has(item)).sort((left, right) => score(left) - score(right))) {
    if (combos - combosInClass(hand) < lower) break;
    result.delete(hand);
    combos -= combosInClass(hand);
  }
  return result;
}

/** Rozhodnutí hráče pro všechny ruce buňky proti daným typům. */
function exploitPlan(cell: Cell, calibration: Calibration, types: SeatTypes): Map<HandLabel, Decision> {
  const foldsMore = cell.foldShare(types) > cell.foldShare({});
  const scores = new Map<HandLabel, { raise: number; call: number }>();
  const proposed = new Map<HandLabel, Decision>();
  for (const hand of HANDS) {
    const chart = cell.chart(hand);
    if (chart === null) continue;
    const base = calibration.base.get(hand)!;
    const anchoredRaise = base.raise - calibration.raiseOffset;
    const anchoredCall = base.call === undefined ? undefined : base.call - calibration.callOffset;
    const real = cell.values(hand, types);
    const raise = CHART_WEIGHT * anchoredRaise + (real.raise - base.raise);
    const call = anchoredCall === undefined || real.call === undefined || base.call === undefined
      ? undefined
      : CHART_WEIGHT * anchoredCall + (real.call - base.call);
    scores.set(hand, { raise, call: call ?? Number.NEGATIVE_INFINITY });
    // Co model nezopakuje ani bez typu, o tom proti typu nic netvrdí.
    if (decide(anchoredRaise, anchoredCall) !== chart) {
      proposed.set(hand, chart);
      continue;
    }
    let decision = decide(raise, call);
    if (decision === "RAISE" && cell.hasCall && !foldsMore && chart !== "RAISE") {
      // Měřeno 5. 11. 2026: model chtěl proti velrybě 3-betovat J5o z big blindu, protože
      // je mezi rukama plochý. Přitvrdit na hodnotu smí jen ruka, kterou chart hraje.
      const canCall = call !== undefined && call > 0;
      decision = !canCall ? "FOLD" : chart === "CALL" ? "RAISE" : "CALL";
    }
    if (decision === "RAISE" && chart !== "RAISE" && !cell.addsRaises(types)) {
      decision = chart === "CALL" && call !== undefined && call > 0 ? "CALL" : "FOLD";
    }
    proposed.set(hand, decision);
  }

  const inDecision = (source: (hand: HandLabel) => Decision | null | undefined, decision: Decision) => (
    HANDS.filter((hand) => source(hand) === decision)
  );
  const raises = withinWidth(
    inDecision((hand) => cell.chart(hand), "RAISE"),
    inDecision((hand) => proposed.get(hand), "RAISE"),
    (hand) => scores.get(hand)?.raise ?? 0,
  );
  const calls = withinWidth(
    inDecision((hand) => cell.chart(hand), "CALL").filter((hand) => !raises.has(hand)),
    inDecision((hand) => proposed.get(hand), "CALL").filter((hand) => !raises.has(hand)),
    (hand) => scores.get(hand)?.call ?? 0,
  );
  const plan = new Map<HandLabel, Decision>();
  for (const hand of HANDS) {
    if (cell.chart(hand) === null) continue;
    plan.set(hand, raises.has(hand) ? "RAISE" : calls.has(hand) ? "CALL" : "FOLD");
  }
  return plan;
}

export interface OneStepOutcome extends CellWhy {
  /** Akce hráče proti soupeřům u stolu. */
  action: ActionKey;
  /** Akce podle chartu. */
  gtoAction: ActionKey;
}

/** Typy na sedadlech, jak je hráč vidí u stolu. */
function seatTypes(table: TablePlayers): SeatTypes {
  return { ...table.cast };
}

export function oneStepPricing(
  spot: Spot,
  table: TablePlayers,
  store: RangeStore,
  order: readonly Position[] = POSITION_ORDER,
): OneStepOutcome | undefined {
  const cell = buildCell(spot, table, store, order);
  if (cell === undefined) return undefined;
  const chart = cell.chart(spot.hand);
  if (chart === null) return undefined;

  const calibration = calibrationFor(cell, store);
  const base = calibration.base.get(spot.hand)!;
  const anchoredCall = base.call === undefined ? undefined : base.call - calibration.callOffset;
  if (decide(base.raise - calibration.raiseOffset, anchoredCall) !== chart) return undefined;

  const types = seatTypes(table);
  const decision = exploitPlan(cell, calibration, types).get(spot.hand) ?? chart;
  const action = cell.actionKey[decision];
  const gtoAction = cell.actionKey[chart];
  if (action === undefined || gtoAction === undefined) return undefined;
  return { action, gtoAction, ...cell.why(types) };
}

/** Měření: jak dobře model bez typu opakuje chart, po kontextech. */
export function oneStepAgreement(
  spot: Spot,
  table: TablePlayers,
  store: RangeStore,
  order: readonly Position[] = POSITION_ORDER,
): number | undefined {
  const cell = buildCell(spot, table, store, order);
  return cell === undefined ? undefined : calibrationFor(cell, store).agreement;
}
