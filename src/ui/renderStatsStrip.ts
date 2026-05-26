import {
  getOverallStatistics,
  getSuccessRate,
  type TrainingStatistics,
} from "../domain/statistics";
import type { StackBandFilter } from "../domain/stackBand";
import type { QuestionProgress } from "../domain/trainingSession";

type SessionProgress = {
  readonly answered: number;
  readonly correct: number;
  readonly remaining: number;
  readonly streak: number;
  readonly stackBand: StackBandFilter;
  readonly byStackBand: Readonly<
    Partial<Record<"BB_15_20" | "BB_21_25", QuestionProgress>>
  >;
};

function getAccuracy(progress: QuestionProgress): number | null {
  if (progress.answered === 0) return null;
  return progress.correct / progress.answered;
}

function pickWeakerStackBand(
  stack15: QuestionProgress,
  stack21: QuestionProgress,
): "BB_15_20" | "BB_21_25" | null {
  if (stack15.answered === 0 && stack21.answered === 0) {
    return null;
  }

  if (stack15.answered === 0) return "BB_15_20";
  if (stack21.answered === 0) return "BB_21_25";

  const acc15 = getAccuracy(stack15) ?? 0;
  const acc21 = getAccuracy(stack21) ?? 0;

  if (acc15 < acc21) return "BB_15_20";
  if (acc21 < acc15) return "BB_21_25";

  return stack15.answered <= stack21.answered ? "BB_15_20" : "BB_21_25";
}

function getOtherStackBand(
  band: "BB_15_20" | "BB_21_25",
): "BB_15_20" | "BB_21_25" {
  return band === "BB_15_20" ? "BB_21_25" : "BB_15_20";
}

export function renderStatsStrip(
  statistics: TrainingStatistics,
  session: SessionProgress,
): string {
  const overall = getOverallStatistics(statistics);
  const overallSuccessRate = getSuccessRate(overall);
  const sessionAccuracy =
    session.answered === 0
      ? null
      : Math.round((session.correct / session.answered) * 100);
  const stack15 = session.byStackBand.BB_15_20 ?? { answered: 0, correct: 0 };
  const stack21 = session.byStackBand.BB_21_25 ?? { answered: 0, correct: 0 };
  const weakerBand = pickWeakerStackBand(stack15, stack21);
  const weakerBandLabel =
    weakerBand === "BB_15_20" ? "15-20 BB" : "21-25 BB";
  const otherBand = weakerBand ? getOtherStackBand(weakerBand) : null;

  return `
    <section class="stats-strip" aria-label="Celkove statistiky">
      <div>
        <span>Remaining</span>
        <strong>${session.remaining}</strong>
      </div>
      <div>
        <span>Streak</span>
        <strong>${session.streak}</strong>
      </div>
      <div>
        <span>Answered</span>
        <strong>${session.answered}</strong>
      </div>
      <div>
        <span>Accuracy</span>
        <strong>${sessionAccuracy === null ? "Novy blok" : `${sessionAccuracy} %`}</strong>
      </div>
      <div>
        <span>Celkem</span>
        <strong>${overall.attempts}</strong>
      </div>
      <div>
        <span>Historie</span>
        <strong>${overallSuccessRate === null ? "Novy trenink" : `${Math.round(overallSuccessRate * 100)} %`}</strong>
      </div>
      <div>
        <span>Stack split</span>
        <strong>${stack15.correct}/${stack15.answered} · ${stack21.correct}/${stack21.answered}</strong>
        <small>15-20 BB · 21-25 BB</small>
        ${
          weakerBand
            ? `
              <div class="stack-focus-row">
                <button class="stack-focus-button" data-stack-focus="${weakerBand}" type="button">Trenovat ${weakerBandLabel}</button>
                <button class="stack-focus-button is-secondary" data-stack-focus="${otherBand}" type="button">Trenovat druhou vetev</button>
              </div>
            `
            : ""
        }
      </div>
      <button class="reset-button" data-reset-stats type="button">Reset statistik</button>
    </section>
  `;
}
