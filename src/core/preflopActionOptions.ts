import { offeredActions } from "./actionTree";
import {
  PUSH_FOLD_MAX,
  type ActionContext,
  type ActionKey,
  type ActionKind,
  type Position,
  type StackBucket,
  type TableState,
} from "./types";

export function preflopActionKindToKey(
  kind: ActionKind,
  handStrict: readonly ActionKey[] | undefined,
  bucket: StackBucket,
  handLenient?: readonly ActionKey[] | undefined,
): ActionKey {
  switch (kind) {
    case "FOLD":
    case "CALL":
    case "LIMP":
    case "OVERLIMP":
    case "3BET":
    case "4BET":
    case "SQUEEZE":
    case "JAM":
    case "CALL_JAM":
      return kind;
    case "OPEN":
      return preferredSizingKey("OPEN", handStrict, bucket, handLenient);
    case "ISO":
      return preferredSizingKey("ISO", handStrict, bucket, handLenient);
  }
}

export function offeredPreflopActionKeys(
  state: TableState,
  handStrict: readonly ActionKey[] | undefined,
  bucket: StackBucket,
  handLenient?: readonly ActionKey[] | undefined,
): ActionKey[] {
  return offeredActions(state).map((kind) => preflopActionKindToKey(kind, handStrict, bucket, handLenient));
}

export function offeredPreflopActionKeysForContext(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  handStrict: readonly ActionKey[] | undefined,
  handLenient?: readonly ActionKey[] | undefined,
): ActionKey[] {
  return offeredPreflopActionKeys(
    tableStateForPreflopContext(context, heroPos, bucket),
    handStrict,
    bucket,
    handLenient,
  );
}

export function tableStateForPreflopContext(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
): TableState {
  return {
    heroPos,
    pushFold: bucket <= PUSH_FOLD_MAX,
    effectiveStackBB: bucket,
    limpsBefore: context === "VS_LIMP" ? 1 : 0,
    callsBefore: context === "SQUEEZE" ? 1 : 0,
    facing: facingForContext(context, heroPos),
    isBvB: context === "BVB",
  };
}

/**
 * Jakou velikost nese tlačítko pro tuhle ruku.
 *
 * Bere se ta, kterou range u ruky **skutečně kreslí** - nejdřív ze striktní
 * odpovědi, pak z benevolentní. Do 23. 9. 2026 se koukalo jen do striktní, a
 * u ruky hrané zčásti to znamenalo, že správnou odpověď nešlo zvolit: BB proti
 * limpu na 15 bb má 73s jako „ISO 3,5x 49 % / limp 51 %", takže striktně je to
 * limp a velikost isa v ní není. Tlačítko pak dostalo výchozí `ISO_25X`,
 * kdežto benevolentní odpověď zněla `ISO_3X` - jiný klíč, tedy chyba, ať hráč
 * klikne na cokoli. Stránka `BBSTR-vs-SB-Limp-15-20BB` proto celá propadla na
 * „doporučení, které produkt nenabízí" (nález vlastníka 23. 9. 2026).
 */
function preferredSizingKey(
  prefix: "OPEN" | "ISO",
  handStrict: readonly ActionKey[] | undefined,
  bucket: StackBucket,
  handLenient?: readonly ActionKey[] | undefined,
): ActionKey {
  const reviewedSizing = handStrict?.find((key) => key.startsWith(`${prefix}_`))
    ?? handLenient?.find((key) => key.startsWith(`${prefix}_`));
  if (reviewedSizing) return reviewedSizing;
  if (prefix === "ISO") return "ISO_25X";
  return bucket <= 25 ? "OPEN_2X" : "OPEN_25X";
}

function facingForContext(context: ActionContext, heroPos: Position): TableState["facing"] {
  switch (context) {
    case "RFI":
    case "VS_LIMP":
    case "PUSH_FOLD":
      return "NONE";
    case "VS_OPEN":
    case "SQUEEZE":
      return "OPEN";
    case "VS_3BET":
      return "3BET";
    case "VS_4BET":
      return "4BET";
    case "VS_ALLIN":
      return "ALLIN";
    case "BVB":
      return heroPos === "SB" ? "NONE" : "OPEN";
  }
}
