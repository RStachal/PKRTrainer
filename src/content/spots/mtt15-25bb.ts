import type { TrainingSpot } from "../../domain/spot";

export const MTT_15_25BB_SPOTS = [
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
        { hand: "A2o", action: "OPEN", weight: "mix" },
        { hand: "K7s", action: "OPEN", weight: "mix" },
        { hand: "Q5o", action: "FOLD", weight: "pure" },
        { hand: "22", action: "OPEN", weight: "pure" },
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
        { hand: "76s", action: "CALL", weight: "mix" },
        { hand: "Q3o", action: "FOLD", weight: "pure" },
      ],
    },
    explanation: "K4s je suited handa s dostatečnou hratelností proti BTN. Proti 2.5x nejde o automatický call se vším, ale tahle handa do defenzivní range patří.",
  },
] as const satisfies readonly TrainingSpot[];
