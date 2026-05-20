import {
  getOverallStatistics,
  getSuccessRate,
  type TrainingStatistics,
} from "../domain/statistics";

type SessionProgress = {
  readonly answered: number;
  readonly correct: number;
  readonly goal: number;
};

export function renderStatsStrip(
  statistics: TrainingStatistics,
  session?: SessionProgress,
): string {
  const overall = getOverallStatistics(statistics);
  const overallSuccessRate = getSuccessRate(overall);
  const sessionSuccessRate =
    !session || session.answered === 0
      ? null
      : Math.round((session.correct / session.answered) * 100);

  return `
    <section class="stats-strip" aria-label="Celkové statistiky">
      ${
        session
          ? `
            <div>
              <span>Session</span>
              <strong>${Math.min(session.answered + 1, session.goal)} / ${session.goal}</strong>
            </div>
            <div>
              <span>Skóre session</span>
              <strong>${sessionSuccessRate === null ? "Nová session" : `${sessionSuccessRate} %`}</strong>
            </div>
          `
          : ""
      }
      <div>
        <span>Celkem odpovědí</span>
        <strong>${overall.attempts}</strong>
      </div>
      <div>
        <span>Celková úspěšnost</span>
        <strong>${overallSuccessRate === null ? "Nový trénink" : `${Math.round(overallSuccessRate * 100)} %`}</strong>
      </div>
      <button class="reset-button" data-reset-stats type="button">Reset statistik</button>
    </section>
  `;
}
