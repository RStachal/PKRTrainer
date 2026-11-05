import type {
  ActionContext,
  ActionKey,
  Position,
  Spot,
  StackBucket,
} from "../core/types";
import type {
  BoardTexture,
  PostflopAction,
  PostflopPotType,
  PostflopPositionPattern,
  PostflopStreet,
} from "../core/postflopGenerator";
import { profileId, type TrainingProfile } from "../core/trainingProfile";
import { POSTFLOP_ACTIONS, isPostflopPositionPattern } from "../core/postflopGenerator";
import type {
  PostflopActionNode,
  PostflopTrainingSpot,
} from "../core/postflopTrainingSpot";
import { KEY_HH_REVIEWS } from "./keys";
import type { SaveOutcome } from "./statsStore";

export const HH_REVIEW_RECORD_SCHEMA = "hh_review_record_v1";
export const HH_REVIEW_RECORD_VERSION = 1;

export type HHReviewRecord = HHPreflopReviewRecord | HHPostflopReviewRecord;

interface HHReviewRecordBase {
  schema: typeof HH_REVIEW_RECORD_SCHEMA;
  schemaVersion: typeof HH_REVIEW_RECORD_VERSION;
  reviewId: string;
  importedAt: number;
  savedToDrillStats: false;
  profileId?: string;
  profile?: TrainingProfile;
  strategyPackId?: string;
  strategyPackVersion?: string;
  strategyPackVerifiedAt?: string;
}

export interface HHReviewIdentity {
  profile?: TrainingProfile;
  strategyPack?: {
    id: string;
    version: string;
    verifiedAt: string;
  };
}

export interface HHPreflopReviewRecord extends HHReviewRecordBase {
  street: "PREFLOP";
  qid: string;
  chosen: ActionKey | null;
  correct: boolean | null;
  recommended: readonly ActionKey[];
  context: ActionContext;
  position: Position;
  bucket: StackBucket;
  hand: string;
}

export interface HHPostflopReviewRecord extends HHReviewRecordBase {
  street: PostflopStreet;
  qid: string;
  recommended: PostflopAction;
  actionNode: PostflopActionNode;
  potType: PostflopPotType;
  spr: number;
  board: readonly string[];
  boardTextures: readonly BoardTexture[];
  heroPosition: Position;
  villainPosition: Position;
  positionPattern: PostflopPositionPattern;
}

export interface HHReviewStore {
  record(r: HHReviewRecord): SaveOutcome;
  events(): HHReviewRecord[];
  replaceAll(records: readonly HHReviewRecord[]): SaveOutcome;
}

const ACTION_CONTEXTS: readonly ActionContext[] = [
  "RFI",
  "VS_LIMP",
  "VS_OPEN",
  "VS_3BET",
  "VS_4BET",
  "SQUEEZE",
  "BVB",
  "PUSH_FOLD",
  "VS_ALLIN",
];

const ACTION_KEYS: readonly ActionKey[] = [
  "FOLD",
  "CALL",
  "LIMP",
  "OVERLIMP",
  "OPEN_2X",
  "OPEN_25X",
  "OPEN_3X",
  "ISO_2X",
  "ISO_25X",
  "ISO_3X",
  "3BET",
  "4BET",
  "SQUEEZE",
  "JAM",
  "CALL_JAM",
];

const POSITIONS: readonly Position[] = [
  "UTG",
  "UTG+1",
  "UTG+2",
  "LJ",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
];

const STACK_BUCKETS: readonly StackBucket[] = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150,
];

export function buildHHPreflopReviewRecord(
  spot: Spot,
  chosen: ActionKey | undefined,
  correct: boolean | undefined,
  importedAt = Date.now(),
  identity: HHReviewIdentity = {},
): HHPreflopReviewRecord {
  return {
    schema: HH_REVIEW_RECORD_SCHEMA,
    schemaVersion: HH_REVIEW_RECORD_VERSION,
    reviewId: `HH|PREFLOP|${spot.id}|${importedAt}`,
    importedAt,
    savedToDrillStats: false,
    ...reviewIdentityFields(identity),
    street: "PREFLOP",
    qid: spot.id,
    chosen: chosen ?? null,
    correct: correct ?? null,
    recommended: [...spot.correctKeys],
    context: spot.context,
    position: spot.heroPos,
    bucket: spot.effStack,
    hand: spot.hand,
  };
}

export function buildHHPostflopReviewRecord(
  spot: PostflopTrainingSpot,
  importedAt = Date.now(),
  identity: HHReviewIdentity = {},
): HHPostflopReviewRecord {
  return {
    schema: HH_REVIEW_RECORD_SCHEMA,
    schemaVersion: HH_REVIEW_RECORD_VERSION,
    reviewId: `HH|${spot.street}|${spot.id}|${importedAt}`,
    importedAt,
    savedToDrillStats: false,
    ...reviewIdentityFields(identity),
    street: spot.street,
    qid: spot.id,
    recommended: spot.recommendedAction,
    actionNode: spot.actionNode,
    potType: spot.potType,
    spr: spot.spr,
    board: spot.board.map((card) => `${card.rank}${card.suit}`),
    boardTextures: [...spot.boardTextures],
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    positionPattern: spot.positionPattern,
  };
}

export function isHHReviewRecord(value: unknown): value is HHReviewRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<HHReviewRecord>;
  if (
    record.schema !== HH_REVIEW_RECORD_SCHEMA ||
    record.schemaVersion !== HH_REVIEW_RECORD_VERSION ||
    typeof record.reviewId !== "string" ||
    record.reviewId.length === 0 ||
    typeof record.importedAt !== "number" ||
    !Number.isFinite(record.importedAt) ||
    record.savedToDrillStats !== false ||
    !isOptionalReviewIdentity(record)
  ) {
    return false;
  }

  if (record.street === "PREFLOP") {
    const preflop = record as Partial<HHPreflopReviewRecord>;
    return (
      typeof preflop.qid === "string" &&
      preflop.qid.length > 0 &&
      (preflop.chosen === null || isActionKey(preflop.chosen)) &&
      (preflop.correct === null || typeof preflop.correct === "boolean") &&
      Array.isArray(preflop.recommended) &&
      preflop.recommended.every(isActionKey) &&
      isActionContext(preflop.context) &&
      isPosition(preflop.position) &&
      isStackBucket(preflop.bucket) &&
      typeof preflop.hand === "string" &&
      preflop.hand.length > 0
    );
  }

  const postflop = record as Partial<HHPostflopReviewRecord>;
  return (
    isPostflopStreet(postflop.street) &&
    typeof postflop.qid === "string" &&
    postflop.qid.length > 0 &&
    isPostflopAction(postflop.recommended) &&
    isPostflopActionNode(postflop.actionNode) &&
    isActionCompatibleWithNode(postflop.actionNode, postflop.recommended) &&
    isPostflopPotType(postflop.potType) &&
    typeof postflop.spr === "number" &&
    Number.isFinite(postflop.spr) &&
    Array.isArray(postflop.board) &&
    postflop.board.every((card) => typeof card === "string" && /^[2-9TJQKA][shdc]$/.test(card)) &&
    Array.isArray(postflop.boardTextures) &&
    postflop.boardTextures.every(isBoardTexture) &&
    isPosition(postflop.heroPosition) &&
    isPosition(postflop.villainPosition) &&
    isPostflopPositionPattern(postflop.positionPattern)
  );
}

function reviewIdentityFields(identity: HHReviewIdentity) {
  return {
    ...(identity.profile
      ? {
        profileId: profileId(identity.profile),
        profile: { ...identity.profile },
      }
      : {}),
    ...(identity.strategyPack
      ? {
        strategyPackId: identity.strategyPack.id,
        strategyPackVersion: identity.strategyPack.version,
        strategyPackVerifiedAt: identity.strategyPack.verifiedAt,
      }
      : {}),
  };
}

function isOptionalReviewIdentity(record: Partial<HHReviewRecord>): boolean {
  if (record.profileId === undefined && record.profile === undefined) return true;
  if (
    typeof record.profileId !== "string" ||
    record.profileId.length === 0 ||
    typeof record.profile !== "object" ||
    record.profile === null ||
    !isTrainingProfile(record.profile) ||
    profileId(record.profile as TrainingProfile) !== record.profileId
  ) {
    return false;
  }
  const strategyFields = [
    record.strategyPackId,
    record.strategyPackVersion,
    record.strategyPackVerifiedAt,
  ];
  return strategyFields.every((value) => value === undefined) ||
    strategyFields.every((value) => typeof value === "string" && value.length > 0);
}

function isTrainingProfile(value: unknown): value is TrainingProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<TrainingProfile>;
  return (
    (profile.gameVariant === "MTT" || profile.gameVariant === "SNG" || profile.gameVariant === "CASH") &&
    (profile.tableFormat === "FULL_RING_9" || profile.tableFormat === "SIX_MAX") &&
    (profile.blindSpeed === "REGULAR" || profile.blindSpeed === "TURBO") &&
    (
      profile.street === "PREFLOP" ||
      profile.street === "FLOP" ||
      profile.street === "TURN" ||
      profile.street === "RIVER"
    ) &&
    (
      profile.evModel === "CHIP_EV" ||
      profile.evModel === "DOLAR_EV" ||
      profile.evModel === "ICM"
    ) &&
    (profile.ante === "ON" || profile.ante === "OFF") &&
    (
      profile.rakeMode === "NONE" ||
      profile.rakeMode === "RAKE" ||
      profile.rakeMode === "NO_RAKE"
    )
  );
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

class LocalHHReviewStore implements HHReviewStore {
  private readonly storage: Storage;
  private records: HHReviewRecord[];

  constructor(storage: Storage) {
    this.storage = storage;
    this.records = this.readEvents();
  }

  record(r: HHReviewRecord): SaveOutcome {
    return this.replaceAll(this.records.concat(cloneRecord(r)));
  }

  events(): HHReviewRecord[] {
    return this.records.map(cloneRecord);
  }

  replaceAll(records: readonly HHReviewRecord[]): SaveOutcome {
    const nextEvents = records.map(cloneRecord);
    if (!nextEvents.every(isHHReviewRecord)) {
      return { ok: false, error: "Invalid HH review record." };
    }
    const priorRaw = this.safeGet(KEY_HH_REVIEWS);

    let eventsJson: string;
    try {
      eventsJson = JSON.stringify(nextEvents);
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }

    try {
      this.storage.setItem(KEY_HH_REVIEWS, eventsJson);
    } catch (err) {
      this.restore(KEY_HH_REVIEWS, priorRaw);
      return { ok: false, error: describeError(err) };
    }

    this.records = nextEvents;
    return { ok: true };
  }

  private readEvents(): HHReviewRecord[] {
    const raw = this.safeGet(KEY_HH_REVIEWS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isHHReviewRecord).map(cloneRecord);
    } catch {
      return [];
    }
  }

  private safeGet(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private restore(key: string, raw: string | null): void {
    try {
      if (raw === null) this.storage.removeItem(key);
      else this.storage.setItem(key, raw);
    } catch {
      /* best-effort rollback */
    }
  }
}

function cloneRecord<T extends HHReviewRecord>(record: T): T {
  return {
    ...record,
    ...(record.profile ? { profile: { ...record.profile } } : {}),
    ...(record.street === "PREFLOP"
      ? { recommended: [...record.recommended] }
      : {
          board: [...record.board],
          boardTextures: [...record.boardTextures],
        }),
  } as T;
}

function isActionKey(value: unknown): value is ActionKey {
  return typeof value === "string" && ACTION_KEYS.includes(value as ActionKey);
}

function isActionContext(value: unknown): value is ActionContext {
  return typeof value === "string" && ACTION_CONTEXTS.includes(value as ActionContext);
}

function isPosition(value: unknown): value is Position {
  return typeof value === "string" && POSITIONS.includes(value as Position);
}

function isStackBucket(value: unknown): value is StackBucket {
  return typeof value === "number" && STACK_BUCKETS.includes(value as StackBucket);
}

function isPostflopAction(value: unknown): value is PostflopAction {
  return typeof value === "string" && POSTFLOP_ACTIONS.includes(value as PostflopAction);
}

function isActionCompatibleWithNode(
  node: PostflopActionNode,
  action: PostflopAction,
): boolean {
  return actionsForNode(node).includes(action);
}

function actionsForNode(node: PostflopActionNode): readonly PostflopAction[] {
  switch (node) {
    case "FLOP_FACING_BET":
    case "TURN_FACING_BET":
    case "RIVER_FACING_BET":
      return ["FOLD", "CALL", "RAISE"];
    case "SINGLE_RAISED_POT_CBET":
    case "THREE_BET_POT_CBET":
    case "FLOP_OOP_LEAD":
    case "TURN_BARREL":
    case "TURN_OOP_LEAD":
    case "RIVER_OOP_LEAD":
    case "RIVER_PRESSURE":
      return ["CHECK", "BET_SMALL", "BET_BIG"];
  }
}

function isPostflopStreet(value: unknown): value is PostflopStreet {
  return value === "FLOP" || value === "TURN" || value === "RIVER";
}

function isPostflopActionNode(value: unknown): value is PostflopActionNode {
  return (
    value === "SINGLE_RAISED_POT_CBET" ||
    value === "THREE_BET_POT_CBET" ||
    value === "FLOP_FACING_BET" ||
    value === "TURN_BARREL" ||
    value === "TURN_OOP_LEAD" ||
    value === "FLOP_OOP_LEAD" ||
    value === "RIVER_OOP_LEAD" ||
    value === "TURN_FACING_BET" ||
    value === "RIVER_PRESSURE" ||
    value === "RIVER_FACING_BET"
  );
}

function isPostflopPotType(value: unknown): value is PostflopPotType {
  return (
    value === "SINGLE_RAISED" ||
    value === "THREE_BET_POT" ||
    value === "LIMPED_POT"
  );
}

function isBoardTexture(value: unknown): value is BoardTexture {
  return (
    value === "paired" ||
    value === "monotone" ||
    value === "two-tone" ||
    value === "rainbow" ||
    value === "connected" ||
    value === "dry" ||
    value === "ace-high" ||
    value === "broadway-high" ||
    value === "low" ||
    value === "medium" ||
    value === "straight-possible" ||
    value === "flush-draw-heavy" ||
    value === "disconnected"
  );
}

export function createHHReviewStore(storage: Storage = localStorage): HHReviewStore {
  return new LocalHHReviewStore(storage);
}
