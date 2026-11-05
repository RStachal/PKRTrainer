/**
 * Akční strom — stavové stráže Požadavku 3.
 *
 * Tento modul obsahuje jedinou čistou (a totální) funkci `offeredActions`,
 * která pro daný `TableState` vrací množinu nabízených druhů akcí
 * (`ActionKind`) bez ohledu na konkrétní ranges. Mapování na konkrétní
 * Akční_klíče vč. sizingu (`ActionKey`) řeší až Range_Store / Drill_Engine.
 *
 * Logika přesně realizuje stavové stráže akceptačních kritérií 3.1–3.13:
 *
 *  - 3.10 vs-all-in (facing = ALLIN): výhradně {CALL_JAM, FOLD} — má přednost
 *    před vším ostatním, nezávisle na režimu Push/Fold.
 *  - 3.9  Push/Fold (pushFold = true, facing ≠ ALLIN): výhradně {JAM, FOLD}.
 *  - 3.1  RFI/Open (not pushFold, facing = NONE, 0 limpů, hero ≠ BB): OPEN.
 *  - 3.2  open-limp (tytéž podmínky jako 3.1): LIMP.
 *  - 3.3  BB vs limp(s) (hero = BB, not pushFold, 1–8 limpů, žádné navýšení):
 *    {LIMP (check), ISO}.
 *  - 3.4  Iso-raise (not pushFold, facing = NONE, 1–8 limpů): ISO.
 *  - 3.13 Over-limp (not pushFold, facing = NONE, 1–8 limpů, hero ≠ BB): OVERLIMP.
 *  - 3.5  vs-open (not pushFold, facing = OPEN): {FOLD, CALL, 3BET}.
 *  - 3.6  Squeeze (not pushFold, facing = OPEN, 1–7 callů): navíc SQUEEZE.
 *  - 3.7  vs-3bet (not pushFold, facing = 3BET): {FOLD, CALL, 4BET}.
 *  - 3.8  vs-4bet (not pushFold, facing = 4BET): {FOLD, CALL, JAM}.
 *  - 3.11 Blind-vs-blind: žádné speciální větvení — pro hrdinu na SB/BB platí
 *    tytéž stráže výše podle stavu stolu.
 *
 * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.13_
 */

import {
  LIMP_SHOVE_MAX,
  OPEN_SHOVE_MAX,
  OPEN_SHOVE_TAUGHT_MAX,
  RE_JAM_MAX,
  RE_JAM_SHEET_MAX,
  type ActionKind,
  type FacingAction,
  type TableState,
} from "./types";

/** Dolní hranice (včetně) počtu limperů, kdy je v hře iso/over-limp/BB check (Req 3.3, 3.4, 3.13). */
const MIN_LIMPS = 1;
/** Horní hranice (včetně) počtu limperů dle Req 3.3/3.4/3.13 ("jeden až osm Limpů"). */
const MAX_LIMPS = 8;
/** Dolní hranice (včetně) počtu callerů, kdy se nabízí Squeeze (Req 3.6: "jeden až sedm Callů"). */
const MIN_SQUEEZE_CALLS = 1;
/** Horní hranice (včetně) počtu callerů dle Req 3.6. */
const MAX_SQUEEZE_CALLS = 7;

/**
 * Vrátí nabízené druhy akcí (`ActionKind`) pro daný stav stolu.
 *
 * Čistá a totální funkce: pro každý platný `TableState` vrací neprázdné pole
 * navzájem různých `ActionKind`. Pořadí prvků je deterministické (akce nejprve,
 * FOLD typicky poslední), na množinové sémantice ale nezávisí.
 *
 * @param state Stav stolu před rozhodnutím hrdiny.
 * @returns Pole nabízených druhů akcí bez duplicit.
 */
/**
 * Kreslí range spotu aspoň jednu ruku jako shove? Rozhoduje o nabídce jamu
 * nad listy vlastníka (`TableState.jamTaught`); bydlí tady, protože to čte
 * drill i přehrání historie a strom je jediné místo bez závislostí.
 */
export function rangeTeachesJam(
  entry: { strict: Record<string, readonly string[]> } | undefined,
): boolean {
  if (entry === undefined) return false;
  return Object.values(entry.strict).some((keys) => keys.includes("JAM"));
}

export function offeredActions(state: TableState): ActionKind[] {
  const { facing, pushFold, heroPos, limpsBefore, callsBefore } = state;

  // Req 3.10 — vs-all-in má absolutní přednost (i v režimu Push/Fold).
  if (facing === "ALLIN") {
    return ["CALL_JAM", "FOLD"];
  }

  // Req 3.9 — Push/Fold (a hrdina nečelí all-inu): výhradně Jam / Fold.
  if (pushFold) {
    return ["JAM", "FOLD"];
  }

  const heroIsBB = heroPos === "BB";

  switch (facing) {
    case "NONE":
      return offeredWhenUnopened(heroIsBB, limpsBefore, state.effectiveStackBB, state.jamTaught === true);

    case "OPEN": {
      // Req 3.5 — vs-open: Fold / Call / 3bet.
      const actions: ActionKind[] = ["FOLD", "CALL", "3BET"];
      // Req 3.6 — Squeeze, je-li v potu 1–7 callerů.
      if (callsBefore >= MIN_SQUEEZE_CALLS && callsBefore <= MAX_SQUEEZE_CALLS) {
        actions.push("SQUEEZE");
      }
      // Req 3.5 — a shove, while the stack is short enough for one. Between 12
      // and 30BB the owner's charts make re-jamming the main answer to an open,
      // and the ranges now say so; without offering it here the recommendation
      // would not be among the options a player can pick. Listed last, as the
      // action that ends the hand. Above the sheets (31-40BB) only where the
      // range this spot teaches draws a shove - RYE does at 40BB for the big
      // blind against the button (decision 8a, 2026-09-22).
      if (
        state.effectiveStackBB <= RE_JAM_SHEET_MAX
        || (state.effectiveStackBB <= RE_JAM_MAX && state.jamTaught === true)
      ) actions.push("JAM");
      return actions;
    }

    case "3BET": {
      // Req 3.7 — vs-3bet: Fold / Call / 4bet.
      const actions: ActionKind[] = ["FOLD", "CALL", "4BET"];
      // A shove, where the range this spot teaches draws one (decision 1a,
      // 2026-09-22). Same construction as facing an open: the button appears
      // only where the grid itself shows a jam, never as a depth rule of our
      // own. It matters most in the ICM spots the owner approved, where the
      // 3-bettor is often shorter than the hero - UTG with 50BB against a
      // small blind holding 9BB is playing for 9, and "4bet" there is a shove
      // in everything but name. Measured before the change: of 822 VS_3BET
      // records in the registry, zero drew a jam, so nothing that ships today
      // gains a button; the nine ICM grids that teach one stop being refused.
      if (state.jamTaught === true) actions.push("JAM");
      return actions;
    }

    case "4BET":
      // Req 3.8 — vs-4bet: Fold / Call / Jam.
      return ["FOLD", "CALL", "JAM"];

    default:
      return assertNeverFacing(facing);
  }
}

/**
 * Nabídka akcí, když před hrdinou neproběhlo žádné navýšení ani all-in
 * (facing = NONE) a hrdina není v režimu Push/Fold.
 *
 * @param heroIsBB Je hrdina na pozici BB?
 * @param limpsBefore Počet limperů před hrdinou (0..8).
 */
function offeredWhenUnopened(
  heroIsBB: boolean,
  limpsBefore: number,
  effectiveStackBB: number,
  jamTaught: boolean,
): ActionKind[] {
  const hasLimps = limpsBefore >= MIN_LIMPS && limpsBefore <= MAX_LIMPS;

  if (hasLimps) {
    if (heroIsBB) {
      // Req 3.3 — BB čelící limpu(ům): Limp (check) a Iso-raise.
      // BB již vložil big blind, může zdarma dorovnat (check) → fold se nenabízí.
      // Req 3.3 — plus a shove while the stack is short enough. The chart shoves
      // 20.5 percent over a limp at 15-20BB and 9.0 at 20-25, and draws none from
      // 30BB up, so the option appears exactly where a range exists to fill it.
      return effectiveStackBB <= LIMP_SHOVE_MAX ? ["LIMP", "ISO", "JAM"] : ["LIMP", "ISO"];
    }
    // Req 3.4 — Iso-raise; Req 3.13 — Over-limp (jen mimo BB); plus Fold.
    return ["ISO", "OVERLIMP", "FOLD"];
  }

  // 0 limperů.
  if (!heroIsBB) {
    // Req 3.1 — RFI/Open; Req 3.2 — open-limp; plus Fold.
    // Req 3.1 — plus the open shove while the stack is short. Between ten and
    // twenty big blinds the owner's sheets do not draw one opening range: they
    // draw a raising band and shove thresholds, and the small pairs are past
    // theirs at fifteen big blinds.
    // Above the sheets (16-20BB) only where the range this spot teaches draws
    // an open shove - RYE does at 20BB for a few hands per seat (decision 6a).
    return effectiveStackBB <= OPEN_SHOVE_MAX || (effectiveStackBB <= OPEN_SHOVE_TAUGHT_MAX && jamTaught)
      ? ["OPEN", "LIMP", "JAM", "FOLD"]
      : ["OPEN", "LIMP", "FOLD"];
  }

  // Hrdina na BB, facing = NONE, 0 limperů: tento stav v praxi nenastává
  // (SB jedná před BB), žádné kritérium 3.1–3.13 jej nepokrývá. Pro totalitu
  // vracíme jedinou bezpečnou akci.
  return ["FOLD"];
}

/** Vyčerpávající kontrola variant `FacingAction` (kompilační záruka totality). */
function assertNeverFacing(facing: never): never {
  throw new Error(`Unexpected FacingAction value: ${facing as FacingAction}`);
}
