import { bestActionsForActionEv, type ActionEvSet } from "../actionEv";
import { deriveSeats } from "../tableSeats";
import { POSITION_ORDER, type ActionKey, type Position, type Spot } from "../types";
import { preflopTablePlayers, type PlayerSettings, type TablePlayers } from "../villain/tableCast";
import { oneStepPricing } from "./oneStepModel";
import { agreesWithChart, priceActions, type PreflopPricingPlayers, type PricedActions } from "./preflopEv";
import type { RangeStore } from "../../data/rangeStore";

/**
 * Spot v režimu REAL: EV proti hráčům, kteří u stolu opravdu sedí
 * (Agents/plan-gto-real-2026-11.md, 4.4 a 4.5).
 *
 * Je to vrstva nad rozdaným spotem, ne část rozdávání. Relace při startu rozdá až
 * 20 000 spotů do zásoby, takže počítat typy hráčů tam by zdržovalo každý start kvůli
 * spotům, které hráč nikdy neuvidí, a tatáž zásoba by se nedala číst jako GTO. Ocení
 * se jen spot, který se právě ukazuje; v GTO se vrací beze změny.
 *
 * Hodnotí se proti typu, GTO odpověď zůstává vedle (`Spot.real`): hráč se má naučit,
 * kdy a o kolik se od rovnováhy odchýlit, ne hrát proti karikatuře. Prahy se nemění,
 * takže GTO akce, která proti typu skoro nic neztrácí, zůstává přijatelná (4.5).
 */

/** Kdo může na tomhle spotu dorovnat shove hráče, v pořadí, jak jednají. */
function callerSeats(spot: Pick<Spot, "context" | "heroPos" | "tableState">, order: readonly Position[]): Position[] {
  if (spot.context === "BVB") return [spot.heroPos === "SB" ? "BB" : "SB"];
  if (spot.context === "SQUEEZE") {
    return deriveSeats(spot, order)
      .filter((seat) => !seat.isHero && seat.badge !== null)
      .map((seat) => seat.position);
  }
  return order.slice(order.indexOf(spot.heroPos) + 1);
}

export function pricingPlayers(
  spot: Pick<Spot, "context" | "heroPos" | "tableState">,
  table: TablePlayers,
  order: readonly Position[] = POSITION_ORDER,
): PreflopPricingPlayers {
  const villain = table.focusSeat === undefined ? undefined : table.cast[table.focusSeat];
  return {
    ...(villain === undefined ? {} : { villain }),
    callers: callerSeats(spot, order).map((seat) => table.cast[seat]),
  };
}

/**
 * EV z packu (solver) posunutá o rozdíl, který spočítal model hráče. Solver na
 * rovnováze zůstává kotvou; model říká jen, co se proti typu změní.
 */
function shiftedByModel(
  base: ActionEvSet<ActionKey>,
  gto: ActionEvSet<ActionKey>,
  real: ActionEvSet<ActionKey>,
): ActionEvSet<ActionKey> | undefined {
  const values = [];
  for (const item of base.values) {
    const before = gto.values.find((value) => value.action === item.action);
    const after = real.values.find((value) => value.action === item.action);
    if (before === undefined || after === undefined) return undefined;
    values.push({ ...item, evBb: Math.round((item.evBb + after.evBb - before.evBb) * 100) / 100 });
  }
  return { ...base, values };
}

function pair(real: number | undefined, gto: number | undefined): { real: number; gto: number } | undefined {
  return real === undefined || gto === undefined ? undefined : { real, gto };
}

/** All-in spot proti stolu: přesné EV z equity; bez ceny, nebo proti chartu nic. */
function allInPricing(spot: Spot, players: PreflopPricingPlayers, store: RangeStore): Spot | undefined {
  const price = (against?: PreflopPricingPlayers): PricedActions | undefined => priceActions(
    spot.context,
    spot.heroPos,
    spot.hand,
    spot.effStack,
    spot.ante,
    spot.startingPot ?? (spot.ante === "ON" ? 2.5 : 1.5),
    spot.answers.map((answer) => answer.key),
    store,
    against,
    spot.tableState.callsBefore,
    spot.tableState.vsSeat,
  );
  const gto = price();
  const real = price(players);
  if (gto === undefined || real === undefined) return undefined;
  const base = spot.actionEvs;
  // Kalibrace (plán, 4.4): co model neumí zopakovat v GTO, to proti typu netvrdí. Nad
  // rovnováhou se z modelu bere jen rozdíl proti typu, kotvou je rovnováha, ne chart.
  if (base?.source !== "NASH_PUSH_FOLD" && !agreesWithChart(gto.evs, spot.strictCorrect)) return undefined;

  const evs = base === undefined || base.source === "ALL_IN_EQUITY"
    ? real.evs
    : shiftedByModel(base, gto.evs, real.evs);
  if (evs === undefined) return undefined;

  const foldFrequency = pair(real.foldFrequency, gto.foldFrequency);
  const shoveShare = pair(real.shoveShare, gto.shoveShare);
  return {
    ...spot,
    actionEvs: { ...evs, source: "VILLAIN_MODEL" },
    real: {
      ...(players.villain === undefined ? {} : { villain: players.villain }),
      gtoActions: bestActionsForActionEv(base ?? gto.evs),
      gtoEvs: base ?? gto.evs,
      ...(foldFrequency === undefined ? {} : { foldFrequency }),
      ...(shoveShare === undefined ? {} : { shoveShare }),
    },
  };
}

/**
 * Open, 3-bet a call proti stolu: směr bez čísla (`oneStepModel.ts`). Známkuje se
 * podle sad odpovědí: přísně platí odchylka, mírně je přijatelná i GTO akce, protože
 * model neřekne, o kolik je lepší (plán, 4.5).
 */
function oneStepSpot(
  spot: Spot,
  table: TablePlayers,
  players: PreflopPricingPlayers,
  store: RangeStore,
  order: readonly Position[],
): { spot: Spot; moved: boolean } | undefined {
  const outcome = oneStepPricing(spot, table, store, order);
  if (outcome === undefined) return undefined;
  const { action, gtoAction, foldFrequency, foldAgainst, raiseShare, raiseKind } = outcome;
  const moved = action !== gtoAction;
  const { actionEvs: _dropped, ...withoutEv } = spot;
  return {
    moved,
    spot: {
      ...withoutEv,
      strictCorrect: moved ? [action] : spot.strictCorrect,
      correctKeys: moved ? [...new Set([action, ...spot.correctKeys])] : spot.correctKeys,
      real: {
        ...(players.villain === undefined ? {} : { villain: players.villain }),
        gtoActions: [gtoAction],
        ...(foldFrequency === undefined ? {} : { foldFrequency }),
        ...(foldAgainst === undefined ? {} : { foldAgainst }),
        ...(raiseShare === undefined ? {} : { raiseShare }),
        ...(raiseKind === undefined ? {} : { raiseKind }),
      },
    },
  };
}

function sameActions(left: readonly ActionKey[], right: readonly ActionKey[]): boolean {
  return left.length === right.length && left.every((key) => right.includes(key));
}

export function withRealPricing(
  spot: Spot,
  settings: PlayerSettings,
  store: RangeStore,
  order: readonly Position[] = POSITION_ORDER,
): Spot {
  // Scénář s ICM se neoceňuje vůbec (rozhodnutí 5b), v REAL ani v GTO.
  if (settings.mode !== "REAL" || spot.tableState.stackSetupId !== undefined) return spot;

  const table = preflopTablePlayers(spot, settings, order);
  const players = pricingPlayers(spot, table, order);
  const allIn = allInPricing(spot, players, store);
  // Když all-in výpočet odpověď změní, má přednost: má číslo, jednokrokový model jen směr.
  if (allIn?.actionEvs !== undefined && allIn.real !== undefined
    && !sameActions(bestActionsForActionEv(allIn.actionEvs), allIn.real.gtoActions)) {
    return allIn;
  }
  const oneStep = oneStepSpot(spot, table, players, store, order);
  if (oneStep !== undefined && (oneStep.moved || allIn === undefined)) return oneStep.spot;
  return allIn ?? spot;
}
