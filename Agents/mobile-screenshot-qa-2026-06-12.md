# Mobile Screenshot QA - 2026-06-12

Scope:

- Local app: `http://127.0.0.1:5173/`
- Browser engine: local Google Chrome headless via DevTools Protocol
- Viewports: `360x800`, `390x844`, `412x915`
- Surfaces: training filters, postflop SRP table, postflop Flopzilla matrix, Statistics dashboard

Result:

- `360x800`: global horizontal overflow `0`; postflop table rendered; 9 seats rendered; 3 board cards rendered; 3 action buttons rendered; Flopzilla matrix rendered with 169 cells; matrix used local horizontal scroll (`scrollWidth=590`, `clientWidth=256`); dashboard rendered with global horizontal overflow `0`.
- `390x844`: global horizontal overflow `0`; postflop table rendered; 9 seats rendered; 3 board cards rendered; 3 action buttons rendered; Flopzilla matrix rendered with 169 cells; matrix used local horizontal scroll (`scrollWidth=590`, `clientWidth=286`); dashboard rendered with global horizontal overflow `0`.
- `412x915`: global horizontal overflow `0`; postflop table rendered; 9 seats rendered; 3 board cards rendered; 3 action buttons rendered; Flopzilla matrix rendered with 169 cells; matrix used local horizontal scroll (`scrollWidth=590`, `clientWidth=308`); dashboard rendered with global horizontal overflow `0`.

Visual inspection:

- `360x800` postflop table screenshot: controls, question panel, active seats, pot and board area were readable; no page-level horizontal overflow.
- `360x800` postflop matrix screenshot: range summary and Flopzilla matrix were readable; matrix scroll was contained within the matrix panel.
- `360x800` dashboard screenshot: summary and KPI cards stacked cleanly; no page-level horizontal overflow.

Notes:

- Browser plugin `iab` was still unavailable in this Codex session, so the QA used local Chrome headless CDP instead of the in-app Browser surface.
- Temporary PNG screenshots were generated under `tmp-mobile-screenshot-qa/` during the run and were intentionally left out of source control.
