import { offeredActions } from "./actionTree";
import {
  PUSH_FOLD_MAX,
  RE_JAM_MAX,
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
      return preferredSizingKey("OPEN", handStrict, bucket);
    case "ISO":
      return preferredSizingKey("ISO", handStrict, bucket);
  }
}

export function offeredPreflopActionKeys(
  state: TableState,
  handStrict: readonly ActionKey[] | undefined,
  bucket: StackBucket,
): ActionKey[] {
  return offeredActions(state).map((kind) => preflopActionKindToKey(kind, handStrict, bucket));
}

export function offeredPreflopActionKeysForContext(
  context: ActionContext,
  heroPos: Position,
  bucket: StackBucket,
  handStrict: readonly ActionKey[] | undefined,
): ActionKey[] {
  return offeredPreflopActionKeys(
    tableStateForPreflopContext(context, heroPos, bucket),
    handStrict,
    bucket,
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
    shortStack: bucket <= RE_JAM_MAX,
    limpsBefore: context === "VS_LIMP" ? 1 : 0,
    callsBefore: context === "SQUEEZE" ? 1 : 0,
    facing: facingForContext(context, heroPos),
    isBvB: context === "BVB",
  };
}

function preferredSizingKey(
  prefix: "OPEN" | "ISO",
  handStrict: readonly ActionKey[] | undefined,
  bucket: StackBucket,
): ActionKey {
  const reviewedSizing = handStrict?.find((key) => key.startsWith(`${prefix}_`));
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
