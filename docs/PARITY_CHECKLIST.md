# PKRTrainer parity checklist

Goal: move the current Vite/TypeScript app toward feature parity with `legacy/PKRTrainer.html` without rewriting everything at once.

## Current state

- [x] Vite + TypeScript scaffold exists.
- [x] Legacy baseline is kept under `legacy/`.
- [x] Core category constants are ported.
- [x] Legacy localStorage key constants are documented in code.
- [x] Basic preflop matrix renderer exists.
- [x] Basic table, decision panel, range panel and stats strip exist.
- [x] Tests cover RNG, storage keys, statistics, storage parsing and basic training model behavior.
- [ ] Full legacy behavior is not yet ported.

## Priority 0 - Repository stability

- [x] Use `legacy/` as the canonical legacy directory.
- [x] Remove the duplicate tracked `Legacy/AGENTS.md` path.
- [ ] Make `refactor/v2-vite-scaffold` the default development branch or merge it into `main`.
- [ ] Add a short root README that explains which branch and command to use.
- [ ] Decide whether generated `dist/` should stay ignored and untracked.

## Priority 1 - Training session model

Legacy behavior to preserve:

- `POOL_SIZE = 300` unique questions per category and seed.
- Block size input with min `5`, max `300`, default `100`.
- Numeric seed input, deterministic order and repeatable blocks.
- New block flow.
- No repeated question inside a block.
- Mixed category selection.
- Category filter and phase filter.
- Missed-only mode.
- Streak, answered count, remaining count and accuracy.
- `LENIENT` and `STRICT` scoring modes.

Porting checklist:

- [ ] Create a typed `TrainingSession` model separate from rendered UI state.
- [ ] Port seeded category pool generation.
- [ ] Port block size and seed controls.
- [ ] Port category filter UI using `CATEGORY_OPTIONS`.
- [ ] Port mixed category selection rules.
- [ ] Port missed-only mode.
- [ ] Port strict/lenient mode into scoring.
- [ ] Add tests for deterministic seeded pool order.
- [ ] Add tests for no repeated questions in a block.
- [ ] Add tests for strict vs lenient scoring.

## Priority 2 - Question generation and poker content

Legacy question generators:

- `OPEN_HJ_CO_BTN`
- `ISO_LIMP`
- `BB_DEFEND`
- `BB_DEFEND_2X`
- `REJAM`
- `SB_OPEN`
- `BVB_AFTER_3BET`
- Flop cbet/checkback/defend/multiway/iso/3bet/BvB/range-aware categories
- Turn barrel/delayed cbet/defend/3bet/BvB categories
- River valuebet/checkback/bluffcatch/value-raise/BvB/3bet categories

Current Vite app:

- Has only a small static seed set in `src/content/spots`.

Porting checklist:

- [ ] Define a typed `Question` shape that includes `correctKeys`, `strictCorrect`, `hint`, `explanation`, `ctx` and category.
- [ ] Port hand/range set utilities from legacy.
- [ ] Port preflop generators first.
- [ ] Port postflop board/hand classification helpers.
- [ ] Port postflop generators after preflop tests are stable.
- [ ] Keep generated IDs deterministic and compatible with legacy missed/seen tracking where possible.
- [ ] Add snapshot-style tests for representative questions per category.
- [ ] Add tests for answer keys on edge hands called out in legacy rule cards.

## Priority 3 - Persistence and migration

Legacy keys:

- `fuf_drill_v5_JungleStyle1`
- `fuf_drill_v5_JungleStyle1_events_v1`
- `fuf_hh_jungle_v1`

Current Vite key:

- `pkrtrainer_v2_statistics_v1`

Porting checklist:

- [ ] Decide whether v2 should read legacy state directly, migrate it once, or keep a separate v2 state.
- [ ] Preserve or explicitly migrate legacy `seen`, `missed`, `byCat`, `strict`, `phase`, `catFilter`, `answered`, `correct` and `streak`.
- [ ] Port append-only event log for answer history.
- [ ] Port stats export JSON.
- [ ] Port stats import JSON with validation.
- [ ] Port clear stats log behavior.
- [ ] Add migration tests using legacy-shaped fixtures.
- [ ] Add corrupt/partial storage recovery tests.

## Priority 4 - UI parity

Legacy UI areas:

- Header pills: mode, filter, question category, remaining, strict, streak, answered, accuracy.
- Table simulator with six seats, board cards, pot line and action history.
- Answer buttons with feedback.
- Controls: Start / Další, Nový blok, Zobrazit pravidla, Zobrazit rozsah, missed mode, reset.
- Category, phase, block size, seed and strict controls.
- Rule cards.
- Compact dashboard by category/street.
- HH paste analyzer.
- Stats export/import panel.
- Range modal.

Porting checklist:

- [ ] Replace the simplified top bar with legacy-equivalent status pills.
- [ ] Port Start / Další and Nový blok workflow.
- [ ] Port category selector, block size input, seed input and strict selector.
- [ ] Port missed mode toggle.
- [ ] Port rule cards.
- [ ] Expand table renderer to support legacy contexts and per-seat action history.
- [ ] Port feedback text generation, including chosen reason and correct answer labels.
- [ ] Port compact dashboard by phase/category.
- [ ] Add keyboard/accessibility checks for controls.
- [ ] Verify responsive layout on mobile and desktop.

## Priority 5 - Range display

Legacy behavior:

- Modal 13x13 Flopzilla-style matrix.
- Preflop category-specific coloring.
- Postflop heuristic action ranges.
- Legend chips and explanatory note.
- Optional preflop mask for some postflop views.

Current Vite app:

- Inline basic range panel and 13x13 preflop matrix for static spot cells.

Porting checklist:

- [ ] Port range modal shell.
- [ ] Port preflop range map builder per category.
- [ ] Port postflop range map builder.
- [ ] Port legend chips and notes.
- [ ] Keep inline range panel only if it still helps the new layout.
- [ ] Add tests for matrix labels and key category color classes.

## Priority 6 - HH analyzer and player profile

Legacy behavior:

- HH paste textarea.
- Save/load pasted HH through `fuf_hh_jungle_v1`.
- Analyze hero `JungleStyle1`.
- Display VPIP, PFR, limp and 3bet metrics.
- Show status and parsing errors.

Porting checklist:

- [ ] Extract HH parser into a pure module.
- [ ] Add parser fixtures with small anonymized hand histories.
- [ ] Port profile KPI rendering.
- [ ] Port saved HH loading and clearing.
- [ ] Add tests for VPIP/PFR/limp/3bet calculations.

## Suggested implementation order

1. Make branch/default-state decision so nobody keeps landing on old `main`.
2. Port `TrainingSession` and legacy state shape.
3. Port preflop question generators and strict/lenient scoring.
4. Wire session controls into the UI.
5. Port stats event log/export/import.
6. Port range modal.
7. Port postflop generators.
8. Port dashboard and HH analyzer.

## Definition of done for parity

- [ ] Legacy and Vite app expose the same category list.
- [ ] Same seed/category/block settings produce stable, repeatable question IDs.
- [ ] Strict and lenient answer acceptance match legacy for representative fixtures.
- [ ] Missed mode follows legacy behavior.
- [ ] Progress and stats survive reload.
- [ ] Export/import round-trips stats.
- [ ] HH paste analyzer produces the same KPIs for fixture input.
- [ ] Build and tests pass.
- [ ] Manual smoke test passes on desktop and mobile viewport.
