import {
  getOverallStatistics,
  getSuccessRate,
  type TrainingStatistics,
} from "../domain/statistics";

type SessionProgress = {
  readonly answered: number;
  readonly correct: number;
  readonly remaining: number;
  readonly streak: number;
};

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
      <button class="reset-button" data-reset-stats type="button">Reset statistik</button>
    </section>
  `;
}
