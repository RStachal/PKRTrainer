import { getOverallStatistics, getSuccessRate, type TrainingStatistics } from "../domain/statistics";

export function renderStatsStrip(statistics: TrainingStatistics): string {
  const overall = getOverallStatistics(statistics);
  const overallSuccessRate = getSuccessRate(overall);

  return `
    <section class="stats-strip" aria-label="Celkové statistiky">
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
