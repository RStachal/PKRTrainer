import type { TrainingSpot } from "../../domain/spot";

export const CASH_100BB_SPOTS = [
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
