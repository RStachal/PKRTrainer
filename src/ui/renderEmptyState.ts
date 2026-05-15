import type { TrainingFormatId } from "../domain/trainingFormat";
import type { PhaseFilter } from "./phaseFilter";

export function renderEmptyState(
  format: TrainingFormatId,
  phase: PhaseFilter,
): string {
  return `
    <section class="empty-state" aria-label="Chybějící spoty">
      <h2>Pro tento výběr zatím nejsou připravené spoty.</h2>
      <p>Formát <strong>${format}</strong> a fáze <strong>${phase === "ALL" ? "Vše" : phase}</strong> zatím nemají obsah. Jakmile přidáme range a vysvětlení, objeví se tady jako tréninkové otázky.</p>
    </section>
  `;
}
