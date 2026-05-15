import type { CategoryPhase } from "./constants";
import type { TrainingFormatId } from "./trainingFormat";

export type ActionId = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "OPEN" | "JAM";

export type SpotCategory =
  | "OPEN"
  | "DEFEND"
  | "ISO"
  | "REJAM"
  | "CBET"
  | "BARREL"
  | "BLUFFCATCH"
  | "VALUE";

export type RangeCellWeight = "none" | "mix" | "pure";

export type RangeCell = {
  readonly hand: string;
  readonly action: ActionId;
  readonly weight: RangeCellWeight;
};

export type RangeReference = {
  readonly title: string;
  readonly summary: string;
  readonly cells: readonly RangeCell[];
};

export type TableSeat = {
  readonly position: string;
  readonly label: string;
  readonly isHero?: boolean;
};

export type TrainingSpot = {
  readonly id: string;
  readonly format: TrainingFormatId;
  readonly phase: CategoryPhase;
  readonly category: SpotCategory;
  readonly title: string;
  readonly prompt: string;
  readonly heroHand: readonly string[];
  readonly boardCards?: readonly string[];
  readonly effectiveStack: string;
  readonly potLabel: string;
  readonly seats: readonly TableSeat[];
  readonly answerOptions: readonly ActionId[];
  readonly correctAction: ActionId;
  readonly range: RangeReference;
  readonly explanation: string;
};

export const TRAINING_SPOTS = [
  {
    id: "mtt-15-25-open-btn-a8o",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "OPEN",
    title: "BTN open proti blindům",
    prompt: "MTT, efektivně 20 BB. Jsi na BTN s A8o, hráči na blindech foldují hodně standardně. Jaká je výchozí akce?",
    heroHand: ["A♠", "8♦"],
    effectiveStack: "20 BB",
    potLabel: "Blindy 0.5 / 1 BB",
    seats: [
      { position: "BTN", label: "Hero", isHero: true },
      { position: "SB", label: "SB" },
      { position: "BB", label: "BB" },
    ],
    answerOptions: ["FOLD", "OPEN", "JAM"],
    correctAction: "OPEN",
    range: {
      title: "BTN open 20 BB",
      summary: "Button otevírá široce, ale pořád preferuje menší open před zbytečným jamem.",
      cells: [
        { hand: "A8o", action: "OPEN", weight: "pure" },
        { hand: "K7s", action: "OPEN", weight: "mix" },
        { hand: "Q5o", action: "FOLD", weight: "pure" },
      ],
    },
    explanation: "A8o je pro BTN při 20 BB standardní open. Jam necháváme hlavně pro specifické exploit spoty nebo jiné stackové konfigurace.",
  },
  {
    id: "mtt-15-25-bb-defend-k4s",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "DEFEND",
    title: "BB defend proti BTN open",
    prompt: "MTT, efektivně 22 BB. BTN otevře 2.5x, jsi na BB s K4s. Jaká je výchozí akce?",
    heroHand: ["K♣", "4♣"],
    effectiveStack: "22 BB",
    potLabel: "BTN open 2.5x",
    seats: [
      { position: "BTN", label: "Open 2.5x" },
      { position: "SB", label: "Fold" },
      { position: "BB", label: "Hero", isHero: true },
    ],
    answerOptions: ["FOLD", "CALL", "RAISE"],
    correctAction: "CALL",
    range: {
      title: "BB defend vs BTN 2.5x",
      summary: "Suited kingové mají proti BTN openům dobrou realizaci equity a často zůstávají v callovací části range.",
      cells: [
        { hand: "K4s", action: "CALL", weight: "pure" },
        { hand: "K2o", action: "FOLD", weight: "pure" },
        { hand: "A5s", action: "RAISE", weight: "mix" },
      ],
    },
    explanation: "K4s je suited handa s dostatečnou hratelností proti BTN. Proti 2.5x nejde o automatický call se vším, ale tahle handa do defenzivní range patří.",
  },
  {
    id: "cash-100-cbet-a72r",
    format: "CASH_100BB",
    phase: "FLOP",
    category: "CBET",
    title: "Cbet na A-high suchém boardu",
    prompt: "Cash game 100 BB. Otevřel jsi CO, BB dorovnal. Flop A72 rainbow. Držíš KQo bez backdoor flush draw. Jaká je výchozí akce?",
    heroHand: ["K♠", "Q♥"],
    boardCards: ["A♦", "7♣", "2♠"],
    effectiveStack: "100 BB",
    potLabel: "CO vs BB SRP",
    seats: [
      { position: "CO", label: "Hero", isHero: true },
      { position: "BB", label: "Call" },
    ],
    answerOptions: ["CHECK", "BET"],
    correctAction: "BET",
    range: {
      title: "CO vs BB, A72 rainbow",
      summary: "PFR má na suchém A-high boardu range výhodu a může používat vysokou frekvenci malého cbetu.",
      cells: [
        { hand: "KQo", action: "BET", weight: "mix" },
        { hand: "AQo", action: "BET", weight: "pure" },
        { hand: "98s", action: "CHECK", weight: "mix" },
      ],
    },
    explanation: "Na A72 rainbow má CO výraznou range výhodu. KQo bez showdown value může profitovat z malého cbetu, i když část kombinací lze mixovat.",
  },
] as const satisfies readonly TrainingSpot[];
