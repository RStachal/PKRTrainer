import { describe, expect, it } from "vitest";
import type { TrainingQuestion } from "../src/domain/question";
import {
  createTrainingSession,
  EMPTY_TRAINING_PROGRESS,
  getNextQuestion,
  recordQuestionAnswer,
  scoreAnswer,
} from "../src/domain/trainingSession";

const QUESTIONS = [
  {
    id: "open-btn-a8o",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "OPEN_HJ_CO_BTN",
    title: "BTN open",
    prompt: "BTN A8o",
    answerOptions: [
      { id: "FOLD", label: "Fold" },
      { id: "OPEN_2X", label: "Open 2x" },
      { id: "OPEN_25X", label: "Open 2.5x" },
    ],
    correctKeys: ["OPEN_2X", "OPEN_25X"],
    strictCorrect: ["OPEN_2X"],
  },
  {
    id: "bb-defend-k4s",
    format: "MTT_15_25BB",
    phase: "PREFLOP",
    category: "BB_DEFEND",
    title: "BB defend",
    prompt: "BB K4s",
    answerOptions: [
      { id: "FOLD", label: "Fold" },
      { id: "CALL", label: "Call" },
    ],
    correctKeys: ["CALL"],
    strictCorrect: ["CALL"],
  },
  {
    id: "flop-cbet-kqo",
    format: "CASH_100BB",
    phase: "FLOP",
    category: "FLOP_CBET_HU_DRY_PFR",
    title: "Flop cbet",
    prompt: "A72r KQo",
    answerOptions: [
      { id: "CHECK", label: "Check" },
      { id: "CBET_33", label: "Cbet 33%" },
    ],
    correctKeys: ["CBET_33"],
    strictCorrect: ["CBET_33"],
  },
] as const satisfies readonly TrainingQuestion[];

describe("training session engine", () => {
  it("vytváří deterministické pořadí podle seedu", () => {
    const first = createTrainingSession(QUESTIONS, {
      seed: 17,
      blockSize: 10,
    });
    const second = createTrainingSession(QUESTIONS, {
      seed: 17,
      blockSize: 10,
    });
    const different = createTrainingSession(QUESTIONS, {
      seed: 18,
      blockSize: 10,
    });

    expect(second.questionOrder).toEqual(first.questionOrder);
    expect(different.questionOrder).not.toEqual(first.questionOrder);
  });

  it("neopakuje otázky v jednom bloku", () => {
    let session = createTrainingSession(QUESTIONS, {
      seed: 1,
      blockSize: 3,
    });
    const seenQuestionIds = new Set<string>();

    for (let index = 0; index < 3; index += 1) {
      const result = getNextQuestion(session, QUESTIONS);
      session = result.session;

      expect(result.question).not.toBeNull();
      expect(seenQuestionIds.has(result.question?.id ?? "")).toBe(false);
      seenQuestionIds.add(result.question?.id ?? "");
    }

    expect(getNextQuestion(session, QUESTIONS).question).toBeNull();
  });

  it("filtruje podle fáze a kategorie", () => {
    const session = createTrainingSession(QUESTIONS, {
      phase: "PREFLOP",
      category: "BB_DEFEND",
    });

    expect(session.questionOrder).toEqual(["bb-defend-k4s"]);
  });

  it("rozlišuje strict a lenient scoring", () => {
    const openQuestion = QUESTIONS[0];

    expect(scoreAnswer(openQuestion, "OPEN_25X", "LENIENT").isCorrect).toBe(
      true,
    );
    expect(scoreAnswer(openQuestion, "OPEN_25X", "STRICT").isCorrect).toBe(
      false,
    );
  });

  it("udržuje missed mód a po správné odpovědi otázku z missed odstraní", () => {
    const wrong = recordQuestionAnswer(
      EMPTY_TRAINING_PROGRESS,
      QUESTIONS[1],
      "FOLD",
      "LENIENT",
    ).progress;

    const missedSession = createTrainingSession(
      QUESTIONS,
      {
        mode: "MISSED",
        blockSize: 10,
      },
      wrong,
    );

    expect(missedSession.questionOrder).toEqual(["bb-defend-k4s"]);

    const fixed = recordQuestionAnswer(
      wrong,
      QUESTIONS[1],
      "CALL",
      "LENIENT",
    ).progress;

    expect(fixed.missed).toEqual({});
    expect(fixed.streak).toBe(1);
    expect(fixed.byCategory.BB_DEFEND).toEqual({
      answered: 2,
      correct: 1,
    });
  });
});
