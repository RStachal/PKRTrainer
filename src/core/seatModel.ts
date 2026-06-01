import type { Position, StackBucket } from "./types";
import {
  positionsForFormat,
  type TableFormat,
} from "./trainingProfile";

export type StackByPosition = Partial<Record<Position, StackBucket | number>>;

export interface SeatState {
  index: number;
  position: Position;
  stackBB: number;
  isHero: boolean;
  isButton: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

export interface SeatModel {
  format: TableFormat;
  tableSize: number;
  seats: SeatState[];
  heroPosition?: Position;
  buttonPosition: Position;
  smallBlindPosition: Position;
  bigBlindPosition: Position;
}

export interface BuildSeatModelInput {
  format: TableFormat;
  heroPosition?: Position;
  stacksBB?: StackByPosition;
  defaultStackBB?: StackBucket | number;
}

const BUTTON_POSITION: Position = "BTN";
const SMALL_BLIND_POSITION: Position = "SB";
const BIG_BLIND_POSITION: Position = "BB";

export function buildSeatModel(input: BuildSeatModelInput): SeatModel {
  const positions = positionsForFormat(input.format);
  const defaultStackBB = input.defaultStackBB ?? 25;

  if (input.heroPosition !== undefined && !positions.includes(input.heroPosition)) {
    throw new Error(
      `Hero position ${input.heroPosition} is not valid for ${input.format}.`,
    );
  }

  const seats = positions.map((position, index): SeatState => ({
    index,
    position,
    stackBB: input.stacksBB?.[position] ?? defaultStackBB,
    isHero: input.heroPosition === position,
    isButton: position === BUTTON_POSITION,
    isSmallBlind: position === SMALL_BLIND_POSITION,
    isBigBlind: position === BIG_BLIND_POSITION,
  }));

  return {
    format: input.format,
    tableSize: seats.length,
    seats,
    heroPosition: input.heroPosition,
    buttonPosition: BUTTON_POSITION,
    smallBlindPosition: SMALL_BLIND_POSITION,
    bigBlindPosition: BIG_BLIND_POSITION,
  };
}

export function effectiveStackBB(
  model: SeatModel,
  heroPosition: Position,
  villainPosition: Position,
): number {
  const hero = seatByPosition(model, heroPosition);
  const villain = seatByPosition(model, villainPosition);
  return Math.min(hero.stackBB, villain.stackBB);
}

export function seatByPosition(model: SeatModel, position: Position): SeatState {
  const seat = model.seats.find((s) => s.position === position);
  if (seat === undefined) {
    throw new Error(`Position ${position} is not present in ${model.format}.`);
  }
  return seat;
}
