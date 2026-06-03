# SNG chipEV sourcing audit - 2026-06-03

## Scope

- Variant: SNG / Spin & Go style single-table tournaments.
- Model: chipEV only.
- Formats: 9-max and 6-max candidate profiles.
- Output: candidate import workflow and preview gating only.
- Excluded: production scoring, raw chart copying, ICM payout-aware ranges.

## Public Sources Checked

1. GTO Charts - Spin and Go Charts
   - URL: https://www.gtocharts.com/spin-and-go-charts/
   - Observation: public page advertises Spin & Go preflop coverage, short-stack depths and action categories.
   - Decision: comparison evidence only; do not copy chart cells.

2. GTO Wizard landing / solutions material
   - URL: https://lp.gtowizard.com/en/
   - Observation: public material references Spin & Go and HU SnG solved situations.
   - Decision: methodology/source availability evidence only.

3. ICMIZER product and calculation pages
   - URLs:
     - https://www.icmizer.com/pt/icmizerapp/
     - https://www.icmizer.com/en/blog/how-icmizer-makes-icm-calculations/
   - Observation: product supports Nash preflop calculations and explicitly mentions ChipEV/ICM modes.
   - Decision: simulator methodology evidence only; separate chipEV from ICM imports.

4. PokerMasterminds / HRC-generated public push-fold PDF
   - URL: https://www.danielhopson.com/wp-content/uploads/2021/04/PokerMastermindsPushFoldCharts.pdf
   - Observation: public document states +ChipEV push/fold charts and no ICM.
   - Decision: short-stack methodology comparison only; no raw range import.

## Decision

- Keep SNG chipEV as candidate/preview for both 9-max and 6-max.
- Candidate reports must stay separate from SNG ICM reports.
- UI must explicitly label selected SNG profiles as `chipEV preview` or `ICM preview`; no production scoring until legal chart import supplies complete hand-class records.
- App UI must not cite source URLs; source evidence remains internal audit metadata.
